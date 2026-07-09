// client.js — penampil + pengirim niat. TIDAK nyimpen aturan game.
// Server yang mutusin semua; di sini kita cuma render "view" yang dikirim server.

const socket = io();

// Daftar game (buat layar pilihan + judul). Harus cocok sama key di server.
const GAMES = {
  tictactoe: { name: "Tic-Tac-Toe", desc: "2 pemain, klasik", emoji: "❌⭕", ready: true },
  uno: { name: "Uno", desc: "2–8 pemain, kartu", emoji: "🎴", ready: true },
  ludo: { name: "Ludo", desc: "segera hadir", emoji: "🎲", ready: false },
};

// Ambil ?room=, ?name=, ?game= dari URL (diisi WordPress lewat iframe).
const params = new URLSearchParams(location.search);
const roomFromUrl = (params.get("room") || "").toUpperCase();
const nameFromUrl = params.get("name") || "";
const gameFromUrl = params.get("game");

let chosenGame = gameFromUrl && GAMES[gameFromUrl] ? gameFromUrl : "tictactoe";
let currentRoom = null;

const $ = (id) => document.getElementById(id);
const screens = {
  select: $("screen-select"),
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
  loading: $("screen-loading"),
};
function show(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
}
function myName() {
  return $("input-name").value.trim() || nameFromUrl || "Guest";
}

// ===========================================================================
// LAYAR PILIH GAME
// ===========================================================================
function buildGameList() {
  const list = $("game-list");
  list.innerHTML = "";
  for (const key in GAMES) {
    const g = GAMES[key];
    const card = document.createElement("button");
    card.className = "game-card" + (g.ready ? "" : " disabled");
    card.innerHTML = `<span class="game-emoji">${g.emoji}</span>
      <span class="game-name">${g.name}</span>
      <span class="game-desc">${g.desc}</span>`;
    if (g.ready) card.onclick = () => openHome(key);
    else card.disabled = true;
    list.appendChild(card);
  }
}

function openHome(key) {
  chosenGame = key;
  $("home-title").textContent = GAMES[key].name;
  $("home-sub").textContent = GAMES[key].desc;
  $("input-name").value = nameFromUrl;
  show("home");
}

$("btn-back").onclick = () => show("select");

// gabung via kode dari layar pilih (game-agnostik)
$("btn-join-select").onclick = () => {
  const roomId = $("input-room-select").value.trim().toUpperCase();
  if (!roomId) { $("select-error").textContent = "Isi kode room dulu"; return; }
  socket.emit("joinRoom", { roomId, name: myName() }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else $("select-error").textContent = res.error || "Gagal gabung";
  });
};

// ===========================================================================
// LAYAR HOME (bikin / gabung buat game terpilih)
// ===========================================================================
$("btn-create").onclick = () => {
  socket.emit("createRoom", { name: myName(), game: chosenGame }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else $("home-error").textContent = res.error || "Gagal bikin room";
  });
};

$("btn-join").onclick = () => {
  const roomId = $("input-room").value.trim().toUpperCase();
  if (!roomId) { $("home-error").textContent = "Isi kode room dulu"; return; }
  socket.emit("joinRoom", { roomId, name: myName() }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else $("home-error").textContent = res.error || "Gagal gabung";
  });
};

// ===========================================================================
// LAYAR LOBBY
// ===========================================================================
$("btn-start").onclick = () => socket.emit("startGame", { roomId: currentRoom });
$("btn-copy").onclick = () => {
  const link = `${location.origin}${location.pathname}?room=${currentRoom}`;
  navigator.clipboard?.writeText(link);
  $("btn-copy").textContent = "Link tersalin ✓";
  setTimeout(() => ($("btn-copy").textContent = "Salin link undangan"), 1500);
};

function renderLobby(view) {
  show("lobby");
  $("lobby-game").textContent = GAMES[view.gameType]?.name || view.gameType;
  $("lobby-code").textContent = view.roomId;

  const list = $("player-list");
  list.innerHTML = "";
  for (const p of view.players) {
    const li = document.createElement("li");
    let badge = "";
    if (!p.connected) badge = '<span class="badge off">terputus…</span>';
    else if (p.isHost) badge = '<span class="badge host">host</span>';
    li.innerHTML = `<span>${escapeHtml(p.name)}${p.isYou ? " (kamu)" : ""}</span>${badge}`;
    list.appendChild(li);
  }

  const canStart = view.youAreHost && view.players.length >= 2;
  $("btn-start").classList.toggle("hidden", !view.youAreHost);
  $("btn-start").disabled = !canStart;
  $("lobby-hint").textContent = view.youAreHost
    ? (canStart ? "Klik Mulai kalau pemain udah kumpul" : "Nunggu minimal 2 pemain…")
    : "Nunggu host mulai game…";
}

