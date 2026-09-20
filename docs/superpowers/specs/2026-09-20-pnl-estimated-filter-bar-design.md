# PnL — Filter Bar di Tab Estimated, Filter Route Group, & Cell Kuning Revenue

**Tanggal:** 2026-09-20
**Area:** `apps/backend/src/modules/pnl`, `apps/frontend/src/features/pnl`
**Branch usulan:** `feature/pnl-estimated-filter-bar` dari `development`
**Revisi 1 (2026-09-20):** keenam pertanyaan terbuka sudah dijawab. Tiga di antaranya mengubah
desain secara substansial — lihat §3b (drilldown ikut per-TO), §2c (rute anggota group tidak bisa
dipilih dua kali), dan §3h (breakdown ikut filter). Jejak jawabannya ada di §Keputusan.

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

### 1d. Dua catatan kuning di drilldown dihapus, tidak dipindah

Header drilldown hari ini membawa dua catatan yang keduanya menjelaskan selisih akibat semantik
AWB-level. §3b menghapus sebabnya, sehingga keduanya ikut hilang — bukan pindah ke filter bar:

| Catatan | Sebab hilangnya |
|---|---|
| *"N AWB di halaman ini punya TO di luar filter…"* | tidak ada lagi TO di luar filter yang ikut terjumlah |
| `vendor-scope-note` (*"…sedangkan sel Vendor Comparison memakai prorata weight_share…"*) | drilldown kini memakai prorata yang sama |

`overhangCount` dan seluruh perhitungannya ikut dihapus. `VariesMark` **tetap** — lihat tabel di §3b.

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

### 2c. Group dan rute dipilih berbarengan; rute anggota group tidak bisa dipilih dua kali

`AnalyticsScope` memakai union bertanda: `{ kind: 'all' | 'group' | 'routes' }` — ketiganya saling
meniadakan. Untuk **picker scope** itu benar. Untuk **baris filter** itu mengejutkan: user memilih
satu group lalu centang rutenya hilang tanpa penjelasan.

Karena itu keduanya aktif berbarengan:

```
rute efektif = rute eksplisit ∪ rute anggota group terpilih
```

**Dan dropdown `Rute` tidak menawarkan rute yang sudah masuk group terpilih.** Ini yang mencegah
kontrolnya berbohong. Tanpa aturan itu, sebuah rute bisa "tercentang" sekaligus "anggota group",
dan melepas centangnya tidak mengubah apa pun — rutenya tetap tersaring lewat group. Kontrol yang
tidak bereaksi jauh lebih buruk daripada pilihan yang hilang.

Bentuknya: rute anggota group **dihapus dari daftar** `MultiRouteFilter`, bukan ditampilkan
tercentang-dan-disabled. `MultiRouteFilter` tidak punya konsep item disabled, dan menambahkannya
demi satu pemakai akan menyentuh SLA page, Analytics, dan Route Comparison sekaligus. Menyaring
`routes` yang dioper ke sana tidak menyentuh komponennya sama sekali.

Yang hilang dari daftar tetap terlihat, lewat satu baris ringkasan di bawah filter:

> Filter aktif: **Group Jabo Timur** (6 rute) + **2 rute dipilih** → **8 rute**

Baris itu hanya dirender saat group terpilih; tanpa group, dropdown sudah jujur dengan sendirinya.

**Aturan tepi — rute yang sudah tercentang lalu group-nya dipilih.** Rute itu hilang dari daftar
tetapi **tetap tersimpan** di `scope.routes`. Ia tidak dihapus, karena mengganti group berikutnya
harus mengembalikannya ke daftar dalam keadaan tercentang — membuangnya berarti pilihan user lenyap
diam-diam. Konsekuensinya `unionRoutes` harus melakukan dedup (§4), dan hitungan di baris ringkasan
menghitung rute unik, bukan menjumlahkan kedua sisi.

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
| `GET /pnl/awb-drilldown` | **sudah** menerima keempatnya | semantiknya berubah (§3b), paramnya tidak |

Delapan endpoint pertama bertambah param; yang kesembilan sudah punya dan hanya berubah arti. Itu
sebabnya `scopeSql` melayani sembilan query, bukan delapan.

Parsing memakai `parseRoutePairs` dan `parseVendorNames` yang sudah ada — tidak ada parser baru.
Seluruh param opsional; tanpa satupun, bentuk query persis seperti sekarang (kecuali drilldown,
yang kolom cost-nya berubah dengan atau tanpa filter — §3b-bis).

