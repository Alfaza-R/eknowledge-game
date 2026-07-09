// src/games/uno.js — STEP 3 (paling akhir, edge case paling banyak)
//
// Uno BUTUH server beneran karena ada info tersembunyi (kartu di tangan).
// getPlayerView WAJIB kirim view berbeda per pemain: myHand penuh, lawan cuma cardCount.
//
// Edge case yang harus dipikir:
//   - Wild card + wild draw four
//   - +2 / +4 stacking (tentuin house rule)
//   - Reverse, skip
//   - Deklarasi "UNO!" (timer 2 detik? penalti 2 kartu?)
//   - Reshuffle discard pile kalau deck habis
//   - Kartu terakhir gak boleh wild (opsional)
//
// Ikuti interface yang sama: init, validateMove, applyMove, checkEnd, getPlayerView.
//
// TODO (nanti banget)

module.exports = {
  init(players) { throw new Error("uno belum diimplement"); },
  validateMove(state, playerId, move) { throw new Error("uno belum diimplement"); },
  applyMove(state, move) { throw new Error("uno belum diimplement"); },
  checkEnd(state) { throw new Error("uno belum diimplement"); },
  getPlayerView(state, playerId) { throw new Error("uno belum diimplement"); },
};