// ===========================================================================
// DISPATCH: state masuk → render sesuai status & jenis game
// ===========================================================================
socket.on("state", (view) => {
  currentRoom = view.roomId;
  if (view.status === "lobby") renderLobby(view);
  else if (view.gameType === "uno") renderUno(view);
  else renderTicTacToe(view);
});

// ---------------------------------------------------------------------------
// RENDER: TIC-TAC-TOE
// ---------------------------------------------------------------------------
function renderTicTacToe(view) {
  show("game");
  const g = view.game;
  const root = $("screen-game");
  root.innerHTML = `
    <p class="turn" id="ttt-turn"></p>
    <div id="board"></div>
    <p class="result hidden" id="ttt-result"></p>
    <button class="primary hidden" id="ttt-again">Main lagi</button>`;

  if (view.status === "playing") {
    $("ttt-turn").textContent = view.isMyTurn
      ? `Giliran kamu (${g.myMark})`
      : `Giliran ${view.currentTurnName}…`;
  }

  const board = $("board");
  g.board.forEach((mark, i) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (mark ? " filled " + mark.toLowerCase() : "");
    if (mark) cell.textContent = mark;
    const clickable = view.status === "playing" && view.isMyTurn && !mark;
    if (!clickable) cell.classList.add("disabled");
    cell.onclick = () => clickable && socket.emit("playMove", { roomId: currentRoom, move: { cell: i } });
    board.appendChild(cell);
  });

  if (view.status === "finished") {
    const r = $("ttt-result");
    r.textContent = view.resultText;
    r.classList.remove("hidden");
    r.style.color = view.youWon ? "var(--ok)" : "var(--fg)";
    if (view.youAreHost) {
      const again = $("ttt-again");
      again.classList.remove("hidden");
      again.onclick = () => socket.emit("playAgain", { roomId: currentRoom });
    }
  }
}

// ---------------------------------------------------------------------------
// RENDER: UNO
// ---------------------------------------------------------------------------
const UNO_LABEL = { skip: "⦸", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };
const COLOR_ID = { red: "Merah", yellow: "Kuning", green: "Hijau", blue: "Biru" };

