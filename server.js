// server.js — Express + Socket.IO bootstrap
//
// Ini "bandar"-nya. Client cuma kirim niat lewat socket; server yang mutusin & kabarin.
// Prinsip: server pegang state, validasi semua move, broadcast VIEW per pemain.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const roomStore = require("./src/rooms");

// Registry game: gameType -> module. Nambah game baru = tambah satu baris di sini.
const games = {
  tictactoe: require("./src/games/tictactoe"),
  uno: require("./src/games/uno"),
  ludo: require("./src/games/ludo"),
};

const app = express();
const PUBLIC_DIR = path.join(__dirname, "public");

// Cache-busting: sisipin ?v=<mtime aset> ke style.css & client.js tiap serve index.html,
// + no-cache di HTML-nya. Jadi tiap deploy (file berubah → mtime berubah → ?v beda),
// browser DIPAKSA ambil aset baru. Gak ada lagi "keliatan gak berubah" gara-gara cache.
function assetVersion() {
  try {
    const a = fs.statSync(path.join(PUBLIC_DIR, "client.js")).mtimeMs;
    const b = fs.statSync(path.join(PUBLIC_DIR, "style.css")).mtimeMs;
    return Math.floor(Math.max(a, b)).toString(36);
  } catch { return Date.now().toString(36); }
}
app.get(["/", "/index.html"], (req, res) => {
  let html;
  try { html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8"); }
  catch { return res.status(500).send("index.html gak ketemu"); }
  const v = assetVersion();
  html = html
    .replace('href="style.css"', `href="style.css?v=${v}"`)
    .replace('src="client.js"', `src="client.js?v=${v}"`);
  res.set("Cache-Control", "no-cache");
  res.type("html").send(html);
});

app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const io = new Server(server, {
  // Reconnect mulus: kalau koneksi putus sebentar (HP ngadat, ganti wifi, tab ke-background),
  // socket balik dgn ID SAMA + event yang ke-lewat dikirim ulang → pemain gak ke-orphan.
  connectionStateRecovery: {
    maxDisconnectionDuration: 90_000, // 1.5 menit
    skipMiddlewares: true,
  },
  // lebih sabar nungguin heartbeat sebelum mutusin (jaringan HP sering telat dikit)
  pingInterval: 20_000,
  pingTimeout: 30_000,
});

const GRACE_MS = 90_000; // grace period sebelum pemain dianggap keluar (samain sama window recovery)
const disconnectTimers = new Map(); // socketId -> timeout, buat batalin kalau reconnect
const TURN_MS = Number(process.env.TURN_MS) || 60_000; // batas waktu per giliran (auto-skip kalau lewat)
const turnTimers = new Map(); // roomId -> timeout
const CHAT_MAX = 50;          // riwayat chat yang disimpen per room
const AVATAR_MAX = 10;        // jumlah aset avatar (av1..av10)
const pickAvatar = (a) => { const n = Math.round(Number(a)); return n >= 1 && n <= AVATAR_MAX ? n : 1 + Math.floor(Math.random() * AVATAR_MAX); };
const lastChatAt = new Map(); // socketId -> timestamp terakhir kirim (rem anti-spam)
const spillTimers = new Map(); // roomId -> timeout (re-broadcast pas spill kelar)

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
      avatar: p.avatar,
      connected: p.connected,
      isHost: p.id === room.hostId,
      isYou: p.id === playerId,
    })),
    // map socketId -> avatar, biar render tiap game (opponents/players by id) bisa nampilin avatar
    avatars: Object.fromEntries(room.players.map((p) => [p.id, p.avatar])),
  };

  if (room.status === "playing" || room.status === "finished") {
    const game = games[room.gameType];
    view.game = game.getPlayerView(room.state, playerId);
    // tambahin nama pemain giliran sekarang (module game gak tau nama)
    const turnId = view.game.currentTurnPlayerId;
    const turnPlayer = room.players.find((p) => p.id === turnId);
    view.currentTurnName = turnPlayer ? turnPlayer.name : null;
    view.isMyTurn = turnId === playerId;
    if (room.status === "playing") view.turnDeadline = room.turnDeadline || null;
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

// ---- Timer giliran (auto-skip 60 detik) ----
function clearTurnTimer(roomId) {
  const t = turnTimers.get(roomId);
  if (t) { clearTimeout(t); turnTimers.delete(roomId); }
}

// pas ada kartu spill dimainin, re-broadcast pas 10 detiknya kelar biar kartu ke-hide lagi
function scheduleSpillEnd(room) {
  const prev = spillTimers.get(room.id);
  if (prev) clearTimeout(prev);
  const until = room.state && room.state.spillUntil;
  if (!until || until <= Date.now()) return;
  spillTimers.set(room.id, setTimeout(() => {
    spillTimers.delete(room.id);
    const r = roomStore.getRoom(room.id);
    if (r) broadcastRoom(r);
  }, until - Date.now() + 60));
}

function scheduleTurnTimer(room) {
  clearTurnTimer(room.id);
  const game = games[room.gameType];
  if (!room || room.status !== "playing" || !game.forceSkip) {
    room && (room.turnDeadline = null);
    return;
  }
  room.turnDeadline = Date.now() + TURN_MS;
  turnTimers.set(room.id, setTimeout(() => {
    try {
      const r = roomStore.getRoom(room.id);
      if (!r || r.status !== "playing") return;
      r.state = game.forceSkip(r.state);          // pemain kehabisan waktu → tarik & skip
      const end = game.checkEnd(r.state);
      if (end !== null) { r.status = "finished"; r.result = end; }
      if (r.status === "playing") scheduleTurnTimer(r); else clearTurnTimer(r.id);
      broadcastRoom(r);
    } catch (e) {
      // jangan sampai 1 error di timer nge-crash-in seluruh server (semua pemain keputus)
      console.error("[turnTimer] error:", e);
    }
  }, TURN_MS));
}

// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  // --- Koneksi PULIH (socket.id sama kaya sebelum putus) ---
  // Batalin timer "keluar", tandain nyambung lagi, kirim state terbaru.
  if (socket.recovered) {
    const t = disconnectTimers.get(socket.id);
    if (t) { clearTimeout(t); disconnectTimers.delete(socket.id); }
    for (const room of roomStore.rooms.values()) {
      const p = room.players.find((pl) => pl.id === socket.id);
      if (p) {
        p.connected = true; socket.join(room.id);
        socket.emit("chatHistory", room.chat || []); // pulihin isi chat juga
        broadcastRoom(room); break;
      }
    }
  }

  // --- Bikin room ---
  socket.on("createRoom", ({ name, game, avatar }, cb) => {
    // Tiap page WordPress kirim ?game=... (tictactoe/ludo/uno). Kalau game-nya belum
    // ada / belum diimplement, fallback ke tictactoe biar gak error.
    const gameType = games[game] ? game : "tictactoe";
    const playerName = (name || "Guest").slice(0, 20);
    const room = roomStore.createRoom(gameType, { id: socket.id, name: playerName, avatar: pickAvatar(avatar) });
    socket.join(room.id);
    socket.emit("chatHistory", room.chat || []); // reset/isi panel chat
    if (cb) cb({ ok: true, roomId: room.id });
    broadcastRoom(room);
  });

  // --- Gabung room ---
  socket.on("joinRoom", ({ roomId, name, avatar }, cb) => {
    const playerName = (name || "Guest").slice(0, 20);
    const existing = roomStore.getRoom(roomId);
    const maxPlayers = existing && games[existing.gameType] ? games[existing.gameType].maxPlayers : 2;
    const result = roomStore.joinRoom(roomId, { id: socket.id, name: playerName, avatar: pickAvatar(avatar) }, maxPlayers);
    if (!result.ok) {
      if (cb) cb({ ok: false, error: result.error });
      return;
    }
    socket.join(roomId);
    socket.emit("chatHistory", result.room.chat || []); // pemain baru langsung liat chat sebelumnya
    if (cb) cb({ ok: true, roomId });
    broadcastRoom(result.room);
  });

  // --- Mulai game (cuma host) ---
  socket.on("startGame", ({ roomId }) => {
    const room = roomStore.getRoom(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;        // bukan host
    if (room.status !== "lobby") return;          // udah jalan

    const game = games[room.gameType];
    const minPlayers = game.minPlayers || 2;
    if (room.players.length < minPlayers) return; // belum cukup pemain

    room.state = game.init(room.players);
    room.status = "playing";
    scheduleTurnTimer(room); // set deadline dulu biar keikut di view
    broadcastRoom(room);
  });

  // --- Jalan (move-nya beda tiap game: ttt {cell}, uno {type,cardIndex,chosenColor}) ---
  socket.on("playMove", ({ roomId, move }) => {
    const room = roomStore.getRoom(roomId);
    if (!room || room.status !== "playing") return;

    const game = games[room.gameType];
    // VALIDASI di server — kiriman client gak dipercaya bulat-bulat
    if (!game.validateMove(room.state, socket.id, move)) return;

    // actorId dikirim juga: ada aksi yang sah DI LUAR giliran (mis. Uno callUno/catchUno)
    room.state = game.applyMove(room.state, move, socket.id);

    const end = game.checkEnd(room.state);
    if (end !== null) {
      room.status = "finished";
      room.result = end; // playerId pemenang | "draw"
    }
    if (room.status === "playing") scheduleTurnTimer(room);
    else clearTurnTimer(room.id);
    scheduleSpillEnd(room);
    broadcastRoom(room);
  });

  // --- Main lagi (reset ke lobby, cuma host) ---
  socket.on("playAgain", ({ roomId }) => {
    const room = roomStore.getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== "finished") return;
    clearTurnTimer(room.id);
    room.status = "lobby";
    room.state = null;
    room.result = null;
    room.turnDeadline = null;
    broadcastRoom(room);
  });

  // --- CHAT (dipakai semua game; server yang nentuin nama & nyimpen riwayat) ---
  socket.on("chat", ({ roomId, text }) => {
    const room = roomStore.getRoom(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return; // bukan anggota room → tolak
    const msg = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!msg) return;
    const now = Date.now();
    if (now - (lastChatAt.get(socket.id) || 0) < 350) return; // rem anti-spam
    lastChatAt.set(socket.id, now);

    if (!room.chat) room.chat = [];
    const entry = { playerId: socket.id, name: player.name, text: msg, ts: now };
    room.chat.push(entry);
    if (room.chat.length > CHAT_MAX) room.chat.splice(0, room.chat.length - CHAT_MAX);
    io.to(roomId).emit("chat", entry);
  });

  // --- Putus koneksi ---
  socket.on("disconnect", () => {
    lastChatAt.delete(socket.id);
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
    clearTurnTimer(roomId);
    roomStore.removeRoom(roomId);
    return;
  }

  // host yang keluar → pindahin host ke pemain berikutnya
  if (room.hostId === socketId) {
    room.hostId = room.players[0].id;
  }

  if (room.status === "playing") {
    const game = games[room.gameType];
    const minPlayers = game.minPlayers || 2;

    // Game yang bisa lanjut walau pemain berkurang (mis. Uno 3+): buang pemainnya
    // dari state, giliran diatur ulang. Game tanpa removePlayer (ttt) lewat aja.
    if (game.removePlayer && room.players.length >= minPlayers) {
      room.state = game.removePlayer(room.state, socketId);
      const end = game.checkEnd(room.state);
      if (end !== null) {
        room.status = "finished";
        room.result = end;
      }
    } else if (room.players.length < minPlayers) {
      // pemain gak cukup buat lanjut → selesai, sisanya menang WO
      room.status = "finished";
      room.result = room.players[0].id;
    }
  }

  if (room.status === "playing") scheduleTurnTimer(room);
  else clearTurnTimer(roomId);
  broadcastRoom(room);
}

// Jaring pengaman: error tak tertangkap JANGAN nge-kill proses (kalau mati, SEMUA pemain
// keputus sekaligus). Cukup di-log; state di memori tetep hidup.
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Eknowledge game server jalan di http://localhost:${PORT}`);
});
