# Barhal Dashboard — Rekap Per Tanggal & Per Rute Lengkap

**Tanggal:** 2026-08-03
**Status:** Draft

## Tujuan

Dua tabel rekap di halaman Barhal Dashboard (`Rekap Per Tanggal` dan `Rekap Per Rute`) sekarang hanya
menampilkan baris yang sudah punya Koli, karena keduanya di-*group* dari `koli_scoped`. Akibatnya
tanggal atau rute yang belum tertangani tidak terlihat sama sekali — padahal justru itu yang perlu
ditindaklanjuti operator.

Perubahan ini membuat:

1. **Rekap Per Tanggal** menampilkan seluruh tanggal dalam range filter (mis. 1–31 Agustus = rekap
   sebulan penuh), termasuk tanggal yang belum ada aktivitasnya.
2. **Rekap Per Rute** menampilkan seluruh rute barhal yang pernah ada, termasuk yang bulan itu tidak
   ada kirimannya.
3. **Status** ditentukan murni dari terisinya `chwt`, bukan lagi dari kelengkapan packing TO ke Koli.

## Kontrak perilaku

### Status

Aturan lama `total_to === attached_to && missing_chwt === 0` dibuang seluruhnya. Aturan baru:

```
completed  ⟺  awbCount > 0  DAN  missingChwt === 0
```

- `awbCount` — jumlah AWB distinct (non-null) dari TO yang **sudah masuk Koli** pada tanggal/rute itu.
- `missingChwt` — berapa di antara AWB tersebut yang tidak punya `chwt` di
  `air_shipments_smu_rate_cgk_spx`.

Konsekuensi yang disengaja:

- Tanggal/rute tanpa Koli sama sekali → `awbCount = 0` → **Incomplete**. Tidak perlu aturan khusus.
- Masih ada TO barhal yang belum dipacking ke Koli **tidak** lagi membuat status Incomplete, selama
  AWB dari TO yang sudah masuk Koli semuanya punya `chwt`.
- Koli ada tapi seluruh TO-nya ber-AWB null → **Incomplete**, karena `chwt` tidak bisa diperiksa.

Karena `chwt` hidup di level AWB sedangkan baris rekap adalah agregat Koli, seluruh Koli yang berbagi
satu AWB otomatis berstatus sama. Tidak ada rincian per-Koli, dan itu memang tidak mungkin dari data
yang tersedia.

### Rekap Per Tanggal

- Satu baris untuk **setiap tanggal kalender** dalam `[startDate, endDate]`, urut **menaik** (1 → 31).
- Tanggal yang belum lewat tetap ditampilkan (baris nol + Incomplete), supaya benar-benar "sebulan
  penuh".
- Pengisian penuh hanya aktif bila `startDate` **dan** `endDate` dua-duanya terisi. Bila API dipanggil
  tanpa range, perilakunya tetap seperti sekarang (hanya tanggal yang punya data).
- Range lebih dari **366 hari** ditolak `400 Bad Request`, supaya tidak menghasilkan tabel ribuan baris.

### Rekap Per Rute

- Satu baris untuk setiap pasangan `origin → dest` yang pernah muncul di data TO barhal
  (`air_shipments_compileaircgk`, `remarks ILIKE '%barhal%'`), **tanpa memandang filter tanggal**.
  Daftar barisnya karena itu stabil dari bulan ke bulan.
- Dipersempit oleh dropdown Origin/Destinasi bila diisi.
- Angka pada tiap baris tetap dihitung **di dalam** range filter, sehingga rute tanpa aktivitas pada
  range tersebut tampil nol + Incomplete.
- Rute yang muncul di `barhal_koli` tapi tidak ada di daftar master (mis. akibat data sumber berubah)
  tetap ditampilkan — hasil akhirnya gabungan kedua himpunan.

### Baris kosong

`totalTo`, `totalKoli`, `weightBefore`, `weightAfter`, `chwt`, `variance`, `variancePercent`,
`addRevenue` semuanya `0`; `status` = `incomplete`.

Perlu dibedakan dari baris yang *bukan* kosong: tanggal/rute yang punya TO tapi belum ada Koli harus
tetap menampilkan `totalTo` yang sebenarnya (mis. "5 TO, 0 Koli, Incomplete"), bukan nol. Ini
menentukan bagaimana `groups` dibangun di SQL — lihat bagian Backend.

### Chart

`chartByDate` dibangun dari baris rekap **sebelum** pengisian, supaya grafik tidak jatuh ke nol pada
tanggal yang belum lewat.

