// client.js — penampil + pengirim niat. TIDAK nyimpen aturan game.
// Server yang mutusin semua; di sini kita cuma render "view" yang dikirim server.

const socket = io();

// Daftar game (buat layar pilihan + judul). Harus cocok sama key di server.
const GAMES = {
  tictactoe: { name: "Tic-Tac-Toe", desc: "2 pemain, klasik", emoji: "❌⭕", ready: true },
  uno: { name: "Uno", desc: "2–8 pemain, kartu", emoji: "🎴", ready: true },
  ludo: { name: "Ludo", desc: "2–4 pemain, dadu", emoji: "🎲", ready: true },
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
let ludoTokenProg = {}; // Ludo: progress bidak render sebelumnya (buat animasi jalan per-kotak)

// Uno: seleksi kartu buat stack. unoSel = index kartu terpilih (urutan tap = bawah→atas).
let lastUnoView = null;
let unoSel = [];
let prevEventId = 0; // buat trigger animasi cangkul cuma sekali per event
let unoTimerInterval = null; // countdown giliran 60 detik

function stopUnoTimer() { if (unoTimerInterval) { clearInterval(unoTimerInterval); unoTimerInterval = null; } }
function startUnoTimer(deadline) {
  stopUnoTimer();
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    document.querySelectorAll(".uno-timer").forEach((el) => {
      el.textContent = "⏱ " + left + "s";
      el.classList.toggle("low", left <= 10);
    });
    if (left <= 0) stopUnoTimer();
  };
  tick();
  unoTimerInterval = setInterval(tick, 500);
}

const $ = (id) => document.getElementById(id);
const screens = {
  select: $("screen-select"),
  home: $("screen-home"),
  join: $("screen-join"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
  loading: $("screen-loading"),
};
let pendingJoinRoom = null; // kode room yang mau dimasukin (nunggu isi nama)
function show(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
  if (name !== "game") {
    $("game-root").classList.remove("wide");
    screens.game.classList.remove("uno-mode");
    document.body.classList.remove("in-table-game");
    stopUnoTimer();
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

// ===========================================================================
// LAYAR ISI NAMA (wajib sebelum masuk room — gak boleh Guest)
// ===========================================================================
function showJoinScreen(code) {
  pendingJoinRoom = code;
  $("join-code").textContent = code;
  $("input-name-join").value = ($("input-name").value || "").trim() || nameFromUrl || "";
  $("join-error").textContent = "";
  show("join");
  setTimeout(() => $("input-name-join").focus(), 50);
}
$("btn-join-back").onclick = () => show("select");
$("btn-enter").onclick = () => {
  const name = $("input-name-join").value.trim();
  if (!name) { $("join-error").textContent = "Isi nama kamu dulu ya 🙂"; return; }
  show("loading");
  socket.emit("joinRoom", { roomId: pendingJoinRoom, name }, (res) => {
    if (res.ok) currentRoom = res.roomId;
    else { $("join-error").textContent = res.error || "Gagal masuk"; show("join"); }
  });
};

// gabung via kode dari layar pilih → isi nama dulu
$("btn-join-select").onclick = () => {
  const roomId = $("input-room-select").value.trim().toUpperCase();
  if (!roomId) { $("select-error").textContent = "Isi kode room dulu"; return; }
  showJoinScreen(roomId);
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
  showJoinScreen(roomId);
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
  unoSel = []; // tiap update dari server, reset seleksi (index tangan berubah)
  if (view.status === "lobby") {
    // reset penanda animasi tiap balik ke lobby (game baru)
    prevBoard = null; prevTopSig = null; celebrated = false; prevEventId = 0;
    renderLobby(view);
  } else if (view.gameType === "uno") renderUno(view);
  else if (view.gameType === "ludo") renderLudo(view);
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
  document.body.classList.remove("in-table-game");
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
// RENDER: LUDO
// ---------------------------------------------------------------------------
const LUDO_RING = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],
  [14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],
  [8,1],[8,0],[7,0],[6,0],
];
const LUDO_COLORS = ["red", "green", "yellow", "blue"];
const LUDO_START = [0, 13, 26, 39];
const LUDO_SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);
const LUDO_HOME = {
  0: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], 1: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  2: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], 3: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};
const LUDO_CORNER = { 0: [0,5,0,5], 1: [0,5,9,14], 2: [9,14,9,14], 3: [9,14,0,5] };
const LUDO_BASE_SLOTS = {
  0: [[1,1],[1,4],[4,1],[4,4]], 1: [[1,10],[1,13],[4,10],[4,13]],
  2: [[10,10],[10,13],[13,10],[13,13]], 3: [[10,1],[10,4],[13,1],[13,4]],
};
// koordinat [r,c] bidak dari progress (samain sama coordFor di src/games/ludo.js)
// 0=base, 1..51=cincin (relatif start), 52..57=home
function ludoCoord(seat, ti, prog) {
  if (prog <= 0) return LUDO_BASE_SLOTS[seat][ti];
  if (prog <= 51) return LUDO_RING[(LUDO_START[seat] + prog - 1) % 52];
  return LUDO_HOME[seat][prog - 52];
}

