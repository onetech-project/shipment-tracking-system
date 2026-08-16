# PnL AWB Drilldown — Kolom & Filter Rute, plus Aksi Klik di Daily Report

**Tanggal:** 2026-08-15
**Status:** Disetujui, siap masuk rencana implementasi

## Latar Belakang

Dua kebutuhan yang saling menyambung di modul PnL:

1. **AWB Drilldown (tab Estimated)** perlu menampilkan origin, destination, dan tanggal
   per AWB. Tanggal yang tampil harus mengikuti date basis yang dipilih di header halaman:
   kalau filter halaman memakai *ATA Vendor WH dest*, kolom tanggal juga menampilkan
   ATA Vendor WH dest. Setelah ketiga kolom itu ada, drilldown perlu bagian filter agar
   user bisa mempersempit isinya berdasarkan tiga field tersebut.

2. **Daily Report** perlu bisa diklik per cell. Klik cell CGK + Tanjung Pinang + 1 Mei 2026
   membawa user ke tab Estimated dengan filter drilldown Origin = Jabo,
   Destination = Tanjung Pinang, Tanggal = 1 Mei 2026.

Kebutuhan kedua adalah konsumen dari kebutuhan pertama, jadi keduanya dikerjakan sebagai
satu spesifikasi.

## Kelayakan

Semua data sudah ada di materialized view `v_pnl_to`. Tidak ada migrasi database dan tidak
ada perubahan definisi view.

| Kebutuhan | Sumber di `v_pnl_to` |
| --- | --- |
| Origin | `origin_station` — bernilai `'Jabo'` atau `'Surabaya'` |
| Destination | `dest_station` |
| Tanggal | `date_completed` / `date_ata` / `date_atd`, dipilih `buildFilter` sesuai basis |
| Peta label origin | `ORIGIN_LABELS` di `pnl.service.ts` (`Jabo` → `CGK`, `Surabaya` → `SUB`) |

## Keputusan Desain

Keputusan berikut sudah disepakati sebelum implementasi.

### 1. Satu baris per AWB, dengan penanda nilai campur

Drilldown tetap `GROUP BY awb` seperti sekarang. Origin, destination, dan tanggal diambil
dari nilai dominan TO milik AWB tersebut (`MODE() WITHIN GROUP`). Kalau TO dalam satu AWB
punya nilai berbeda, sel diberi penanda "campur" alih-alih menyembunyikan perbedaan itu
atau memecah AWB menjadi beberapa baris. Jumlah AWB dan makna paging tidak berubah.

### 2. Filter rute bekerja sebagai semi-join, bukan filter TO

Di `v_pnl_to`, revenue bersifat per-TO tetapi biaya bersifat per-AWB (`MAX(cost_smu_awb)`,
`MAX(cost_total_awb)`). Kalau filter membuang sebagian TO dari agregasi, penjumlahan revenue
ikut menyusut sementara `MAX(cost_*_awb)` tetap mengembalikan biaya AWB penuh, sehingga
margin AWB campur menjadi rugi semu.

Karena itu filter rute menentukan **AWB mana yang tampil**, bukan TO mana yang dijumlahkan:
sebuah AWB tampil bila punya minimal satu TO yang cocok, dan angkanya tetap dihitung dari
seluruh TO milik AWB itu. Bila satu AWB selalu satu rute dan satu tanggal, hasilnya identik
dengan filter TO langsung.

**Besar konsekuensinya, diukur di database asli (cycle 2026-05-1H, basis ATA).** Rancangan ini
awalnya menyebut selisihnya "sedikit"; pengukuran menunjukkan angka itu terlalu kecil, jadi
dicatat apa adanya di sini:

| Sumber selisih | Sebaran |
| --- | --- |
| Origin berbeda dalam satu AWB | 0 dari 1.285 AWB |
| Destination berbeda dalam satu AWB | 3 dari 1.285 AWB (anomali data sumber) |
| Tanggal ATA berbeda dalam satu AWB | 50 dari 1.285 AWB (3,9%) |