Karena sembilan handler mengulang blok param yang sama, ekstraksi kecil di controller:

```ts
// pnl-scope.util.ts
export interface PnlScopeQuery { routes?: string; dateFrom?: string; dateTo?: string;
                                 vendor?: string | string[] | Record<string, unknown> }
export function parseScope(q: PnlScopeQuery): PnlRouteFilter
```

### 3b. Semantik TO-level di mana-mana — termasuk AWB Drilldown

**Ini perubahan terpenting dalam revisi ini.**

Rancangan awal mempertahankan drilldown pada semantik AWB (filter memilih AWB, agregat menjumlahkan
seluruh TO-nya) dan menjelaskan selisihnya lewat catatan. Itu ditolak, dengan alasan yang benar:
drilldown pun dihitung dari TO. Pemeriksaan ulang membenarkannya, dan menemukan sesuatu yang lebih
buruk daripada sekadar selisih antar-panel.

**Baris drilldown hari ini bercampur grain.** Dalam satu baris `SELECT` yang sama:

| Kolom | SQL | Grain |
|---|---|---|
| `totalRevenue` | `SUM(revenue_total) - SUM(revenue_discount)` | **TO** (baris tersaring) |
| `sumGw` | `SUM(gross_weight)` | **TO** |
| `grossProfit` | `SUM(gross_profit_to)` | **TO** |
| `costSmu` | `MAX(cost_smu_awb)` | **AWB penuh** |
| `costRa` | `MAX(cost_ra_awb)` | **AWB penuh** |
| `costSgOut` | `MAX(cost_sg_out_awb)` | **AWB penuh** |
| `totalCost` | `MAX(cost_total_awb) + SUM(cost_sg_in_to)` | **campuran** |

Akibatnya, pada AWB multi-TO **Revenue − Total Cost ≠ GP di baris yang sama**, karena GP memakai
biaya yang sudah diprorata sedangkan kolom Cost menampilkan biaya AWB penuh. Ini berlaku hari ini,
tanpa filter apa pun — bukan sesuatu yang diperkenalkan fitur ini. Komentar `EXISTS`-nya menyebut
risiko "rugi palsu", dan memang benar: menyaring TO **tanpa** memprorata kolom cost akan menagihkan
biaya penuh AWB ke sebagian revenue-nya.

Obatnya bukan berhenti menyaring, melainkan memprorata kolom cost-nya — persis seperti yang sudah
dilakukan `getAwbTos` untuk sub-tabel TO (`cost_smu_awb * weight_share`), `getDailyMatrix`,
`getRouteComparison`, dan `getVendorComparison` lewat `costSplitSql`.

`getAwbDrilldown` karena itu berubah pada dua sisi:

**Pertama, kolom cost memakai `costSplitSql('v')`:**

```sql
-- sebelum                                   -- sesudah
MAX(cost_smu_awb)      AS cost_smu           SUM(cost_smu_awb * weight_share)
                                               FILTER (WHERE cost_to IS NOT NULL)   AS cost_smu
MAX(cost_ra_awb)       AS cost_ra            -- idem untuk ra dan sg_out
SUM(cost_sg_in_to)     AS cost_sg_in         SUM(COALESCE(cost_sg_in_to, 0))
                                               FILTER (WHERE cost_to IS NOT NULL)   AS cost_sg_in
```

`totalCost` menjadi `SUM(cost_to)`, satu ekspresi, bukan lagi `MAX(...) + SUM(...)`.

**Dan GP harus berhenti memakai `SUM(gross_profit_to)`.** Ditemukan saat menyusun implementation
plan: `gross_profit_to` bernilai NULL setiap kali `cost_to` NULL, sehingga `SUM`-nya **melewatkan**
TO yang belum berbiaya — padahal `total_revenue` menghitungnya. Pada AWB yang hanya sebagian TO-nya
berbiaya, Revenue − Cost karena itu tidak akan pernah sama dengan GP, betapapun rapinya kolom cost
diprorata.

`getSummary` sudah menyelesaikannya dengan cara lain: ia mendefinisikan gross profit sebagai
`totalRevenue − totalCost`, yaitu seluruh revenue dihadapkan pada biaya yang berhasil dihitung saja.
Drilldown memakai definisi yang sama, dihitung di TypeScript, atau barisnya tidak akan pernah
menjumlah ke card di atasnya.

