// src/games/ludo.js — STEP 2 (jangan dikerjain sebelum tic-tac-toe solid)
//
// Turn-based, dadu, 4 pemain. State kecil, tidak ada info tersembunyi.
// Aturan: keluar base kalau dapet 6, makan bidak lawan (balik base), safe zone,
//         dapet 6 = lempar lagi, bidak masuk home column.
// Papan = CSS grid 15x15.
//
// Ikuti interface yang sama: init, validateMove, applyMove, checkEnd, getPlayerView.
//
// TODO (nanti)

module.exports = {
  init(players) { throw new Error("ludo belum diimplement"); },
  validateMove(state, playerId, move) { throw new Error("ludo belum diimplement"); },
  applyMove(state, move) { throw new Error("ludo belum diimplement"); },
  checkEnd(state) { throw new Error("ludo belum diimplement"); },
  getPlayerView(state, playerId) { throw new Error("ludo belum diimplement"); },
};
