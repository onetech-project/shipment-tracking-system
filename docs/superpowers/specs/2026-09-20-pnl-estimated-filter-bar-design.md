# PnL — Filter Bar di Tab Estimated, Filter Route Group, & Cell Kuning Revenue

**Tanggal:** 2026-09-20
**Area:** `apps/backend/src/modules/pnl`, `apps/frontend/src/features/pnl`
**Branch usulan:** `feature/pnl-estimated-filter-bar` dari `development`

---

## Latar

Lima perubahan pada modul P&L, dua tab:

**Tab Estimated**

1. Baris filter yang sekarang berada **di dalam** AWB Drilldown dipindah ke atas, tepat di bawah
   panel *How is estimated P&L calculated?*.
2. Filter tersebut mendapat pilihan **Route Group**.
3. **KPI cards dan chart ikut menyempit** mengikuti filter itu — hari ini keduanya selalu
   menampilkan seluruh periode.

**Tab Daily Report**

4. Filter rute yang sudah ada mendapat pilihan **Route Group**.
5. Cell pada tabel **Revenue** kembali kuning bila revenue-nya benar-benar bolong.

Poin 3 adalah perubahan yang paling dalam: ia membatalkan sebuah keputusan desain yang hari ini
tertulis eksplisit di `page.tsx` — *"The page period, KPIs, chart and breakdowns keep showing the
whole cycle; only the drilldown narrows, which is what makes it readable as a subset of them."*
Setelah perubahan ini, filter adalah **satu scope untuk seluruh tab**, bukan lagi penyempit lokal
milik drilldown. Konsekuensinya dirinci di §3.

Poin 5 bukan sekadar mengembalikan perilaku lama: penyebab cell tidak kuning sudah diketahui dan
sudah tercatat sebagai batasan yang diterima di spec 2026-08-27 §2d. Spec ini menutupnya di sumber,
bukan dengan membatalkan §2a spec itu. Lihat §5.

---

## Keadaan Sekarang

### Tab Estimated merender, berurutan

| # | Komponen | Sumber data | Cakupan |
|---|---|---|---|
| 1 | `PnlFormulaPanel` | — | statis |
| 2 | `PnlKpiCards` | `usePnlSummary(filter)` | seluruh periode |
| 3 | `PnlDailyMarginChart` | `usePnlDailyMargin(filter)` | seluruh periode |
| 4 | `PnlBreakdownPanel` | 7 endpoint `breakdown/*` | seluruh periode, hanya saat satu KPI card diklik |
| 5 | `PnlAwbDrilldown` | `usePnlAwbDrilldown(filter, page, route)` | **dipersempit `route`** |
| 6 | `PnlDataQuality` | global | tidak terikat periode sama sekali |

Baris filter (`Rute`, `Dari`, `Sampai`, chip Vendor, `Reset`) dirender di dalam komponen nomor 5.
State-nya sendiri sudah diangkat ke `PnlPageContent` sebagai `drilldownRoute: PnlRouteFilter`.

### Tab Daily Report

Punya dropdown `Rute` multi-pilih yang menyaring **di client** lewat `selectMatrixColumns` — murni
proyeksi kolom, tidak ada request. Daftar rutenya dari `GET /pnl/routes` (master `air_shipments_data`),
dilabeli `displayRouteLabel` (`CGK → Denpasar`).

---

## 1. Memindahkan Baris Filter ke Atas

### 1a. Komponen baru

Baris filter menjadi komponennya sendiri:

```
apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.tsx
```

Props:

```ts
interface PnlEstimateFilterBarProps {
  filter: PnlFilter               // periode aktif — untuk batas min/max tanggal
  scope: PnlRouteFilter           // routes / dateFrom / dateTo / vendors
  onScopeChange: (next: PnlRouteFilter) => void
  groupId: string | undefined     // Route Group terpilih (§2)
  onGroupChange: (next: string | undefined) => void
}
```

`PnlAwbDrilldown` kehilangan seluruh blok `<div className="flex flex-wrap items-end gap-3 border-b …">`
beserta `setRoutes`, `setDate`, `removeVendor`, `hasRoute`, `bounds`, `routeIndex`, dan hook
`usePnlStations()`. Ia menyusut menjadi murni tabel + paging, dan prop-nya menjadi `route` saja
(tanpa `onRouteChange`).

