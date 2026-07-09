// src/games/tictactoe.js
//
// Aturan tic-tac-toe. Module ini MURNI logika — gak tau soal socket, room, atau nama.
// Semua fungsi nerima "state" dan ngembaliin hasil. Interface-nya sama kayak game lain
// (init, validateMove, applyMove, checkEnd, getPlayerView) biar rooms.js gak perlu peduli
// game apa yang lagi jalan.
//
// Bentuk state:
//   {
//     board: [null x9],        // index 0..8, isinya null | "X" | "O"
//     order: [idA, idB],       // urutan giliran, isinya playerId
//     marks: { idA:"X", idB:"O" },
//     currentTurn: 0,          // index ke dalam `order`
//   }
//
// Papan diberi nomor gini:
//   0 | 1 | 2
//   3 | 4 | 5
//   6 | 7 | 8

// 8 kemungkinan garis menang (3 baris, 3 kolom, 2 diagonal)
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // baris
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolom
  [0, 4, 8], [2, 4, 6],            // diagonal
];

module.exports = {
  name: "Tic-Tac-Toe",
  minPlayers: 2,
  maxPlayers: 2,

  // players = [{ id, name }, ...]. Pemain pertama pegang "X" dan jalan duluan.
  init(players) {
    return {
      board: Array(9).fill(null),
      order: players.map((p) => p.id),
      marks: {
        [players[0].id]: "X",
        [players[1].id]: "O",
      },
      currentTurn: 0,
    };
  },

  // Cek apakah move sah. move = { cell: 0..8 }. Return true/false.
  validateMove(state, playerId, move) {
    // bukan giliran pemain ini?
    if (state.order[state.currentTurn] !== playerId) return false;

    const { cell } = move;
    // di luar papan?
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return false;
    // kotak udah keisi?
    if (state.board[cell] !== null) return false;
    // game udah selesai?
    if (this.checkEnd(state) !== null) return false;

    return true;
  },

  // Terapkan move (diasumsikan udah lolos validateMove). Return state BARU.
  // Pemain yang jalan = pemain di giliran sekarang (udah dijamin sama validasi).
  applyMove(state, move) {
    const playerId = state.order[state.currentTurn];
    const board = state.board.slice(); // salin biar gak ngubah state lama
    board[move.cell] = state.marks[playerId];

    return {
      ...state,
      board,
      currentTurn: (state.currentTurn + 1) % state.order.length,
    };
  },

  // Return playerId pemenang, atau "draw" kalau seri, atau null kalau masih jalan.
  checkEnd(state) {
    for (const [a, b, c] of LINES) {
      const mark = state.board[a];
      if (mark && mark === state.board[b] && mark === state.board[c]) {
        // ketemu 3 sejajar — cari siapa pemilik mark ini
        const winnerId = Object.keys(state.marks).find(
          (id) => state.marks[id] === mark
        );
        return winnerId;
      }
    }
    // papan penuh tanpa pemenang = seri
    if (state.board.every((cell) => cell !== null)) return "draw";
    return null;
  },

  // View buat pemain tertentu. Tic-tac-toe gak ada info rahasia (papan keliatan semua),
  // tapi tetap ikut interface. Nama pemain ditambahin di server (module ini gak tau nama).
  getPlayerView(state, playerId) {
    return {
      board: state.board,
      myMark: state.marks[playerId] || null,
      currentTurnPlayerId: state.order[state.currentTurn],
    };
  },
};
