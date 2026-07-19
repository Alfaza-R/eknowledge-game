// src/games/uno.js — Uno "aturan tongkrongan" (bukan Uno internasional penuh)
//
// Info tersembunyi (kartu di tangan) → getPlayerView WAJIB beda per pemain.
//
// ATURAN RUMAH:
//  1. STACK se-angka/se-simbol: dalam 1 giliran boleh keluarin beberapa kartu yang
//     ikon-nya sama (mis. semua "6", atau 2 skip). Kartu PALING BAWAH harus sah nimpa
//     kartu aktif (nyocok WARNA atau ANGKA/SIMBOL). Sisanya se-ikon; urutan bebas;
//     kartu PALING ATAS jadi warna aktif baru.
//  2. Efek kartu aksi NUMPUK: 2 skip = skip 2 orang; 2 reverse = arah balik 2x.
//  3. Kartu PLUS (+2 & +4) satu "keluarga": boleh dicampur & di-stack. Korban (pemain
//     berikut) boleh NANGKIS dengan plus sendiri → total tarik numpuk & dilempar terus,
//     sampai ada yang gak punya/gak mau plus → dia tarik SEMUA total, lalu ke-skip.
//  4. Wild & +4 bisa di-stack.
//  5. Nyocok kartu bawah: WARNA atau ANGKA/SIMBOL.
//  6. Recycle: kalau tumpukan cangkulan < 30, buangan lama (kecuali teratas) diacak
//     balik jadi deck.
//  7. UNO diumumin otomatis; menang = kartu habis.

const COLORS = ["red", "yellow", "green", "blue"];
const RECYCLE_AT = 30;

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ kind: "num", color, value: 0 });
    for (let v = 1; v <= 9; v++) {
      deck.push({ kind: "num", color, value: v });
      deck.push({ kind: "num", color, value: v });
    }
    // 2 tiap: skip, reverse, +2, dan SPILL (kartu spill: 2/warna = 8 total)
    for (const kind of ["skip", "reverse", "draw2", "spill"]) {
      deck.push({ kind, color });
      deck.push({ kind, color });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ kind: "wild" });
    deck.push({ kind: "wild4" });
  }
  for (let i = 0; i < 2; i++) deck.push({ kind: "wild8" }); // wild +8 (2 biji)
  return deck; // 118
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPlus(card) { return card.kind === "draw2" || card.kind === "wild4" || card.kind === "wild8"; }
function isWildKind(card) { return card.kind === "wild" || card.kind === "wild4" || card.kind === "wild8"; }

// "ikon" kartu — buat nentuin kartu mana yang boleh di-stack bareng.
//  angka  → "num:<value>"
//  +2/+4  → "plus"          (satu keluarga)
//  wild   → "wild"
//  skip/reverse → "act:<kind>"
function cardGroup(card) {
  if (card.kind === "num") return "num:" + card.value;
  if (isPlus(card)) return "plus";
  if (card.kind === "wild") return "wild";
  return "act:" + card.kind;
}

// Boleh nggak `card` jadi kartu PALING BAWAH di atas `top` (warna aktif `currentColor`)?
function matches(card, top, currentColor) {
  if (isWildKind(card)) return true;
  if (card.color === currentColor) return true;
  if (card.kind === "num" && top.kind === "num" && card.value === top.value) return true;
  if (card.kind !== "num" && card.kind === top.kind) return true;
  return false;
}

// Ambil n kartu; kalau deck habis di tengah jalan, acak ulang buangan (kecuali teratas).
function drawCards(state, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length <= 1) break;
      const top = state.discardPile.pop();
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [top];
    }
    out.push(state.drawPile.shift());
  }
  return out;
}

// Aturan #6: kalau cangkulan < 30, buangan lama masuk balik ke deck.
function maybeRecycle(state) {
  if (state.drawPile.length < RECYCLE_AT && state.discardPile.length > 1) {
    const top = state.discardPile.pop();
    state.drawPile = shuffle(state.drawPile.concat(state.discardPile));
    state.discardPile = [top];
  }
}

// pindah ke pemain AKTIF berikutnya (lewati yang udah selesai kartunya)
function nextActiveIndex(state, fromIdx) {
  const n = state.order.length;
  let idx = fromIdx;
  for (let k = 0; k < n; k++) {
    idx = (((idx + state.direction) % n) + n) % n;
    if (!state.finished.includes(state.order[idx])) return idx;
  }
  return fromIdx;
}
function advance(state, steps) {
  for (let s = 0; s < steps; s++) state.currentTurn = nextActiveIndex(state, state.currentTurn);
  state.drawnThisTurn = false;
}