### 1b. Posisi

```
PnlFormulaPanel
PnlEstimateFilterBar     ← baru
PnlKpiCards
PnlDailyMarginChart
PnlBreakdownPanel
PnlAwbDrilldown
PnlDataQuality
```

Filter dirender **tanpa syarat** — sebelum cabang loading/error apa pun — dengan alasan yang sama
seperti di `PnlDailyMatrixView`: filter yang terlalu sempit tidak boleh menyembunyikan kontrol yang
membatalkannya.

### 1c. Daftar rute dan labelnya tidak berubah

Tetap `usePnlStations()` (pasangan yang benar-benar ada di `v_pnl_to`) dengan `dropdownRouteLabel`
(`Jabo → Denpasar`, nama stasiun mentah) — **bukan** `usePnlRoutes()` + `displayRouteLabel` seperti
Daily Report.

Alasannya sama dengan yang tertulis di `routeLabels.ts`: tab Estimated tidak punya header matrix
berkode bandara untuk disepakati, tetapi kolom `Origin`/`Destination` di tabel drilldown di bawahnya
menampilkan nilai stasiun mentah. Dropdown harus berbicara bahasa tabel yang ia saring.

### 1d. Catatan overhang ikut pindah

Catatan kuning *"N AWB di halaman ini punya TO di luar filter…"* hari ini dirender di header
drilldown karena filternya ada di sana. Catatan itu **tetap di drilldown** — ia menghitung baris di
halaman yang sedang tampil, jadi tempatnya memang di situ. Yang bertambah adalah catatan baru di
filter bar tentang perbedaan cakupan KPI vs drilldown (§3d).

---

## 2. Filter Route Group

### 2a. Bentuk kontrol

Satu `<select>` bernama **Route Group** dengan placeholder `Route group…`, persis seperti
`AnalyticsScopePicker`. Single-select, bukan checkbox seperti tab Route Comparison — Route Comparison
memilih *kolom perbandingan* (banyak, berurutan), sedangkan ini memilih *scope* (satu).

Kontrol ini muncul di **dua tempat** dengan perilaku identik:

- `PnlEstimateFilterBar` (tab Estimated)
- `PnlDailyMatrixView` (tab Daily Report), di samping dropdown `Rute` yang sudah ada

Karena dipakai dua kali, ia diekstrak menjadi komponen bersama:

```
apps/frontend/src/components/shared/route-group-select.tsx
```

```ts
interface RouteGroupSelectProps {
  value: string | undefined
  onChange: (id: string | undefined) => void
}
```

Komponen ini sendiri yang memanggil `useRouteGroups({ enabled: canReadGroups })` dan
menyembunyikan dirinya saat permission tidak ada.

### 2b. Permission

`GET /route-groups` dijaga `Permission.READ_ROUTE_GROUP`. User yang boleh melihat tab Estimated /
Daily Report belum tentu boleh melihat Route Group.

Polanya sudah ada di `AnalyticsScopePicker` dan diikuti persis:

```ts
const canReadGroups = hasPermission('read.route_group')
const { data: groups } = useRouteGroups({ enabled: canReadGroups })
```

`enabled: false` berarti **request tidak dikirim sama sekali** — bukan sekadar hasilnya
disembunyikan — sehingga tidak ada 403 yang pernah sampai ke user. Saat `canReadGroups` false,
`<select>` tidak dirender dan seluruh fitur ini tidak ada bagi user itu.

### 2c. Group digabung (union) dengan rute eksplisit, bukan saling meniadakan

Ini keputusan desain yang paling mudah salah, jadi ditulis eksplisit.

`AnalyticsScope` memakai union bertanda: `{ kind: 'all' | 'group' | 'routes' }` — ketiganya saling
meniadakan. Untuk **picker scope** itu benar. Untuk **baris filter** itu mengejutkan: user mencentang
satu group lalu centang rutenya hilang tanpa penjelasan.

Karena itu di sini keduanya **digabung**:

```
rute efektif = union(scope.routes ?? [], routes milik group terpilih)
```

Konsekuensi yang harus dijinakkan: dropdown `Rute` hanya mencentang rute **eksplisit**, sehingga
rute yang tersaring bisa lebih banyak daripada yang tercentang — sebuah kontrol yang berbohong.
Obatnya bukan state gymnastics (mencentang otomatis lalu bingung saat user melepas satu centang),
melainkan **satu kalimat** di bawah baris filter:

