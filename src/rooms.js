// src/rooms.js — penyimpanan room di memori (TIDAK ada database)
//
// Semua meja disimpan di satu Map: kode room -> data room.
// Kalau server restart, semua ilang. Buat main kantor, itu fine.
//
// Bentuk satu room:
//   {
//     id: "K3P9XZ",
//     gameType: "tictactoe",
//     hostId: <socketId host>,
//     players: [{ id, name, connected }],
//     status: "lobby" | "playing" | "finished",
//     state: null,           // diisi module game pas mulai
//     result: null,          // "draw" | playerId pemenang, pas finished
//   }

const rooms = new Map();

// Alfabet tanpa karakter ambigu (gak ada 0/O, 1/I) biar gampang dibaca & di-share.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomId() {
  let id;
  do {
    id = "";
    for (let i = 0; i < 6; i++) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  } while (rooms.has(id)); // ulang kalau kebetulan bentrok (jarang banget)
  return id;
}

// Bikin room baru, host jadi pemain pertama. Return objek room.
function createRoom(gameType, host) {
  const id = generateRoomId();
  const room = {
    id,
    gameType,
    hostId: host.id,
    players: [{ id: host.id, name: host.name, connected: true }],
    status: "lobby",
    state: null,
    result: null,
  };
  rooms.set(id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

// Masukin pemain ke room. maxPlayers beda tiap game (ttt=2, uno=8).
// Return { ok, error?, room? }.
function joinRoom(roomId, player, maxPlayers = 2) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: "Room gak ketemu" };
  if (room.status !== "lobby") return { ok: false, error: "Game udah mulai" };
  if (room.players.length >= maxPlayers) return { ok: false, error: "Room udah penuh" };

  room.players.push({ id: player.id, name: player.name, connected: true });
  return { ok: true, room };
}

function removeRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = {
  rooms,
  generateRoomId,
  createRoom,
  getRoom,
  joinRoom,
  removeRoom,
};
