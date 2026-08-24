# Barhal Dashboard — Export CSV Per TO

**Tanggal:** 2026-08-24
**Status:** Disetujui, siap diimplementasikan

## Latar Belakang

Export CSV dashboard Barhal (`GET /barhal/export.csv`) saat ini menghasilkan satu baris per
**Koli** dengan 8 kolom: No. Koli, Tanggal, Origin, Destinasi, Total TO, Weight Before,
Weight After, ChWt. Bentuk ini menyembunyikan TO — padahal TO adalah satuan kerja yang
dilacak operator, dan data milik TO (Vendor, LT Number, Qty Parcel, Remarks) tidak muncul
sama sekali.

Export diubah menjadi satu baris per **TO**, dengan 23 kolom yang menggabungkan data TO
(dari sheet `air_shipments_compileaircgk`) dan data Koli (dari `barhal_koli`).

## Ruang Lingkup

Hanya TO yang **sudah dilampirkan ke sebuah Koli** (`barhal_koli_to`). TO Barhal yang belum
dipacking tidak ikut ter-export.

Format CSV lama diganti total — tidak ada endpoint kedua, tidak ada mode. Judul kolom lama
`Total TO` dan `ChWt` hilang dari export; ChWt tetap dapat dilihat di rekap dashboard. Judul
`No. Koli` juga hilang, tetapi nilainya tetap ada di export baru dengan judul
`ID Packing Kayu` (kolom 10).

Nama file unduhan tetap `barhal-<range>.csv`.

## Kolom

Urutan kolom persis seperti berikut, tidak lebih:

| # | Kolom | Sumber | Milik |
|---|---|---|---|
| 1 | Date (TO) | `c.shipment_date` | TO |
| 2 | Vendor | `c.extra_fields->>'vendor'` | TO |
| 3 | Origin | `k.origin_name` | Koli |
| 4 | Destination | `k.dest_name` | Koli |
| 5 | LT Number | `c.lt_number` | TO |
| 6 | TO Number | `t.to_number` | TO |
| 7 | Gross Weight | `c.gross_weight` (live dari sheet) | TO |
| 8 | Qty Parcel | `c.extra_fields->>'qty_parcel'` | TO |
| 9 | Remarks | `c.remarks` | TO |
| 10 | ID Packing Kayu | `k.koli_number` | Koli |
| 11 | Berat sebelum | `k.weight_before` | Koli |
| 12 | Berat Setelah Packing Kayu | `k.weight_after` | Koli |
| 13 | Kenaikan Berat | `k.weight_after − k.weight_before` | turunan |
| 14 | SMU | `k.smu_number` | Koli |
| 15 | Airlines | `k.airlines` | Koli |
| 16 | Flight No | `k.flight_no` | Koli |
| 17 | STD | `k.std` (timestamptz → WIB) | Koli |
| 18 | STA | `k.sta` (timestamptz → WIB) | Koli |
| 19 | Panjang (P) | `k.length_cm` | Koli |
| 20 | Lebar (L) | `k.width_cm` | Koli |
| 21 | Tinggi (T) | `k.height_cm` | Koli |
| 22 | Volume | `k.volume` | Koli |
| 23 | Jumlah Batang Kayu | `k.batang_kayu` | Koli |

Baris header CSV, harfiah:

```
Date (TO),Vendor,Origin,Destination,LT Number,TO Number,Gross Weight,Qty Parcel,Remarks,ID Packing Kayu,Berat sebelum,Berat Setelah Packing Kayu,Kenaikan Berat,SMU,Airlines,Flight No,STD,STA,Panjang (P),Lebar (L),Tinggi (T),Volume,Jumlah Batang Kayu
```

### Keputusan sumber data

**Gross Weight live dari sheet**, bukan snapshot `barhal_koli_to.gross_weight`. Konsisten
dengan kolom TO lain (Vendor, LT, Qty Parcel, Remarks) yang memang harus mengikuti sheet
terbaru.

