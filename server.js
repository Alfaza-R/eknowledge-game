// server.js — Express + Socket.IO bootstrap
//
// Ini "bandar"-nya. Client cuma kirim niat lewat socket; server yang mutusin & kabarin.
// Prinsip: server pegang state, validasi semua move, broadcast VIEW per pemain.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const roomStore = require("./src/rooms");

// Registry game: gameType -> module. Nambah game baru = tambah satu baris di sini.
const games = {
  tictactoe: require("./src/games/tictactoe"),
  // ludo: require("./src/games/ludo"),
  // uno: require("./src/games/uno"),
};

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

const GRACE_MS = 30_000; // grace period 30 detik sebelum pemain dianggap keluar beneran
const disconnectTimers = new Map(); // socketId -> timeout, buat batalin kalau reconnect

// ---------------------------------------------------------------------------
// Bikin VIEW yang dikirim ke satu pemain. Tiap pemain bisa beda view-nya
// (penting nanti buat Uno; tic-tac-toe kebetulan sama semua).
// ---------------------------------------------------------------------------
function viewFor(room, playerId) {
  const view = {
    roomId: room.id,
    gameType: room.gameType,
    status: room.status,
    youAreHost: room.hostId === playerId,
    players: room.players.map((p) => ({
      name: p.name,
      connected: p.connected,
      isHost: p.id === room.hostId,
      isYou: p.id === playerId,
    })),
  };

  if (room.status === "playing" || room.status === "finished") {
    const game = games[room.gameType];
    view.game = game.getPlayerView(room.state, playerId);
    // tambahin nama pemain giliran sekarang (module game gak tau nama)
    const turnId = view.game.currentTurnPlayerId;
    const turnPlayer = room.players.find((p) => p.id === turnId);
    view.currentTurnName = turnPlayer ? turnPlayer.name : null;
    view.isMyTurn = turnId === playerId;
  }

  if (room.status === "finished") {
    if (room.result === "draw") {
      view.resultText = "Seri!";
    } else {
      const winner = room.players.find((p) => p.id === room.result);
      view.resultText = winner ? `${winner.name} menang!` : "Selesai";
      view.youWon = room.result === playerId;
    }
  }

  return view;
}

// Kirim view masing-masing ke tiap pemain di room.
function broadcastRoom(room) {
  for (const p of room.players) {
    if (p.connected) io.to(p.id).emit("state", viewFor(room, p.id));
  }
}

// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  // --- Bikin room ---
  socket.on("createRoom", ({ name }, cb) => {
    const playerName = (name || "Guest").slice(0, 20);
    const room = roomStore.createRoom("tictactoe", { id: socket.id, name: playerName });
    socket.join(room.id);
    if (cb) cb({ ok: true, roomId: room.id });
    broadcastRoom(room);
  });

  // --- Gabung room ---
  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const playerName = (name || "Guest").slice(0, 20);
    const result = roomStore.joinRoom(roomId, { id: socket.id, name: playerName });
    if (!result.ok) {
      if (cb) cb({ ok: false, error: result.error });
      return;
    }
    socket.join(roomId);
    if (cb) cb({ ok: true, roomId });
    broadcastRoom(result.room);
  });

  // --- Mulai game (cuma host) ---
  socket.on("startGame", ({ roomId }) => {
    const room = roomStore.getRoom(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;        // bukan host
    if (room.status !== "lobby") return;          // udah jalan
    if (room.players.length < 2) return;          // belum cukup pemain

    const game = games[room.gameType];
    room.state = game.init(room.players);
    room.status = "playing";
    broadcastRoom(room);
  });

  // --- Jalan (taro X/O di kotak) ---
  socket.on("playMove", ({ roomId, cell }) => {
    const room = roomStore.getRoom(roomId);
    if (!room || room.status !== "playing") return;

    const game = games[room.gameType];
    // VALIDASI di server — kiriman client gak dipercaya bulat-bulat
    if (!game.validateMove(room.state, socket.id, { cell })) return;

    room.state = game.applyMove(room.state, { cell });

    const end = game.checkEnd(room.state);
    if (end !== null) {
      room.status = "finished";
      room.result = end; // playerId pemenang | "draw"
    }
    broadcastRoom(room);
  });

  // --- Main lagi (reset ke lobby, cuma host) ---
  socket.on("playAgain", ({ roomId }) => {
    const room = roomStore.getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== "finished") return;
    room.status = "lobby";
    room.state = null;
    room.result = null;
    broadcastRoom(room);
  });

  // --- Putus koneksi ---
  socket.on("disconnect", () => {
    // cari room yang ada pemain ini
    for (const room of roomStore.rooms.values()) {
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) continue;

      player.connected = false;
      broadcastRoom(room); // kabarin yang lain: "X terputus..."

      // Grace period: tungguin 30 detik, siapa tau cuma wifi ngadat.
      const timer = setTimeout(() => finalizeLeave(room.id, socket.id), GRACE_MS);
      disconnectTimers.set(socket.id, timer);
      break;
    }
  });
});

// Dipanggil setelah grace period habis dan pemain gak balik.
function finalizeLeave(roomId, socketId) {
  disconnectTimers.delete(socketId);
  const room = roomStore.getRoom(roomId);
  if (!room) return;

  // buang pemainnya
  room.players = room.players.filter((p) => p.id !== socketId);

  // semua keluar → hapus room biar gak jadi zombie di memori
  if (room.players.length === 0) {
    roomStore.removeRoom(roomId);
    return;
  }

  // host yang keluar → pindahin host ke pemain berikutnya
  if (room.hostId === socketId) {
    room.hostId = room.players[0].id;
  }

  // kalau game lagi jalan dan pemain berkurang, tic-tac-toe (butuh 2) gak bisa lanjut → selesai
  if (room.status === "playing" && room.players.length < 2) {
    room.status = "finished";
    room.result = room.players[0].id; // yang tersisa menang WO
  }

  broadcastRoom(room);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Eknowledge game server jalan di http://localhost:${PORT}`);
});