> Filter aktif: **Group Jabo Timur** (6 rute) + **2 rute dipilih** → **8 rute**

Kalimat itu hanya muncul saat group terpilih. Saat hanya rute eksplisit yang dipakai, dropdown sudah
jujur dengan sendirinya dan kalimat itu tidak dirender.

Rute yang muncul di kedua sisi union hanya dihitung sekali (dedup pada `origin|dest`).

### 2d. Resolusi di client, bukan param backend baru

Group **tidak** dikirim ke server sebagai `groupId`. Ia di-resolve di client menjadi daftar
`PnlRoutePair`, lalu masuk ke param `routes` yang sudah ada.

Alasan:

- `useRouteGroups()` sudah dimuat di halaman ini untuk tab lain; keanggotaan group kecil (UI-nya
  sendiri menampilkan "N rute") dan sudah ada di memori.
- Param `routes` beserta parser-nya (`parseRoutePairs`) sudah ada, sudah teruji, dan sudah dipakai
  drilldown. Menambah `groupId` berarti parser baru, query `route_groups` baru di service, dan
  penanganan "group dihapus di tengah jalan" baru — di **empat** endpoint.
- Di tab Daily Report penyaringan memang murni client-side (`selectMatrixColumns`); memaksa group
  lewat server justru akan memasukkan round-trip ke tab yang hari ini tidak punya satu pun.

Yang dikorbankan: filter tidak mengikuti perubahan keanggotaan group secara live dalam satu sesi
(harus ganti pilihan untuk memuat ulang). Untuk sebuah filter, itu harga yang wajar.

### 2e. Group yang hilang

`picks` di tab Route Comparison punya effect yang memangkas group terhapus. Di sini tidak perlu:
`groupId` yang tidak ada di `groups` cukup menghasilkan daftar rute kosong, sehingga union-nya jatuh
kembali ke rute eksplisit. `<select>` yang `value`-nya tidak cocok dengan satu pun `<option>` akan
menampilkan placeholder — yang justru jawaban yang benar.

**Penting**, dan ini sebab langsung effect di Route Comparison sengaja dijaga `if (!groups) return`:
`useRouteGroups` tanpa `initialData` akan `undefined` selama loading dan setelah `gcTime` 5 menit.
Karena itu di sini pun **tidak boleh** ada effect yang menghapus `groupId` saat `groups` undefined.
Pilihan user harus bertahan; yang boleh kosong hanyalah daftar rute hasil resolusi.

---

## 3. KPI Cards, Chart, dan Breakdown Mengikuti Filter

### 3a. Endpoint yang bertambah param

| Endpoint | Hari ini | Menjadi |
|---|---|---|
| `GET /pnl/summary` | periode saja | + `routes`, `dateFrom`, `dateTo`, `vendor` (berulang) |
| `GET /pnl/daily-margin` | periode saja | + idem |
| `GET /pnl/breakdown/revenue-by-route` | periode saja | + idem |
| `GET /pnl/breakdown/profit-by-route` | periode saja | + idem |
| `GET /pnl/breakdown/cost-totals` | periode saja | + idem |
| `GET /pnl/breakdown/cost-by-vendor` | periode saja | + idem |
| `GET /pnl/breakdown/cost-by-ra` | periode saja | + idem |
| `GET /pnl/breakdown/cost-by-sg-out` | periode saja | + idem |
| `GET /pnl/breakdown/cost-by-sg-in` | periode saja | + idem |

Parsing memakai `parseRoutePairs` dan `parseVendorNames` yang sudah ada — tidak ada parser baru.
Seluruh param opsional; tanpa satupun, bentuk query persis seperti sekarang.

Karena sembilan handler mengulang blok param yang sama, ekstraksi kecil di controller:

```ts
// pnl-scope.util.ts
export interface PnlScopeQuery { routes?: string; dateFrom?: string; dateTo?: string;
                                 vendor?: string | string[] | Record<string, unknown> }
export function parseScope(q: PnlScopeQuery): PnlRouteFilter
```

### 3b. Semantik: TO-level, bukan AWB-level

**Ini perbedaan terpenting dalam spec ini.**