// finish tengah: 4 segitiga (gradient tepi→pusat) + glow di titik tujuan.
// atas=hijau, kanan=kuning, bawah=biru, kiri=merah (ngikut arah lane tiap warna masuk).
const LUDO_CENTER_SVG = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="lcg-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--lu-green-l)"/><stop offset="1" stop-color="var(--lu-green-d)"/>
    </linearGradient>
    <linearGradient id="lcg-right" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="var(--lu-yellow-l)"/><stop offset="1" stop-color="var(--lu-yellow-d)"/>
    </linearGradient>
    <linearGradient id="lcg-bottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="var(--lu-blue-l)"/><stop offset="1" stop-color="var(--lu-blue-d)"/>
    </linearGradient>
    <linearGradient id="lcg-left" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--lu-red-l)"/><stop offset="1" stop-color="var(--lu-red-d)"/>
    </linearGradient>
    <radialGradient id="lcg-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="rgba(255,255,255,0.95)"/>
      <stop offset="0.55" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <polygon points="0,0 100,0 50,50" fill="url(#lcg-top)"/>
  <polygon points="100,0 100,100 50,50" fill="url(#lcg-right)"/>
  <polygon points="100,100 0,100 50,50" fill="url(#lcg-bottom)"/>
  <polygon points="0,100 0,0 50,50" fill="url(#lcg-left)"/>
  <circle cx="50" cy="50" r="22" fill="url(#lcg-glow)"/>
  <circle cx="50" cy="50" r="5.5" fill="rgba(255,255,255,0.92)"/>
