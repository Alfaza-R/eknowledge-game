# Eknowledge Game

Platform game multiplayer sederhana buat dimainkan bareng tim kantor Taharica pas istirahat.
Bukan proyek komersial. Prioritas: gampang deploy, gratis, cukup solid buat 5–15 orang.

Halaman game di-embed di WordPress (via iframe), tapi **logika game jalan di server Node.js
terpisah** ini. WordPress cuma jadi pintu masuk + sumber nama pemain.

Target game (urut, jangan lompat): **Tic-tac-toe → Ludo → Uno**.

---

## Stack

- **Server:** Node.js + Express + Socket.IO
- **Client:** HTML + CSS + vanilla JS
- **Hosting:** Fly.io (free tier, always-on, WebSocket lancar)
- **Database:** TIDAK ADA — state di memori server (room ilang kalau server restart, dan itu fine)

## Prinsip wajib

Server pegang state. Client cuma penampil + pengirim niat.
- Jangan broadcast state penuh → kirim **view berbeda per pemain** (penting buat Uno).
- Semua aturan divalidasi di server.
- Pikirin disconnect dari awal: grace period, host migration, cleanup room zombie.

---

## Struktur folder

```
eknowledge game/
  package.json
  Dockerfile
  fly.toml
  server.js              <- Express + Socket.IO bootstrap
  src/
    rooms.js             <- create/join/leave/cleanup room
    games/
      tictactoe.js       <- { init, validateMove, applyMove, checkEnd, getPlayerView }
      ludo.js
      uno.js
  public/
    index.html
    style.css
    client.js
```

Setiap game module ekspor **interface yang sama**, biar `rooms.js` gak perlu tau game apa
yang lagi jalan:

```js
module.exports = {
  init(players),                    // return initial state
  validateMove(state, playerId, move),
  applyMove(state, move),           // return new state
  checkEnd(state),                  // return winner | "draw" | null
  getPlayerView(state, playerId),   // view khusus pemain ini
};
```

> **Status saat ini:** baru scaffold struktur. Isi kode masih placeholder / stub (`TODO`).

---

## Run lokal

```bash
npm install
npm run dev        # node --watch, auto-restart pas file berubah
# atau: npm start
```

Buka http://localhost:3000 . Tes multiplayer: buka beberapa tab / device di jaringan sama.

## Deploy ke Fly.io

Sekali setup:

```bash
# install flyctl (https://fly.io/docs/flyctl/install/), lalu:
fly auth login
fly launch --no-deploy      # atau langsung pakai fly.toml yang udah ada
```

Deploy ulang tiap ada perubahan:

```bash
fly deploy
```

Setelah live, URL-nya kira-kira `https://eknowledge-game.fly.dev`.
Tes dari HP orang lain buat mastiin WebSocket tembus firewall.

## Integrasi WordPress (nanti)

`page-game.php` di child theme, embed via iframe. Nama pemain otomatis dari
`wp_get_current_user()`, dilempar ke game lewat query param `?room=...&name=...`.

> Catatan keamanan: query param bisa dimanipulasi. Buat internal kantor ini fine.
> Kalau nanti perlu, pakai signed token (HMAC) yang di-generate WordPress.

---

## Roadmap singkat

1. **Tic-tac-toe multiplayer** — buat menguasai pola room (connect, create/join, lobby,
   giliran, validasi server, broadcast, menang/seri, disconnect + host migration, deploy).
2. **Ludo** — turn-based, dadu, 4 pemain, papan CSS grid 15×15.
3. **Uno** — info tersembunyi (kartu di tangan), butuh server beneran. Edge case paling banyak.