Drilldown menyaring pada **AWB**: filter menentukan AWB mana yang *terdaftar*, lalu agregatnya
menjumlahkan **seluruh TO milik AWB itu**, termasuk yang di luar filter. Itu disengaja dan wajib —
kolom cost-nya `MAX(cost_*_awb)`, yaitu biaya seluruh AWB; membuang sebagian TO akan menagihkan
biaya penuh AWB ke sebagian revenue-nya dan **menciptakan rugi yang tidak ada**.

KPI, chart, dan breakdown **tidak** boleh memakai semantik itu. Alasannya justru kebalikannya:

- `getSummary` menjumlahkan `SUM(cost_to)`, dan `cost_to` **sudah** ber-grain TO
  (`cost_total_awb * weight_share + cost_sg_in_to`).
- `getDailyMargin` idem.

Karena biayanya sudah diprorata per TO, membuang baris TO justru **benar** secara aritmetika: sisa
baris membawa `weight_share`-nya masing-masing. Inilah semantik yang sama persis dengan Daily Report
matrix dan Route Comparison, sehingga angka-angka antar tab tetap bisa direkonsiliasi.

Implementasinya: tiga klausa `AND` langsung pada `WHERE`, bukan `EXISTS`.

```sql
AND (origin_station, dest_station) IN (SELECT * FROM UNNEST($n::text[], $m::text[]))
AND <dateCol> >= $k::DATE
AND <dateCol> <  ($l::DATE + INTERVAL '1 day')
AND vendor = ANY($v::text[])
```

Dua array paralel di-`UNNEST` — pasangan harus tetap pasangan; satu daftar datar akan mencocokkan
origin mana pun dengan destination mana pun. Pola ini sudah dipakai di `getAwbDrilldown` dan
`getRouteComparison`.

### 3c. Tiga endpoint cost harus ditulis ulang ke `costSplitSql`

`getCostTotals`, `getCostByVendor`, `getCostByRa`, `getCostBySgOut` memakai pola
`MAX(cost_*_awb)` per AWB lalu dijumlahkan. Pola itu **runtuh di bawah filter TO-level**: AWB yang
hanya sebagian TO-nya cocok tetap menyumbang biaya penuh, sehingga card `Est. Cost` dan
breakdown-nya akan berselisih.

Perbaikannya memakai aturan yang sudah ada dan sudah ditunjuk sebagai sumber kebenaran —
`costSplitSql()`: tiga komponen AWB diprorata `weight_share`, SG In diambil apa adanya (sudah
membawa share di dalam definisi view), dan setiap komponen di-`FILTER (WHERE cost_to IS NOT NULL)`.

`getCostTotals` memakai helper itu utuh — bentuk keluarannya (`smu`/`ra`/`sg_out`/`sg_in`) sudah
persis `PnlCostTotals`, sehingga CTE `per_awb` + `sg_in`-nya lenyap menjadi satu agregat datar.

Tiga query lain (`getCostByVendor`, `getCostByRa`, `getCostBySgOut`) mengelompokkan per vendor/nama,
jadi mereka tidak bisa memanggil helper itu apa adanya — masing-masing memakai **satu** ekspresi
komponen dengan aturan yang sama (`SUM(cost_X_awb * weight_share) FILTER (WHERE cost_to IS NOT NULL)`)
di atas join yang sudah ada, dan CTE `per_awb`-nya hilang.

`getCostBySgIn` tidak berubah: ia sudah `SUM(cost_sg_in_to)` yang ber-grain TO. Yang ditambahkan
hanya klausa scope.

**Efek samping yang disengaja pada layar tanpa filter.** Hari ini `MAX(cost_smu_awb)` ikut terhitung
pada AWB yang `cost_ra_awb`-nya NULL, padahal `SUM(cost_to)` melewatkan AWB itu seluruhnya (karena
`cost_total_awb` NULL bila salah satu komponen NULL). Jadi `cost-totals` dan card `Est. Cost` **sudah
berselisih hari ini** pada periode yang punya AWB setengah-berbiaya. Penulisan ulang ini
menutup selisih itu. Angka `Est. Cost` sendiri tidak bergerak; yang bergerak adalah rincian di
bawahnya, turun menjadi sama dengan card-nya.

Bila selisih itu ternyata dipakai orang sebagai sinyal, tempatnya adalah panel Data Quality, bukan
dua angka yang diam-diam tidak sama.

