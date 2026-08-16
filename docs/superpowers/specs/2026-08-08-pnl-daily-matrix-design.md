# PnL Daily Matrix — Revenue & Profit Margin per Origin/Destination

**Tanggal:** 2026-08-08
**Status:** Disetujui, siap masuk rencana implementasi

## Latar Belakang

Tim keuangan memelihara "Daily Profit and Loss Report CGK" secara manual di spreadsheet:
dua tabel pivot dengan baris tanggal dan kolom destination, dikelompokkan per origin
(CGK dan SUB). Tabel pertama berisi revenue, tabel kedua berisi profit margin lengkap
dengan baris ringkasan % Margin, Total Tonase, dan Space per Kg.

Laporan itu diminta untuk dipindahkan ke modul PnL dashboard, dengan layout yang sama.

## Kelayakan

Seluruh angka yang dibutuhkan sudah tersedia di materialized view `v_pnl_to`. Tidak ada
migrasi database, tidak ada perubahan view.

| Kebutuhan | Kolom `v_pnl_to` |
| --- | --- |
| Tanggal (baris) | `date_completed` / `date_ata` / `date_atd` sesuai date basis terpilih |
| Origin (grup kolom) | `origin_station` — bernilai `'Jabo'` atau `'Surabaya'` |
| Destination (kolom) | `dest_station` |
| Revenue | `revenue_total` |
| Profit Margin | `revenue_total − revenue_discount − cost_to` |
| Total Tonase | `gross_weight` |
| Space per Kg | margin ÷ tonase |

Kumpulan `(origin_station, dest_station)` di database persis cocok dengan header di
spreadsheet: 13 destination di bawah Jabo (Aceh, Ambon, Balikpapan, Banjarmasin, Batam,
Denpasar, Kendari, Makassar, Padang, Palangka Raya, Pekanbaru, Tanjung Pandan, Tanjung
Pinang) dan 5 di bawah Surabaya (Balikpapan, Banjarmasin, Gorontalo, Makassar, Pontianak),
keduanya urut alfabetis.

Formula baris ringkasan diverifikasi silang dengan angka spreadsheet pada kolom Aceh:
total margin 13.693.732 ÷ 15 hari = 912.915 (Avg/Day); ÷ revenue 145.101.440 = 9,44 %
(% Margin); ÷ tonase 3.817 = 3.588 (Space per Kg).

## Keputusan Desain

| Topik | Keputusan |
| --- | --- |
| Penempatan | Tab ketiga di halaman P&L, di samping "Estimated" dan "Actual vs Estimate" |
| Layout | Dua tabel bertumpuk seperti spreadsheet, masing-masing bisa dilipat |
| Kolom destination | Diturunkan dari seluruh data `v_pnl_to`, bukan hanya periode terpilih, supaya layout stabil antar periode |
| TO tanpa cost | Sel tetap dihitung, diberi penanda visual dan tooltip |
| Export Excel | Di luar cakupan iterasi ini |
| Pembagian kerja | Backend menghitung seluruh agregat dan baris footer; frontend hanya me-render |

Alasan backend yang menghitung footer: modul ini sudah memakai konvensi tersebut
(`getProfitByRoute` menghitung `avgMarginPerKg` dan `avgMarginPerDay` di service), angka
laporan keuangan jadi punya satu sumber kebenaran yang bisa di-unit-test, dan kalau export
Excel menyusul, builder-nya memakai perhitungan yang sama tanpa duplikasi.

## Asumsi

- Tab baru memakai filter yang sudah ada di halaman P&L: mode Billing Cycle atau Custom
  Range, plus pemilih Date Basis. Cycle `1H` mencakup 15 hari, sama dengan periode di
  spreadsheet.
- Baris tanggal lengkap secara kalender. Tanggal tanpa shipment tetap muncul sebagai baris
  kosong, supaya Avg/Day = Total ÷ jumlah hari periode tetap konsisten.
- Sel tanpa data sama sekali dirender `—`; sel yang ada shipment tapi bernilai nol dirender `0`.
  Keduanya memang dibedakan seperti di spreadsheet. (Semula sel tanpa data dibiarkan kosong;
  diubah jadi `—` pada 2026-08-16 atas permintaan user — sel kosong dan nol terbaca sama sekilas,
  dan setelah sel bisa diklik, sel kosong tidak punya sasaran yang terlihat. Sama dengan cara
  `num()`/`pct()` dan AWB Drilldown merender nilai yang tidak ada.)