## Backend

### Modul baru — `modules/barhal/barhal-recap.builder.ts`

`getDashboard()` sudah ~215 baris. Logika rekap dipindahkan ke modul builder tersendiri, mengikuti
pola `barhal-csv.builder.ts` yang sudah ada, agar bisa diuji terpisah dari SQL.

```ts
export interface RecapAggregateRow {
  total_to: number
  total_koli: number
  awb_count: number
  missing_chwt: number
  weight_before: string
  chwt: string
  weight_increase: string
  add_revenue: string
}

export interface RecapMetrics {
  totalTo: number
  totalKoli: number
  weightBefore: number
  weightAfter: number
  chwt: number
  variance: number
  variancePercent: number
  addRevenue: number
  status: 'completed' | 'incomplete'
}

export const MAX_RECAP_DAYS = 366

export function toRecapMetrics(row: RecapAggregateRow): RecapMetrics
export function emptyRecapMetrics(): RecapMetrics
export function enumerateDates(start: string, end: string): string[]
export function densifyPerTanggal(
  rows: (RecapMetrics & { date: string })[],
  start: string,
  end: string,
): (RecapMetrics & { date: string })[]
export function densifyPerRute(
  rows: (RecapMetrics & { originName: string; destName: string })[],
  masterRoutes: { originName: string; destName: string }[],
): (RecapMetrics & { originName: string; destName: string })[]
```

`toRecapMetrics` mempertahankan perhitungan yang ada (`weightAfter = weightBefore + weight_increase`,
`variancePercent = 0` bila `weightBefore = 0`) dan hanya mengganti penentuan `status`.

`enumerateDates` menghitung dengan komponen UTC (`Date.UTC` + format manual `YYYY-MM-DD`), bukan
aritmetika `Date` lokal, supaya pergeseran zona waktu/DST tidak pernah melewatkan atau menggandakan
satu tanggal.

`densifyPerRute` mengurutkan hasil berdasarkan `originName` lalu `destName`; `densifyPerTanggal`
mengurutkan menaik berdasarkan tanggal.

### Perubahan SQL di `getDashboard()`

**CTE `groups`** — sumbernya diperluas agar tanggal/rute yang punya TO tapi belum ada Koli tetap
membawa angka aslinya:

```sql
-- per tanggal
groups AS (
  SELECT to_date AS koli_date FROM scoped
  UNION
  SELECT koli_date FROM koli_scoped
)

-- per rute
groups AS (
  SELECT origin_name, dest_name FROM scoped
  UNION
  SELECT origin_name, dest_name FROM koli_scoped
)
```

Dengan ini, baris yang diisi oleh `densify*` benar-benar hanya baris yang seluruh angkanya nol.

**Kolom `attached_to` dihapus** dari kedua query (tidak lagi dipakai), diganti `awb_count`:

```sql
(SELECT COUNT(DISTINCT s.awb)
   FROM koli_scoped ks
   JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id
   JOIN scoped s ON s.to_number = bkt.to_number
   WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL)::int AS awb_count
```

(analog untuk per rute dengan predikat `ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name`)

Himpunan AWB-nya identik dengan yang sudah dipakai subquery `chwt` dan `missing_chwt`, sehingga
ketiganya konsisten.

**Urutan per tanggal** berubah dari `ORDER BY g.koli_date DESC` menjadi `ASC`.

### Query baru — daftar master rute

```sql
SELECT DISTINCT
  <normalizedStationSql('e.origin_station')> AS "originName",
  <normalizedStationSql('e.dest_station')>   AS "destName"
FROM air_shipments_compileaircgk e
WHERE e.remarks ILIKE '%barhal%'
  AND e.to_number IS NOT NULL
  AND e.completed_date IS NOT NULL
  AND e.origin_station IS NOT NULL AND e.origin_station != ''
  AND e.dest_station  IS NOT NULL AND e.dest_station  != ''
  -- opsional: AND <normalized origin> = $1 / AND <normalized dest> = $n
ORDER BY 1, 2
```

Query ini **tidak** memakai parameter tanggal, jadi ia membangun array parameternya sendiri
(`routeParams`) dan tidak ikut `params` bersama milik query lain.

### Alur `getDashboard()`

1. Validasi range: bila `startDate` & `endDate` terisi dan jumlah tanggal inklusif di dalamnya
   melebihi `MAX_RECAP_DAYS` →
   `BadRequestException('Date range must not exceed 366 days')`. Dicek sebelum query apa pun jalan.
   (1 Jan–31 Des tahun kabisat = 366 tanggal, lolos.)