</svg>`;
const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function ludoCellClass(r, c) {
  for (const seat of [0, 1, 2, 3])
    if (LUDO_HOME[seat].some(([hr, hc]) => hr === r && hc === c)) return "lane " + LUDO_COLORS[seat];
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return "center";
  const ringIdx = LUDO_RING.findIndex(([rr, rc]) => rr === r && rc === c);
  if (ringIdx >= 0) {
    let cls = "ring";
    const startSeat = LUDO_START.indexOf(ringIdx);
    if (startSeat >= 0) cls += " start " + LUDO_COLORS[startSeat];
    if (LUDO_SAFE.has(ringIdx)) cls += " safe";
    return cls;
  }
  for (const seat of [0, 1, 2, 3]) {
    const [r0, r1, c0, c1] = LUDO_CORNER[seat];
    if (r >= r0 && r <= r1 && c >= c0 && c <= c1) {
      const isSlot = LUDO_BASE_SLOTS[seat].some(([sr, sc]) => sr === r && sc === c);
      return "corner " + LUDO_COLORS[seat] + (isSlot ? " slot" : "");
    }
  }
  return "blank";
}

function renderLudo(view) {
  show("game");
  const g = view.game;
  const root = $("screen-game");
  root.classList.add("uno-mode");
  $("game-root").classList.add("wide");
  document.body.classList.add("in-table-game"); // minta landscape di HP
  root.innerHTML = "";

  const playing = view.status === "playing";
  const myTurn = playing && view.isMyTurn;
  const emitMove = (m) => socket.emit("playMove", { roomId: currentRoom, move: m });

  const wrap = document.createElement("div");
  wrap.className = "ludo-wrap";

  // ---- papan 15x15 ----
  const board = document.createElement("div");
  board.className = "ludo-board";
  const cells = {};
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement("div");
      cell.className = "lc " + ludoCellClass(r, c);
      cells[r + "_" + c] = cell;
      board.appendChild(cell);
    }

  // ---- dekorasi: 4 home base + finish tengah (overlay z-index:-1, di bawah bidak) ----
  LUDO_COLORS.forEach((col) => {
    const hb = document.createElement("div");
    hb.className = "ludo-home-base " + col;
    board.appendChild(hb);
  });
  const centerPiece = document.createElement("div");
  centerPiece.className = "ludo-center-piece";
  centerPiece.innerHTML = LUDO_CENTER_SVG;
  board.appendChild(centerPiece);

  // ---- bidak ----
  const tokAnim = []; // { el, key, seat, ti, prog } buat animasi jalan per-kotak
  // Kelompokin dulu per kotak: yang numpuk (beda/sama warna) digeser jadi grid kecil
  // biar SEMUA keliatan & bisa diklik (dulu yang kehimpit ketutup, gak bisa diklik).
  const byCell = {};
  for (const p of g.players) {
    const seat = LUDO_COLORS.indexOf(p.color);
    p.tokens.forEach((t, ti) => {
      const key = t.r + "_" + t.c;
      if (!cells[key]) return;
      (byCell[key] = byCell[key] || []).push({ p, seat, ti, t });
    });
  }
  for (const key in byCell) {
    const group = byCell[key];
    const cell = cells[key];
    const n = group.length;
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const subW = 100 / cols, subH = 100 / rows, size = Math.min(subW, subH) * 0.86;
    group.forEach((it, gi) => {
      const { p, seat, ti, t } = it;
      const tok = document.createElement("div");
      tok.className = "ludo-token " + p.color;
      tok.dataset.tk = p.color + ti; // key stabil buat animasi
      tok.innerHTML = '<span class="token-shadow"></span><span class="token-bead"></span>';
      if (n > 1) {
        // taro di sub-kotak (grid) biar gak saling nutupin
        tok.classList.add("stacked");
        const gc = gi % cols, gr = Math.floor(gi / cols);
        const cx = gc * subW + subW / 2, cy = gr * subH + subH / 2;
        tok.style.left = (cx - size / 2) + "%";
        tok.style.top = (cy - size / 2) + "%";
        tok.style.width = size + "%";
        tok.style.height = size + "%";
      }
      const isMine = p.color === g.myColor;
      if (isMine && myTurn && g.dice !== null && g.movable.includes(ti)) {
        tok.classList.add("movable");
        tok.onclick = () => emitMove({ type: "move", tokenIndex: ti });
      }
      cell.appendChild(tok);
      tokAnim.push({ el: tok, key: p.color + ti, seat, ti, prog: t.prog });
    });
  }
  wrap.appendChild(board);

  // ---- panel samping ----
  const panel = document.createElement("div");
  panel.className = "ludo-panel";

  const dice = document.createElement("div");
  dice.className = "ludo-dice" + (g.dice ? " rolled" : "");
  dice.textContent = g.dice ? DICE_FACE[g.dice] : "🎲";
  panel.appendChild(dice);

  const turn = document.createElement("p");
  turn.className = "turn" + (myTurn ? " my-turn" : "");
  turn.textContent = playing ? (view.isMyTurn ? "Giliran kamu" : `Giliran ${view.currentTurnName}…`) : "";
  panel.appendChild(turn);

  if (myTurn && g.canRoll) {
    panel.appendChild(primaryBtn("🎲 Lempar Dadu", () => emitMove({ type: "roll" })));
  } else if (myTurn && g.dice !== null && g.movable.length) {
    const h = document.createElement("p");
    h.className = "hint";
    h.textContent = "Pilih bidak yang mau digerakin ↑";
    panel.appendChild(h);
  }

  if (g.lastAction) {
    const la = document.createElement("p");
    la.className = "uno-last";
    la.textContent = g.lastAction;
    panel.appendChild(la);
  }

  const plist = document.createElement("div");
  plist.className = "ludo-players";
  for (const p of g.players) {
    const row = document.createElement("div");
    row.className = "ludo-prow" + (p.isTurn ? " turn" : "");
    row.innerHTML = `<span class="dotc ${p.color}"></span>${escapeHtml(p.name)}${p.id === g.currentTurnPlayerId ? "" : ""} <b>${p.done}/4</b>`;
    plist.appendChild(row);
  }
  panel.appendChild(plist);
  wrap.appendChild(panel);

  // ---- hasil menang ----
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
    board.appendChild(over);
    if (view.youWon && !celebrated) { celebrated = true; confettiBurst(); }
  }

  root.appendChild(wrap);

  // ---- animasi JALAN PER-KOTAK: bidak melompat kotak-demi-kotak nyusurin jalurnya ----
  if (prevStatus !== "playing") ludoTokenProg = {}; // game baru → reset
  for (const a of tokAnim) {
    const oldProg = ludoTokenProg[a.key];
    ludoTokenProg[a.key] = a.prog;
    if (oldProg == null || a.prog <= oldProg) continue; // baru / diam / mundur (kemakan) → gak dianimasiin

    // kumpulin titik tiap kotak yang dilewatin (prog oldProg..a.prog), relatif ke posisi FINAL
    const fb = a.el.getBoundingClientRect();
    const fx = fb.x + fb.width / 2, fy = fb.y + fb.height / 2;
    const pts = [];
    for (let pr = oldProg; pr <= a.prog; pr++) {
      const rc = ludoCoord(a.seat, a.ti, pr);
      const cel = rc && cells[rc[0] + "_" + rc[1]];
      if (!cel) { pts.push(pts.length ? pts[pts.length - 1] : { x: 0, y: 0 }); continue; }
      const b = cel.getBoundingClientRect();
      pts.push({ x: b.x + b.width / 2 - fx, y: b.y + b.height / 2 - fy });
    }
    const seg = pts.length - 1;
    if (seg < 1) continue;

    // tiap segmen = 1 lompatan kecil (naik lalu turun)
    const hop = fb.width * 0.55;
    const frames = [];
    pts.forEach((pt, i) => {
      frames.push({ offset: i / seg, transform: `translate(${pt.x}px, ${pt.y}px)`, easing: "ease-out" });
      if (i < seg) {
        const nx = pts[i + 1];
        frames.push({ offset: (i + 0.5) / seg, transform: `translate(${(pt.x + nx.x) / 2}px, ${(pt.y + nx.y) / 2 - hop}px)`, easing: "ease-in" });
      }
    });
    a.el.animate(frames, { duration: Math.min(1500, 175 * seg + 60), easing: "linear" });
  }
}

// ---------------------------------------------------------------------------
// RENDER: UNO
// ---------------------------------------------------------------------------
const UNO_LABEL = { skip: "⦸", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4", wild8: "+8", spill: "👀" };
const COLOR_ID = { red: "Merah", yellow: "Kuning", green: "Hijau", blue: "Biru" };
// warna panah arah (ngikut warna aktif): solid + lite (buat gradient/glow) + deep
const DIR_HEX = {
  red:    { solid: "#ff5a4d", lite: "#ffb4ac", deep: "#b12a20" },
  yellow: { solid: "#ffc21f", lite: "#ffe693", deep: "#b8850a" },
  green:  { solid: "#43d357", lite: "#a9f2b3", deep: "#1f8b34" },
  blue:   { solid: "#4d90ff", lite: "#accaff", deep: "#245fc0" },
};
const DIR_NEUTRAL = { solid: "#8aa0c6", lite: "#cdd8ef", deep: "#5a6f9c" };

// SVG: 2 busur tebal bikin lingkaran + arrowhead (marker orient=auto ngikut arah path).
// warna pakai CSS var biar gampang ganti ngikut warna aktif.
const UNO_DIR_SVG = `
<svg viewBox="0 0 100 100" class="uno-dir-svg" aria-hidden="true">
  <defs>
    <linearGradient id="ugrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--dir-lite,#cdd8ef)"/>
      <stop offset="0.55" stop-color="var(--dir-solid,#8aa0c6)"/>
      <stop offset="1" stop-color="var(--dir-deep,#5a6f9c)"/>
    </linearGradient>
    <marker id="uarw" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" refX="3.5" refY="9" orient="auto">
      <path d="M0,1 L17,9 L0,17 L5.5,9 Z" fill="var(--dir-solid,#8aa0c6)"/>
    </marker>
  </defs>
  <g fill="none" stroke="url(#ugrad)" stroke-width="7" stroke-linecap="round">
    <path d="M14.29 37 A38 38 0 0 1 85.71 37" marker-end="url(#uarw)"/>
    <path d="M85.71 63 A38 38 0 0 1 14.29 63" marker-end="url(#uarw)"/>
  </g>