Akibatnya 46 dari 229 cell (20%) menghasilkan drilldown dengan revenue lebih besar dari cell
yang diklik; terparah +51.952.499 (+135%), yaitu cell Jabo → Tanjung Pinang 2026-05-09 senilai
3.268.725 yang membuka drilldown 7.689.081 — seluruhnya dari satu AWB yang TO-nya melewati
batas tengah malam.

Aturan "1 AWB = 1 rute" jadi terbukti: penyebab dominan adalah **tanggal**, bukan rute. TO dalam
satu penerbangan tiba di gudang vendor pada jam berbeda dan bisa jatuh di dua tanggal. Tiga AWB
dengan destination ganda (Denpasar+Palangka Raya, Balikpapan+Banjarmasin, Gorontalo+Pontianak)
tidak masuk akal secara operasional dan pantas diperbaiki di sheet sumber.

Karena selisihnya tidak kecil, selain penanda campur per baris, drilldown menampilkan catatan
ringkas saat filter rute aktif: berapa AWB di halaman itu yang punya TO di luar filter, dan
bahwa angka barisnya mencakup seluruh TO milik AWB tersebut.

### 3. Klik cell hanya memfilter AWB Drilldown

Periode halaman (cycle/range/basis) tidak diubah oleh klik cell, jadi KPI, chart, dan
breakdown tetap menampilkan seluruh periode. Endpoint selain `awb-drilldown` tidak menerima
parameter rute.

### 4. Origin ditampilkan sebagai nilai asli

Kolom dan dropdown Origin menampilkan `Jabo` / `Surabaya`, bukan kode bandara. Daily Report
tetap menampilkan `CGK` / `SUB` seperti sekarang; pemetaan hanya terjadi saat klik cell
mengisi filter.

### 5. Rentang tanggal, bukan tanggal tunggal

Filter tanggal berupa Dari–Sampai agar beberapa hari bisa dilihat sekaligus. Klik cell
mengisi `dateFrom = dateTo = tanggal cell`.

### 6. Semua cell body bisa diklik

Termasuk cell kosong — hasilnya drilldown kosong untuk rute dan tanggal itu, yang merupakan
jawaban yang sah. Kolom Tanggal dan seluruh baris footer tidak bisa diklik.

### 7. State antar-tab tinggal di `page.tsx`

Filter rute disimpan sebagai state React di `PnlPageContent`, sejalan dengan cycle, basis,
mode, dan view yang sudah memakai local state. URL query param ditolak untuk saat ini:
memindahkan sebagian filter ke URL sementara sisanya di local state menghasilkan halaman
yang tidak konsisten, dan memindahkan semuanya jauh melebihi cakupan permintaan ini.

## Backend

### `GET /pnl/stations` (baru)

Mengembalikan pasangan rute distinct dari seluruh `v_pnl_to`, urut origin lalu dest:

```ts
interface PnlStation {
  origin: string       // 'Jabo'
  originLabel: string  // 'CGK'
  dest: string
}
```

Daftar diambil dari seluruh view, bukan hanya periode terpilih, agar isi dropdown tidak
berubah-ubah saat user berpindah cycle. Query `SELECT DISTINCT origin_station, dest_station`
yang sekarang tertanam di dalam `getDailyMatrix` diangkat menjadi method `getStations()` dan
dipanggil balik oleh `getDailyMatrix`, sehingga daftar rute punya satu definisi.

### `getAwbDrilldown` menerima objek `route`

Method ini sudah punya enam argumen posisional; parameter baru dibungkus satu objek opsional
agar pemanggilannya tetap terbaca:

```ts
interface PnlRouteFilter {
  origin?: string
  dest?: string
  dateFrom?: string  // YYYY-MM-DD
  dateTo?: string    // YYYY-MM-DD, inklusif
}
```

Query utama memakai alias `v` (`buildFilter(..., 'v.')`) dan menambahkan semi-join:

