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
    for (const kind of ["skip", "reverse", "draw2"]) {
      deck.push({ kind, color });
      deck.push({ kind, color });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ kind: "wild" });
    deck.push({ kind: "wild4" });
  }
  return deck; // 108
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPlus(card) { return card.kind === "draw2" || card.kind === "wild4"; }

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
  if (card.kind === "wild" || card.kind === "wild4") return true;
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

function advance(state, steps) {
  const n = state.order.length;
  state.currentTurn = (((state.currentTurn + state.direction * steps) % n) + n) % n;
  state.drawnThisTurn = false;
}

function describe(card) {
  const c = { red: "merah", yellow: "kuning", green: "hijau", blue: "biru" }[card.color] || "";
  if (card.kind === "num") return `${c} ${card.value}`.trim();
  if (card.kind === "skip") return `skip ${c}`.trim();
  if (card.kind === "reverse") return `reverse ${c}`.trim();
  if (card.kind === "draw2") return `+2 ${c}`.trim();
  if (card.kind === "wild") return `wild ${c}`.trim();
  if (card.kind === "wild4") return `+4 ${c}`.trim();
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
      winner: null,
      lastAction: `Kartu pembuka: ${describe(start)}`,
    };
  },

  validateMove(state, playerId, move) {
    if (state.winner) return false;
    if (state.order[state.currentTurn] !== playerId) return false;
    if (!move || !move.type) return false;
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
      if (topCard.kind === "wild4" && !COLORS.includes(move.chosenColor)) return false;
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
    if ((topCard.kind === "wild" || topCard.kind === "wild4") && !COLORS.includes(move.chosenColor)) return false;
    return true;
  },

  applyMove(state, move) {
    const s = structuredClone(state);
    const pid = s.order[s.currentTurn];

    if (move.type === "takeDraw") {
      const drawn = drawCards(s, s.pendingDraw);
      s.hands[pid].push(...drawn);
      s.lastAction = `${s.names[pid]} nyerah — tarik ${s.pendingDraw} kartu`;
      s.pendingDraw = 0;
      s.drawnThisTurn = false;
      maybeRecycle(s);
      advance(s, 1);
      return s;
    }

    if (move.type === "draw") {
      const [card] = drawCards(s, 1);
      if (card) s.hands[pid].push(card);
      s.drawnThisTurn = true;
      s.lastAction = `${s.names[pid]} ambil kartu`;
      maybeRecycle(s);
      return s;
    }

    if (move.type === "pass") {
      s.lastAction = `${s.names[pid]} pass`;
      advance(s, 1);
      return s;
    }

    // ---- play (bisa 1 kartu atau stack) ----
    const idxs = move.cardIndexes.slice();
    const cards = idxs.map((i) => s.hands[pid][i]); // referensi objek di tangan (clone)
    const topCard = cards[cards.length - 1];
    if (topCard.kind === "wild" || topCard.kind === "wild4") topCard.color = move.chosenColor;

    // buang dari tangan (index besar dulu biar aman)
    for (const i of idxs.slice().sort((a, b) => b - a)) s.hands[pid].splice(i, 1);
    for (const c of cards) s.discardPile.push(c); // bawah → atas
    s.currentColor = topCard.color;
    s.drawnThisTurn = false;

    if (s.hands[pid].length === 0) {
      s.winner = pid;
      s.lastAction = `${s.names[pid]} MENANG! 🎉`;
      return s;
    }

    const group = cardGroup(cards[0]);
    const n = s.order.length;
    let desc = cards.length > 1
      ? `${s.names[pid]} stack ${cards.length}× (${describe(topCard)})`
      : `${s.names[pid]} main ${describe(topCard)}`;

    if (group === "plus") {
      const add = cards.reduce((sum, c) => sum + (c.kind === "wild4" ? 4 : 2), 0);
      s.pendingDraw += add;
      desc += ` — tarik gantung ${s.pendingDraw}`;
      advance(s, 1); // lempar ke pemain berikut buat nangkis/tarik
    } else if (group === "act:skip") {
      advance(s, cards.length + 1);
      desc += ` — skip ${cards.length}`;
    } else if (group === "act:reverse") {
      if (cards.length % 2 === 1) s.direction *= -1;
      advance(s, n === 2 && cards.length % 2 === 1 ? 2 : 1);
      desc += " — arah dibalik";
    } else {
      advance(s, 1); // angka / wild biasa
    }

    s.lastAction = desc;
    maybeRecycle(s);
    return s;
  },

  checkEnd(state) {
    return state.winner || null;
  },

  removePlayer(state, playerId) {
    const s = structuredClone(state);
    const idx = s.order.indexOf(playerId);
    if (idx === -1) return s;
    delete s.hands[playerId];
    delete s.names[playerId];
    s.order.splice(idx, 1);
    if (s.order.length === 0) return s;
    if (idx < s.currentTurn) s.currentTurn -= 1;
    if (s.currentTurn >= s.order.length) s.currentTurn = 0;
    s.drawnThisTurn = false;
    if (s.order.length === 1) s.winner = s.order[0];
    return s;
  },

  getPlayerView(state, playerId) {
    const top = state.discardPile[state.discardPile.length - 1];
    const hand = state.hands[playerId] || [];
    const meIsCurrent = state.order[state.currentTurn] === playerId;
    const pending = state.pendingDraw;

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

    return {
      myHand,
      opponents: state.order
        .filter((id) => id !== playerId)
        .map((id) => ({
          id,
          name: state.names[id],
          count: state.hands[id].length,
          isTurn: state.order[state.currentTurn] === id,
        })),
      topCard: top,
      currentColor: state.currentColor,
      currentTurnPlayerId: state.order[state.currentTurn],
      direction: state.direction,
      drawPileCount: state.drawPile.length,
      iDrew: meIsCurrent ? state.drawnThisTurn : false,
      pendingDraw: pending,
      mustRespondPlus: meIsCurrent && pending > 0, // giliranku & ada tumpukan plus
      unoNames: state.order
        .filter((id) => state.hands[id] && state.hands[id].length === 1)
        .map((id) => state.names[id]),
      lastAction: state.lastAction,
    };
  },
};