Ketiganya juga memakai `MAX(sum_gw_per_awb)` sebagai berat; di bawah filter itu menjadi berat
**seluruh** AWB. Diganti `SUM(gross_weight)` atas baris yang tersaring — kolom Total Weight di
breakdown karena itu ikut turun pada periode ber-AWB-terpotong, sama seperti kolom biayanya.

### 3d. Yang hilang, dan catatannya

Sebelum perubahan ini, KPI/chart/breakdown adalah **superset** yang stabil, dan drilldown terbaca
sebagai irisan di dalamnya. Setelah perubahan ini keduanya bergerak bersama — tetapi dengan
**semantik yang berbeda** (§3b), sehingga:

> Total Revenue di drilldown ≥ Est. Revenue di card, bila ada AWB yang sebagian TO-nya di luar filter.

Ini bukan bug dan tidak bisa dihilangkan tanpa merusak salah satu sisi. Karena itu filter bar
merender catatan berikut — **hanya** saat filter rute atau tanggal aktif:

> Kartu dan chart menghitung per-TO di dalam filter. Tabel AWB di bawah menjumlahkan **seluruh TO**
> milik AWB yang cocok, karena biaya SMU/RA/SG Out melekat pada AWB, bukan pada TO. Kedua angka
> memang tidak akan sama bila ada AWB yang sebagian TO-nya di luar filter.

Catatan overhang yang sudah ada di drilldown (`N AWB di halaman ini punya TO di luar filter…`) tetap
di tempatnya — ia menghitung baris di halaman yang sedang tampil, dan sekarang menjadi bukti konkret
dari kalimat di atas.

### 3e. Klik cell dari tab lain kini menyetel seluruh scope

`applyDrilldownRoute` dipanggil dari Daily Report, Route Comparison, dan Vendor Comparison. Ia
mengganti filter secara utuh lalu pindah ke tab Estimated.

Setelah perubahan ini, satu klik cell **menyempitkan KPI cards, chart, breakdown, dan drilldown
sekaligus**. Itu peningkatan yang nyata, dan sekaligus perubahan perilaku yang besar. Handler-nya
juga harus mengosongkan `groupId` — ia mengganti scope, bukan menambahinya:

```ts
function applyDrilldownRoute(route: PnlRouteFilter) {
  setEstimateScope(route)
  setEstimateGroupId(undefined)
  setView('estimate')
  requestAnimationFrame(() => filterBarRef.current?.scrollIntoView({ behavior: 'smooth' }))
}
```

Target scroll pindah dari drilldown ke **filter bar**, karena yang harus dilihat user setelah klik
adalah "scope-nya berubah menjadi ini", bukan hanya tabel di paling bawah.

### 3f. Reset saat periode berubah — menyempit, bukan menghapus semua

Hari ini:

```ts
useEffect(() => { setDrilldownRoute({}) }, [dateBasis, mode, cycle, startDate, endDate])
```

Seluruh filter dibuang setiap periode berganti. Alasan yang tertulis hanya menyangkut **tanggal**:
tanggal di dalam periode lama akan mengosongkan tabel tanpa sebab yang terlihat.

Rute, group, dan vendor tidak membawa tanggal — sama seperti `routePicks`, `dailyRoutes`, dan
`vendorPicks` yang memang sengaja **tidak** ikut di-reset. Jadi effect-nya dipersempit:

```ts
// Hanya tanggal yang membawa periode. Rute/group/vendor tidak, sama seperti picks di tab lain.
useEffect(() => {
  setEstimateScope((prev) => ({ ...prev, dateFrom: undefined, dateTo: undefined }))
}, [dateBasis, mode, cycle, startDate, endDate])
```

`setEstimateScope` karena itu harus menerima updater function.

### 3g. Cache key

`usePnlSummary`, `usePnlDailyMargin`, dan kelima hook breakdown menerima parameter `scope` baru yang
**masuk ke `queryKey`**, persis seperti `route` sudah masuk ke key `usePnlAwbDrilldown`. Tanpa itu
mengubah filter tidak memicu refetch.

`routeToParams` yang sudah ada dipakai kembali apa adanya, beserta
`paramsSerializer: { indexes: null }` — tanpa itu axios menulis `vendor[]=…`, yang di-parse `qs`
menjadi key bernama `'vendor[]'` yang tidak dibaca handler mana pun, dan filter menghilang tanpa
error di mana pun.