```sql
FROM v_pnl_to v
WHERE <filter periode pada v.>
  AND EXISTS (
    SELECT 1 FROM v_pnl_to m
    WHERE m.awb = v.awb
      AND <filter periode pada m.>
      AND <kondisi rute yang terisi>
  )
```

Aturan perakitan:

- Kondisi rute hanya dirakit untuk field yang terisi: `m.origin_station = $n`,
  `m.dest_station = $n`, `m.<dateCol> >= $n::DATE`, `m.<dateCol> < $n::DATE + INTERVAL '1 day'`.
  Batas atas memakai `< dateTo + 1 hari` agar seluruh hari terakhir ikut, sama seperti
  perbaikan yang sudah diterapkan pada filter range di `buildFilter`.
- Bila tidak ada satu pun field rute terisi, klausa `EXISTS` tidak dirakit sama sekali dan
  query identik dengan yang sekarang.
- Filter periode ikut diterapkan di dalam subquery, sehingga TO di luar periode tidak pernah
  menarik masuk sebuah AWB.
- Query `SELECT COUNT(DISTINCT awb)` memakai klausa `WHERE` yang sama persis, agar paging
  tidak melenceng dari isi tabel.

### Field baru pada baris drilldown

```ts
interface PnlAwbRow {
  // …field yang sudah ada
  origin: string | null
  dest: string | null
  date: string | null        // YYYY-MM-DD sesuai basis aktif
  originVaries: boolean
  destVaries: boolean
  dateVaries: boolean
}
```

Nilai dominan diambil dengan `MODE() WITHIN GROUP (ORDER BY origin_station)` dan seterusnya;
penanda campur dari `COUNT(DISTINCT origin_station) > 1`. Kolom tanggal memakai `dateCol`
yang dikembalikan `buildFilter`, jadi otomatis mengikuti basis yang dipilih halaman.

### Controller

`awb-drilldown` menambah `@Query('origin')`, `@Query('dest')`, `@Query('dateFrom')`, dan
`@Query('dateTo')`, semuanya opsional, diteruskan sebagai objek `route`. `awb-tos` tidak
berubah: sub-tabel TO tetap menampilkan seluruh TO milik AWB, konsisten dengan angka baris
induknya yang juga dihitung dari seluruh TO.

## Frontend

### `hooks/usePnl.ts`

- Tipe `PnlRouteFilter` (bentuknya sama dengan versi backend).
- `usePnlAwbDrilldown(filter, page, route, limit)` — `route` masuk params dan `queryKey`.
  Field kosong tidak dikirim sebagai query param.
- `usePnlStations()` — `staleTime` panjang (5 menit) seperti `usePnlCycles`, karena daftar
  rute jarang berubah.
- Field baru pada `PnlAwbRow`.
- `BASIS_LABELS: Record<DateBasis, string>` di-export dari sini; `BASIS_OPTIONS` di
  `page.tsx` dibangun dari peta itu, sehingga judul kolom tanggal di drilldown dan label
  dropdown basis tidak bisa berbeda teks.

### `utils/periodBounds.ts` (baru)

`periodBounds(filter): { min: string; max: string }` menurunkan batas kalender periode aktif:
mode range mengembalikan start/end apa adanya, mode cycle menurunkan `1H` = tanggal 1–15 dan
`2H` = tanggal 16 sampai akhir bulan. Mencerminkan aturan `calendarDatesForFilter` di backend
dan dipakai sebagai `min`/`max` input tanggal filter.

### `components/PnlAwbDrilldown.tsx`

- Menerima props baru `route: PnlRouteFilter` dan `onRouteChange(next: PnlRouteFilter)`.
  State-nya milik `page.tsx` agar klik cell Daily Report bisa mengisinya.
- Bagian filter di bawah header: dropdown Origin, dropdown Destination (opsinya menyusut
  mengikuti origin terpilih), input Dari dan Sampai (dibatasi `periodBounds`), serta tombol
  Reset yang hanya muncul saat ada filter aktif.