- Total Tonase memakai `gross_weight` (berat aktual per TO), bukan chargeable weight.
- Label header: `Jabo` ditampilkan sebagai **CGK**, `Surabaya` sebagai **SUB**.
- Tidak ada kolom total per baris (per tanggal), mengikuti spreadsheet.

## Backend

### Agregasi

Dua query terhadap `v_pnl_to`.

Query kolom, lepas dari filter periode:

```sql
SELECT DISTINCT origin_station, dest_station
FROM v_pnl_to
WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
ORDER BY 1, 2
```

`'Jabo' < 'Surabaya'` secara alfabetis, sehingga urutan grup CGK lalu SUB muncul dengan
sendirinya tanpa aturan pengurutan khusus.

Query fakta, memakai `buildFilter()` yang sudah ada supaya mode cycle/range dan date basis
identik dengan sisa modul:

```sql
SELECT
  TO_CHAR(<dateCol>::DATE, 'YYYY-MM-DD')                                   AS d,
  origin_station,
  dest_station,
  COALESCE(SUM(revenue_total), 0)                                          AS revenue,
  COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)
    - COALESCE(SUM(cost_to), 0)                                            AS margin,
  COALESCE(SUM(gross_weight), 0)                                           AS weight,
  COUNT(*) FILTER (WHERE cost_to IS NULL)::int                             AS incomplete_tos
FROM v_pnl_to
WHERE <filter> AND <dateCol> IS NOT NULL
GROUP BY 1, 2, 3
```

Tanggal dikembalikan lewat `TO_CHAR`, bukan `::DATE` telanjang, karena driver `pg`
mengubah kolom `DATE` menjadi objek `Date` JavaScript sehingga tidak bisa dicocokkan
langsung dengan daftar tanggal kalender. `getDailyMargin` sudah memakai cara yang sama.

Formula margin identik dengan `getSummary` dan `getProfitByRoute`, sehingga total tiap
kolom rekonsiliasi dengan KPI card di tab Estimated. Konsekuensinya sama pula: TO yang
cost-nya belum ketemu menyumbang revenue tetapi tidak menyumbang cost, sehingga margin
terlihat lebih tinggi dari seharusnya — inilah yang ditandai oleh `incomplete_tos`.

### Kontrak API

`GET /pnl/breakdown/daily-matrix?cycle=&start=&end=&basis=`, dengan `JwtAuthGuard` dan
permission `READ_PNL` mengikuti controller yang ada.

```ts
interface PnlDailyMatrixColumn {
  origin: string        // 'Jabo' | 'Surabaya'
  originLabel: string   // 'CGK'  | 'SUB'
  dest: string
}

interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number
}

interface PnlDailyMatrixRow {
  date: string                              // YYYY-MM-DD
  cells: (PnlDailyMatrixCell | null)[]      // sejajar dengan columns; null = tidak ada shipment
}

interface PnlDailyMatrixFooter {            // satu entri per kolom, sejajar dengan columns
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null                  // null bila totalRevenue = 0
  spacePerKg: number | null                 // null bila totalWeight = 0
  incompleteTos: number
}

interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]                 // lengkap secara kalender
  footer: PnlDailyMatrixFooter[]
  periodDays: number                        // pembagi Avg/Day
}
```

Pembagi nol menghasilkan `null`, bukan `Infinity` atau `NaN`.

### Helper baru

`calendarDaysForFilter()` di `pnl-filter.util.ts` hanya mengembalikan jumlah hari. Baris
yang lengkap secara kalender membutuhkan daftar tanggalnya, jadi ditambahkan
`calendarDatesForFilter(cycle?, start?, end?): string[]` di file yang sama: `1H` menghasilkan
tanggal 1–15, `2H` menghasilkan tanggal 16 sampai akhir bulan, mode range menghasilkan tiap
tanggal dari start sampai end. `calendarDaysForFilter` didefinisikan ulang sebagai panjang
array tersebut, supaya panjang periode hanya punya satu sumber kebenaran.

## Frontend

### Unit

