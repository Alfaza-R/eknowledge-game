// src/games/ludo.js — Ludo 2–4 pemain
//
// Turn-based, pakai dadu, TIDAK ada info tersembunyi (papan keliatan semua).
// Aturan: keluar base kalau dapet 6; makan bidak lawan (balik ke base); safe zone;
//         dapet 6 = lempar lagi; menang = 4 bidak sampai home.
//
// Papan 15×15. Tiap bidak punya "progress":
//   0        = di base (kandang)
//   1..51    = jalur cincin bersama (relatif ke start pemain)
//   52..57   = jalur home (6 kotak) → progress 57 = HOME (selesai)

// Jalur cincin (52 kotak) sebagai koordinat [row, col] di grid 15×15, searah jarum jam.
// Index 0 = start MERAH, 13 = HIJAU, 26 = KUNING, 39 = BIRU.
const RING = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const START_OFFSET = [0, 13, 26, 39];
const COLORS = ["red", "green", "yellow", "blue"];

// jalur home (6 kotak) tiap pemain, dari mulut ke tengah
const HOME = {
  0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  3: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

// slot bidak di kandang (4 per pemain)
const BASE_SLOTS = {
  0: [[1, 1], [1, 4], [4, 1], [4, 4]],
  1: [[1, 10], [1, 13], [4, 10], [4, 13]],
  2: [[10, 10], [10, 13], [13, 10], [13, 13]],
  3: [[10, 1], [10, 4], [13, 1], [13, 4]],
};

// kotak aman: start tiap pemain + 4 kotak bintang
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

function absRing(seat, prog) { return (START_OFFSET[seat] + prog - 1) % 52; }

function coordFor(seat, ti, prog) {
  let rc;
  if (prog === 0) rc = BASE_SLOTS[seat][ti];
  else if (prog <= 51) rc = RING[absRing(seat, prog)];
  else rc = HOME[seat][prog - 52];
  return { r: rc[0], c: rc[1] };
}

function canMove(prog, dice) {
  if (prog === 57) return false;      // udah home
  if (prog === 0) return dice === 6;  // keluar base cuma pas 6
  return prog + dice <= 57;           // gak boleh lewat home
}

function movableList(state, pid, dice) {
  const out = [];
  state.tokens[pid].forEach((prog, ti) => { if (canMove(prog, dice)) out.push(ti); });
  return out;
}

function advance(state) {
  state.currentTurn = (state.currentTurn + 1) % state.order.length;
  state.dice = null;
}

module.exports = {
  name: "Ludo",
  minPlayers: 2,
  maxPlayers: 4,

  init(players) {
    const order = players.map((p) => p.id);
    const names = {}, colors = {}, seats = {}, tokens = {};
    players.forEach((p, i) => {
      names[p.id] = p.name;
      colors[p.id] = COLORS[i];
      seats[p.id] = i;
      tokens[p.id] = [0, 0, 0, 0];
    });
    return {
      order, names, colors, seats, tokens,
      currentTurn: 0,
      dice: null,        // null = perlu lempar; angka = nunggu gerak
      winner: null,
      lastAction: "Lempar dadu buat mulai",
    };
  },

  validateMove(state, playerId, move) {
    if (state.winner) return false;
    if (state.order[state.currentTurn] !== playerId) return false;
    if (!move || !move.type) return false;

    if (move.type === "roll") return state.dice === null;
    if (move.type === "move") {
      if (state.dice === null) return false;
      const ti = move.tokenIndex;
      if (!Number.isInteger(ti) || ti < 0 || ti > 3) return false;
      return canMove(state.tokens[playerId][ti], state.dice);
    }
    return false;
  },

  applyMove(state, move) {
    const s = structuredClone(state);
    const pid = s.order[s.currentTurn];
    const nm = s.names[pid];

    if (move.type === "roll") {
      const dice = 1 + Math.floor(Math.random() * 6);
      s.dice = dice;
      const movable = movableList(s, pid, dice);
      if (movable.length === 0) {
        s.lastAction = `${nm} lempar ${dice} — gak ada langkah`;
        advance(s); // gagal gerak → giliran lanjut (walau 6)
      } else {
        s.lastAction = `${nm} lempar ${dice}`;
      }
      return s;
    }

    // move.type === "move"
    const dice = s.dice;
    const ti = move.tokenIndex;
    const prog = s.tokens[pid][ti];
    const np = prog === 0 ? 1 : prog + dice;
    s.tokens[pid][ti] = np;
    const reachedHome = np === 57; // bidak ini baru masuk tujuan

    let ate = false;
    if (np <= 51) {
      const abs = absRing(s.seats[pid], np);
      if (!SAFE.has(abs)) {
        for (const oid of s.order) {
          if (oid === pid) continue;
          s.tokens[oid].forEach((op, oi) => {
            if (op >= 1 && op <= 51 && absRing(s.seats[oid], op) === abs) {
              s.tokens[oid][oi] = 0; // balik ke base
              ate = true;
            }
          });
        }
      }
    }

    if (s.tokens[pid].every((p) => p === 57)) {
      s.winner = pid;
      s.lastAction = `${nm} MENANG! 🎉`;
      return s;
    }

    s.lastAction = `${nm} jalan${ate ? " & makan bidak lawan! 😈" : ""}${reachedHome ? " — bidak MASUK! 🏠" : ""}`;
    // BONUS lempar lagi: dapet 6, ATAU makan bidak lawan, ATAU berhasil masukin bidak ke tujuan
    const bonusRoll = dice === 6 || ate || reachedHome;
    if (bonusRoll) {
      s.dice = null;                 // giliran gak pindah — pemain sama lempar lagi
      s.lastAction += " — lempar lagi! 🎲";
    } else {
      advance(s);
    }
    return s;
  },

  checkEnd(state) { return state.winner || null; },

  removePlayer(state, playerId) {
    const s = structuredClone(state);
    const idx = s.order.indexOf(playerId);
    if (idx === -1) return s;
    delete s.tokens[playerId];
    delete s.names[playerId];
    delete s.colors[playerId];
    s.order.splice(idx, 1);
    if (s.order.length === 0) return s;
    if (idx < s.currentTurn) s.currentTurn -= 1;
    if (s.currentTurn >= s.order.length) s.currentTurn = 0;
    s.dice = null;
    if (s.order.length === 1) s.winner = s.order[0];
    return s;
  },

  getPlayerView(state, playerId) {
    const meIsCurrent = state.order[state.currentTurn] === playerId;
    const players = state.order.map((id) => ({
      id,
      name: state.names[id],
      color: state.colors[id],
      isTurn: state.order[state.currentTurn] === id,
      done: state.tokens[id].filter((p) => p === 57).length,
      tokens: state.tokens[id].map((prog, ti) => ({
        prog, home: prog === 57, ...coordFor(state.seats[id], ti, prog),
      })),
    }));
    return {
      players,
      currentTurnPlayerId: state.order[state.currentTurn],
      dice: state.dice,
      canRoll: meIsCurrent && state.dice === null && !state.winner,
      movable: meIsCurrent && state.dice !== null ? movableList(state, playerId, state.dice) : [],
      myColor: state.colors[playerId] || null,
      lastAction: state.lastAction,
    };
  },
};