### 3h. Yang tidak ikut filter

`PnlDataQuality` tetap global. Ia tidak terikat periode pun hari ini, dan panel itu adalah worklist
perbaikan sumber data — bukan laporan periode.

---

## 4. Filter Route Group di Daily Report

Perubahan paling kecil dalam spec ini karena seluruh mesinnya sudah ada.

`PnlDailyMatrixView` merender `<RouteGroupSelect>` di samping dropdown `Rute`, lalu:

```ts
const effectiveRoutes = unionRoutes(picks, groupRoutePairs)
const shown = selectMatrixColumns(data, effectiveRoutes)
```

`selectMatrixColumns` tidak berubah sedikit pun. Aturan tepinya tetap berlaku, termasuk yang paling
berguna di sini: **rute anggota group yang tidak punya kolom tetap dirender sebagai kolom em-dash.**
Group dibentuk dari master `air_shipments_data`, yang memang menawarkan lebih banyak pasangan
daripada yang pernah terbang — jadi group berisi 6 rute akan selalu menghasilkan 6 kolom, dan
kolom kosong terbaca sebagai jawaban ("tidak ada yang terbang lewat sini"), bukan sebagai filter yang
gagal.

`unionRoutes` adalah fungsi murni kecil di `dailyMatrix.ts` (dedup pada `origin|dest`, urutan:
rute eksplisit dulu, lalu anggota group yang belum ada). Dipakai kedua tab.

State `groupId` diangkat ke `PnlPageContent` sejajar `dailyRoutes` — tab dirender lewat ternary,
jadi meninggalkan tab akan meng-unmount view dan membuang pilihannya. Tab Estimated dan tab Daily
Report memegang `groupId`-nya **masing-masing**; keduanya scope yang berbeda dan tidak saling ikut.

Kalimat "Filter aktif: …" dari §2c dirender di sini juga, dengan bentuk yang sama.

---

## 5. Cell Kuning di Tabel Revenue

### 5a. Sebab cell tidak kuning

Bukan karena §2a spec 2026-08-27 salah. Aturan itu benar dan dipertahankan:

| Sinyal | Tabel Revenue | Tabel Margin |
|---|---|---|
| revenue benar-benar bolong | mewarnai | mewarnai |
| sebab cost | diabaikan | mewarnai |
| `incompleteTos` | diabaikan | mewarnai |

Yang salah adalah **sinyalnya**. Satu-satunya sinyal yang tersedia adalah `v_pnl_to.issue`, dan itu
adalah **rantai prioritas**, bukan daftar:

```sql
CASE WHEN cost_basis IS NULL AND vendor IS NULL THEN 'no_booking'
     WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'
     WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'
     WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'
     WHEN revenue_total   IS NULL THEN 'revenue_missing'   -- ← baru sampai sini
     ...
```

`'revenue_missing'` baru muncul bila vendor dan **ketiga** komponen biaya AWB sudah ada. TO yang
revenue-nya NULL **dan** AWB-nya belum ter-booking akan berlabel `'no_booking'` — sebuah sebab
**cost** — sehingga tabel Revenue membuangnya dan cell-nya tampil bersih padahal revenue-nya bolong.

Dan ini justru kasus yang umum: `revenue_total = revenue_freight_gross + packing_kayu`, dan
`revenue_freight_gross = gross_weight × rate_spx` dari master. NULL-nya berarti pasangan DC tidak
ada di `air_shipments_data` atau `rate_spx`-nya kosong — persis kondisi yang juga membuat fallback
biaya tidak jalan. Kedua kegagalan itu berasal dari **satu** baris master yang hilang, jadi mereka
nyaris selalu muncul bersamaan, dan rantai prioritas selalu memenangkan sebab cost.

Spec 2026-08-27 §2d sudah menamai obatnya. Spec ini mengeksekusinya.

### 5b. Agregat langsung, bukan lewat rantai issue

`getDailyMatrix` menambah satu agregat pada query fact-nya:

```sql
COUNT(*) FILTER (WHERE revenue_total IS NULL)::int AS revenue_missing_tos
```

Sejajar persis dengan `incomplete_tos` yang sudah ada untuk cost. Ia predikat langsung: tidak
melewati rantai issue, jadi tidak bisa dikalahkan oleh sebab yang peringkatnya lebih tinggi.