Satu kolom tambahan menyertainya: `COUNT(*) FILTER (WHERE cost_to IS NOT NULL) AS costed_tos`.
`COALESCE(SUM(...), 0)` tidak pernah NULL, jadi AWB yang sama sekali tidak bisa dibiayai akan
menampilkan `0` yang terbaca pasti di sebelah revenue yang nyata. Hitungan itulah yang memisahkan
"tidak berbiaya di dalam filter" dari "tidak bisa dihitung" — `totalCost` dan `grossProfit` menjadi
NULL saat `costed_tos = 0`.

Dengan ketiganya, **Revenue − Cost = GP berlaku di setiap baris yang punya biaya**, dan baris
drilldown menjadi rekonsiliasi langsung dari cell yang diklik.

**Kedua, filter pindah dari `EXISTS` ke `WHERE` biasa.** Setelah kolom cost diprorata, `EXISTS`
justru yang salah: ia membiarkan TO di luar filter ikut terjumlah. Klausanya menjadi identik dengan
delapan endpoint lain (§3a), sehingga `scopeSql` melayani **sembilan** query dengan satu bentuk.

Satu nuansa yang ikut hilang: `vendorWhere` hari ini sengaja berada di predikat luar sementara
route/date di dalam `EXISTS`. Perbedaan itu hanya ada karena kedua grain-nya berbeda; begitu
semuanya TO-level, ketiganya masuk ke `WHERE` yang sama dan komentar panjang yang menjelaskan
perbedaan itu dihapus, bukan dipertahankan sebagai sejarah.

**Yang hilang bersamanya:**

| Hal | Nasib |
|---|---|
| `hasNullCost` (latar kuning baris) | `BOOL_OR(cost_to IS NULL)` — sebelumnya `MAX(cost_total_awb) IS NULL OR MAX(cost_sg_in_to) IS NULL`, yang memeriksa AWB, bukan baris yang tampil |
| `VariesMark` (`+` pada Origin/Dest/Date) | **tetap ada.** Filter rute boleh menyisakan beberapa origin (user memilih dua rute), jadi tanda "TO di baris ini tidak seragam" masih berarti |
| Catatan overhang (`N AWB … punya TO di luar filter`) | **dihapus.** Tidak ada lagi TO di luar filter yang ikut terjumlah — catatan itu menjadi salah |
| `vendor-scope-note` (Vendor Comparison vs drilldown) | **dihapus.** Selisih yang dijelaskannya justru yang diperbaiki di sini |
| Catatan §3d rancangan awal (KPI vs drilldown) | **tidak jadi dibuat.** Tidak ada selisih untuk dijelaskan |
| `ToSubTable` / `getAwbTos` | **tidak berubah.** Ia sudah prorata, dan sengaja menampilkan **seluruh** TO milik AWB yang diklik — membukanya adalah permintaan eksplisit untuk melihat isi AWB itu, bukan irisannya |

**Invarian baru yang bisa diuji**, menggantikan catatan yang tidak jadi ditulis:

> Pada periode dan filter yang sama, `SUM(totalRevenue)` dan `SUM(totalCost)` seluruh halaman
> drilldown = `totalRevenue` dan `totalCost` dari `/pnl/summary`.
>
> Dan pada setiap baris yang punya biaya: `totalRevenue − totalCost = grossProfit`.

Invarian ini tidak mungkin berlaku pada rancangan lama, dan itulah alasan terbaik untuk memilih
rancangan ini.

### 3b-bis. Efek pada layar tanpa filter

Perubahan kolom cost berlaku **juga tanpa filter**, karena ia memperbaiki grain, bukan menanggapi
filter. Pada AWB single-TO (`weight_share = 1`) tidak ada yang bergerak. Pada AWB multi-TO:

- kolom Cost SMU/RA/SG Out **turun** menjadi porsi milik baris yang tampil;
- kolom Total Cost turun seiring;
- kolom GP dan Margin **tidak bergerak** — keduanya memang sudah prorata;
- baris yang tadinya membaca "Revenue − Cost ≠ GP" menjadi konsisten.

Ini perbaikan yang berdiri sendiri. Kalau lingkup rilis harus dipotong, §3b bisa dikirim lebih dulu
tanpa satu pun bagian lain dari spec ini.

### 3c. Empat query cost harus ditulis ulang ke grain TO

`getCostTotals`, `getCostByVendor`, `getCostByRa`, `getCostBySgOut` memakai pola
`MAX(cost_*_awb)` per AWB lalu dijumlahkan — persis pola yang §3b cabut dari drilldown. Pola itu
**runtuh di bawah filter TO-level**: AWB yang hanya sebagian TO-nya cocok tetap menyumbang biaya
penuh, sehingga card `Est. Cost` dan breakdown-nya akan berselisih.

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