</svg>`;

// animator putaran panah: pakai rAF + easing kecepatan biar REVERSE mulus
// (melambat → berhenti sejenak di 0 → ngebut ke arah sebaliknya), gak patah.
let unoDirRotEl = null, unoDirAngle = 0, unoDirVel = 0, unoDirTarget = 1, unoDirRAF = null, unoDirLast = 0;
function unoDirStart() {
  if (unoDirRAF != null) return;
  unoDirLast = performance.now();
  const tick = (ts) => {
    const dt = Math.min(0.05, (ts - unoDirLast) / 1000);
    unoDirLast = ts;
    if (!unoDirRotEl || !unoDirRotEl.isConnected) { unoDirRAF = null; return; } // keluar Uno → stop
    const targetVel = unoDirTarget * 68; // deg/detik (~5.3 detik/putaran)
    unoDirVel += (targetVel - unoDirVel) * (1 - Math.exp(-dt / 0.13));
    unoDirAngle = (unoDirAngle + unoDirVel * dt) % 360;
    unoDirRotEl.style.transform = `rotate(${unoDirAngle.toFixed(2)}deg)`;
    unoDirRAF = requestAnimationFrame(tick);
  };
  unoDirRAF = requestAnimationFrame(tick);
}

// urutan tampil kartu di tangan: dikumpulin per simbol (angka → aksi → wild), warna jadi tiebreak
function cardRank(card) {
  const color = { red: 0, yellow: 1, green: 2, blue: 3 }[card.color] ?? 4;
  if (card.kind === "num") return [0, card.value, color];
  if (card.kind === "skip") return [1, 0, color];
  if (card.kind === "reverse") return [1, 1, color];
  if (card.kind === "draw2") return [1, 2, color];
  if (card.kind === "spill") return [1, 3, color];
  if (card.kind === "wild") return [2, 0, 0];
  if (card.kind === "wild4") return [2, 1, 0];
  if (card.kind === "wild8") return [2, 2, 0];
  return [3, 0, 0];
}
function cmpCard(a, b) {
  const ra = cardRank(a), rb = cardRank(b);
  for (let k = 0; k < 3; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
  return 0;
}

// Warna yang PNG kartunya udah ada.
const ASSET_COLORS = new Set(["red", "yellow", "green", "blue"]);
// Prefix nama file per warna sesuai file user: m=merah, k=kuning, h=hijau, b=biru.
const COLOR_PREFIX = { red: "m", yellow: "k", green: "h", blue: "b" };

// URL gambar kartu, atau null kalau belum ada asetnya (→ pakai placeholder).
function cardImageUrl(card) {
  if (card.kind === "wild") return "assets/cards/wild/" + encodeURIComponent("wild normal") + ".png";
  if (card.kind === "wild4") return "assets/cards/wild/" + encodeURIComponent("w +4") + ".png";
  if (card.kind === "wild8") return "assets/cards/wild/" + encodeURIComponent("w +8") + ".png";
  if (!ASSET_COLORS.has(card.color)) return null;
  const p = COLOR_PREFIX[card.color];
  const v =
    card.kind === "num" ? String(card.value) :
    card.kind === "draw2" ? "+2" :
    card.kind === "skip" ? "skip" :
    card.kind === "reverse" ? "reverse" :
    card.kind === "spill" ? "spill" : null;
  if (v === null) return null;
  // nama file ada spasi & "+", jadi di-encode
  return "assets/cards/" + card.color + "/" + encodeURIComponent(p + " " + v) + ".png";
}

function unoCardEl(card, { playable = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const colorClass = card.kind === "wild" || card.kind === "wild4" ? "wild" : card.color;
  el.className = `uno-card ${colorClass}` + (playable ? " playable" : "");

  const label = document.createElement("span");
  label.className = "card-label";
  label.textContent = card.kind === "num" ? card.value : UNO_LABEL[card.kind];
  el.appendChild(label);

  const src = cardImageUrl(card);
  if (src) {
    const img = document.createElement("img");
    img.className = "card-img";
    img.alt = "";
    img.onload = () => el.classList.add("has-img"); // gambar ada → sembunyiin placeholder
    img.onerror = () => img.remove();               // gambar gagal → balik ke placeholder
    img.src = src;
    el.appendChild(img);
  }

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
  const cx = 50, cy = 38, rx = 47, ry = 40;
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
  document.body.classList.add("in-table-game"); // minta landscape di HP
  root.innerHTML = "";

  const firstDeal = prevStatus !== "playing";
  const topSig = JSON.stringify(g.topCard);
  const topChanged = topSig !== prevTopSig;
  prevTopSig = topSig;

  lastUnoView = view; // simpan buat re-render lokal pas milih kartu
  const playing = view.status === "playing";
  const canDraw = playing && view.isMyTurn && !g.iDrew && g.pendingDraw === 0 && unoSel.length === 0;
  const emitMove = (m) => socket.emit("playMove", { roomId: currentRoom, move: m });
  const inSelection = unoSel.length > 0;
  const selGroup = inSelection ? g.myHand[unoSel[0]].group : null;

  // ===== MEJA (panggung 3D: felt = meja miring di bawah, table = konten datar di atas) =====
  const stage = document.createElement("div");
  stage.className = "uno-stage";
  const felt = document.createElement("div"); // cuma gambar meja yang dimiringin (layer paling bawah)
  felt.className = "uno-felt";
  const table = document.createElement("div");
  table.className = "uno-table";
  stage.appendChild(felt);
  stage.appendChild(table);
  // ukuran kartu nyesuain layar: kecil di HP landscape, gede di desktop
  const cw = Math.max(28, Math.min(66, Math.round(Math.min(window.innerHeight * 0.11, window.innerWidth * 0.08))));
  stage.style.setProperty("--cw", cw + "px"); // di stage biar tangan (sibling table) ikut kebagian

  // banner pas kartu SPILL aktif (semua kartu keliatan)
  if (g.spillActive) {
    const sb = document.createElement("div");
    sb.className = "uno-spill-banner";
    sb.textContent = "👀 SPILL! Semua kartu keliatan";
    stage.appendChild(sb); // di stage (datar) biar banner gak ikut rebah sama meja
  }

  // arah putaran: 2 panah lengkung ngelilingin tumpukan, rebah di meja, warna ngikut warna aktif
  const dir = document.createElement("div");
  dir.className = "uno-dir" + (g.direction === 1 ? "" : " ccw");
  const rot = document.createElement("div");
  rot.className = "uno-dir-rot";
  rot.innerHTML = UNO_DIR_SVG;
  dir.appendChild(rot);
  const dh = DIR_HEX[g.currentColor] || DIR_NEUTRAL;
  dir.style.setProperty("--dir-solid", dh.solid);
  dir.style.setProperty("--dir-lite", dh.lite);
  dir.style.setProperty("--dir-deep", dh.deep);
  // deteksi REVERSE → kasih flash (cuma kalau tadinya emang lagi main, bukan render pertama)
  const newDirTarget = g.direction === 1 ? 1 : -1;
  if (unoDirTarget !== newDirTarget && prevStatus === "playing") dir.classList.add("flip-flash");
  unoDirTarget = newDirTarget;
  unoDirRotEl = rot;
  unoDirStart();
  table.appendChild(dir);

  // pusat: deck + buangan + warna aktif
  const play = document.createElement("div");
  play.className = "uno-play";
  const piles = document.createElement("div");
  piles.className = "uno-piles";

  // deck: numpuk rapi (beberapa lapis punggung), tanpa nampilin jumlah
  const deckStack = document.createElement("div");
  deckStack.className = "uno-deck-stack" + (canDraw ? " playable" : "");
  for (let i = 0; i < 4; i++) {
    const b = unoBackEl("deck");
    b.style.setProperty("--i", i);
    deckStack.appendChild(b);
  }
  if (canDraw) deckStack.onclick = () => emitMove({ type: "draw" });
  piles.appendChild(deckStack);

  // tumpukan buangan: 2–5 kartu terakhir, tercecer
  const stack = document.createElement("div");
  stack.className = "uno-discard-stack";
  const recent = g.recentDiscard && g.recentDiscard.length ? g.recentDiscard : [g.topCard];
  recent.forEach((card, i) => {
    const el = unoCardEl(card, {});
    el.classList.add("discard");
    el.style.setProperty("--spin", (card.spin || 0) + "deg");
    el.style.setProperty("--dx", (card.dx || 0) + "px");
    el.style.setProperty("--dy", (card.dy || 0) + "px");
    el.style.zIndex = i;
    stack.appendChild(el);
  });
  piles.appendChild(stack);
  play.appendChild(piles);

  const color = document.createElement("div");
  color.className = "uno-color " + g.currentColor;
  color.innerHTML = `<span></span>${COLOR_ID[g.currentColor] || ""}`;
  play.appendChild(color);
  if (g.pendingDraw > 0) {
    const pend = document.createElement("div");
    pend.className = "uno-pending";
    pend.textContent = `🔥 Tumpukan +${g.pendingDraw}`;
    play.appendChild(pend);
  }
  table.appendChild(play);

  // ===== LAWAN mengelilingi meja =====
  const pos = seatPositions(g.opponents.length);
  g.opponents.forEach((o, idx) => {
    const seat = document.createElement("div");
    seat.className = "uno-seat" + (o.isTurn ? " turn" : "") + (o.done ? " done" : "");
    seat.style.left = pos[idx].left + "%";
    seat.style.top = pos[idx].top + "%";
    seat.dataset.pid = o.id; // buat target animasi
    // muter dikit ngikut lengkung meja (kiri/kanan ngadep tengah) + depth cue (makin atas makin jauh)
    const ry = Math.max(-20, Math.min(20, (50 - pos[idx].left) * 0.42));
    const far = 1 - Math.max(0, Math.min(1, (pos[idx].top + 2) / 40)); // 0 = deket, 1 = jauh
    seat.style.setProperty("--ry", ry.toFixed(1) + "deg");
    seat.style.setProperty("--far", far.toFixed(2));

    // kipas punggung = jumlah kartu asli lawan (kalau udah selesai, gak usah)
    const fan = document.createElement("div");
    fan.className = "seat-fan";
    if (o.done) {
      fan.innerHTML = '<span class="seat-medal">✅</span>';
    } else {
      // pas spill aktif → kartu lawan keliatan (face-up), selain itu punggung
      const revealed = o.revealHand ? o.revealHand.slice(0, 20) : null;
      const shown = revealed ? revealed.length : Math.min(o.count, 25);
      const cardW = Math.round(cw * 0.52), areaW = Math.round(cw * 1.9);
      const step = shown > 1 ? Math.min(cardW - 5, (areaW - cardW) / (shown - 1)) : 0;
      const arc = Math.min(58, shown * 6);
      for (let i = 0; i < shown; i++) {
        const el = revealed ? unoCardEl(revealed[i], {}) : unoBackEl("mini");
        if (revealed) el.classList.add("reveal-mini");
        const ang = shown > 1 ? (i - (shown - 1) / 2) * (arc / (shown - 1)) : 0;
        if (i > 0) el.style.marginLeft = step - cardW + "px";
        el.style.transform = `rotate(${ang}deg) translateY(${Math.abs(ang) * 0.3}px)`;
        el.style.zIndex = i;
        fan.appendChild(el);
      }
    }
    seat.appendChild(fan);

    const info = document.createElement("div");
    info.className = "seat-info";
    const countHtml = o.done
      ? '<span class="seat-count done">selesai</span>'
      : `<span class="seat-count">🂠 ${o.count}${o.count === 1 ? ' <span class="uno-badge">UNO!</span>' : ""}</span>`;
    info.innerHTML = `<div class="uno-avatar">${initial(o.name)}</div>
      <div class="seat-meta"><span class="seat-name">${escapeHtml(o.name)}</span>${countHtml}</div>`;
    seat.appendChild(info);
    table.appendChild(seat);
  });

  // ===== TANGAN KAMU (kipas bawah) =====
  const hand = document.createElement("div");
  hand.className = "uno-hand-fan";
  const n = g.myHand.length;
  const spread = Math.min(8, 78 / Math.max(n, 1));
  const myTurn = playing && view.isMyTurn;
  // urutin tampilan per simbol biar rapi; tetep simpen index asli buat tapCard
  const ordered = g.myHand.map((card, i) => ({ card, i })).sort((a, b) => cmpCard(a.card, b.card));
  ordered.forEach(({ card, i }, pos) => {
    const selPos = unoSel.indexOf(i);
    const selected = selPos >= 0;
    // kartu ini bisa dipilih?
    let selectable = false;
    if (myTurn) {
      if (g.pendingDraw > 0) selectable = card.playable;      // cuma plus
      else if (!inSelection) selectable = card.playable;       // belum milih
      else selectable = card.group === selGroup;               // lagi milih: se-grup aja
    }
    const el = unoCardEl(card, { playable: myTurn && card.playable });
    if (selected) {
      // nomor urutan stack — ditaro DI DEPAN kartu biar keliatan
      const badge = document.createElement("span");
      badge.className = "sel-order";
      badge.textContent = selPos + 1;
      el.appendChild(badge);
    }

    // Kartu dibungkus SLOT stabil yang nangkep hover — biar kartu naik tanpa geter.
    const slot = document.createElement("div");
    slot.className = "hand-slot";
    if (selected) slot.classList.add("selected");
    else if (inSelection && !selectable) slot.classList.add("dimmed");
    if (selectable || selected) slot.onclick = () => tapCard(i);
    const ang = (pos - (n - 1) / 2) * spread;
    slot.style.setProperty("--ang", ang + "deg");
    slot.style.setProperty("--lift", Math.abs(ang) * 1.1 + "px"); // busur lebih kentara: tengah paling tinggi
    if (firstDeal) { slot.classList.add("deal"); slot.style.animationDelay = pos * 45 + "ms"; }
    slot.appendChild(el);
    hand.appendChild(slot);
  });
  stage.appendChild(hand); // tangan di luar tilt → ngadep kamera penuh, paling depan-bawah

  // ===== Hasil akhir: papan ranking (juara → kalah terakhir) =====
  if (view.status === "finished") {
    const ranking = g.ranking || [];
    const iWon = ranking[0] && ranking[0].isYou;
    const over = document.createElement("div");
    over.className = "uno-result-overlay";
    const box = document.createElement("div");
    box.className = "uno-result-box standings";

    const title = document.createElement("p");
    title.className = "result";
    title.style.color = iWon ? "var(--ok)" : "var(--fg)";
    title.textContent = iWon ? "🏆 Kamu Juara!" : "Hasil Akhir";
    box.appendChild(title);

    const list = document.createElement("div");
    list.className = "standings-list";
    ranking.forEach((p, i) => {
      const last = i === ranking.length - 1;
      const medal = i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : last ? "💀" : "🎖️";
      const row = document.createElement("div");
      row.className = "standings-row" + (p.isYou ? " you" : "") + (last ? " loser" : "");
      row.innerHTML = `<span class="st-rank">${medal}</span>
        <span class="st-name">${escapeHtml(p.name)}${p.isYou ? " (kamu)" : ""}</span>
        <span class="st-pos">#${i + 1}</span>`;
      list.appendChild(row);
    });
    box.appendChild(list);

    if (view.youAreHost) {
      const again = document.createElement("button");
      again.className = "primary";
      again.textContent = "Main lagi";
      again.onclick = () => socket.emit("playAgain", { roomId: currentRoom });
      box.appendChild(again);
    }
    over.appendChild(box);
    stage.appendChild(over); // overlay hasil di luar tilt → papan ranking datar & kebaca
    if (iWon && !celebrated) { celebrated = true; confettiBurst(); }
  }

  root.appendChild(stage);

  // ===== BAR bawah: giliran + aksi terakhir =====
  const bar = document.createElement("div");
  bar.className = "uno-bar";
  const tSpan = document.createElement("span");
  tSpan.className = "uno-turn" + (myTurn ? " my-turn" : "");
  tSpan.textContent = playing ? (view.isMyTurn ? "Giliran kamu" : `Giliran ${view.currentTurnName}…`) : "";
  bar.appendChild(tSpan);
  if (playing && view.turnDeadline) {
    const timer = document.createElement("span");
    timer.className = "uno-timer";
    bar.appendChild(timer);
  }
  if (g.lastAction) {
    const la = document.createElement("span");
    la.className = "uno-last";
    la.textContent = g.lastAction;
    bar.appendChild(la);
  }
  root.appendChild(bar);

  // jalanin/hentikan countdown
  if (playing && view.turnDeadline) startUnoTimer(view.turnDeadline);
  else stopUnoTimer();

  // ===== KONTROL: mainkan / batal / tarik / lewati =====
  const controls = document.createElement("div");
  controls.className = "uno-controls";
  if (myTurn) {
    if (g.pendingDraw > 0) {
      if (unoSel.length > 0) {
        const add = unoSel.reduce((s, i) => s + (g.myHand[i].kind === "wild4" ? 4 : 2), 0);
        controls.appendChild(primaryBtn(`Lawan +${add} (total +${g.pendingDraw + add})`, playSelection));
        controls.appendChild(ghostBtn("Batal", cancelSelection));
      } else {
        controls.appendChild(primaryBtn(`😵 Tarik ${g.pendingDraw} kartu`, () => emitMove({ type: "takeDraw" })));
      }
    } else if (unoSel.length > 0) {
      controls.appendChild(primaryBtn(`Mainkan (${unoSel.length})`, playSelection));
      controls.appendChild(ghostBtn("Batal", cancelSelection));
    } else if (g.iDrew) {
      controls.appendChild(primaryBtn("Lewati", () => emitMove({ type: "pass" })));
    }
  }
  if (controls.children.length) root.appendChild(controls);

  // ===== animasi berdasarkan event terakhir =====
  const ev = g.lastEvent;
  if (ev && ev.id !== prevEventId) {
    prevEventId = ev.id;
    if (ev.type === "draw") flyDraw(ev.by, g.youId, g.myDrawnCard);
    else if (ev.type === "play") {
      flyPlay(ev.by, g.youId, ev.n || 1, g.topCard); // lempar muka kartu ke tengah + jumlahnya
      if (ev.finished) victoryPop(ev.by, g, ev.rank); // ada yang selesai → animasi menang
    }
  }
}

