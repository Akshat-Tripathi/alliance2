const gameConfig = require("config.ini").load("game.ini");
const serverConfig = require("config.ini").load("server.ini");

const express = require("express");
const cron = require("node-cron");
const game = require("./game");

const app = express();
app.set("trust proxy", 1);
app.use(
  require("helmet")({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"]
      }
    }
  })
);
app.use(require("body-parser").json());
app.use(require("body-parser").urlencoded({ extended: true }));
app.use(require("cookie-parser")(serverConfig.Server.CookieSecret));
app.use(express.static("./dist"));
app.use("/flags", express.static("./node_modules/svg-country-flags/svg"));

app.get("/auth-fail", (req, res) => {
  res.send("Please use the login link to access the game");
});

app.get("/login/:id", (req, res) => {
  const id = req.params.id;
  const instance = game.loadInstance();
  const player = game.getPlayer(instance, id);
  if (player) {
    res.cookie("id", player.id, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.redirect("/");
  } else {
    res.send("Invalid ID");
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("id");
  res.redirect("/auth-fail");
});

app.post("/jury", (req, res) => {
  if (
    !req.body ||
    typeof req.body.pin != "number" ||
    typeof req.body.code != "string"
  ) {
    res.sendStatus(400);
    return;
  }
  if (req.body.pin != serverConfig.Server.AdminPin) {
    res.sendStatus(401);
    return;
  }
  const code = req.body.code.toLowerCase().trim();
  const instance = game.loadInstance();
  let found = false;
  const newPlayers = instance.players.map(player => {
    if (player.code.toLowerCase().trim() == code) {
      if (player.health > 0) {
        found = true;
        return { ...player, funds: player.funds + 1 };
      }
    }
    return player;
  });
  const newInstance = { ...instance, players: newPlayers };
  game.saveInstance(newInstance);
  updateClients();
  if (found) {
    res.status(200).send("AP awarded");
  } else {
    res.status(404).send("Could not find country");
  }
});

const server = app.listen(serverConfig.Server.Port, () => {
  console.log(`Server listening on *:${serverConfig.Server.Port}`);
});

const io = require("socket.io")(server);

io.use((socket, next) => {
  if (socket.handshake.query.update) {
    updateClients();
    socket.disconnect();
  }
  const playerId = socket.handshake.query.playerId;
  if (!playerId) {
    return next(new Error("Player ID must be provided"));
  }
  socket.playerId = playerId;
  next();
});

io.on("connection", socket => {
  updateClients();

  const playerId = socket.playerId;

  socket.on("move", payload => {
    if (
      !payload ||
      typeof payload.x != "number" ||
      typeof payload.y != "number"
    )
      return;

    const { x, y } = payload;
    let instance = game.loadInstance();
    const player = game.getPlayer(instance, playerId);

    if (
      !player ||
      player.health <= 0 ||
      player.funds < 1 ||
      game.distance(player.position, { x, y }) > gameConfig.Range.MoveDistance
    )
      return;

    const newPlayer = {
      ...player,
      position: { x, y },
      funds: player.funds - 1
    };
    instance = game.updatePlayer(instance, newPlayer);
    game.saveInstance(instance);
    updateClients();
  });

  socket.on("fire", payload => {
    if (!payload || typeof payload.targetCode != "string") return;

    const { targetCode } = payload;
    let instance = game.loadInstance();
    const player = game.getPlayer(instance, playerId);
    const target = instance.players.find(x => x.code == targetCode);

    if (
      !player ||
      !target ||
      player.health <= 0 ||
      player.funds < 1 ||
      target.health <= 0 ||
      game.distance(player.position, target.position) > player.range
    )
      return;

    const newTargetHealth = target.health - 1;
    const newPlayer = { ...player, funds: player.funds - 1 };
    const newTarget = {
      ...target,
      health: newTargetHealth,
      killer: newTargetHealth <= 0 ? newPlayer.code : undefined
    };
    instance = game.updatePlayer(instance, newPlayer);
    instance = game.updatePlayer(instance, newTarget);
    game.saveInstance(instance);
    updateClients();
  });

  socket.on("gift", payload => {
    if (!payload || typeof payload.targetCode != "string") return;

    const { targetCode } = payload;
    let instance = game.loadInstance();
    const player = game.getPlayer(instance, playerId);
    const target = instance.players.find(x => x.code == targetCode);

    if (
      !player ||
      !target ||
      player.health <= 0 ||
      player.funds < 1 ||
      target.health <= 0 ||
      game.distance(player.position, target.position) > player.range
    )
      return;

    const newPlayer = { ...player, funds: player.funds - 1 };
    const newTarget = { ...target, funds: target.funds + 1 };
    instance = game.updatePlayer(instance, newPlayer);
    instance = game.updatePlayer(instance, newTarget);
    game.saveInstance(instance);
    updateClients();
  });

  socket.on("upgrade", payload => {
    let instance = game.loadInstance();
    const player = game.getPlayer(instance, playerId);

    if (
      !player ||
      player.health <= 0 ||
      player.funds < gameConfig.Range.UpgradeCost ||
      player.range >= gameConfig.Range.MaxDistance
    )
      return;

    const newPlayer = {
      ...player,
      range: player.range + 1,
      funds: player.funds - gameConfig.Range.UpgradeCost
    };
    instance = game.updatePlayer(instance, newPlayer);
    game.saveInstance(instance);
    updateClients();
  });
});

function updateClients() {
  const instance = game.loadInstance();
  for (const socketId in io.sockets.connected) {
    const socket = io.sockets.connected[socketId];
    const payload = {
      config: gameConfig,
      players: [
        ...instance.players
          .filter(player => player.id != socket.playerId)
          .filter(player => player.health > 0)
          .map(player => ({
            country: player.country,
            code: player.code,
            position: player.position
          })),
        instance.players.find(player => player.id == socket.playerId)
      ]
    };
    socket.emit("update", payload);
  }
}

cron.schedule(gameConfig.AP.PaymentCron, () => {
  const instance = game.loadInstance();
  const newInstance = game.payment(instance);
  game.saveInstance(newInstance);
  updateClients();
});
