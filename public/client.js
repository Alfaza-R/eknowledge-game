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

// Buat animasi: bandingin state antar render biar cuma yang berubah yang di-animate.
let prevStatus = null;
let prevTopSig = null;
let prevBoard = null;
let celebrated = false;

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
  if (name !== "game") {
    $("game-root").classList.remove("wide");
    screens.game.classList.remove("uno-mode");
  }
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
  if (view.status === "lobby") {
    // reset penanda animasi tiap balik ke lobby (game baru)
    prevBoard = null; prevTopSig = null; celebrated = false;
    renderLobby(view);
  } else if (view.gameType === "uno") renderUno(view);
  else renderTicTacToe(view);
  prevStatus = view.status;
});

// ---------------------------------------------------------------------------
// RENDER: TIC-TAC-TOE
// ---------------------------------------------------------------------------
function renderTicTacToe(view) {
  show("game");
  const g = view.game;
  const root = $("screen-game");
  root.classList.remove("uno-mode");
  $("game-root").classList.remove("wide");
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

  // kotak mana yang baru keisi (buat animasi pop cuma di situ)
  const changed = prevBoard ? g.board.findIndex((m, i) => m && m !== prevBoard[i]) : -1;

  const board = $("board");
  g.board.forEach((mark, i) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (mark ? " filled " + mark.toLowerCase() : "");
    if (i === changed) cell.classList.add("just-placed");
    if (mark) cell.textContent = mark;
    const clickable = view.status === "playing" && view.isMyTurn && !mark;
    if (!clickable) cell.classList.add("disabled");
    cell.onclick = () => clickable && socket.emit("playMove", { roomId: currentRoom, move: { cell: i } });
    board.appendChild(cell);
  });
  prevBoard = g.board.slice();

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
    if (view.youWon && !celebrated) { celebrated = true; confettiBurst(); }
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

// huruf awal nama buat avatar placeholder (nanti diganti PNG dari user)
function initial(name) { return ((name || "?").trim().charAt(0) || "?").toUpperCase(); }

// punggung kartu placeholder (nanti diganti PNG)
function unoBackEl(extra = "") {
  const el = document.createElement("div");
  el.className = "uno-back " + extra;
  return el;
}

// posisi kursi lawan: disebar di busur atas meja, kiri → kanan
function seatPositions(k) {
  const cx = 50, cy = 44, rx = 46, ry = 42;
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = Math.PI - ((i + 1) * Math.PI) / (k + 1); // 180°..0°
    out.push({ left: cx + rx * Math.cos(t), top: cy - ry * Math.sin(t) });
  }
  return out;
}

