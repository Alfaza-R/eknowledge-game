// src/games/uno.js — Uno lengkap
//
// Uno BUTUH server beneran karena ada info tersembunyi (kartu di tangan).
// getPlayerView WAJIB kirim view beda per pemain: tangan sendiri penuh, lawan cuma JUMLAH.
//
// House rules (versi simpel, bisa diubah nanti):
//  - Deck standar 108 kartu, bagi 7/pemain.
//  - Main: samain warna / angka / simbol. Wild & Wild+4 boleh kapan aja.
//  - +2 / +4 TIDAK bisa di-stack (kena langsung tarik + skip).
//  - Draw: ambil 1 kartu; kalau bisa dimainin boleh langsung main, kalau nggak ya pass.
//  - "UNO" diumumin otomatis pas pemain sisa 1 kartu (tanpa penalti telat — v1).
//  - Deck habis → discard (kecuali kartu teratas) diacak jadi deck baru.
//  - Menang: pemain pertama yang kartunya habis.
//
// Bentuk kartu:
//   { kind: "num", color, value }              angka 0..9
//   { kind: "skip"|"reverse"|"draw2", color }  kartu aksi berwarna
//   { kind: "wild"|"wild4" }                    (color null; diisi pas dimainkan)

const COLORS = ["red", "yellow", "green", "blue"];

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ kind: "num", color, value: 0 }); // satu "0" per warna
    for (let v = 1; v <= 9; v++) {
      deck.push({ kind: "num", color, value: v });
      deck.push({ kind: "num", color, value: v }); // dua tiap 1..9
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
  return deck; // 108 kartu
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Boleh nggak `card` dimainin di atas `top` dengan warna aktif `currentColor`?
function matches(card, top, currentColor) {
  if (card.kind === "wild" || card.kind === "wild4") return true; // boleh kapan aja
  if (card.color === currentColor) return true;                    // sewarna
  if (card.kind === "num" && top.kind === "num" && card.value === top.value) return true; // seangka
  if (card.kind !== "num" && card.kind === top.kind) return true;  // simbol sama (skip/reverse/draw2)
  return false;
}

// Ambil n kartu dari deck; kalau deck habis, acak ulang discard (kecuali teratas).
function drawCards(state, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length <= 1) break; // beneran habis
      const top = state.discardPile.pop();
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [top];
    }
    out.push(state.drawPile.shift());
  }
  return out;
}

// Geser giliran sebanyak `steps` langkah ke arah `direction`.
function advance(state, steps) {
  const n = state.order.length;
  state.currentTurn = (((state.currentTurn + state.direction * steps) % n) + n) % n;
  state.drawnThisTurn = false;
}

function nextIndex(state) {
  const n = state.order.length;
  return (((state.currentTurn + state.direction) % n) + n) % n;
}

function describe(card) {
  const c = { red: "merah", yellow: "kuning", green: "hijau", blue: "biru" }[card.color] || "";
  if (card.kind === "num") return `${c} ${card.value}`;
  if (card.kind === "skip") return `skip ${c}`;
  if (card.kind === "reverse") return `reverse ${c}`;
  if (card.kind === "draw2") return `+2 ${c}`;
  if (card.kind === "wild") return `wild (${c})`;
  if (card.kind === "wild4") return `+4 (${c})`;
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
    // Kartu pembuka: ambil kartu ANGKA pertama biar nggak ribet efek di awal.
    const startIdx = deck.findIndex((c) => c.kind === "num");
    const start = deck.splice(startIdx, 1)[0];

    return {
      order,
      names,
      hands,
      drawPile: deck,
      discardPile: [start],
      currentColor: start.color,
      currentTurn: 0,
      direction: 1,
      drawnThisTurn: false,
      winner: null,
      lastAction: `Kartu pembuka: ${describe(start)}`,
    };
  },

  validateMove(state, playerId, move) {
    if (state.winner) return false;
    if (state.order[state.currentTurn] !== playerId) return false;
    if (!move || !move.type) return false;

    if (move.type === "draw") return !state.drawnThisTurn; // cuma sekali per giliran
    if (move.type === "pass") return state.drawnThisTurn;  // harus draw dulu

    if (move.type === "play") {
      const card = state.hands[playerId][move.cardIndex];
      if (!card) return false;
      const top = state.discardPile[state.discardPile.length - 1];
      if (card.kind === "wild" || card.kind === "wild4") {
        return COLORS.includes(move.chosenColor); // wajib pilih warna sah
      }
      return matches(card, top, state.currentColor);
    }
    return false;
  },

  applyMove(state, move) {
    const s = structuredClone(state);
    const pid = s.order[s.currentTurn];

    if (move.type === "draw") {
      const [card] = drawCards(s, 1);
      if (card) s.hands[pid].push(card);
      s.drawnThisTurn = true;
      s.lastAction = `${s.names[pid]} ambil kartu`;
      return s;
    }

    if (move.type === "pass") {
      s.lastAction = `${s.names[pid]} pass`;
      advance(s, 1);
      return s;
    }

    // move.type === "play"
    const card = s.hands[pid][move.cardIndex];
    if (card.kind === "wild" || card.kind === "wild4") card.color = move.chosenColor;
    s.hands[pid].splice(move.cardIndex, 1);
    s.discardPile.push(card);
    s.currentColor = card.color;
    s.drawnThisTurn = false;

    if (s.hands[pid].length === 0) {
      s.winner = pid;
      s.lastAction = `${s.names[pid]} MENANG! 🎉`;
      return s;
    }

    let desc = `${s.names[pid]} main ${describe(card)}`;
    const n = s.order.length;

    if (card.kind === "skip") {
      advance(s, 2);
      desc += ` — ${s.names[s.order[s.currentTurn]] || "berikutnya"} ke-skip`;
    } else if (card.kind === "reverse") {
      if (n === 2) {
        advance(s, 2); // 2 pemain: reverse = skip (main lagi)
      } else {
        s.direction *= -1;
        advance(s, 1);
      }
      desc += " — arah dibalik";
    } else if (card.kind === "draw2") {
      const victim = s.order[nextIndex(s)];
      s.hands[victim].push(...drawCards(s, 2));
      desc += ` — ${s.names[victim]} tarik 2`;
      advance(s, 2);
    } else if (card.kind === "wild") {
      desc += ` — warna jadi ${describe({ kind: "num", color: card.color, value: "" }).trim()}`;
      advance(s, 1);
    } else if (card.kind === "wild4") {
      const victim = s.order[nextIndex(s)];
      s.hands[victim].push(...drawCards(s, 4));
      desc += ` — ${s.names[victim]} tarik 4, warna ganti`;
      advance(s, 2);
    } else {
      advance(s, 1); // num biasa
    }

    s.lastAction = desc;
    return s;
  },

  checkEnd(state) {
    return state.winner || null;
  },

  // Dipanggil server pas ada pemain keluar di tengah game (uno bisa lanjut kalau ≥2).
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

    if (s.order.length === 1) s.winner = s.order[0]; // tinggal 1 → menang
    return s;
  },

  getPlayerView(state, playerId) {
    const top = state.discardPile[state.discardPile.length - 1];
    const meIsCurrent = state.order[state.currentTurn] === playerId;
    const myHand = (state.hands[playerId] || []).map((card) => ({
      ...card,
      playable: matches(card, top, state.currentColor),
    }));

    return {
      myHand,
      // lawan: urut sesuai giliran, cuma keliatan JUMLAH kartunya
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
      unoNames: state.order
        .filter((id) => state.hands[id] && state.hands[id].length === 1)
        .map((id) => state.names[id]),
      lastAction: state.lastAction,
    };
  },
};