### 3d. Satu scope, satu grain, satu angka

Setelah §3b dan §3c, seluruh tab Estimated berbicara dalam grain yang sama. Tidak ada catatan
penjelas selisih yang perlu ditulis, karena tidak ada selisih:

| Panel | Revenue | Cost |
|---|---|---|
| `PnlKpiCards` | `SUM(revenue_total − revenue_discount)` | `SUM(cost_to)` |
| `PnlDailyMarginChart` | idem, per hari | idem, per hari |
| `PnlBreakdownPanel` | idem, per rute | `costSplitSql`, menjumlah ke `SUM(cost_to)` |
| `PnlAwbDrilldown` | idem, per AWB | `costSplitSql`, menjumlah ke `SUM(cost_to)` |

Semuanya atas himpunan baris `v_pnl_to` yang sama. Yang dulu butuh tiga catatan kuning sekarang
menjadi satu invarian yang diuji (§Pengujian).

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

`routeFromCell` dan `routeFromComparisonCell` tidak berubah: keduanya sudah menghasilkan
`PnlRouteFilter`, dan sekarang nilai itu menyetel sembilan panel alih-alih satu. Klik satu cell
Daily Report karena itu menghasilkan KPI cards yang angkanya **sama persis** dengan cell yang
diklik — hal yang tidak mungkin sebelum §3b.

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

`usePnlSummary`, `usePnlDailyMargin`, dan keenam hook breakdown menerima parameter `scope` baru yang
**masuk ke `queryKey`**, persis seperti `route` sudah masuk ke key `usePnlAwbDrilldown`. Tanpa itu
mengubah filter tidak memicu refetch.

`routeToParams` yang sudah ada dipakai kembali apa adanya, beserta
`paramsSerializer: { indexes: null }` — tanpa itu axios menulis `vendor[]=…`, yang di-parse `qs`
menjadi key bernama `'vendor[]'` yang tidak dibaca handler mana pun, dan filter menghilang tanpa
error di mana pun.

### 3h. Satu-satunya yang tidak ikut filter

`PnlDataQuality` tetap global, dan itu satu-satunya pengecualian.

Ia tidak terikat periode pun hari ini: panel itu adalah **worklist perbaikan sumber data**, bukan
laporan periode. Menyempitkannya ke filter akan menyembunyikan justru baris yang paling perlu
diperbaiki — sebuah TO yang `station_mapping_missing` tidak punya rute, sehingga filter rute apa pun
akan membuangnya, dan panel itu ada persis untuk menemukannya.

Endpoint `/pnl/data-quality` dan `/pnl/data-quality/summary` karena itu **tidak** menerima param
scope.

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

Dua fungsi murni kecil di `dailyMatrix.ts`, dipakai kedua tab:

```ts
// Rute efektif: eksplisit dulu, lalu anggota group yang belum ada. Dedup pada `origin|dest` —
// sebuah rute yang sudah tercentang sebelum group-nya dipilih ada di kedua sisi (§2c).
export function unionRoutes(picked: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[]

// Daftar yang ditawarkan dropdown: seluruh rute dikurangi anggota group terpilih (§2c).
export function offerableRoutes(all: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[]
```

`offerableRoutes` bekerja pada pasangan, bukan label, supaya kedua tab bisa memakainya walau
label dropdown-nya berbeda (§1c). Penyaringan label dilakukan pemanggil lewat `labelsForRoutes`.

State `groupId` diangkat ke `PnlPageContent` sejajar `dailyRoutes` — tab dirender lewat ternary,
jadi meninggalkan tab akan meng-unmount view dan membuang pilihannya. Tab Estimated dan tab Daily
Report memegang `groupId`-nya **masing-masing**; keduanya scope yang berbeda dan tidak saling ikut.

Kalimat "Filter aktif: …" dari §2c dirender di sini juga, dengan bentuk yang sama, dan aturan
"rute anggota group tidak ditawarkan lagi" berlaku sama persis.

