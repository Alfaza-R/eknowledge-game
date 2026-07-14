# Panduan Aset PNG — Eknowledge Game (Uno)

Tempat naro desain PNG kartu: **`public/assets/cards/`**, dipisah per warna.
Taro file sesuai NAMA & FOLDER di bawah, terus bilang ke Claude "aset udah masuk" →
langsung di-wire ke game (nggak usah ngoding sendiri).

> Sekarang masih placeholder (kotak warna + angka). Begitu PNG ada, diganti gambar asli.

---

## Aturan umum
- Format **PNG**, transparan lebih bagus (biar sudut kartu membulat rapi).
- Rasio kartu **2 : 3** (potrait). Rekomendasi **300 × 450 px**.
- Nama file **huruf kecil semua**, persis kayak daftar.

---

## Struktur folder kartu

```
public/assets/cards/
├── red/       ← kartu MERAH
├── yellow/    ← kartu KUNING
├── green/     ← kartu HIJAU
├── blue/      ← kartu BIRU
├── wild/      ← kartu WILD (hitam)
└── back.png   ← punggung kartu (1 file)
```

### Isi tiap folder warna (`red/`, `yellow/`, `green/`, `blue/`) — 13 file per folder
Nama filenya **sama di tiap folder** (yang beda cuma warnanya):

| Kartu | Nama file |
|---|---|
| Angka 0–9 | `0.png`, `1.png`, `2.png`, … `9.png` (10 file) |
| Skip | `skip.png` |
| Reverse | `reverse.png` |
| +2 | `plus2.png` |

Contoh: kartu **merah 7** → `red/7.png`. Kartu **biru skip** → `blue/skip.png`.
Kartu **kuning +2** → `yellow/plus2.png`.

### Isi folder `wild/` (hitam) — 2 file
| Kartu | Nama file |
|---|---|
| Wild (ganti warna) | `wild/wild.png` |
| Wild +4 | `wild/plus4.png` |

**Total muka kartu = 4 × 13 + 2 = 54 file.** (Kartu kembar pakai gambar sama.)

---

## Aset lain (opsional, di `public/assets/`)
| Aset | Path | Ukuran |
|---|---|---|
| Punggung kartu | `public/assets/cards/back.png` | 300 × 450 |
| Background meja | `public/assets/table.png` | 1600 × 1000 (16:10) |
| Avatar default | `public/assets/avatar.png` | 96 × 96 |

---

## Checklist
- [ ] `red/` : `0..9.png`, `skip.png`, `reverse.png`, `plus2.png` (13)
- [ ] `yellow/` : idem (13)
- [ ] `green/` : idem (13)
- [ ] `blue/` : idem (13)
- [ ] `wild/` : `wild.png`, `plus4.png` (2)
- [ ] `cards/back.png`
- [ ] `assets/table.png` (opsional)
- [ ] `assets/avatar.png` (opsional)

Kalau minimal muka kartu + `back.png` udah ada, itu cukup buat mulai keliatan asli.
Bilang "aset udah masuk" → langsung gua wire.