Footer per kolom menjumlahkannya di TypeScript, di loop akumulasi yang sudah ada — sama seperti
`incompleteTos`.

### 5c. Bentuk di frontend

`CellWarning` bertambah satu field:

```ts
export interface CellWarning {
  issues: PnlCellIssue[]
  incompleteTos: number      // sebab cost: TO tanpa biaya sama sekali
  revenueMissingTos: number  // sebab revenue: TO tanpa revenue_total
}
```

Penyesuaian yang mengikuti:

| Fungsi | Perubahan |
|---|---|
| `hasWarning` | ikut menghitung `revenueMissingTos > 0` |
| `warningTooltip` | menambah `"N TO tanpa revenue"` |
| `revenueWarning` | **mempertahankan** `revenueMissingTos`, tetap memaksa `incompleteTos: 0` dan tetap menyaring `issues` ke `REVENUE_ISSUES` |
| `CLEAN` / `EMPTY_FOOTER` | `revenueMissingTos: 0` |

`revenue_missing_tos` dibaca dengan `?? 0`, mengikuti pola `issues ?? []` yang sudah ada: pipeline
deploy menaikkan backend dan frontend paralel, sehingga frontend baru bisa sejenak memanggil backend
lama yang belum mengirim field ini.

Tabel **Margin** ikut mendapat manfaatnya tanpa perubahan apa pun: ia memakai `CellWarning` utuh, dan
`revenue_total` yang NULL memang membuat `gross_profit_to` NULL sehingga `SUM` melewatkannya — cell
margin-nya understated dan pantas kuning.

### 5d. Satu arti kuning di seluruh P&L

`cellWarning.ts` menyatakan dirinya *"one definition for the daily matrix and the route comparison,
so 'yellow' cannot come to mean two different things."*

Menambah field yang hanya diisi salah satu sumber akan membatalkan janji itu dalam diam. Karena itu
`getRouteComparison` dan `getVendorComparison` mendapat agregat yang sama pada query fact dan footer
masing-masing — satu baris SQL dan satu akumulator per query.

Kalau lingkup harus dipersempit, **ini** bagian yang dipotong (bukan §5b), dengan konsekuensi yang
harus ditulis di `cellWarning.ts`: kuning di Daily Report lebih peka daripada kuning di kedua tab
perbandingan.

---

## Berkas yang Tersentuh

### Backend

| Berkas | Perubahan |
|---|---|
| `pnl.controller.ts` | 9 handler menerima `routes`/`dateFrom`/`dateTo`/`vendor` lewat `parseScope` |
| `pnl-scope.util.ts` | **baru** — satu tempat merakit `PnlRouteFilter` dari query |
| `pnl.service.ts` | `getSummary`, `getDailyMargin`, 7 `getCost*`/`get*ByRoute` menerima `scope`; `getDailyMatrix`/`getRouteComparison`/`getVendorComparison` menambah `revenue_missing_tos`; 4 query cost ditulis ulang ke `costSplitSql` |

Semua narrowing lewat satu helper privat `scopeSql(scope, dateCol, startParamIndex)` yang
mengembalikan `{ sql, params }` — sembilan query tidak boleh masing-masing menyusun `UNNEST` sendiri.

### Frontend

| Berkas | Perubahan |
|---|---|
| `components/shared/route-group-select.tsx` | **baru** |
| `features/pnl/components/PnlEstimateFilterBar.tsx` | **baru** |
| `features/pnl/components/PnlAwbDrilldown.tsx` | baris filter dihapus; prop `onRouteChange` hilang |
| `features/pnl/components/PnlAwbDrilldown.spec.tsx` | blok `filter section`, `route filter`, `vendor filter` pindah ke spec filter bar |
| `features/pnl/components/PnlDailyMatrixView.tsx` | `<RouteGroupSelect>` + `unionRoutes` |
| `features/pnl/hooks/usePnl.ts` | 7 hook menerima `scope`, masuk `queryKey`, pakai `routeToParams` |
| `features/pnl/utils/cellWarning.ts` | field `revenueMissingTos` |
| `features/pnl/utils/dailyMatrix.ts` | `unionRoutes`; `CLEAN`/`EMPTY_FOOTER` |
| `features/pnl/utils/routeComparison.ts` | meneruskan `revenueMissingTos` |
| `features/pnl/utils/vendorComparison.ts` | idem |
| `app/(dashboard)/pnl/page.tsx` | rename state, dua `groupId`, effect reset dipersempit, urutan render |

