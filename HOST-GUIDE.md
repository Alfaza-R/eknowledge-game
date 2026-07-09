# Panduan Jadi Host — Eknowledge Game

Siapa pun di tim bisa jadi "mesin host" (yang nyalain server game). Berguna kalau
laptop orang yang biasa nge-host lagi mati. Sekali setup, selanjutnya tinggal 1x klik.

> Catatan: tiap kali di-host, **link publiknya ganti baru** (kayak `https://xxxx.trycloudflare.com`).
> Jadi yang lagi nge-host wajib share link terbaru ke grup WA. Selama nge-host, komputernya
> harus tetap nyala.

---

## Setup awal (sekali aja, ~5 menit)

**1. Install Node.js**
- Download dari https://nodejs.org → pilih versi **LTS** → install (klik Next terus).

**2. Install cloudflared**
- Buka **PowerShell**, jalankan:
  ```
  winget install Cloudflare.cloudflared
  ```

**3. Ambil kode game**
- Cara gampang (tanpa Git): buka https://github.com/Alfaza-R/eknowledge-game
  → tombol hijau **Code** → **Download ZIP** → extract ke folder mana aja.
- Atau kalau punya Git:
  ```
  git clone https://github.com/Alfaza-R/eknowledge-game.git
  ```
  > Repo-nya private — minta Rayhan tambahin kamu sebagai collaborator dulu, atau minta filenya langsung.

---

## Cara nge-host (tiap mau main)

1. Buka folder game.
2. **Double-click `host.bat`**.
3. Tunggu sampai muncul link `https://xxxx.trycloudflare.com` di jendela hitam.
4. **Copy link itu, share ke grup WA.**
5. Jangan tutup jendelanya selama main.

Selesai main? Tutup jendela `host.bat` + jendela `eknowledge-server`. Link langsung mati.

---

## Kalau mau link yang TETAP (nggak ganti-ganti) atau nyala 24 jam

Itu butuh salah satu dari:
- **Deploy ke cloud** (Fly.io / Render) — link permanen, nyala terus tanpa laptop,
  **tapi wajib daftar kartu** buat verifikasi.
- **Named Cloudflare Tunnel** pakai domain sendiri (mis. `game.taharica.co.id`) — link tetap,
  gratis tanpa kartu, tapi tetap butuh salah satu komputer nyala buat jalanin server.

Ngobrol sama Rayhan kalau mau naik ke salah satu ini.
