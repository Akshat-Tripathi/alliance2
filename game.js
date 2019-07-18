const fs = require("fs");

const FILENAME = "data.json";

function distance(a = { x: 0, y: 0 }, b = { x: 0, y: 0 }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getPlayer(instance, playerId) {
  if (typeof playerId != "string") playerId = "";
  return instance.players.find(
    player => player.id.toLowerCase().trim() == playerId.toLowerCase().trim()
  );
}

function updatePlayer(instance, newPlayer) {
  return {
    ...instance,
    players: instance.players.map(player => {
      if (player.id == newPlayer.id) return newPlayer;
      else return player;
    })
  };
}

function payment(instance) {
  const newPlayers = instance.players.map(player => {
    if (player.health > 0) {
      return { ...player, funds: player.funds + 1 };
    } else {
      return player;
    }
  });
  return { ...instance, players: newPlayers };
}

function loadInstance() {
  const exists = fs.existsSync(FILENAME);
  if (exists) {
    const instance = JSON.parse(fs.readFileSync(FILENAME, "utf8"));
    if (!instance.version) {
      instance.version = 0;
      archiveInstance(instance);
    }
    return instance;
  } else {
    return {
      players: [],
      version: 0
    };
  }
}

function saveInstance(instance) {
  instance = { ...instance, version: instance.version + 1 };
  archiveInstance(instance);
  const jsonInstance = JSON.stringify(instance);
  fs.writeFileSync(FILENAME, jsonInstance, "utf8");
}

function archiveInstance(instance) {
  const archiveExists = fs.existsSync("archive");
  if (!archiveExists) fs.mkdirSync("archive");

  const jsonInstance = JSON.stringify(instance);
  fs.writeFileSync(
    `archive/archive-${instance.version}.json`,
    jsonInstance,
    "utf8"
  );
}

module.exports = {
  distance,
  getPlayer,
  updatePlayer,
  payment,
  loadInstance,
  saveInstance
};