2. Query berurutan: `kpi` → `recapPerTanggal` → `recapPerRute` → `masterRoutes` → `recapBatangKayu`.
3. Map baris mentah lewat `toRecapMetrics`.
4. `chartByDate` dibangun dari hasil langkah 3 (sparse).
5. `recapPerTanggal` = `densifyPerTanggal(...)` bila `startDate` & `endDate` terisi; bila tidak, hasil
   langkah 3 diurutkan menaik apa adanya.
6. `recapPerRute` = `densifyPerRute(...)` — selalu, tidak bergantung range.

Bentuk response dan tipe di `features/barhal/types.ts` tidak berubah.

## Frontend

### Halaman — `app/(dashboard)/barhal/dashboard/page.tsx`

`startDate` / `endDate` di-inisialisasi ke tanggal 1 dan tanggal terakhir **bulan berjalan**, lewat
inisialisasi lazy `useState`. Aman terhadap hydration mismatch karena `BarhalDashboardPage`
mengembalikan `null` selama `loading || !user`, sehingga `BarhalDashboardContent` tidak pernah dirender
saat SSR.

Helper `currentMonthRange()` diletakkan di file yang sama dan mengembalikan `{ start, end }` berformat
`YYYY-MM-DD`.

Input tanggal yang ada tidak berubah — user mengganti bulan dengan mengubah kedua tanggal itu.

### Komponen — `features/barhal/components/BarhalRecapToTable.tsx`

Struktur kolom dan logika tidak berubah. Satu penyesuaian keterbacaan: dengan 31 baris yang sebagian
besar nol, baris kosong (`totalTo === 0 && totalKoli === 0`) dirender dengan `text-muted-foreground`
agar baris yang berisi data langsung menonjol. Badge status tetap seperti sekarang.

## Testing

### Baru — `barhal-recap.builder.spec.ts`

1. `toRecapMetrics` — tabel kebenaran status: `awbCount > 0 && missingChwt === 0` → `completed`;
   `awbCount = 0` → `incomplete`; `missingChwt > 0` → `incomplete`.
2. `toRecapMetrics` — TO yang belum masuk Koli tidak lagi mempengaruhi status.
3. `toRecapMetrics` — `variancePercent = 0` saat `weightBefore = 0`.
4. `enumerateDates` — bulan penuh (31 hari), Februari kabisat, rentang satu hari, batas lintas bulan.
5. `densifyPerTanggal` — mengisi celah dengan baris nol, mempertahankan baris yang ada, urut menaik.
6. `densifyPerRute` — menggabungkan master rute dengan baris hasil query, memasukkan rute yang hanya
   ada di salah satu himpunan, urut origin lalu dest.

### Diperbarui — `barhal.service.spec.ts`

Mock `getDashboard` yang ada disesuaikan: `attached_to` → `awb_count`, dan ditambah satu
`mockResolvedValueOnce` untuk query master rute pada posisi ke-4.

Test tambahan:

1. Dengan `startDate`/`endDate` terisi, `recapPerTanggal` berisi seluruh tanggal dalam range.
2. Tanpa range, `recapPerTanggal` tetap sparse.
3. Range > 366 hari melempar `BadRequestException` tanpa menjalankan query.
4. `recapPerRute` memuat rute master yang tidak ada di hasil query, dengan angka nol + `incomplete`.
5. `chartByDate` hanya memuat tanggal yang punya data, bukan tanggal hasil pengisian.

Mengikuti pola mock `dataSource.query` yang sudah dipakai di spec tersebut.

## Batasan yang diketahui

Bila satu AWB tersebar ke Koli pada **tanggal yang berbeda**, `chwt` AWB tersebut terhitung penuh di
tiap tanggal. Di dalam satu tanggal sudah aman karena subquery memakai `DISTINCT awb`, tetapi total
lintas tanggal akan lebih besar dari `chwt` sebenarnya. Perilaku ini sudah ada sebelum perubahan ini
dan tidak diperbaiki di sini.

## Di luar cakupan

- Perbaikan penghitungan ganda `chwt` lintas tanggal di atas
- Month picker khusus, terpisah dari filter range global
- Paginasi untuk kedua tabel rekap
- Perubahan `exportCsv`, yang masih berbasis Koli dan tidak mengikuti baris kosong
- Rincian status per Koli di dalam satu AWB (tidak mungkin: `chwt` hanya ada di level AWB)