**Origin/Destination dari Koli**, bukan dari `route_master`. Kolom Koli selalu terisi dan
sudah dinormalisasi (`Makassar`, bukan `MAKASSAR DC`), serta sama dengan yang tampil di
dashboard.

**P/L/T dan Volume dari Koli** (hasil wizard packing), bukan dari `p_panjang`/`l_lebar`/
`t_tinggi` di sheet. Sekelompok dengan Volume dan Batang Kayu yang memang dihitung wizard;
kolom sheet hanya terisi ~20% dan tidak menyediakan Volume.

**ID Packing Kayu = `koli_number`.** Satu-satunya identitas packing kayu yang ada di sistem;
tidak ada field baru yang perlu ditambahkan.

### Kolom Koli diulang di setiap baris

Kolom 3–4 dan 10–23 milik Koli dan **diulang** di setiap baris TO milik Koli tersebut,
sehingga tiap baris berdiri sendiri untuk difilter dan di-pivot di Excel.

Konsekuensinya: `SUM` atas kolom berat, volume, dan batang kayu akan menghitung satu Koli
berkali-kali dan menghasilkan angka yang menggelembung. Ini sejajar dengan catatan chWt yang
sudah ada di builder lama, dan harus ditulis sebagai doc comment di `BarhalCsvRow`.

## Query

Satu query di `BarhalService.exportCsv`:

```sql
WITH to_latest AS (
  SELECT DISTINCT ON (to_number)
    to_number, lt_number, shipment_date, gross_weight, remarks,
    extra_fields->>'vendor'     AS vendor,
    extra_fields->>'qty_parcel' AS qty_parcel
  FROM air_shipments_compileaircgk
  WHERE to_number IS NOT NULL
  ORDER BY to_number, updated_at DESC NULLS LAST
)
SELECT …
FROM barhal_koli_to t
JOIN barhal_koli k ON k.id = t.koli_id
LEFT JOIN to_latest c ON c.to_number = t.to_number
<WHERE …>
ORDER BY c.shipment_date DESC NULLS LAST, k.koli_number, t.to_number
```

### `DISTINCT ON (to_number)` bersifat wajib, bukan kosmetik

`air_shipments_compileaircgk` unik pada `(lt_number, to_number)`, sehingga satu TO dapat
memiliki lebih dari satu baris dengan LT dan tanggal berbeda — contoh nyata di data:
`TO20260508TJOMX` punya dua baris, LT `LT1Q591H79QL1` (2026-05-09) dan `LT1Q5E1HBWC61`
(2026-05-14). Tanpa `DISTINCT ON`, join menggandakan baris TO dan jumlah baris CSV melampaui
`total_to` Koli. Baris terpilih adalah `updated_at` terbaru. Polanya mengikuti
`SMU_CHWT_CTE` yang sudah ada di service.

### `LEFT JOIN`, bukan inner

`barhal_koli_to` adalah snapshot: bila TO-nya hilang dari sheet, barisnya tetap harus muncul
dengan kolom Koli utuh dan kolom TO kosong. Inner join akan membuat baris itu lenyap diam-diam
dan membuat CSV tidak cocok dengan `total_to`.

### Basis tanggal: `shipment_date`

Filter rentang tanggal memakai `c.shipment_date` (tanggal TO), bukan `k.koli_date` seperti
export lama — sehingga yang di-filter sama dengan yang ditampilkan di kolom 1.

Konsekuensi yang perlu diketahui: rekap dashboard berbasis `koli_date`, jadi jumlah baris CSV
tidak akan persis sama dengan kartu statistik di layar bila sebuah TO dipacking di bulan yang
berbeda dari tanggal TO-nya. Tulis ini sebagai doc comment di `exportCsv`.

Karena `shipment_date` berasal dari `to_latest`, TO yang tidak ditemukan di sheet bertanggal
`NULL` dan tersaring keluar saat rentang tanggal aktif. Ini benar: tanpa tanggal, baris itu
tidak dapat ditempatkan dalam rentang mana pun.