Satu hal yang **tidak** berlaku di sini: daftar rute Daily Report berasal dari master
(`usePnlRoutes`) sedangkan keanggotaan group juga dari master, jadi setiap anggota group dijamin
ada di daftar yang disaring. Di tab Estimated daftarnya dari `v_pnl_to` (§1c), sehingga anggota
group yang belum pernah terbang memang tidak ada di daftar — `offerableRoutes` cukup tidak
menemukannya, dan itu bukan kondisi kesalahan.

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
| `pnl.controller.ts` | 9 handler menerima `routes`/`dateFrom`/`dateTo`/`vendor` lewat `parseScope`; `getAwbDrilldown` memakainya juga, menggantikan blok param manualnya |
| `pnl-scope.util.ts` | **baru** — satu tempat merakit `PnlRouteFilter` dari query |
| `pnl.service.ts` | `getSummary`, `getDailyMargin`, 6 `getCost*`/`get*ByRoute` menerima `scope`; `getAwbDrilldown` pindah dari `EXISTS` ke `WHERE` dan kolom cost-nya ke `costSplitSql` (§3b); 4 query cost ditulis ulang ke grain TO (§3c); `getDailyMatrix`/`getRouteComparison`/`getVendorComparison` menambah `revenue_missing_tos` |

Semua narrowing lewat satu helper privat `scopeSql(scope, dateCol, startParamIndex)` yang
mengembalikan `{ sql, params }` — **sembilan** query tidak boleh masing-masing menyusun `UNNEST`
sendiri. Drilldown adalah yang kesembilan: setelah §3b ia memakai klausa yang sama persis, dan
`routeWhere`/`vendorWhere` buatannya sendiri dihapus.

### Frontend

| Berkas | Perubahan |
|---|---|
| `components/shared/route-group-select.tsx` | **baru** |
| `features/pnl/components/PnlEstimateFilterBar.tsx` | **baru** |
| `features/pnl/components/PnlAwbDrilldown.tsx` | baris filter, `onRouteChange`, catatan overhang, `vendor-scope-note`, dan `overhangCount` dihapus (§1d) |
| `features/pnl/components/PnlAwbDrilldown.spec.tsx` | blok `filter section`, `route filter`, `vendor filter` pindah ke spec filter bar; blok `overhang note` dihapus |
| `features/pnl/components/PnlDailyMatrixView.tsx` | `<RouteGroupSelect>`, `unionRoutes`, `offerableRoutes` |
| `features/pnl/hooks/usePnl.ts` | 8 hook menerima `scope`, masuk `queryKey`, pakai `routeToParams` |
| `features/pnl/utils/cellWarning.ts` | field `revenueMissingTos` |
| `features/pnl/utils/dailyMatrix.ts` | `unionRoutes`, `offerableRoutes`; `CLEAN`/`EMPTY_FOOTER` |
| `features/pnl/utils/routeComparison.ts` | meneruskan `revenueMissingTos` |
| `features/pnl/utils/vendorComparison.ts` | idem |
| `app/(dashboard)/pnl/page.tsx` | rename state, dua `groupId`, effect reset dipersempit, urutan render |

---

## Pengujian

### Invarian rekonsiliasi — inti dari revisi ini

Tiga pengujian yang menggantikan tiga catatan kuning yang dihapus. Semuanya dijalankan **dengan dan
tanpa** filter, pada dataset yang memuat minimal satu AWB multi-TO yang sebagian TO-nya di luar
filter — tanpa baris seperti itu, ketiganya lulus secara trivial dan tidak membuktikan apa pun.

| Invarian | Yang dibandingkan |
|---|---|
| Drilldown ↔ Summary | `SUM` seluruh halaman drilldown (`totalRevenue`, `totalCost`) = `/pnl/summary` |
| Breakdown ↔ Summary | `cost-totals` (smu+ra+sgOut+sgIn) = `summary.totalCost` |
| Dalam satu baris | untuk setiap baris drilldown: `totalRevenue − totalCost = grossProfit` |

Yang ketiga **gagal pada kode hari ini** (§3b), jadi ia ditulis lebih dulu dan menjadi bukti bahwa
perbaikannya nyata, bukan sekadar refactor.

### Unit