- Tiga kolom baru — Origin, Destination, dan tanggal berlabel basis aktif — disisipkan
  setelah kolom AWB. Nilai `null` tampil sebagai `—`; nilai campur diberi badge `+` dengan
  tooltip yang menjelaskan bahwa TO dalam AWB ini punya nilai berbeda.
- `colSpan` pada baris loading dan `ToSubTable` naik dari 15 ke 18.
- `page` di-reset ke 1 saat `route` berubah, sama seperti perilakunya saat `filter` berubah.

### `components/PnlMatrixTable.tsx`

Prop opsional `onCellClick?(column: PnlDailyMatrixColumn, date: string): void`. Saat prop
diberikan, isi tiap cell body dibungkus `<button>` selebar cell dengan `hover:bg-primary/10`
dan `title`, sehingga bisa dijangkau keyboard. Cell kosong tetap bisa diklik. Kolom Tanggal
dan seluruh footer tidak. Tanpa prop tersebut, render-nya identik dengan sekarang.

### `components/PnlDailyMatrixView.tsx`

Meneruskan `onCellClick` ke kedua tabel (Revenue dan Profit Margin).

### `app/(dashboard)/pnl/page.tsx`

- State `drilldownRoute: PnlRouteFilter`, diteruskan ke `PnlAwbDrilldown`.
- Handler klik cell: mengisi `{ origin: column.origin, dest: column.dest, dateFrom: date,
  dateTo: date }`, memanggil `setView('estimate')`, lalu men-scroll ke drilldown lewat `ref`
  setelah render.
- `drilldownRoute` dikosongkan saat basis, mode, cycle, atau range berubah, agar tidak
  tertinggal tanggal di luar periode baru yang membuat tabel kosong tanpa sebab yang terlihat.

## Rencana Pengujian

**Backend (`DataSource.query` di-mock, mengikuti `pnl.service.spec.ts` yang ada):**

- `getStations` mengembalikan bentuk `{ origin, originLabel, dest }` dengan label dari
  `ORIGIN_LABELS` dan fallback ke nilai asli untuk origin yang belum dipetakan.
- `getDailyMatrix` tetap menghasilkan kolom yang sama setelah refactor ke `getStations`.
- `getAwbDrilldown` merakit SQL dan params yang benar untuk: tanpa parameter rute (tidak ada
  `EXISTS` sama sekali), origin saja, dest saja, rentang tanggal saja, dan kombinasi lengkap.
- Query count memakai klausa `WHERE` yang sama dengan query data.
- Batas atas tanggal memakai `< dateTo + 1 hari`.
- Pemetaan hasil `MODE`/`COUNT(DISTINCT)` ke `origin`/`dest`/`date` dan tiga flag `*Varies`.
- Controller meneruskan keempat query param baru sebagai objek `route`.

**Frontend (RTL, mengikuti `PnlMatrixTable.spec.tsx` yang ada):**

- `periodBounds` untuk cycle `1H`, cycle `2H` (termasuk bulan 30 dan 31 hari serta Februari),
  dan mode range.
- `PnlMatrixTable`: cell memanggil `onCellClick` dengan kolom dan tanggal yang benar; cell
  kosong tetap memanggilnya; footer dan kolom Tanggal tidak; tanpa prop tersebut tidak ada
  elemen klik yang muncul.
- `PnlAwbDrilldown`: tiga kolom baru terender, badge campur muncul sesuai flag, perubahan
  dropdown memanggil `onRouteChange`, opsi Destination menyusut mengikuti Origin, dan Reset
  mengosongkan seluruh filter.
- Satu tes level halaman: klik cell di Daily Report memindahkan view ke Estimated dengan
  `drilldownRoute` terisi dari kolom dan tanggal cell tersebut.

## Di Luar Cakupan

- Parameter origin/dest pada endpoint summary, daily-margin, dan breakdown.
- Memindahkan filter halaman PnL ke URL query param.
- Perubahan pada tab Actual vs Estimate.
- Prorata biaya AWB ke level TO.