Filter `origin`/`dest` tetap opsional dan tetap dibangun dengan params terindeks seperti
sekarang.

### Urutan baris

`shipment_date DESC` (terbaru dulu), lalu `koli_number`, lalu `to_number`. TO dalam satu Koli
tetap berkelompok berurutan sehingga kolom Koli yang berulang terbaca rapi.

## Builder

`barhal-csv.builder.ts` tetap murni (tanpa NestJS/DB) agar dapat diuji terpisah.
`BarhalCsvRow` diganti 23 field dan `HEADERS` diganti 23 judul kolom.

Fungsi yang dipertahankan: `escapeCsvCell`, `formatCsvDate`, `formatCsvWeight`.

Tiga fungsi format baru:

- **`formatCsvDateTime`** (STD/STA) — `timestamptz` → `'DD MMM YYYY HH:mm'` dalam WIB.
  Offset +7 di-hardcode sebagai konstanta bernama, **bukan** `toLocaleString` dengan zona
  server: server dapat berjalan di UTC dan hasilnya akan diam-diam berbeda dari yang dilihat
  operator di dashboard (frontend menampilkannya dalam waktu lokal browser). `null` → sel
  kosong.
- **`formatCsvDelta`** (Kenaikan Berat) — sel kosong bila salah satu berat `null`, selain itu
  `(after − before).toFixed(1)`. Kosong membedakan "belum ditimbang" dari "tidak naik".
- **`formatCsvNumber`** (P/L/T, Volume, Batang Kayu) — `null` → sel kosong, bukan `0.0`. Nol
  yang dipaksakan pada dimensi terbaca sebagai "ukurannya nol", padahal artinya belum diisi.

`formatCsvWeight` yang lama tetap memaksa `null` menjadi `0.0` dan dipakai untuk Gross Weight,
Berat sebelum, dan Berat Setelah Packing Kayu — ketiganya hasil timbang yang selalu bernilai
dalam alur normal, dan perilaku itu sudah dipakai export yang berjalan sekarang. Termasuk
untuk baris yang TO-nya tidak ditemukan di sheet: Gross Weight-nya tampil `0.0`, sementara
kolom TO lain di baris itu (Vendor, LT Number, Qty Parcel, Remarks) tampil kosong.

Tanggal (kolom 1) tetap `'24 Aug 2026'` lewat `formatCsvDate`.

Vendor, LT Number, TO Number, Remarks, SMU, Airlines, Flight No ditulis apa adanya lewat
`escapeCsvCell`; Remarks yang mengandung koma otomatis dikutip.

**Qty Parcel keluar sebagai teks mentah** dari sheet, tanpa dipaksa menjadi angka. Sheet
diisi manual dan dapat berisi apa saja; mengubahnya menjadi `0` akan menghilangkan informasi.

## Tes

Ditulis lebih dulu (TDD).

`barhal-csv.builder.spec.ts` — ditulis ulang:

- header 23 kolom sesuai daftar, dan satu baris lengkap yang terisi penuh
- `null` pada STD/STA dan pada P/L/T/Volume/Batang Kayu menghasilkan sel kosong, bukan `0.0`
- salah satu berat `null` menghasilkan Kenaikan Berat kosong
- STD tengah malam WIB tidak bergeser hari (regresi UTC)
- Remarks yang mengandung koma dikutip benar
- `numeric` yang datang sebagai string dari driver pg diformat sama dengan number

`barhal.service.spec.ts` — blok `exportCsv` yang ada diperluas:

- SQL memfilter pada `shipment_date`, bukan `koli_date`
- SQL mengandung `DISTINCT ON (to_number)`
- satu TO dengan dua baris LT hanya menghasilkan satu baris CSV — bug yang paling mungkin
  lolos tanpa dijaga

## Yang Tidak Berubah

Frontend (`useBarhalDashboard.ts`, halaman dashboard), controller, `BarhalDashboardQueryDto`,
dan nama file unduhan tidak tersentuh.
