import Vue from "vue";
import io from "socket.io-client";

const game = {
  players: [],
  config: {},
  selectedCell: { x: 0, y: 0 },
  playerId: "",
  loaded: false,
  sheetOpen: false
};

const app = new Vue({
  el: "#js-game",
  data: game,
  computed: {
    selectedPlayers() {
      return this.playersInCell(this.selectedCell.x, this.selectedCell.y);
    },
    me() {
      return this.players.find(player => player.id == this.playerId);
    },
    selectedCellInRange() {
      return this.cellInRange(this.selectedCell.x, this.selectedCell.y);
    },
    canUpgrade() {
      return (
        this.me.funds >= 2 && this.me.range < this.config.Range.MaxDistance
      );
    },
    canAct() {
      return this.me.funds >= 1;
    },
    ready() {
      return this.loaded && this.playerId != "";
    }
  },
  methods: {
    getPlayerFromCode(code) {
      return this.players.find(player => player.code == code);
    },
    isCellSelected(col, row) {
      return this.selectedCell.x == col && this.selectedCell.y == row;
    },
    playersInCell(col, row) {
      return this.players.filter(
        player =>
          player.position.x == col &&
          player.position.y == row &&
          (typeof player.health == "undefined" || player.health > 0)
      );
    },
    getClickHandler(col, row) {
      this.selectedCell = { x: col, y: row };
      this.sheetOpen = true;
      setTimeout(() => {
        document.getElementById("js-sheet").scrollLeft = 0;
      }, 0);
    },
    cellInRange(x, y) {
      return (
        distance(this.me.position, { x, y }) <= this.me.range &&
        this.me.health > 0
      );
    },
    canMoveTo(x, y) {
      //Check to see if the cell is above, below, left or right
      leftright = distance(this.me.position, { x, y }) == this.config.Range.MoveDistance;
      //Check to see if the cell is diagonal
      diagonal = distance(this.me.position, { x, y }).toFixed(3) == (Math.sqrt(2)*this.config.Range.MoveDistance).toFixed(3);
      //Check if the player is still alive
      alive = this.me.health > 0;
      return (
        (leftright || diagonal) && alive
      );
    },
    isThisPlayer(player) {
      return player.id == this.playerId;
    },
    cellsAreEqual(cell1, cell2) {
      return cell1.x == cell2.x && cell1.y == cell2.y;
    },
    getFlagUrl(code) {
      return `url(/flags/${code.toLowerCase().trim()}.svg)`;
    },
    move(position) {
      socket.emit("move", { playerId: this.playerId, ...position });
      this.sheetOpen = false;
    },
    upgradeRange() {
      socket.emit("upgrade", { playerId: this.playerId });
    },
    fireAt(targetCode) {
      socket.emit("fire", { playerId: this.playerId, targetCode });
    },
    gift(targetCode) {
      socket.emit("gift", { playerId: this.playerId, targetCode });
    }
  }
});

function distance(a = { x: 0, y: 0 }, b = { x: 0, y: 0 }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const id = document.cookie.replace(
  /(?:(?:^|.*;\s*)id\s*\=\s*([^;]*).*$)|^.*$/,
  "$1"
);

if (!id) {
  window.location = "/auth-fail";
} else {
  game.playerId = id;
}

const socket = io({
  query: {
    playerId: id
  }
});

socket.on("update", payload => {
  const { players, config } = payload;
  game.players = players;
  game.config = config;
  game.loaded = true;
});
