# P&L Analytics — Tab Baru di Halaman P&L

**Tanggal:** 2026-09-05
**Status:** Approved

## Tujuan

File `dashboard-analytics.html` (2,7 MB, di root repo, tidak di-track git) adalah dashboard analitik
rute kargo udara yang berdiri sendiri: satu file HTML berisi snapshot data yang dibekukan pada
2026-09-03 plus ~1.900 baris JavaScript vanilla yang merendernya jadi 14 section.

Seluruh datanya berasal dari endpoint backend repo ini. Dari 14 dataset yang dipakainya, 11 sudah
punya hook React Query di `features/pnl/hooks/usePnl.ts`, dan 3 sisanya (`sla-overview`,
`tracking-smu/offloaded`, `route-groups`) sudah ada di modul lain. Yang belum ada adalah antarmuka
untuk analisisnya — analisis yang tidak dicover satupun dari lima tab P&L yang ada:

- kualitas data level-hari yang membedakan periode sehat dari artefak (bukan sekadar "ada cost atau
  tidak"),
- pola hari-dalam-minggu dan dampak campaign,
- kombinasi vendor × maskapai terbaik per rute, dengan potensi upside-nya,
- konsentrasi margin (HHI) dan stabilitas margin per rute,
- selisih gross weight vs chargeable weight,
- self-operate gap: berapa mahal vendor pihak ketiga dibanding ESP terbang sendiri.

Perubahan ini mengimplementasikan seluruh 14 section itu sebagai tab **Analytics** keenam di halaman
P&L, memakai data live dari backend, bukan snapshot.

## Keputusan Desain

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Cakupan | Seluruh 14 section | Tab yang setengah jadi lebih buruk daripada tidak ada |
| Data per-AWB | Endpoint agregasi baru | 1.428 baris AWB per periode tidak perlu lewat kabel untuk menghasilkan 50 baris rollup |
| Deret harian | Endpoint `daily-series` baru | Menggantikan join dua matriks di client (~850 KB → ~50 KB) dan menghilangkan risiko salah-pasang tanggal |
| Chart | recharts | Sudah dipakai `PnlDailyMarginChart`; ~180 baris `charts.js` tidak perlu diport |
| Bahasa UI | Inggris | Halaman P&L seluruhnya Inggris; satu tab Indonesia akan terasa tempelan |
| Section Operasional tanpa `read.sla` | Tampil dengan catatan izin | User tahu fitur itu ada dan bisa minta akses |
| Scope rute | Selector sendiri di dalam tab | Mengikuti pola picker milik tab Routes/Vendors |
| Campaign dates | Diport, dengan localStorage | Analisis unik yang tidak ada di tab lain |

## Backend

Tiga endpoint baru di `apps/backend/src/modules/pnl/`, semuanya di bawah guard `read.pnl` yang sama
dengan endpoint P&L lain, menerima parameter periode standar (`cycle` / `start` / `end` / `basis`).

### `GET /pnl/analytics/daily-series`

Fondasi lima section (Data Health, Summary, Daily Trend, Time Patterns, Cost Structure) sekaligus
Routes & Groups. Mengembalikan satu baris per **(tanggal × rute)**, bukan total harian:

```ts
export interface PnlAnalyticsDailyRow {
  date: string        // YYYY-MM-DD
  origin: string
  dest: string
  revenue: number     // net: revenue_total - revenue_discount
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  weight: number      // gross weight
  incompleteTos: number
}
```

SQL memakai ekspresi cost-split yang sudah terbukti di `getRouteComparison`
(`pnl.service.ts:1258-1266`) — `SUM(cost_smu_awb * weight_share) FILTER (WHERE cost_to IS NOT NULL)`
— digabung `SUM(gross_weight)` dan `COUNT(*) FILTER (WHERE cost_to IS NULL)` dari `getDailyMatrix`,
dengan `GROUP BY date, origin_station, dest_station`.

**Kenapa per-rute, bukan total harian.** `routeContribution()` dan `marginStability()` di HTML asli
memanggil `periodSeries()` sekali per rute (baris 798 dan 836). Dengan total harian saja, mode live
akan butuh ~38 request untuk satu tab. Baris per-rute (16 hari × 29 rute ≈ 460 baris, ~50 KB) membuat
semuanya bisa diturunkan di client dengan penjumlahan biasa, dan **ganti scope tidak memicu request
sama sekali**.

Cost selalu jumlah keempat komponen. `summary.totalCost` tidak setuju dengannya (spec DQ2) dan hanya
ditampilkan di section Data Health sebagai diagnostik.

### `GET /pnl/analytics/journey`

`GROUP BY vendor, airline, origin_station, dest_station`:

```ts
export interface PnlAnalyticsJourneyRow {
  vendor: string | null
  airline: string | null
  origin: string
  dest: string
  awbCount: number
  gw: number
  chwt: number
  revenue: number
  cost: number
  margin: number
  marginPerKg: number
}
```

### `GET /pnl/analytics/gw-chw`

`GROUP BY origin_station, dest_station`:

```ts
export interface PnlAnalyticsGwChwRow {
  origin: string
  dest: string
  gw: number
  chwt: number
  diff: number          // gw - chwt
  revenuePerKg: number
  impact: number        // diff * revenuePerKg
}
```

### Chargeable weight

Kedua endpoint terakhir menghitung chwt sebagai `MAX(chwt_awb)` per AWB lalu dijumlahkan, **bukan**
`SUM(chwt_awb)` langsung. Chargeable weight adalah atribut AWB, bukan TO; menjumlahkannya per baris
TO akan menggandakannya sebanyak `toCount`. Ini jebakan yang sama yang sudah ditangani
`getAwbDrilldown` lewat `MAX(cost_*_awb)`.

### Section Appendix

Tidak butuh endpoint baru — `usePnlAwbDrilldown` yang sudah ada (paginated, limit 50) sudah pas untuk
tabel per-AWB mentah.

## Frontend

### Struktur

Feature module baru `features/pnl-analytics/`, mengikuti pola `features/pnl-settlement/` yang sudah
membuktikan tab P&L boleh punya feature dir sendiri. `features/pnl/` sudah berisi 17 komponen dan 18
util; menambah 14 section lagi ke sana membuatnya tak terbaca.

```
features/pnl-analytics/
  hooks/useAnalytics.ts
  utils/
    cycle.ts       previousCycle, cycleDateRange, routeKey, routeLabel, mapSlaRoutes
    series.ts      foldByRoute, foldAll, kpis, sliceSeries, completeRevenueShare,
                   dailyOutliers, costComposition
    weekday.ts     weekdayProfile, campaignDates, campaignWindows, campaignSummary
    share.ts       buildShare, shareTable, vendorExecution, airlineShare, selfOperateGap
    journey.ts     bestCombination
    routes.ts      routeContribution, concentration, marginStability
    ops.ts         slaView, offloadView
    dq.ts          dqReport
  components/
    PnlAnalyticsView.tsx        container: scope selector, nav, 14 section
    AnalyticsScopePicker.tsx
    AnalyticsNotes.tsx          catatan scope/range/absent
    AnalyticsHealth.tsx         section 1
    AnalyticsSummary.tsx        section 2
    AnalyticsTrend.tsx          section 3
    AnalyticsTimePatterns.tsx   section 4
    AnalyticsCostStructure.tsx  section 5
    AnalyticsAirline.tsx        section 6
    AnalyticsRa.tsx             section 7
    AnalyticsSg.tsx             section 8
    AnalyticsVendor.tsx         section 9
    AnalyticsJourney.tsx        section 10
    AnalyticsRoutes.tsx         section 11
    AnalyticsWeightGap.tsx      section 12
    AnalyticsOps.tsx            section 13
    AnalyticsAppendix.tsx       section 14
```

Seluruh util adalah fungsi murni yang menerima data dan mengembalikan angka. Di situ seluruh
matematikanya, dan di situ pula spec-nya. Komponen React hanya memformat.

### Pemanggilan data

`daily-series` dipanggil **dua kali**: periode kini dan periode sebelumnya. Keduanya unscoped —
scope diterapkan di client lewat `foldByRoute()`.

Dari satu respons periode kini diturunkan:

- **total unscoped** → gate Data Health,
- **total scoped** → KPI, chart, komposisi biaya,
- **per rute** → kontribusi, HHI, stabilitas margin.

Pemisahan scoped/unscoped itu disengaja dan didokumentasikan di HTML asli (baris 1272): coverage
level-rute mensertifikasi `2026-07-1H` sebagai 100% padahal hanya 14,9% revenue-nya jatuh di hari
dengan cost lengkap. Kalau gate ikut ter-scope, memilih satu rute bersih bisa menyembunyikan periode
yang rusak.

Respons periode sebelumnya dipakai untuk delta KPI dan untuk cek `baselineIncomplete`.

### `baselineIncomplete`

Kalau periode pembanding sendiri punya `completeDaysPct < 95`, **seluruh delta KPI dimatikan** dan
diganti catatan. Delta terhadap baseline yang rusak bukan fakta: `2026-07-1H` 100% "tercover" secara
level-rute sementara 85% revenue-nya duduk di hari dengan cost tak lengkap, sehingga delta naif
terbaca sebagai swing margin nyata padahal itu "periode sehat vs baseline rusak".

### Dua ukuran coverage

`dqReport()` menghitung keduanya dan sengaja memilih yang lebih ketat:

- `routeCoveragePct` — apakah rute punya cost sama sekali. Diagnostik sekunder.
- `completeDaysPct` — share revenue yang jatuh di hari dengan `incompleteTos === 0`. **Ini yang jadi
  gate**, dengan ambang `COVERAGE_MIN = 95`.

Setiap periode nyata dengan margin masuk akal punya ≥94% revenue di hari bersih; setiap periode
artefak punya ≤15% — sementara coverage level-rute mensertifikasi keduanya sebagai "100%".

## 14 Section

| # | Section | Sumber data |
|---|---|---|
| 1 | Data Health | daily-series (kini + sebelumnya), `data-quality/summary`, `cost-totals`, `summary`, `cost-by-vendor`, `cost-by-ra`, `sla-overview` |
| 2 | Summary | daily-series + KPI delta + narasi |
| 3 | Daily Trend | daily-series → ComposedChart |
| 4 | Time Patterns | daily-series → weekday profile + campaign |
| 5 | Cost Structure | daily-series → komposisi 4 komponen |
| 6 | SMU & Airline | `cost-by-vendor` |
| 7 | RA | `cost-by-ra` |
| 8 | Incoming & Outgoing | `cost-by-sg-out`, `cost-by-sg-in` |
| 9 | Vendor Execution | `cost-by-vendor` → `selfOperateGap` |
| 10 | Best Journey | `analytics/journey` |
| 11 | Routes & Groups | daily-series per-rute → kontribusi, HHI, stabilitas |
| 12 | Weight Gap | `analytics/gw-chw` |
| 13 | Operations | `sla-overview` + `offloaded` — butuh `read.sla` |
| 14 | Appendix | `awb-drilldown` (paginated) |

Section 2 menampilkan 13 KPI: days, weight, weightPerDay, revenue, revenuePerDay, revenuePerKg, cost,
costPerDay, costPerKg, margin, marginPerDay, marginPerKg, marginPct.

## Campaign Dates

Section 4 (Time Patterns) menandai tanggal campaign dan mengukur dampaknya terhadap tonase: tonase
pada hari campaign dibanding rata-rata hari biasa di sekitarnya.

Default dua aturan, sama dengan HTML asli:

```ts
[{ label: 'Double Date', rule: { type: 'doubleDate' } },      // 7.7, 8.8, 9.9, ...
 { label: 'Payday (25th)', rule: { type: 'dayOfMonth', day: 25 } }]
```

Bisa diedit user dan disimpan di `localStorage` dengan key `esp.campaigns`, per-browser. HTML asli
memakai `prompt()`; di React diganti dialog kecil dengan input teks berformat sama (koma sebagai
pemisah, `double` untuk tanggal kembar, angka untuk tanggal tetap). Nilai tersimpan yang tidak bisa
di-parse diabaikan dan diganti default, bukan membuat section gagal render.

## Catatan yang Wajib Ikut Diport

Tanpa ketiganya, angka di halaman menyesatkan.

**`SCOPE_FALLBACK_NOTE`** — section 6–9 datang dari endpoint yang tidak menerima filter rute. Saat
scope bukan "semua rute", angkanya tetap seluruh rute, dan section harus mengatakan itu.

**`RANGE_FALLBACK_NOTE`** — dalam mode Custom Range, metrik yang hanya ada sebagai agregat periode
(RA, SG, vendor, journey, GW/ChWt, SLA) tetap memakai periode penuh.

**Absen ≠ kosong** (HTML baris 1596) — endpoint yang gagal dimuat dapat catatan eksplisit, bukan
tabel kosong yang terbaca sebagai "tidak ada apa-apa periode ini".

## Chart

| HTML | recharts |
|---|---|
| `comboChart` (Daily Trend) | `ComposedChart` + `Bar` tonase + `Line` margin %, campaign jadi `ReferenceLine` |
| `hBar` (share/ranking) | `BarChart layout="vertical"` |
| `stackedBar` (Cost Structure) | `BarChart` + `Bar stackId` |
| `donut` (airline share) | `PieChart` + `Pie innerRadius` |

Warna mengikuti `PnlDailyMarginChart.tsx:30`: merah margin negatif, amber <10%, hijau sehat, abu-abu
untuk data tak lengkap — supaya arti sebuah warna sama di seluruh halaman P&L. `charts.js` tidak
diport.

## Integrasi ke Halaman P&L

Di `app/(dashboard)/pnl/page.tsx`:

- `PnlView` bertambah `'analytics'`,
- satu entri di `VIEW_SUBTITLE`,
- satu tombol tab (tanpa gate permission — tab-nya sendiri hanya butuh `read.pnl`),
- satu cabang ternary yang merender `<PnlAnalyticsView filter={filter} scope={...} onScopeChange={...} />`.

State `analyticsScope` **diangkat ke page**, seperti `routePicks` / `dailyRoutes` / `vendorPicks`
sudah: tab dirender lewat ternary, jadi meninggalkannya akan meng-unmount komponen dan membuang
pilihan scope.

Label tab masuk `features/pnl/constants.ts` — App Router menolak named export dari `page.tsx` selain
default dan metadata.

## Permission

Tab dijaga `read.pnl`, sama dengan halaman P&L. Section 13 (Operations) memanggil endpoint yang
dijaga `read.sla` (`air-shipments.controller.ts:206`). Untuk user tanpa `read.sla`, section tetap
dirender dengan catatan bahwa ia butuh izin SLA — tidak ada request yang dikirim, tidak ada 403 yang
sampai ke user.

## Testing

TDD: tes lebih dulu untuk tiap unit.

**Util (jest, mengikuti gaya `routeComparison.spec.ts`)** — di sinilah seluruh matematika
diverifikasi:

- `dqReport` memisahkan periode sehat dari artefak; `coveragePct` memakai ukuran level-hari,
- `bestCombination` jatuh ke fallback saat tak ada kombinasi lolos floor 5%, dan menandainya
  `floorCleared: false`,
- `selfOperateGap` melewati baris ESP berbobot nol (kalau tidak, "ESP terbang gratis" jadi baseline),
- `concentration` mengecualikan rute `costComplete: false` dan melaporkan `routesExcluded`,
- `marginStability` mengembalikan `null` di bawah lima hari terpakai,
- `foldByRoute` menjumlahkan rute terpilih dan mengabaikan sisanya.

**Komponen (RTL)** — container: state loading, error, kosong, gate `read.sla`, dan catatan
scope/range muncul persis di kondisi yang benar.

**Backend** — service spec untuk bentuk output ketiga endpoint; integration spec bergaya
`pnl-group-comparison.integration.spec.ts` yang memverifikasi total `daily-series` cocok dengan
`/pnl/summary` untuk periode dan basis yang sama. Itu invariant yang paling mungkin diam-diam rusak.

## Di Luar Cakupan

- Mode live/snapshot yang bisa ditukar (`createDataSource`) — tab ini selalu live.
- Export CSV seluruh halaman. Tab P&L yang ada tidak punya itu; kalau diinginkan, dikerjakan
  terpisah untuk semua tab sekaligus.
- Menghapus atau mengubah `dashboard-analytics.html`. File itu tidak di-track git dan dibiarkan apa
  adanya sebagai referensi.