| Unit | Yang dipastikan |
|---|---|
| `scopeSql` | dua array paralel di-`UNNEST` sebagai pasangan, bukan cross-product; scope kosong menghasilkan SQL kosong; indeks param tidak bertabrakan dengan param periode |
| `parseScope` | field kosong tidak dikirim; `vendor` tunggal, array, dan objek ber-index (arrayLimit qs) sama-sama terbaca |
| `PnlService.getSummary` | filter rute menyempitkan per-TO; tanpa scope SQL identik dengan hari ini |
| `PnlService.getAwbDrilldown` | kolom cost prorata `weight_share`; filter di `WHERE`, bukan `EXISTS`; `hasNullCost` dari `BOOL_OR(cost_to IS NULL)`; AWB single-TO tidak berubah angkanya |
| `PnlService.getCostTotals` | hasil = `summary.totalCost` pada periode yang sama, dengan dan tanpa filter |
| `PnlService.getCostByVendor` | Total Weight dari `SUM(gross_weight)` baris tersaring, bukan `MAX(sum_gw_per_awb)` |
| `PnlService.getDailyMatrix` | `revenue_missing_tos` terhitung per cell dan terjumlah di footer; TO revenue-NULL yang ber-issue `no_booking` **tetap** terhitung — kasus yang mendorong §5 |
| `revenueWarning` | `revenueMissingTos` lolos; `incompleteTos` tetap nol; cell yang hanya bermasalah cost tetap bersih |
| `hasWarning` / `warningTooltip` | `revenueMissingTos` saja sudah memicu warning; tooltip menyebut TO tanpa revenue dan tidak menyebut cost di tabel Revenue |
| `unionRoutes` | dedup rute yang ada di kedua sisi; group kosong = rute eksplisit; rute eksplisit kosong = anggota group; urutan stabil |
| `offerableRoutes` | anggota group hilang dari daftar; tanpa group daftar utuh; anggota group yang tidak ada di daftar bukan error |
| `RouteGroupSelect` | tanpa `read.route_group` tidak merender apa pun **dan** tidak mengirim request |
| `PnlEstimateFilterBar` | mengubah rute/tanggal/group memanggil callback-nya; Reset mengosongkan keempatnya; tanggal terbatas pada `periodBounds`; baris "Filter aktif" hanya saat group terpilih dan menghitung rute unik; rute yang tercentang sebelum group dipilih **tidak** terhapus dari scope |
| `PnlDailyMatrixView` | memilih group menyaring kolom; rute anggota group tanpa data menjadi kolom em-dash; union dengan centang manual; anggota group tidak lagi ditawarkan dropdown |
| `page.tsx` | klik cell dari tiga tab menyetel scope **dan** mengosongkan `groupId`; ganti periode menghapus tanggal saja; rute/group bertahan; filter bar berada di atas KPI cards; `groupId` Estimated dan Daily Report tidak saling ikut |

Spec `PnlAwbDrilldown` yang ada harus **diperbarui, bukan dipindah utuh**: blok `overhang note`
menguji perilaku yang dihapus, dan assertion angka cost di blok `route columns` menguji nilai
AWB-penuh yang sekarang prorata.

E2E tidak ditambah. Satu-satunya perilaku yang tidak tertutup unit test adalah scroll-into-view,
yang sudah tidak diuji hari ini.

---

## Keputusan

Keenam pertanyaan terbuka revisi awal, beserta jawabannya dan akibatnya pada spec.

| # | Pertanyaan | Jawaban | Akibat |
|---|---|---|---|
| 1 | Breakdown ikut filter, atau dilabeli "seluruh periode"? | **Ikut filter.** Semua data ikut filter kecuali Data Quality | §3a (9 endpoint), §3c (4 query ditulis ulang), §3h (satu pengecualian, dengan alasannya) |
| 2 | Catatan cukup, atau drilldown ikut per-TO? | **Ikut per-TO** — drilldown memang dihitung dari TO | §3b ditulis ulang total; §3b-bis baru; dua catatan kuning dihapus (§1d); invarian rekonsiliasi menggantikannya |
| 3 | Group + rute: union atau saling meniadakan? | **Berbarengan**, dan rute anggota group tidak bisa dipilih lagi | §2c ditulis ulang; `offerableRoutes` baru |
| 4 | Group single-select atau multi? | **Single**, sesuai usulan | tidak berubah |
| 5 | Ganti periode: buang tanggal saja? | **Ya**, sesuai usulan | tidak berubah |
| 6 | `revenue_missing_tos` ikut ke kedua tab perbandingan? | **Ya**, sesuai usulan | tidak berubah |

Jawaban #2 ternyata menemukan cacat yang sudah ada di `main`: baris drilldown mencampur revenue
per-TO dengan cost per-AWB, sehingga **Revenue − Cost ≠ GP** pada setiap AWB multi-TO, tanpa filter
apa pun. §3b memperbaikinya, dan §3b-bis mencatat bahwa perbaikan itu berdiri sendiri — ia bisa
dikirim lebih dulu, terpisah dari seluruh sisa spec ini.