// PLAY: muka kartu dilempar dari tangan/kursi ke tumpukan tengah — arc + overshoot + settle
function flyPlay(byId, youId, n, playedCard) {
  const discards = document.querySelectorAll(".uno-card.discard");
  const topDiscard = discards[discards.length - 1];
  if (!topDiscard || !playedCard) return;
  const to = topDiscard.getBoundingClientRect();
  topDiscard.style.opacity = "0"; // sembunyiin dulu, munculin pas lemparan mendarat
  let source = null;
  if (byId === youId) source = document.querySelector(".uno-hand-fan");
  else document.querySelectorAll(".uno-seat").forEach((s) => { if (s.dataset.pid === byId) source = s; });
  const from = source ? source.getBoundingClientRect() : to;

  const startL = from.left + from.width / 2 - to.width / 2;
  const startT = from.top + from.height / 2 - to.height / 2;
  const dx = to.left - startL, dy = to.top - startT;
  const arc = Math.max(40, Math.hypot(dx, dy) * 0.22 + 30); // tinggi lengkungan
  const rot = Math.round(Math.random() * 16 - 8);           // -8..8 pas mendarat

  const el = unoCardEl(playedCard, {});
  el.classList.add("fly-play-card");
  el.style.width = to.width + "px"; el.style.height = to.height + "px";
  el.style.left = startL + "px"; el.style.top = startT + "px";
  document.body.appendChild(el);

  const throwE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  el.animate([
    { offset: 0,    transform: "translate(0px,0px) scale(1) rotate(0deg)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))", easing: throwE },
    { offset: 0.5,  transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(1.15) rotate(${rot * 0.4}deg)`, filter: "drop-shadow(0 18px 22px rgba(0,0,0,0.55))", easing: throwE },
    { offset: 0.82, transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${rot}deg)`, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))", easing: "ease-out" },
    { offset: 0.91, transform: `translate(${dx}px, ${dy + 3}px) scale(1) rotate(${rot}deg)`, easing: "ease-in" },
    { offset: 1,    transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${rot}deg)` },
  ], { duration: 460, fill: "forwards", easing: "linear" });
  setTimeout(() => { if (topDiscard) topDiscard.style.opacity = "1"; }, 430);
  setTimeout(() => el.remove(), 520);

  if (n > 1) {
    const pop = document.createElement("div");
    pop.className = "count-pop";
    pop.textContent = "×" + n;
    pop.style.left = to.left + to.width / 2 + "px";
    pop.style.top = to.top + "px";
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1100);
  }
}

// animasi pas ada pemain selesai (juara ke-N)
function victoryPop(byId, g, rank) {
  const name = byId === g.youId ? "Kamu" : (g.opponents.find((o) => o.id === byId)?.name || "Pemain");
  const medal = rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎖️";
  const banner = document.createElement("div");
  banner.className = "victory-pop";
  banner.innerHTML = `<span class="vp-medal">${medal}</span><span>${escapeHtml(name)} selesai — Juara #${rank}!</span>`;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("show"));
  setTimeout(() => banner.classList.remove("show"), 2200);
  setTimeout(() => banner.remove(), 2700);
  if (rank === 1 || byId === g.youId) confettiBurst();
}

// DRAW: kartu meluncur dari deck ke tangan. Diri sendiri → flip kebuka; lawan → tetap punggung.
function flyDraw(byId, youId, drawnCard) {
  const deck = document.querySelector(".uno-deck-stack") || document.querySelector(".uno-back.deck");
  if (!deck) return;
  const from = deck.getBoundingClientRect();
  let target = null;
  if (byId === youId) target = document.querySelector(".uno-hand-fan");
  else document.querySelectorAll(".uno-seat").forEach((s) => { if (s.dataset.pid === byId) target = s; });
  const to = target ? target.getBoundingClientRect() : from;
  const isMe = byId === youId;

  // kartu teratas deck naik 5px dulu (80ms) baru kartu meluncur
  const topDeck = document.querySelector(".uno-deck-stack .uno-back.deck");
  if (topDeck) topDeck.animate(
    [{ transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "translateY(0)" }],
    { duration: 200, easing: "ease-out" }
  );

  const flip = document.createElement("div");
  flip.className = "fly-flip";
  flip.style.width = from.width + "px"; flip.style.height = from.height + "px";
  flip.style.left = from.left + "px"; flip.style.top = from.top + "px";

  const front = document.createElement("div");
  front.className = "face face-front"; // punggung kartu
  flip.appendChild(front);

  const showFace = isMe && drawnCard;
  if (showFace) {
    const back = document.createElement("div");
    back.className = "face face-back";
    const inner = unoCardEl(drawnCard, {});
    inner.style.width = "100%"; inner.style.height = "100%";
    back.appendChild(inner);
    flip.appendChild(back);
  }
  document.body.appendChild(flip);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const rotY = showFace ? 180 : 0;

  flip.animate([
    { offset: 0, transform: "translate(0px,0px) scale(0.95) rotateY(0deg)" },
    { offset: 0.5, transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(1) rotateY(${rotY * 0.5}deg)` },
    { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(1) rotateY(${rotY}deg)` },
  ], { duration: 430, delay: 80, fill: "forwards", easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" });
  setTimeout(() => flip.remove(), 560);
}

function primaryBtn(text, onClick) {
  const b = document.createElement("button");
  b.className = "primary pass-btn";
  b.textContent = text;
  b.onclick = onClick;
  return b;
}
function ghostBtn(text, onClick) {
  const b = document.createElement("button");
  b.className = "ghost pass-btn";
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

// ---- Interaksi pilih kartu (stack) ----
function tapCard(i) {
  const g = lastUnoView.game;
  const card = g.myHand[i];
  const selPos = unoSel.indexOf(i);

  if (selPos >= 0) {
    // batal pilih kartu ini + semua yang di ATAS-nya (biar urutan tetap valid)
    unoSel = unoSel.slice(0, selPos);
    return renderUno(lastUnoView);
  }

  if (g.pendingDraw > 0) {
    if (!card.playable) return; // cuma plus
    unoSel.push(i);
    return renderUno(lastUnoView);
  }

  if (unoSel.length === 0) {
    // instan kalau kartu ini se-grup sendirian & sah jadi paling bawah
    const sameGroup = g.myHand.filter((c) => c.group === card.group).length;
    if (card.matchesTop && sameGroup === 1) return playCards([i], card);
    if (card.matchesTop) unoSel = [i];
    else {
      // kartu ini gak nyocok → auto-taruh se-grup yang nyocok jadi paling bawah
      const bottom = g.myHand.findIndex((c, j) => c.group === card.group && c.matchesTop);
      if (bottom === -1) return;
      unoSel = bottom === i ? [i] : [bottom, i];
    }
    return renderUno(lastUnoView);
  }

  // lanjut milih: harus se-grup sama kartu paling bawah
  if (card.group !== g.myHand[unoSel[0]].group) return;
  unoSel.push(i);
  renderUno(lastUnoView);
}

function playCards(indexes, topCard) {
  const send = (chosenColor) => {
    const move = { type: "play", cardIndexes: indexes };
    if (chosenColor) move.chosenColor = chosenColor;
    socket.emit("playMove", { roomId: currentRoom, move });
    unoSel = [];
  };
  if (topCard.kind === "wild" || topCard.kind === "wild4" || topCard.kind === "wild8") showColorPicker(send);
  else send();
}

function playSelection() {
  if (!unoSel.length) return;
  const top = lastUnoView.game.myHand[unoSel[unoSel.length - 1]];
  playCards(unoSel.slice(), top);
}

function cancelSelection() {
  unoSel = [];
  renderUno(lastUnoView);
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
  // auto-join CUMA kalau nama udah ada dari URL (mis. dari WordPress ?name=).
  // Kalau cuma ?room= tanpa nama, init() bakal munculin layar isi nama.
  if (roomFromUrl && !currentRoom && nameFromUrl) {
    show("loading");
    socket.emit("joinRoom", { roomId: roomFromUrl, name: nameFromUrl }, (res) => {
      if (res.ok) currentRoom = res.roomId;
      else init();
    });
  }
});

socket.on("disconnect", () => {
  // koneksi putus — kasih tau di layar game kalau lagi main
  const t = document.querySelector("#screen-game .turn");
  if (t) t.textContent = "Koneksi terputus, nyambungin lagi…";
});

// pas layar diputar/resize, hitung ulang ukuran kartu (Uno)
let resizeT;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (lastUnoView && screens.game.classList.contains("uno-mode") && !screens.game.classList.contains("hidden")) {
      renderUno(lastUnoView);
    }
  }, 150);
});

// ===========================================================================
// INIT
// ===========================================================================
function init() {
  buildGameList();
  if (roomFromUrl && nameFromUrl) show("loading");     // nama udah ada → auto-join
  else if (roomFromUrl) showJoinScreen(roomFromUrl);   // ada kode link → isi nama dulu
  else if (gameFromUrl && GAMES[gameFromUrl]) openHome(gameFromUrl); // deep-link 1 game
  else show("select");                                  // buka game.taharica.com langsung
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