function unoCardEl(card, { playable = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const colorClass = card.kind === "wild" || card.kind === "wild4" ? "wild" : card.color;
  el.className = `uno-card ${colorClass}` + (playable ? " playable" : "");
  el.textContent = card.kind === "num" ? card.value : UNO_LABEL[card.kind];
  if (onClick) el.onclick = onClick;
  return el;
}

function renderUno(view) {
  show("game");
  const g = view.game;
  const root = $("screen-game");
  root.innerHTML = "";

  // --- Lawan ---
  const opp = document.createElement("div");
  opp.className = "uno-opponents";
  for (const o of g.opponents) {
    const box = document.createElement("div");
    box.className = "uno-opp" + (o.isTurn ? " turn" : "");
    box.innerHTML = `<div class="uno-opp-name">${escapeHtml(o.name)}</div>
      <div class="uno-opp-count">🂠 ${o.count}${o.count === 1 ? ' <span class="uno-badge">UNO!</span>' : ""}</div>`;
    opp.appendChild(box);
  }
  root.appendChild(opp);

  // --- Tengah: warna aktif, buangan, deck ---
  const center = document.createElement("div");
  center.className = "uno-center";
  const colorDot = `<span class="color-dot ${g.currentColor}" title="Warna aktif"></span>`;
  center.innerHTML = `<div class="uno-info">${colorDot} Warna: <b>${COLOR_ID[g.currentColor] || "-"}</b>
      <span class="dir">${g.direction === 1 ? "↻" : "↺"}</span></div>`;

  const pileRow = document.createElement("div");
  pileRow.className = "uno-pile-row";
  pileRow.appendChild(unoCardEl(g.topCard, {})); // kartu teratas buangan

  const deck = document.createElement("div");
  deck.className = "uno-card deck" + (view.status === "playing" && view.isMyTurn && !g.iDrew ? " playable" : "");
  deck.innerHTML = `<span>DECK</span><small>${g.drawPileCount}</small>`;
  if (view.status === "playing" && view.isMyTurn && !g.iDrew) {
    deck.onclick = () => socket.emit("playMove", { roomId: currentRoom, move: { type: "draw" } });
  }
  pileRow.appendChild(deck);
  center.appendChild(pileRow);

  if (g.lastAction) {
    const la = document.createElement("p");
    la.className = "uno-last";
    la.textContent = g.lastAction;
    center.appendChild(la);
  }
  root.appendChild(center);

  // --- Banner giliran ---
  const turn = document.createElement("p");
  turn.className = "turn";
  if (view.status === "playing") {
    turn.textContent = view.isMyTurn ? "Giliran kamu" : `Giliran ${view.currentTurnName}…`;
  }
  root.appendChild(turn);

  // --- Tangan sendiri ---
  const hand = document.createElement("div");
  hand.className = "uno-hand";
  g.myHand.forEach((card, i) => {
    const canPlay = view.status === "playing" && view.isMyTurn && card.playable;
    const el = unoCardEl(card, {
      playable: canPlay,
      onClick: canPlay ? () => playUnoCard(card, i) : null,
    });
    hand.appendChild(el);
  });
  root.appendChild(hand);

  // --- Kontrol: pass ---
  if (view.status === "playing" && view.isMyTurn && g.iDrew) {
    const pass = document.createElement("button");
    pass.className = "primary";
    pass.textContent = "Lewati (pass)";
    pass.onclick = () => socket.emit("playMove", { roomId: currentRoom, move: { type: "pass" } });
    root.appendChild(pass);
  }

  // --- Hasil ---
  if (view.status === "finished") {
    const r = document.createElement("p");
    r.className = "result";
    r.textContent = view.resultText;
    r.style.color = view.youWon ? "var(--ok)" : "var(--fg)";
    root.appendChild(r);
    if (view.youAreHost) {
      const again = document.createElement("button");
      again.className = "primary";
      again.textContent = "Main lagi";
      again.onclick = () => socket.emit("playAgain", { roomId: currentRoom });
      root.appendChild(again);
    }
  }
}

// Klik kartu Uno: kalau wild → pilih warna dulu, selain itu langsung main.
function playUnoCard(card, index) {
  if (card.kind === "wild" || card.kind === "wild4") {
    showColorPicker((color) =>
      socket.emit("playMove", { roomId: currentRoom, move: { type: "play", cardIndex: index, chosenColor: color } })
    );
  } else {
    socket.emit("playMove", { roomId: currentRoom, move: { type: "play", cardIndex: index } });
  }
}

function showColorPicker(onPick) {
  const overlay = document.createElement("div");
  overlay.className = "color-overlay";
  overlay.innerHTML = `<div class="color-box"><p>Pilih warna:</p><div class="color-choices"></div></div>`;
  const choices = overlay.querySelector(".color-choices");
  for (const c of ["red", "yellow", "green", "blue"]) {
    const b = document.createElement("button");
    b.className = `color-choice ${c}`;
    b.title = COLOR_ID[c];
    b.onclick = () => { document.body.removeChild(overlay); onPick(c); };
    choices.appendChild(b);
  }
  document.body.appendChild(overlay);
}

// ===========================================================================
// AUTO-JOIN via link undangan (?room=)
// ===========================================================================
socket.on("connect", () => {
  if (roomFromUrl && !currentRoom) {
    show("loading");
    socket.emit("joinRoom", { roomId: roomFromUrl, name: myName() }, (res) => {
      if (res.ok) currentRoom = res.roomId;
      else init(); // gagal (penuh/udah mulai) → balik ke awal
    });
  }
});

socket.on("disconnect", () => {
  // koneksi putus — kasih tau di layar game kalau lagi main
  const t = document.querySelector("#screen-game .turn");
  if (t) t.textContent = "Koneksi terputus, nyambungin lagi…";
});

// ===========================================================================
// INIT
// ===========================================================================
function init() {
  buildGameList();
  if (roomFromUrl) show("loading");          // nunggu auto-join
  else if (gameFromUrl && GAMES[gameFromUrl]) openHome(gameFromUrl); // deep-link 1 game
  else show("select");                        // buka game.taharica.com langsung
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();