- **`hooks/usePnl.ts`** — tambah `usePnlDailyMatrix(filter)` dan tipe `PnlDailyMatrix`,
  mengikuti pola hook yang sudah ada di file itu.
- **`components/PnlDailyMatrixView.tsx`** — kontainer tab. Fetch, tangani loading, error,
  dan keadaan kosong, lalu render dua `PnlMatrixTable`. Tidak berisi logika angka.
- **`components/PnlMatrixTable.tsx`** — komponen presentasional generik yang dipakai dua
  kali. Props: `title`, `columns`, `rows`, `footerRows`, `defaultOpen`. Tidak tahu apa-apa
  soal revenue maupun margin; hanya menerima angka dan merender. Inilah yang membuat kedua
  tabel identik layout-nya tanpa duplikasi.
- **`utils/dailyMatrix.ts`** — dua fungsi murni, `toRevenueTable(matrix)` dan
  `toMarginTable(matrix)`, yang memproyeksikan response API menjadi props tabel. Perbedaan
  kedua tabel hidup di sini: yang pertama menghasilkan 2 baris footer (Total, Avg/Day), yang
  kedua 5 baris (Total, Avg/Day, % Margin, Total Tonase, Space per Kg).
- **`app/(dashboard)/pnl/page.tsx`** — state `view` diperluas menjadi
  `'estimate' | 'actual' | 'daily'`, ditambah tombol "Daily Report" dan subtitle yang
  menyesuaikan. Filter di header dipakai apa adanya.

### Rendering

Kolom `Tanggal` dibuat `sticky left-0` supaya tetap terlihat saat 18 kolom di-scroll
horizontal, mengikuti pola sticky di `RouteAlertTable.tsx`. Header dua tingkat: baris atas
berisi grup `CGK` dan `SUB` dengan latar hijau dan biru muda seperti spreadsheet, baris
bawah berisi nama destination. `colSpan` tiap grup dihitung dari jumlah kolom yang datang
dari API (saat ini 13 dan 5), bukan dari angka tetap, sehingga rute baru otomatis terwadahi.

Angka memakai `num()` dari `features/pnl/utils/format.ts` — separator ribuan tanpa prefix
`Rp`, karena 18 kolom terlalu sempit untuk format mata uang penuh. `num()` memakai locale
`id-ID` sehingga tampil `6.690.528`, berbeda dari `6,690,528` di spreadsheet; locale
aplikasi dipertahankan demi konsistensi seluruh dashboard.

Nilai negatif di tabel Profit Margin ditampilkan dengan teks merah dan latar merah muda,
sama seperti spreadsheet. Sel yang mengandung TO tanpa cost mendapat penanda kecil beserta
tooltip berisi jumlah TO tersebut. Baris footer dipisahkan garis tebal dan di-bold.

## Testing

Dikerjakan dengan TDD: test lebih dulu, lalu implementasi.

**`pnl.service.spec.ts`**, mengikuti pola mock `dataSource.query` yang sudah ada:

- sel tersusun sejajar dengan `columns`
- pasangan (tanggal, rute) tanpa data menghasilkan `null`
- baris kalender lengkap, termasuk tanggal tanpa shipment
- matematika footer: `marginPct`, `spacePerKg`, `avgRevenuePerDay`, `avgMarginPerDay`
- pembagi nol menghasilkan `null`, bukan `Infinity` atau `NaN`
- hasil kosong tidak melempar error

**`pnl-filter.util.spec.ts`** (file baru; util ini belum punya test) untuk
`calendarDatesForFilter`: `1H` menghasilkan 15 tanggal; `2H` untuk bulan 30 dan 31 hari;
Februari termasuk tahun kabisat; mode range.

**`utils/dailyMatrix.spec.ts`** di frontend untuk kedua fungsi proyeksi: jumlah dan urutan
baris footer, penanganan `null`, dan pemetaan field.

**`pnl.controller.spec.ts`** — satu test wiring endpoint, mengikuti yang sudah ada.

## Di Luar Cakupan

- Export Excel berformat. Pembagian kerja di desain ini sengaja menaruh seluruh perhitungan
  di backend supaya export bisa memakai ulang angka yang sama saat nanti dikerjakan.
- Kolom total per baris.
- Drill-down dari sel ke daftar AWB.