// Status "udah teriak UNO" hangus lagi kalau kartunya nambah jadi >2 (mis. kena denda/narik).
function syncUnoFlags(state) {
  if (!state.unoCalled) state.unoCalled = {};
  for (const id of state.order) {
    if ((state.hands[id] || []).length > 2) state.unoCalled[id] = false;
  }
}

function describe(card) {
  const c = { red: "merah", yellow: "kuning", green: "hijau", blue: "biru" }[card.color] || "";
  if (card.kind === "num") return `${c} ${card.value}`.trim();
  if (card.kind === "skip") return `skip ${c}`.trim();
  if (card.kind === "reverse") return `reverse ${c}`.trim();
  if (card.kind === "draw2") return `+2 ${c}`.trim();
  if (card.kind === "spill") return `spill ${c}`.trim();
  if (card.kind === "wild") return `wild ${c}`.trim();
  if (card.kind === "wild4") return `+4 ${c}`.trim();
  if (card.kind === "wild8") return `+8 ${c}`.trim();
  return "kartu";
}

module.exports = {
  name: "Uno",
  minPlayers: 2,
  maxPlayers: 8,

  init(players) {
    const deck = shuffle(buildDeck());
    const order = players.map((p) => p.id);
    const names = {};
    const hands = {};
    for (const p of players) {
      names[p.id] = p.name;
      hands[p.id] = deck.splice(0, 7);
    }
    const startIdx = deck.findIndex((c) => c.kind === "num");
    const start = deck.splice(startIdx, 1)[0];
    return {
      order, names, hands,
      drawPile: deck,
      discardPile: [start],
      currentColor: start.color,
      currentTurn: 0,
      direction: 1,
      drawnThisTurn: false,
      pendingDraw: 0, // total tarik yang lagi "gantung" dari tumpukan plus
      spillUntil: 0,  // timestamp: sampai kapan semua kartu ke-spill (spill card)
      lastDrawCard: null, // kartu terakhir yang ditarik (buat animasi flip, cuma ke penarik)
      unoCalled: {},  // playerId -> udah teriak UNO buat sisa kartu sekarang?
      winner: null,   // juara pertama (kartu habis duluan)
      finished: [],   // urutan pemain yang udah habis kartunya (ranking juara)
      over: false,    // game beneran selesai (tersisa ≤1 pemain aktif)
      loser: null,    // pemain terakhir yang masih pegang kartu
      ranking: [],
      eventId: 0,     // naik tiap aksi — buat trigger animasi di client
      lastEvent: null,
      lastAction: `Kartu pembuka: ${describe(start)}`,
    };
  },

  validateMove(state, playerId, move) {
    if (state.over) return false; // game udah bubar
    if (!move || !move.type) return false;

    // ---- UNO: boleh DI LUAR giliran (teriak sendiri / nangkep lawan) ----
    if (move.type === "callUno") {
      const h = state.hands[playerId];
      if (!h || state.finished.includes(playerId)) return false;
      if (state.unoCalled && state.unoCalled[playerId]) return false; // udah teriak
      // boleh sebelum (sisa 2, mau buang kartu kedua terakhir) atau sesudah (sisa 1)
      return h.length === 1 || h.length === 2;
    }
    if (move.type === "catchUno") {
      const tid = move.targetId;
      if (!tid || tid === playerId) return false;              // gak bisa nangkep diri sendiri
      if (!state.hands[playerId] || state.finished.includes(playerId)) return false;
      const th = state.hands[tid];
      if (!th || state.finished.includes(tid)) return false;
      // cuma sah kalau target beneran sisa 1 kartu & belum teriak UNO
      return th.length === 1 && !(state.unoCalled && state.unoCalled[tid]);
    }

    if (state.order[state.currentTurn] !== playerId) return false;
    const hand = state.hands[playerId];
    const top = state.discardPile[state.discardPile.length - 1];

    // ---- lagi ada tumpukan plus (harus nangkis pakai plus, atau tarik) ----
    if (state.pendingDraw > 0) {
      if (move.type === "takeDraw") return true;
      if (move.type !== "play") return false;
      const idxs = move.cardIndexes;
      if (!Array.isArray(idxs) || idxs.length === 0) return false;
      if (new Set(idxs).size !== idxs.length) return false;
      const cards = idxs.map((i) => hand[i]);
      if (cards.some((c) => !c)) return false;
      if (!cards.every(isPlus)) return false; // wajib plus semua
      const topCard = cards[cards.length - 1];
      if ((topCard.kind === "wild4" || topCard.kind === "wild8") && !COLORS.includes(move.chosenColor)) return false;
      return true;
    }

    // ---- giliran normal ----
    if (move.type === "draw") return !state.drawnThisTurn;
    if (move.type === "pass") return state.drawnThisTurn;
    if (move.type !== "play") return false;

    const idxs = move.cardIndexes;
    if (!Array.isArray(idxs) || idxs.length === 0) return false;
    if (new Set(idxs).size !== idxs.length) return false;
    const cards = idxs.map((i) => hand[i]);
    if (cards.some((c) => !c)) return false;

    const g0 = cardGroup(cards[0]);
    if (!cards.every((c) => cardGroup(c) === g0)) return false; // harus se-ikon
    if (!matches(cards[0], top, state.currentColor)) return false; // bawah harus sah

    const topCard = cards[cards.length - 1];
    if (isWildKind(topCard) && !COLORS.includes(move.chosenColor)) return false;
    return true;
  },

  // actorId = pemain yang ngirim move (perlu buat aksi di luar giliran: callUno/catchUno)
  applyMove(state, move, actorId) {
    const s = structuredClone(state);
    const pid = s.order[s.currentTurn];
    if (!s.unoCalled) s.unoCalled = {};

    // ---- teriak UNO sendiri (gak ganti giliran) ----
    if (move.type === "callUno") {
      s.unoCalled[actorId] = true;
      s.lastAction = `${s.names[actorId]} teriak UNO! 🔥`;
      s.eventId = (state.eventId || 0) + 1;
      s.lastEvent = { id: s.eventId, type: "callUno", by: actorId };
      return s;
    }

    // ---- nangkep lawan yang lupa teriak UNO → dia tarik 2 (gak ganti giliran) ----
    if (move.type === "catchUno") {
      const tid = move.targetId;
      s.hands[tid].push(...drawCards(s, 2));
      s.unoCalled[tid] = false;
      s.lastAction = `${s.names[actorId]} nangkep ${s.names[tid]} lupa UNO — tarik 2! 😈`;
      maybeRecycle(s);
      s.eventId = (state.eventId || 0) + 1;
      s.lastEvent = { id: s.eventId, type: "catchUno", by: actorId, target: tid, n: 2 };
      syncUnoFlags(s);
      return s;
    }

    if (move.type === "takeDraw") {
      const n = s.pendingDraw;
      const drawn = drawCards(s, n);
      s.hands[pid].push(...drawn);
      s.lastAction = `${s.names[pid]} nyerah — tarik ${n} kartu`;
      s.pendingDraw = 0;
      s.lastDrawCard = null;
      s.drawnThisTurn = false;
      maybeRecycle(s);
      s.eventId = (state.eventId || 0) + 1;
      s.lastEvent = { id: s.eventId, type: "draw", by: pid, n };
      syncUnoFlags(s);
      advance(s, 1);
      return s;
    }

    if (move.type === "draw") {
      const [card] = drawCards(s, 1);
      if (card) s.hands[pid].push(card);
      s.lastDrawCard = card || null;
      s.drawnThisTurn = true;
      s.lastAction = `${s.names[pid]} ambil kartu`;
      maybeRecycle(s);
      s.eventId = (state.eventId || 0) + 1;
      s.lastEvent = { id: s.eventId, type: "draw", by: pid, n: 1 };
      syncUnoFlags(s);
      return s;
    }

    if (move.type === "pass") {
      s.lastAction = `${s.names[pid]} pass`;
      s.lastDrawCard = null;
      advance(s, 1);
      return s;
    }

    // ---- play (bisa 1 kartu atau stack) ----
    const idxs = move.cardIndexes.slice();
    const cards = idxs.map((i) => s.hands[pid][i]); // referensi objek di tangan (clone)
    const topCard = cards[cards.length - 1];
    if (isWildKind(topCard)) topCard.color = move.chosenColor;

    // buang dari tangan (index besar dulu biar aman)
    for (const i of idxs.slice().sort((a, b) => b - a)) s.hands[pid].splice(i, 1);
    for (const c of cards) {
      // puteran & geser acak biar tumpukan tengah keliatan berantakan (natural)
      c.spin = Math.round((Math.random() * 2 - 1) * 12); // -12°..+12°
      c.dx = Math.round((Math.random() * 2 - 1) * 7);
      c.dy = Math.round((Math.random() * 2 - 1) * 7);
      s.discardPile.push(c); // bawah → atas
    }
    s.currentColor = topCard.color;
    s.drawnThisTurn = false;
    s.lastDrawCard = null;
    s.eventId = (state.eventId || 0) + 1;

    // pemain ini habis kartunya → masuk ranking juara (game tetep lanjut)
    const justFinished = s.hands[pid].length === 0 && !s.finished.includes(pid);
    if (justFinished) {
      s.finished.push(pid);
      if (!s.winner) s.winner = pid; // juara pertama
    }
    s.lastEvent = {
      id: s.eventId, type: "play", by: pid, n: cards.length,
      finished: justFinished, rank: justFinished ? s.finished.length : null,
    };

    const group = cardGroup(cards[0]);
    let desc = justFinished
      ? `${s.names[pid]} SELESAI — juara #${s.finished.length}! 🎉`
      : cards.length > 1
        ? `${s.names[pid]} buang ${cards.length} kartu (${describe(topCard)})`
        : `${s.names[pid]} main ${describe(topCard)}`;

    // tersisa ≤1 pemain aktif → game bubar, yang tersisa = kalah terakhir
    const active = s.order.filter((id) => !s.finished.includes(id));
    if (active.length <= 1) {
      s.over = true;
      s.loser = active[0] || null;
      s.ranking = [...s.finished, ...(s.loser ? [s.loser] : [])];
      s.lastAction = desc;
      return s;
    }

    // efek kartu (advance otomatis skip yang udah selesai)
    if (group === "plus") {
      const add = cards.reduce((sum, c) => sum + (c.kind === "wild8" ? 8 : c.kind === "wild4" ? 4 : 2), 0);
      s.pendingDraw += add;
      desc += ` — tarik gantung ${s.pendingDraw}`;
      advance(s, 1);
    } else if (group === "act:skip") {
      advance(s, cards.length + 1);
      desc += ` — skip ${cards.length}`;
    } else if (group === "act:reverse") {
      if (cards.length % 2 === 1) s.direction *= -1;
      advance(s, active.length === 2 && cards.length % 2 === 1 ? 2 : 1);
      desc += " — arah dibalik";
    } else if (group === "act:spill") {
      s.spillUntil = Date.now() + 10000; // semua kartu keliatan 10 detik
      desc += " — 👀 SEMUA kartu ke-spill 10 detik!";
      advance(s, 1);
    } else {
      advance(s, 1); // angka / wild biasa
    }

    s.lastAction = desc;
    maybeRecycle(s);
    return s;
  },

  checkEnd(state) {
    return state.over ? state.loser || "over" : null;
  },

  // dipanggil server pas pemain kehabisan waktu (60 detik) → tarik & skip
  forceSkip(state) {
    const s = structuredClone(state);
    if (s.over) return s;
    const pid = s.order[s.currentTurn];
    if (s.pendingDraw > 0) {
      s.hands[pid].push(...drawCards(s, s.pendingDraw));
      s.lastAction = `${s.names[pid]} kehabisan waktu — tarik ${s.pendingDraw}`;
      s.pendingDraw = 0;
      s.lastDrawCard = null;
    } else {
      const [card] = drawCards(s, 1);
      if (card) s.hands[pid].push(card);
      s.lastDrawCard = card || null;
      s.lastAction = `${s.names[pid]} kehabisan waktu — tarik 1 & di-skip`;
    }
    s.drawnThisTurn = false;
    s.eventId = (s.eventId || 0) + 1;
    s.lastEvent = { id: s.eventId, type: "draw", by: pid, n: 1 };
    maybeRecycle(s);
    syncUnoFlags(s);
    advance(s, 1);
    return s;
  },

  removePlayer(state, playerId) {
    const s = structuredClone(state);
    const idx = s.order.indexOf(playerId);
    if (idx === -1) return s;
    delete s.hands[playerId]; // nama disimpen buat ranking
    s.order.splice(idx, 1);
    s.finished = s.finished.filter((id) => id !== playerId);
    if (s.order.length === 0) { s.over = true; return s; }
    if (idx < s.currentTurn) s.currentTurn -= 1;
    if (s.currentTurn >= s.order.length) s.currentTurn = 0;
    if (s.finished.includes(s.order[s.currentTurn])) s.currentTurn = nextActiveIndex(s, s.currentTurn);
    s.drawnThisTurn = false;
    const active = s.order.filter((id) => !s.finished.includes(id));
    if (active.length <= 1) {
      s.over = true;
      s.loser = active[0] || null;
      s.ranking = [...s.finished, ...(s.loser ? [s.loser] : [])];
    }
    return s;
  },

  getPlayerView(state, playerId) {
    const top = state.discardPile[state.discardPile.length - 1];
    const hand = state.hands[playerId] || [];
    const meIsCurrent = state.order[state.currentTurn] === playerId;
    const pending = state.pendingDraw;
    const spillActive = !!(state.spillUntil && Date.now() < state.spillUntil);

    // grup mana yang punya ≥1 kartu yang sah jadi kartu bawah → semua kartu grup itu "playable"
    const groupCanStart = {};
    for (const c of hand) {
      const g = cardGroup(c);
      if (!(g in groupCanStart)) groupCanStart[g] = false;
      if (matches(c, top, state.currentColor)) groupCanStart[g] = true;
    }

    const myHand = hand.map((c) => {
      const group = cardGroup(c);
      const playable = pending > 0 ? isPlus(c) : !!groupCanStart[group];
      // matchesTop = kartu ini sah jadi PALING BAWAH (buat aturan stack di client)
      return { ...c, group, playable, matchesTop: matches(c, top, state.currentColor) };
    });

    // Urutan lawan DIPUTAR mulai dari pemain SESUDAH kita, biar tiap pemain lihat
    // meja yang konsisten: kiri = giliran berikutnya, muter, kanan = pemain sebelumnya.
    // (Dulu cuma di-filter tanpa diputar → cuma bener buat pemain pertama.)
    const myIdx = state.order.indexOf(playerId);
    const seatOrder = myIdx === -1
      ? state.order.filter((id) => id !== playerId)
      : [...state.order.slice(myIdx + 1), ...state.order.slice(0, myIdx)];

    return {
      myHand,
      opponents: seatOrder
        .map((id) => ({
          id,
          name: state.names[id],
          count: state.hands[id].length,
          isTurn: state.order[state.currentTurn] === id,
          done: state.finished.includes(id),
          calledUno: !!(state.unoCalled && state.unoCalled[id]),
          // sisa 1 kartu tapi belum teriak → bisa ditangkep pemain lain
          catchable: state.hands[id].length === 1 && !(state.unoCalled && state.unoCalled[id]) && !state.finished.includes(id),
          // pas spill aktif, kartu lawan keliatan (cuma data tampilan)
          revealHand: spillActive ? state.hands[id].map((c) => ({ kind: c.kind, color: c.color, value: c.value })) : null,
        })),
      topCard: top,
      recentDiscard: state.discardPile.slice(-5), // 2–5 kartu terakhir buat tumpukan berantakan
      currentColor: state.currentColor,
      currentTurnPlayerId: state.order[state.currentTurn],
      direction: state.direction,
      drawPileCount: state.drawPile.length,
      iDrew: meIsCurrent ? state.drawnThisTurn : false,
      pendingDraw: pending,
      mustRespondPlus: meIsCurrent && pending > 0, // giliranku & ada tumpukan plus
      youId: playerId,
      // ---- UNO call ----
      iCalledUno: !!(state.unoCalled && state.unoCalled[playerId]),
      // boleh teriak pas sisa 2 (sebelum buang kartu kedua terakhir) atau sisa 1 (sesudah)
      canCallUno:
        !state.finished.includes(playerId) &&
        !(state.unoCalled && state.unoCalled[playerId]) &&
        (hand.length === 1 || hand.length === 2),
      spillActive,
      spillUntil: spillActive ? state.spillUntil : null,
      // kartu yang barusan gua tarik (buat animasi flip) — cuma ke penariknya, gak bocor ke lawan
      myDrawnCard:
        state.lastEvent && state.lastEvent.type === "draw" && state.lastEvent.by === playerId && state.lastDrawCard
          ? { kind: state.lastDrawCard.kind, color: state.lastDrawCard.color, value: state.lastDrawCard.value }
          : null,
      lastEvent: state.lastEvent,
      unoNames: state.order
        .filter((id) => state.hands[id] && state.hands[id].length === 1)
        .map((id) => state.names[id]),
      // ranking / status selesai
      over: !!state.over,
      winnerId: state.winner || null,
      iAmDone: state.finished.includes(playerId),
      ranking: (state.ranking || []).map((id, i) => ({
        rank: i + 1, id, name: state.names[id], isYou: id === playerId,
      })),
      lastAction: state.lastAction,
    };
  },
};
