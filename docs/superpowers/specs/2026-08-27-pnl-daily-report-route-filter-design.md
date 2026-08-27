# PnL — Filter Rute di Daily Report, Warning Revenue & Latar Kolom Beku

**Tanggal:** 2026-08-27
**Area:** `apps/backend/src/modules/pnl`, `apps/frontend/src/features/pnl`
**Branch:** `feature/pnl-daily-report-route-filter` dari `main`

## Latar

Tiga perubahan pada tab **Daily Report** dan tabel-tabel P&L yang sudah jalan:

1. Daily Report mendapat dropdown filter rute multi-pilih, seperti yang sudah ada di tab Route
   Comparison, sehingga user bisa memilih rute mana saja yang ditampilkan.
2. Cell di tabel **Revenue** menjadi kuning hanya bila masalahnya ada pada revenue AWB/TO-nya;
   masalah cost tidak lagi mewarnai tabel itu.
3. Kolom Tanggal yang beku (`sticky`) mendapat latar opak, sehingga cell yang tergulir tidak lagi
   terlihat menembusnya.

Ketiganya independen dan bisa dikerjakan berurutan tanpa saling menunggu.

---

## 1. Filter Rute di Daily Report

### 1a. Sumber daftar rute

Daftar rute yang bisa dipilih berasal dari master **`air_shipments_data`** — pasangan
`extra_fields->>'origin_station'` dan `extra_fields->>'destination_station'` untuk `service = 'Air'` —
bukan dari kolom respons daily-matrix dan bukan dari `v_pnl_to`.

Query yang sama sudah ada di `RouteGroupsService.getAvailableRoutes()`, tetapi endpoint-nya
(`GET /route-groups/available-routes`) dijaga `Permission.READ_ROUTE_GROUP`, sementara tab Daily
Report sama sekali tidak digerbangi permission itu. Memakainya berarti user yang berhak melihat
Daily Report tetapi tidak berhak melihat Route Group akan menerima `403` dan mendapat dropdown
kosong — filter yang rusak tanpa penjelasan.

Karena itu dibuat endpoint baru:

```
GET /pnl/routes  →  PnlStation[]
```

Di `PnlController`, yang seluruh method-nya sudah dijaga `@Authorize(Permission.READ_PNL)` di level
controller. Permission-nya jadi sama persis dengan permission tab yang memakainya.

Implementasinya `PnlService.getRoutes()`:

```sql
SELECT DISTINCT
  NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
  NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest
FROM air_shipments_data
WHERE service = 'Air'
  AND NULLIF(BTRIM(extra_fields->>'origin_station'), '')      IS NOT NULL
  AND NULLIF(BTRIM(extra_fields->>'destination_station'), '') IS NOT NULL
ORDER BY 1, 2
```

Hasilnya dipetakan ke `PnlStation` (`origin`, `originLabel` lewat `originLabel()`, `dest`) — tipe
yang sudah dipakai `getStations()`, sehingga kolom matrix dan daftar filter berbicara dalam bentuk
yang sama.

**Duplikasi SQL ini disengaja.** Menyatukannya menuntut salah satu dari dua hal: satu modul
mengimpor service modul lain demi satu `SELECT`, atau guard multi-permission (`READ_ROUTE_GROUP`
ATAU `READ_PNL`) yang belum ada di codebase — `@Authorize` hanya menerima satu permission. Dua
salinan SQL yang stabil lebih murah daripada keduanya.

**Yang tidak ikut disalin adalah `hasData`.** `getAvailableRoutes()` melakukan `LEFT JOIN` ke
`v_pnl_to` untuk menandai rute yang belum pernah terbang; penanda itu hanya berguna bagi
`RoutePicker`. Di filter ini perannya sudah diambil alih oleh kolom em-dash (§1c), yang menyampaikan
hal yang sama di tempat yang lebih berguna — di tabelnya sendiri, bukan di dropdown.

### 1b. Label rute

Dropdown memakai `displayRouteLabel` (`CGK → Denpasar`), **bukan** `dropdownRouteLabel`
(`Jabo → Denpasar`).