---

## Pengujian

| Unit | Yang dipastikan |
|---|---|
| `scopeSql` | dua array paralel di-`UNNEST` sebagai pasangan; scope kosong menghasilkan SQL kosong; indeks param tidak bertabrakan dengan param periode |
| `parseScope` | field kosong tidak dikirim; `vendor` tunggal, array, dan objek ber-index (arrayLimit qs) sama-sama terbaca |
| `PnlService.getSummary` | filter rute menyempitkan per-TO; `totalCost` = `SUM(cost_to)` atas baris tersaring; tanpa scope, SQL identik dengan hari ini |
| `PnlService.getCostTotals` | hasil = `SUM(cost_to)` dari `getSummary` pada periode yang sama, dengan dan tanpa filter (invarian §3c) |
| `PnlService.getDailyMatrix` | `revenue_missing_tos` terhitung per cell dan terjumlah di footer; TO revenue-NULL yang ber-issue `no_booking` tetap terhitung |
| `revenueWarning` | `revenueMissingTos` lolos; `incompleteTos` tetap nol; cell yang hanya bermasalah cost tetap bersih |
| `hasWarning` / `warningTooltip` | `revenueMissingTos` saja sudah memicu warning; tooltip menyebut TO tanpa revenue dan tidak menyebut cost di tabel Revenue |
| `unionRoutes` | dedup; group kosong = rute eksplisit; rute eksplisit kosong = anggota group; urutan stabil |
| `RouteGroupSelect` | tanpa `read.route_group` tidak merender apa pun **dan** tidak mengirim request |
| `PnlEstimateFilterBar` | mengubah rute/tanggal/group memanggil `onScopeChange`/`onGroupChange`; Reset mengosongkan keempatnya; tanggal terbatas pada `periodBounds`; catatan §3d muncul hanya saat filter aktif |
| `PnlDailyMatrixView` | memilih group menyaring kolom; rute anggota group tanpa data menjadi kolom em-dash; union dengan centang manual |
| `page.tsx` | klik cell dari tiga tab menyetel scope **dan** mengosongkan `groupId`; ganti periode menghapus tanggal saja; rute/group bertahan; filter bar berada di atas KPI cards |

E2E tidak ditambah. Satu-satunya perilaku yang tidak tertutup unit test adalah scroll-into-view,
yang sudah tidak diuji hari ini.

---

## Pertanyaan Terbuka

Enam keputusan yang saya ambil sendiri agar spec ini utuh. Semuanya bisa dibalik.

1. **§3c — menulis ulang 4 query cost ke `costSplitSql`.** Ini memperbaiki selisih yang sudah ada
   hari ini antara card `Est. Cost` dan rincian breakdown-nya. Rincian breakdown akan **turun** pada
   periode yang punya AWB setengah-berbiaya. Apakah perubahan angka pada layar tanpa filter itu
   diterima, atau breakdown sebaiknya tidak ikut filter sama sekali (dan diberi label "seluruh
   periode")?

2. **§3b/§3d — KPI per-TO vs drilldown per-AWB.** Saya memilih mempertahankan perbedaannya dan
   menjelaskannya lewat catatan, karena menyamakannya berarti merusak salah satu sisi. Apakah
   catatan itu cukup, atau Anda ingin drilldown juga per-TO (dengan risiko rugi palsu yang
   disebut §3b)?

3. **§2c — union vs saling meniadakan.** Group + rute eksplisit digabung, dijelaskan satu kalimat.
   Alternatifnya mengikuti `AnalyticsScopePicker`: memilih group mengosongkan centang rute.

4. **§2a — single-select vs multi-select group.** Saya pilih single, mengikuti Analytics.
   Route Comparison memakai checkbox multi.

5. **§3f — reset saat ganti periode.** Saya persempit menjadi "hanya tanggal yang dibuang".
   Hari ini semuanya dibuang.

6. **§5d — apakah `revenue_missing_tos` ikut ke Route Comparison & Vendor Comparison.** Saya
   memilih ikut, demi satu arti kuning. Ini bagian yang paling mudah dipotong bila ingin rilis
   lebih kecil.
