// client.js — penampil + pengirim niat. TIDAK nyimpen aturan game.
// Server yang mutusin semua; di sini kita cuma render "view" yang dikirim server.

const socket = io();

// Ambil ?room= dan ?name= dari URL (nanti diisi WordPress lewat iframe).
const params = new URLSearchParams(location.search);
const roomFromUrl = (params.get("room") || "").toUpperCase();
const nameFromUrl = params.get("name") || "";

// Simpan roomId yang lagi aktif (dipakai buat emit playMove/startGame).
let currentRoom = null;

// --- Ambil elemen ---
const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
};
function show(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
}

// Prefill nama & room dari URL
$("input-name").value = nameFromUrl;
if (roomFromUrl) $("input-room").value = roomFromUrl;

function myName() {
  return $("input-name").value.trim() || "Guest";
}

// --- Home: bikin room ---
$("btn-create").onclick = () => {
  socket.emit("createRoom", { name: myName() }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else $("home-error").textContent = res.error || "Gagal bikin room";
  });
};

// --- Home: gabung room ---
function doJoin() {
  const roomId = $("input-room").value.trim().toUpperCase();
  if (!roomId) { $("home-error").textContent = "Isi kode room dulu"; return; }
  socket.emit("joinRoom", { roomId, name: myName() }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else $("home-error").textContent = res.error || "Gagal gabung";
  });
}
$("btn-join").onclick = doJoin;

// Kalau dibuka dari link undangan (?room=...), langsung coba gabung otomatis
if (roomFromUrl) {
  // tunggu socket connect dulu
  socket.on("connect", () => {
    if (currentRoom) return; // udah masuk
    socket.emit("joinRoom", { roomId: roomFromUrl, name: myName() }, (res) => {
      if (res.ok) currentRoom = res.roomId;
      // kalau gagal (room penuh / udah mulai), biarin user di home
    });
  });
}

// --- Lobby: tombol ---
$("btn-start").onclick = () => socket.emit("startGame", { roomId: currentRoom });
$("btn-again").onclick = () => socket.emit("playAgain", { roomId: currentRoom });
$("btn-copy").onclick = () => {
  const link = `${location.origin}${location.pathname}?room=${currentRoom}`;
  navigator.clipboard?.writeText(link);
  $("btn-copy").textContent = "Link tersalin ✓";
  setTimeout(() => ($("btn-copy").textContent = "Salin link undangan"), 1500);
};

// ===========================================================================
// Inti: terima "state" dari server, render sesuai statusnya.
// ===========================================================================
socket.on("state", (view) => {
  currentRoom = view.roomId;

  if (view.status === "lobby") renderLobby(view);
  else renderGame(view); // playing | finished
});

function renderLobby(view) {
  show("lobby");
  $("lobby-code").textContent = view.roomId;

  const list = $("player-list");
  list.innerHTML = "";
  for (const p of view.players) {
    const li = document.createElement("li");
    const nameSpan = `<span>${escapeHtml(p.name)}${p.isYou ? " (kamu)" : ""}</span>`;
    let badge = "";
    if (!p.connected) badge = '<span class="badge off">terputus…</span>';
    else if (p.isHost) badge = '<span class="badge host">host</span>';
    li.innerHTML = nameSpan + badge;
    list.appendChild(li);
  }

  // Tombol Mulai cuma buat host, dan cuma aktif kalau udah 2 pemain
  const canStart = view.youAreHost && view.players.length >= 2;
  $("btn-start").classList.toggle("hidden", !view.youAreHost);
  $("btn-start").disabled = !canStart;
  $("lobby-hint").textContent = view.youAreHost
    ? (canStart ? "" : "Nunggu 1 pemain lagi…")
    : "Nunggu host mulai game…";
}

function renderGame(view) {
  show("game");
  const g = view.game;

  // Banner giliran
  if (view.status === "playing") {
    $("turn-banner").textContent = view.isMyTurn
      ? `Giliran kamu (${g.myMark})`
      : `Giliran ${view.currentTurnName}…`;
  } else {
    $("turn-banner").textContent = "";
  }

  // Papan
  const board = $("board");
  board.innerHTML = "";
  g.board.forEach((mark, i) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (mark) {
      cell.textContent = mark;
      cell.classList.add("filled", mark.toLowerCase());
    }
    // bisa diklik cuma kalau: lagi main, giliran gua, kotak kosong
    const clickable = view.status === "playing" && view.isMyTurn && !mark;
    if (!clickable) cell.classList.add("disabled");
    cell.onclick = () => {
      if (!clickable) return;
      socket.emit("playMove", { roomId: currentRoom, cell: i });
    };
    board.appendChild(cell);
  });

  // Hasil
  const result = $("result");
  if (view.status === "finished") {
    result.textContent = view.resultText;
    result.classList.remove("hidden");
    result.style.color = view.youWon ? "var(--ok)" : "var(--fg)";
    $("btn-again").classList.toggle("hidden", !view.youAreHost);
  } else {
    result.classList.add("hidden");
    $("btn-again").classList.add("hidden");
  }
}

// Kalau socket putus lalu nyambung lagi, kembali ke home (state seat-nya udah hilang
// di server setelah grace period — versi awal belum support reclaim seat otomatis).
socket.on("disconnect", () => {
  $("turn-banner").textContent = "Koneksi terputus, nyambungin lagi…";
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