Alasannya ada di `routeLabels.ts`: header matrix menamai origin dengan kode bandara, meniru
spreadsheet yang digantikannya. Kalau dropdown berbicara nama stasiun mentah, yang dicentang user
tidak akan cocok dengan yang terbaca di tabel di sebelahnya. Ini berbeda dari tab Route Comparison,
yang memang sengaja memakai bentuk mentah karena picker-nya berbagi bahasa dengan Route Group.

Konsekuensinya perlu index label baru yang memetakan label tampilan → pasangan rute. Bentuknya sama
dengan `buildRouteLabelIndex`, hanya beda fungsi label — jadi `buildRouteLabelIndex` digeneralisasi
menerima fungsi label, dengan `dropdownRouteLabel` sebagai default supaya pemanggil yang ada tidak
berubah.

### 1c. Rute terpilih selalu menjadi kolom

Master menghasilkan lebih banyak pasangan rute daripada yang benar-benar membawa shipment (terukur
31 vs 18 pada database saat ini). Rute yang dipilih user tetapi tidak punya kolom di respons
daily-matrix **tetap dirender sebagai kolom**, dengan `—` di seluruh baris dan seluruh footer.

Yang dicentang harus selalu terlihat: kolom kosong terbaca sebagai jawaban ("tidak ada yang terbang
lewat sini pada periode ini") sedangkan kolom yang hilang terbaca sebagai filter yang gagal. Ini
juga konsisten dengan perlakuan cell kosong yang sudah ada — `formatValue` sudah merender nilai
tak-ada sebagai em-dash, bukan sebagai sel kosong.

### 1d. Urutan kolom tetap milik matrix

Kolom **tidak** diurutkan menurut urutan centang user. `groupOrigins` membentuk header origin yang
membentang (`colSpan`) dari kolom se-origin yang berdampingan; mengurutkan ulang menurut klik akan
memecah satu grup origin menjadi beberapa header terpisah.

Kolom sintetis (§1c) disisipkan tepat setelah kolom terakhir yang se-origin dengannya, atau di ujung
daftar bila origin itu belum ada sama sekali — sehingga blok origin tetap utuh.

### 1e. Penyaringan di client, bukan param backend

Kolom daily-matrix berasal dari `getStations()` — seluruh view, bukan periode terpilih — dan setiap
baris footer dihitung per kolom secara independen. Menyaring kolom karena itu murni proyeksi: tidak
ada total yang perlu dihitung ulang, dan mengubah centang tidak memicu request.

Menambahkan param `routes` ke `/pnl/breakdown/daily-matrix` akan menjadikan setiap centang satu
round-trip demi aritmetika yang hasilnya identik.

Seam-nya satu fungsi murni di `dailyMatrix.ts`:

```ts
selectMatrixColumns(matrix: PnlDailyMatrix, routes: PnlRoutePair[]): PnlDailyMatrix
```

Memotong kolom yang tidak dipilih, menyisipkan kolom sintetis, dan mengembalikan `PnlDailyMatrix`
dengan bentuk yang sama. `toRevenueTable`, `toMarginTable`, `groupOrigins` dan `PnlMatrixTable`
tidak berubah sedikit pun — semuanya membaca hasil fungsi ini.

Aturan tepinya:

| Kondisi | Hasil |
|---|---|
| `routes` kosong | seluruh kolom matrix ditampilkan (tab yang kosong saat pertama dibuka adalah regresi) |
| `routes` berisi, sebagian cocok | kolom yang cocok, ditambah kolom sintetis untuk yang tidak |
| `routes` berisi, tidak ada yang cocok | seluruhnya kolom sintetis (bukan tabel tanpa kolom) |

Kolom sintetis mendapat `cells: null` pada setiap baris dan footer bernilai nol dengan
`marginPct: null`, `spacePerKg: null`, `incompleteTos: 0`, `issues: []` — bentuk yang sama persis
dengan kolom asli yang tidak punya shipment, sehingga renderer tidak perlu tahu bedanya.

### 1f. State

Rute terpilih disimpan di `PnlPageContent`, sejajar `routePicks` dan `vendorPicks`, karena tab
dirender lewat ternary — meninggalkan tab meng-unmount view dan akan membuang pilihannya.

Seperti dua state itu, **tidak** ikut di-reset oleh effect periode: sebuah label rute tidak memuat
tanggal, berbeda dengan `drilldownRoute`. Rute yang tidak punya data di periode baru akan tampil
sebagai kolom em-dash, yang justru merupakan jawaban yang benar.

---

## 2. Cell Kuning di Tabel Revenue

### 2a. Aturan

Saat ini kedua tabel memakai `cellWarnings()` yang sama: `issues[]` apa pun ditambah
`incompleteTos`. Yang berubah **hanya tabel Revenue**:

| Sinyal | Tabel Revenue | Tabel Margin |
|---|---|---|
| `issues[]` dengan `issue = 'revenue_missing'` | mewarnai | mewarnai |
| `issues[]` lainnya (sebab cost) | diabaikan | mewarnai |
| `incompleteTos` (TO tanpa cost) | diabaikan | mewarnai |

Tabel Margin tidak berubah: margin = revenue − discount − cost, jadi masalah revenue maupun cost
sama-sama merusaknya.

**"Hanya" berarti "yang menentukan warna cuma masalah revenue"**, bukan "revenue harus satu-satunya
masalah". Cell yang punya `revenue_missing` **dan** masalah cost tetap kuning di tabel Revenue —
masalah cost tidak menambah dan tidak membatalkan. Membuat cell semacam itu tampil bersih akan
menyembunyikan revenue yang benar-benar bolong justru pada cell yang datanya paling kacau.

### 2b. Implementasi

Fungsi baru di `cellWarning.ts`:

```ts
// Satu-satunya nilai issue yang menandai revenue itu sendiri bermasalah.
const REVENUE_ISSUES = new Set(['revenue_missing'])

export function revenueWarning(warning: CellWarning | undefined): CellWarning | undefined
```

Menyaring `issues` ke `REVENUE_ISSUES` dan memaksa `incompleteTos: 0`. Konstanta bernama, bukan
literal di tengah kode, supaya ada satu tempat untuk ditambahi bila kelak muncul nilai issue revenue
yang lain.

Tooltip tetap lewat `warningTooltip` yang ada, sehingga cell kuning di tabel Revenue berbunyi
`Data quality: Revenue missing (2 AWB)` dan tidak pernah lagi menyebut cost.

`toRevenueTable` memanggilnya untuk cell **dan** footer. `toMarginTable` tidak berubah.

### 2c. Footer Revenue ikut di-scope, sekaligus membetulkan komentar yang keliru

Komentar yang ada di `toRevenueTable` mengklaim footer-nya "understated by the same missing cost
that produces these warnings". Itu salah: `totalRevenue` adalah `SUM(revenue_total)` — cost tidak
menyentuhnya sama sekali. Yang benar-benar menggerus footer Revenue justru `revenue_missing`, karena
`revenue_total` yang `NULL` tidak ikut terjumlah.

Jadi men-scope footer Revenue bukan sekadar konsistensi dengan cell-nya; itu memperbaiki warning yang
selama ini menunjuk sebab yang salah.

### 2d. Batasan yang diterima

`v_pnl_to.issue` adalah **rantai prioritas**, bukan daftar:

```sql
CASE WHEN vendor          IS NULL THEN 'no_booking'
     WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'
     WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'
     WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'
     WHEN revenue_total   IS NULL THEN 'revenue_missing'
     ...
```

`revenue_missing` baru muncul bila `vendor`, `cost_smu`, `cost_ra`, dan `cost_sg_out` semuanya ada.
AWB yang `no_booking` **dan** revenue-nya kosong akan berlabel `no_booking`, sehingga cell-nya tampil
bersih di tabel Revenue padahal revenue-nya bolong.

Ini konsekuensi yang diterima dari memakai sinyal yang sudah ada tanpa mengubah backend. Bila kelak
akurasinya diperlukan, obatnya satu agregat baru di `getDailyMatrix` —
`COUNT(*) FILTER (WHERE revenue_total IS NULL)` — sebagai predikat langsung yang tidak melewati
rantai issue, sejajar dengan `incomplete_tos` yang sudah ada untuk cost.

### 2e. Satuan

Membuang `incompleteTos` juga membuang satu-satunya angka bersatuan TO dari tabel Revenue. Angka di
tooltip Revenue karena itu selalu AWB.

---

## 3. Latar Kolom Tanggal yang Beku

### 3a. Sebab

Kolomnya sudah `sticky` dan sudah memberi latar — masalahnya latar itu **tembus pandang** pada baris
belang. `PnlMatrixTable` memberi `bg-muted/30` pada cell tanggal di baris genap, dan 30% opasitas
berarti cell yang tergulir di bawahnya terlihat menembusnya.

Latar `<tr>` tidak bisa menolong: sebuah `<td>` yang `sticky` tidak membawa serta latar barisnya,
jadi cell itu harus opak dengan sendirinya.

### 3b. Perbaikan

Cell tanggal selalu memakai latar opak: `bg-card` untuk baris ganjil, dan untuk baris belang
`bg-card` yang di atasnya ditumpuk lapisan belang — bukan `bg-muted` polos, yang jauh lebih gelap
daripada `bg-muted/30` dan akan membuat kolom beku itu belang mencolok dibanding baris tabelnya.

Penumpukan dilakukan lewat pseudo-element `before:` pada cell yang sudah `bg-card`, dengan
`before:bg-muted/30` mengisi seluruh cell dan isi teks diangkat `relative` di atasnya. Hasil
visualnya identik dengan baris tabelnya, tetapi lapisan bawahnya opak.

### 3c. Tempat lain dengan bug yang sama

"Beku" harus berarti hal yang sama di setiap tabel P&L, jadi dua tempat berikut ikut diperbaiki:

| Lokasi | Masalah |
|---|---|
| `PnlComparisonTable` baris data | `bg-muted/30` pada baris belang — sama persis dengan di atas |
| `PnlComparisonTable` baris rincian cost | `bg-card` padahal barisnya `bg-muted/10`, jadi kolom beku terlihat lebih terang daripada barisnya |

`PnlComparisonTable` dipakai tab Route Comparison dan Vendor Comparison sekaligus, sehingga satu
perbaikan menutup keduanya.

Header dan footer di kedua tabel sudah `bg-card` yang opak dan tidak bermasalah.

---

## Pengujian

| Unit | Yang dipastikan |
|---|---|
| `selectMatrixColumns` | pilihan kosong mengembalikan seluruh kolom; kolom yang tidak dipilih hilang beserta cell dan footer-nya pada indeks yang sama; rute tanpa kolom menjadi kolom em-dash; kolom sintetis disisipkan di dalam blok origin-nya; tidak ada yang cocok tetap menghasilkan kolom |
| `revenueWarning` | `revenue_missing` lolos; issue cost tersaring; `incompleteTos` selalu nol; cell campur tetap berwarning; cell yang hanya bermasalah cost menjadi bersih |
| `toRevenueTable` / `toMarginTable` | tabel Revenue memakai warning yang ter-scope pada cell dan footer; tabel Margin tidak berubah |
| `buildRouteLabelIndex` | menerima fungsi label; default-nya tetap `dropdownRouteLabel` |
| `PnlDailyMatrixView` | dropdown merender rute dari `/pnl/routes`; mencentang menyaring kolom; klik cell tetap meneruskan kolom dan tanggal yang benar |
| `PnlService.getRoutes` | query menyentuh `air_shipments_data` dan menyaring `service = 'Air'`; origin diberi label |
| `PnlController` | `/pnl/routes` meneruskan ke service |

Latar kolom beku tidak diuji otomatis — ini murni visual, dan menguji nama kelas Tailwind hanya
mengunci ejaan, bukan hasilnya. Diperiksa dengan menggulir tabel secara horizontal.