function renderUno(view) {
  show("game");
  const g = view.game;
  const root = $("screen-game");
  root.classList.add("uno-mode");
  $("game-root").classList.add("wide");
  root.innerHTML = "";

  const firstDeal = prevStatus !== "playing";
  const topSig = JSON.stringify(g.topCard);
  const topChanged = topSig !== prevTopSig;
  prevTopSig = topSig;

  const playing = view.status === "playing";
  const canDraw = playing && view.isMyTurn && !g.iDrew;
  const emitMove = (m) => socket.emit("playMove", { roomId: currentRoom, move: m });

  // ===== MEJA =====
  const table = document.createElement("div");
  table.className = "uno-table";

  // arah putaran (placeholder)
  const dir = document.createElement("div");
  dir.className = "uno-dir " + (g.direction === 1 ? "cw" : "ccw");
  dir.textContent = g.direction === 1 ? "↻" : "↺";
  table.appendChild(dir);

  // pusat: deck + buangan + warna aktif
  const play = document.createElement("div");
  play.className = "uno-play";
  const piles = document.createElement("div");
  piles.className = "uno-piles";

  const deck = unoBackEl("deck" + (canDraw ? " playable" : ""));
  deck.innerHTML = `<small>${g.drawPileCount}</small>`;
  if (canDraw) deck.onclick = () => emitMove({ type: "draw" });
  piles.appendChild(deck);

  const topEl = unoCardEl(g.topCard, {});
  topEl.classList.add("discard");
  if (topChanged) topEl.classList.add("played");
  piles.appendChild(topEl);
  play.appendChild(piles);

  const color = document.createElement("div");
  color.className = "uno-color " + g.currentColor;
  color.innerHTML = `<span></span>${COLOR_ID[g.currentColor] || ""}`;
  play.appendChild(color);
  table.appendChild(play);

  // ===== LAWAN mengelilingi meja =====
  const pos = seatPositions(g.opponents.length);
  g.opponents.forEach((o, idx) => {
    const seat = document.createElement("div");
    seat.className = "uno-seat" + (o.isTurn ? " turn" : "");
    seat.style.left = pos[idx].left + "%";
    seat.style.top = pos[idx].top + "%";

    // kipas punggung = jumlah kartu asli lawan (lebar kipas dijaga biar nggak melebar)
    const fan = document.createElement("div");
    fan.className = "seat-fan";
    const count = Math.min(o.count, 25); // batas aman DOM
    const cardW = 26, areaW = 96;
    const step = count > 1 ? Math.min(cardW - 5, (areaW - cardW) / (count - 1)) : 0;
    const arc = Math.min(58, count * 6); // total derajat kipas
    for (let i = 0; i < count; i++) {
      const b = unoBackEl("mini");
      const ang = count > 1 ? (i - (count - 1) / 2) * (arc / (count - 1)) : 0;
      if (i > 0) b.style.marginLeft = step - cardW + "px";
      b.style.transform = `rotate(${ang}deg) translateY(${Math.abs(ang) * 0.3}px)`;
      b.style.zIndex = i;
      fan.appendChild(b);
    }
    seat.appendChild(fan);

    const info = document.createElement("div");
    info.className = "seat-info";
    info.innerHTML = `<div class="uno-avatar">${initial(o.name)}</div>
      <div class="seat-meta"><span class="seat-name">${escapeHtml(o.name)}</span>
      <span class="seat-count">🂠 ${o.count}${o.count === 1 ? ' <span class="uno-badge">UNO!</span>' : ""}</span></div>`;
    seat.appendChild(info);
    table.appendChild(seat);
  });

  // ===== TANGAN KAMU (kipas bawah) =====
  const hand = document.createElement("div");
  hand.className = "uno-hand-fan";
  const n = g.myHand.length;
  const spread = Math.min(8, 78 / Math.max(n, 1));
  g.myHand.forEach((card, i) => {
    const canPlay = playing && view.isMyTurn && card.playable;
    const el = unoCardEl(card, { playable: canPlay, onClick: canPlay ? () => playUnoCard(card, i) : null });
    const ang = (i - (n - 1) / 2) * spread;
    el.style.setProperty("--ang", ang + "deg");
    el.style.setProperty("--lift", Math.abs(ang) * 0.6 + "px");
    if (firstDeal) { el.classList.add("deal"); el.style.animationDelay = i * 45 + "ms"; }
    hand.appendChild(el);
  });
  table.appendChild(hand);

  // ===== Hasil (overlay di atas meja) =====
  if (view.status === "finished") {
    const over = document.createElement("div");
    over.className = "uno-result-overlay";
    const box = document.createElement("div");
    box.className = "uno-result-box";
    const r = document.createElement("p");
    r.className = "result";
    r.style.color = view.youWon ? "var(--ok)" : "var(--fg)";
    r.textContent = view.resultText;
    box.appendChild(r);
    if (view.youAreHost) {
      const again = document.createElement("button");
      again.className = "primary";
      again.textContent = "Main lagi";
      again.onclick = () => socket.emit("playAgain", { roomId: currentRoom });
      box.appendChild(again);
    }
    over.appendChild(box);
    table.appendChild(over);
    if (view.youWon && !celebrated) { celebrated = true; confettiBurst(); }
  }

  root.appendChild(table);

  // ===== BAR bawah: giliran, aksi terakhir, pass =====
  const bar = document.createElement("div");
  bar.className = "uno-bar";
  const tSpan = document.createElement("span");
  tSpan.className = "uno-turn" + (playing && view.isMyTurn ? " my-turn" : "");
  tSpan.textContent = playing ? (view.isMyTurn ? "Giliran kamu" : `Giliran ${view.currentTurnName}…`) : "";
  bar.appendChild(tSpan);
  if (g.lastAction) {
    const la = document.createElement("span");
    la.className = "uno-last";
    la.textContent = g.lastAction;
    bar.appendChild(la);
  }
  if (playing && view.isMyTurn && g.iDrew) {
    const pass = document.createElement("button");
    pass.className = "primary pass-btn";
    pass.textContent = "Lewati";
    pass.onclick = () => emitMove({ type: "pass" });
    bar.appendChild(pass);
  }
  root.appendChild(bar);
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

function confettiBurst() {
  const colors = ["#e4483b", "#f2b400", "#3fae4a", "#3b7de4", "#5b93ff", "#ffffff"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.35 + "s";
    p.style.animationDuration = 1.8 + Math.random() * 1.4 + "s";
    p.style.opacity = 0.9;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3400);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();
