# Panduan Aset PNG — Eknowledge Game (Uno)

Daftar semua gambar PNG yang perlu dibikin buat ngeganti placeholder CSS sekarang.
**Taro file-nya sesuai NAMA & FOLDER di bawah** — nanti tinggal bilang ke Claude "aset udah
masuk", langsung di-wire ke game (nggak usah ngubah kode sendiri).

> Sekarang semua masih placeholder (kartu = kotak warna + angka, punggung = merah + oval,
> avatar = huruf awal nama, background = gradient). Begitu PNG-nya ada, diganti gambar asli.

---

## Aturan umum
- Format: **PNG** (transparan lebih bagus, terutama buat kartu biar sudutnya membulat rapi).
- Kartu sebaiknya seragam rasio **2 : 3** (potrait). Rekomendasi **300 × 450 px** (tajam di HP retina).
- Nama file **huruf kecil semua**, persis kayak daftar (biar kebaca kode otomatis).

---

## 1. Muka kartu → folder `public/assets/cards/`

### a. Kartu angka (40 file)
Pola nama: **`<warna>_<angka>.png>`** — warna: `red`, `yellow`, `green`, `blue`; angka `0`–`9`.

| Warna | File |
|---|---|
| Merah | `red_0.png`, `red_1.png`, … `red_9.png` |
| Kuning | `yellow_0.png` … `yellow_9.png` |
| Hijau | `green_0.png` … `green_9.png` |
| Biru | `blue_0.png` … `blue_9.png` |

### b. Kartu aksi (12 file)
Pola: **`<warna>_<aksi>.png`** — aksi: `skip`, `reverse`, `draw2` (ini kartu +2).

`red_skip.png`, `red_reverse.png`, `red_draw2.png`
`yellow_skip.png`, `yellow_reverse.png`, `yellow_draw2.png`
`green_skip.png`, `green_reverse.png`, `green_draw2.png`
`blue_skip.png`, `blue_reverse.png`, `blue_draw2.png`

### c. Kartu wild (2 file)
`wild.png` (ganti warna), `wild4.png` (+4).

**Total muka kartu = 54 file.** (Kartu kembar pakai gambar yang sama, jadi cukup 54.)

---

## 2. Punggung kartu → `public/assets/cards/back.png`
Satu file, ukuran sama kayak kartu (300 × 450). Dipakai buat deck & kartu lawan.

## 3. Background meja → `public/assets/table.png`
Rasio **16 : 10** (mendatar). Rekomendasi **1600 × 1000 px** (boleh PNG/JPG).

## 4. Avatar default (opsional) → `public/assets/avatar.png`
Kotak **96 × 96 px**. Dipakai kalau pemain nggak punya foto. (Sekarang: huruf awal nama.)

## 5. Panah arah putaran (opsional) → `public/assets/arrow.png`
Transparan. Sekarang pakai simbol ↻ CSS — boleh diganti kalau mau lebih bagus.

---

## Checklist cepat
- [ ] 40 kartu angka (`<warna>_0..9.png`)
- [ ] 12 kartu aksi (`<warna>_skip/reverse/draw2.png`)
- [ ] 2 kartu wild (`wild.png`, `wild4.png`)
- [ ] `back.png`
- [ ] `table.png`
- [ ] `avatar.png` (opsional)
- [ ] `arrow.png` (opsional)

Kalau udah ada minimal muka kartu + `back.png`, itu udah cukup buat mulai keliatan asli.
Bilang aja "aset udah masuk" → langsung di-wire.
