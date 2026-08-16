# Route Group & PnL Group Comparison

**Tanggal:** 2026-08-16
**Status:** Disetujui, siap masuk rencana implementasi

## Latar Belakang

Tim ingin membandingkan revenue dan cost antar sekumpulan rute, bukan per rute satu-satu.
Daily Report yang sudah ada menampilkan 18 kolom rute berdampingan; yang dibutuhkan sekarang
adalah pengelompokan rute menjadi group bernama (mis. "Kalimantan", "Sumatera") lalu
membandingkan beberapa group sekaligus per tanggal.

Dua bagian pekerjaan:

1. **Menu Route Group** di section Air Shipments — CRUD group berisi kumpulan rute. Satu
   group boleh berisi banyak rute, satu rute boleh masuk banyak group.
2. **Tab baru di modul PnL** — tabel perbandingan revenue dan cost per tanggal untuk group
   yang dipilih user, dengan cell cost yang bisa dibuka menjadi rincian SMU, RA, SG Out, dan
   SG In.

Bentuk tabel yang diminta:

```
Date  |            Revenue            |             Cost
      | Group A | Group B | Group C   | Group A | Group B | Group C
```

Tanggal yang tampil mengikuti global filter halaman PnL apa adanya.

## Kelayakan

Seluruh angka sudah tersedia di materialized view `v_pnl_to`. Tidak ada perubahan definisi
view. Yang baru hanya dua tabel untuk menyimpan group.

| Kebutuhan | Sumber |
| --- | --- |
| Rute (baris pilihan saat menyusun group) | `air_shipments_data` `service = 'Air'`, pasangan `extra_fields->>'origin_station'` / `->>'destination_station'` |
| Rute (kunci agregasi) | `v_pnl_to.origin_station` / `.dest_station` |
| Tanggal | `date_completed` / `date_ata` / `date_atd`, dipilih `buildFilter` sesuai basis |
| Revenue | `revenue_total` |
| Cost | `cost_to` |
| Rincian SMU / RA / SG Out | `cost_smu_awb` / `cost_ra_awb` / `cost_sg_out_awb`, masing-masing dikali `weight_share` |
| Rincian SG In | `cost_sg_in_to` (sudah per TO) |
| Label origin | `ORIGIN_LABELS` di `pnl.service.ts` (`Jabo` → `CGK`, `Surabaya` → `SUB`) |

### Bukti dari Database

Diukur langsung terhadap database lokal (66.203 baris `v_pnl_to`, 76 baris
`air_shipments_data`) sebelum desain ini disusun.

**1. Master menutupi seluruh rute yang punya data.** `air_shipments_data` jalur Air
menghasilkan **31** pasangan station distinct; `v_pnl_to` memakai **18** pasangan. Selisih
`used EXCEPT master` **kosong** — tidak ada satu pun rute berdata yang tidak bisa dimasukkan
ke group. 13 pasangan sisanya hanya ada di master (Medan → Batam, Jabo → Gorontalo,
Surabaya → Batam, Ternate → Jabo, Mataram → Jabo, Pekanbaru → Batam, Denpasar → Makassar,
Pekanbaru → Yogya, Surabaya → Palu, Surabaya → Manado, Gorontalo → Jabo, Denpasar → Jabo,
Padang → Jabo) dan akan menghasilkan kolom kosong bila dipilih.

**2. Rincian cost rekonsiliasi tepat dengan cell di atasnya.** Dengan klausa `FILTER` yang
dirancang di bawah, atas seluruh 66.203 baris:

| | Nilai |
| --- | --- |
| `SUM(cost_to)` | 1.924.180.323 |
| SMU | 1.621.833.995 |
| RA | 75.882.449 |
| SG Out | 21.873.808 |
| SG In | 204.590.070 |
| **Sisa (total − keempat komponen)** | **0** |

## Keputusan Desain

| Topik | Keputusan |
| --- | --- |
| Definisi rute | Pasangan origin→destination station, sama dengan yang dipakai seluruh modul PnL |
| Sumber daftar rute | Master `air_shipments_data`, bukan `v_pnl_to` — rute baru bisa didaftarkan sebelum shipment pertamanya |
| Kepemilikan group | Global, dikelola admin. Bukan per organisasi, bukan per user |
| Angka Revenue | `SUM(revenue_total)` — gross, tanpa potong diskon. Sama dengan tabel Revenue di Daily Report |
| Angka Cost | `SUM(cost_to)` — sudah diprorata per TO, sudah termasuk SG In |
| Rincian cost | Baris expand di bawah baris tanggal, terisi untuk seluruh group sekaligus |
| Pemilihan group di PnL | Multi-select, default kosong |
| Penempatan menu | Item terakhir di section Air Shipments, halaman di `/route-groups` |
| Permission | `read.route_group` untuk lihat, `create` / `update` / `delete.route_group` untuk kelola |
| Pembagian kerja | Backend menghitung seluruh agregat dan baris footer; frontend hanya me-render |

Alasan backend yang menghitung footer: modul PnL sudah memakai konvensi itu di
`getProfitByRoute` dan `getDailyMatrix`, sehingga angka laporan keuangan punya satu sumber
kebenaran yang bisa di-unit-test.

## Asumsi

- Tab baru memakai filter yang sudah ada di halaman PnL — mode Billing Cycle atau Custom
  Range, plus pemilih Date Basis. Tidak ada filter tambahan khusus tab ini.
- Baris tanggal lengkap secara kalender. Tanggal tanpa shipment tetap muncul, supaya
  Avg/Day = Total ÷ jumlah hari periode tetap konsisten.
- Sel tanpa data sama sekali dirender `—`; sel yang ada shipment tapi bernilai nol dirender
  `0`. Mengikuti `PnlMatrixTable`.
- Group tanpa rute tidak diizinkan; nama group unik.
- Rute yang tidak masuk group mana pun tidak muncul di tabel comparison.

## Data Model

Dua tabel baru, satu migration:
`apps/backend/src/database/migrations/20260816000002-route-groups.ts`, kelas
`RouteGroups20260816000002`, SQL mentah seperti migration lain di repo ini. `down()` menghapus
kedua tabel.

```sql
CREATE TABLE route_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE route_group_routes (
  route_group_id uuid NOT NULL REFERENCES route_groups(id) ON DELETE CASCADE,
  origin_station varchar(100) NOT NULL,
  dest_station   varchar(100) NOT NULL,
  PRIMARY KEY (route_group_id, origin_station, dest_station)
);

CREATE INDEX idx_route_group_routes_station
  ON route_group_routes (origin_station, dest_station);
```

Relasi many-to-many jatuh dengan sendirinya dari bentuk tabel ini: satu group punya banyak
baris rute, dan satu pasangan station boleh muncul di banyak `route_group_id`. Tidak perlu
penanganan khusus untuk "1 rute masuk lebih dari 1 group".

**Kenapa pasangan station disimpan sebagai teks, bukan foreign key ke master rute.** Tidak
ada tabel yang primary key-nya pasangan station. `air_shipments_data` disinkronkan dari
Google Sheet: barisnya adalah pasangan **DC** (55 baris Air menghasilkan 31 pasangan
station), dan seluruh barisnya ditulis ulang tiap sync sehingga id-nya tidak stabil. Pasangan
station hasil resolusi adalah kunci yang stabil, dan persis kunci yang dipakai `v_pnl_to`
untuk agregasi — sehingga join di tab PnL cukup kesamaan dua kolom, tanpa rantai lookup.

Index pada `(origin_station, dest_station)` melayani arah join dari `v_pnl_to`.

## Backend

### Modul `route-groups`

`apps/backend/src/modules/route-groups/`, mengikuti layout modul yang sudah ada:

```
route-groups.module.ts
route-groups.controller.ts
route-groups.service.ts
route-groups.service.spec.ts
route-groups.controller.spec.ts
dto/create-route-group.dto.ts
dto/update-route-group.dto.ts
entities/route-group.entity.ts
entities/route-group-route.entity.ts
```

Didaftarkan di `app.module.ts`.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/route-groups` | `read.route_group` |
| GET | `/route-groups/available-routes` | `read.route_group` |
| POST | `/route-groups` | `create.route_group` |
| PATCH | `/route-groups/:id` | `update.route_group` |
| DELETE | `/route-groups/:id` | `delete.route_group` |

```ts
interface RouteGroupRoute {
  origin: string        // 'Jabo'
  originLabel: string   // 'CGK'
  dest: string
}

interface RouteGroup {
  id: string
  name: string
  description: string | null
  routes: RouteGroupRoute[]
}

interface AvailableRoute extends RouteGroupRoute {
  hasData: boolean      // pasangan ini ada di v_pnl_to
}
```

`GET /route-groups` mengembalikan seluruh group beserta rutenya sekaligus — jumlahnya kecil
dan frontend membutuhkan daftar rute tiap group untuk mendeteksi irisan antar group di tab
PnL.

`getAvailableRoutes()` mengambil pasangan station distinct dari master:

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

`hasData` diturunkan dari `LEFT JOIN` ke `SELECT DISTINCT origin_station, dest_station FROM
v_pnl_to`. Gunanya menandai 13 rute master yang belum pernah punya shipment, supaya admin
tidak memasukkan rute yang pasti menghasilkan kolom kosong tanpa sadar.

`originLabel` memakai `ORIGIN_LABELS` yang sudah ada, dengan fallback ke nilai asli untuk
origin yang belum dipetakan. Konstanta itu saat ini tinggal di `pnl.service.ts`; dipindahkan
ke `apps/backend/src/common/utils/origin-labels.util.ts` agar kedua modul memakai satu definisi
tanpa saling impor. Bukan ke `packages/shared`, karena frontend tidak pernah membutuhkannya —
backend selalu mengirim `originLabel` yang sudah jadi.

Validasi: nama wajib dan unik (pelanggaran unique constraint dipetakan menjadi 409), minimal
satu rute, dan setiap rute yang dikirim harus ada di daftar `available-routes`.

### `GET /pnl/breakdown/group-comparison`

Query param `cycle` / `start` / `end` / `basis` seperti endpoint PnL lainnya, ditambah
`groupIds` berisi daftar uuid dipisah koma. Berada di controller PnL yang sudah dijaga
`JwtAuthGuard` dan `@Authorize(Permission.READ_PNL)` di level kelas.

`groupIds` kosong mengembalikan `columns` dan `rows` kosong tanpa menyentuh database.

#### Agregasi

Satu query fakta, memakai `buildFilter()` yang sudah ada supaya mode cycle/range dan date
basis identik dengan sisa modul.

```sql
SELECT
  TO_CHAR(v.${dateCol}::DATE, 'YYYY-MM-DD')                    AS d,
  r.route_group_id                                             AS gid,
  COALESCE(SUM(v.revenue_total), 0)                            AS revenue,
  COALESCE(SUM(v.cost_to), 0)                                  AS cost,
  COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_smu,
  COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_ra,
  COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_out,
  COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))
           FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_in,
  COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int               AS incomplete_tos
FROM v_pnl_to v
JOIN route_group_routes r
  ON r.origin_station = v.origin_station
 AND r.dest_station   = v.dest_station
WHERE ${where} AND v.${dateCol} IS NOT NULL
  AND r.route_group_id = ANY($n::uuid[])
GROUP BY 1, 2
```

Tanggal dikembalikan lewat `TO_CHAR`, bukan `::DATE` telanjang, karena driver `pg` mengubah
kolom `DATE` menjadi objek `Date` JavaScript sehingga tidak bisa dicocokkan dengan daftar
tanggal kalender. `getDailyMargin` dan `getDailyMatrix` sudah memakai cara yang sama.

**Join inilah yang menangani irisan group.** Sebuah TO pada rute yang menjadi anggota tiga
group menghasilkan tiga baris hasil join dan masuk ke tiga kolom. Tidak ada dedup, dan
memang tidak boleh ada — tiap kolom adalah pertanyaan yang berdiri sendiri.

Query kedua yang murah mengambil nama group untuk `columns`, urut mengikuti urutan
`groupIds` yang dikirim frontend.

#### Klausa `FILTER` menanggung beban

`cost_to` bernilai NULL ketika salah satu dari SMU, RA, atau SG Out tidak ketemu tarifnya —
`cost_total_awb` menjadi NULL sehingga `cost_to` ikut NULL, dan `SUM` melewati baris itu.
Tanpa `FILTER (WHERE v.cost_to IS NOT NULL)`, keempat komponen tetap menyerap biaya dari TO
yang totalnya NULL, sehingga empat baris rincian akan **melebihi** cell yang membukanya.
Dengan `FILTER`, keempatnya menjumlah tepat ke `SUM(cost_to)` — terverifikasi sisa 0 atas
seluruh 66.203 baris database lokal. Ini yang membuat rincian tidak mungkin bertentangan
dengan angka di atasnya, dan karena itu diuji sebagai regression test.

`incompleteTos` menghitung TO yang `cost_to`-nya NULL, mengikuti `getDailyMatrix`. Konsekuensi
yang sama pula berlaku: TO tersebut menyumbang revenue tetapi tidak menyumbang cost, sehingga
cost terlihat lebih rendah dari seharusnya — inilah yang ditandai penanda visualnya.

Baris disusun ke daftar tanggal lengkap dari `calendarDatesForFilter()` yang sudah ada.

#### Kontrak API

```ts
interface PnlGroupComparisonColumn {
  id: string
  name: string
  routeCount: number
}

interface PnlGroupComparisonCell {
  revenue: number
  cost: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
}

interface PnlGroupComparisonRow {
  date: string                                   // YYYY-MM-DD
  cells: (PnlGroupComparisonCell | null)[]       // sejajar dengan columns; null = tidak ada shipment
}

interface PnlGroupComparisonFooter {             // satu entri per kolom, sejajar dengan columns
  totalRevenue: number
  totalCost: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  avgRevenuePerDay: number
  avgCostPerDay: number
  incompleteTos: number
}

interface PnlGroupComparison {
  columns: PnlGroupComparisonColumn[]
  rows: PnlGroupComparisonRow[]
  footer: PnlGroupComparisonFooter[]
  periodDays: number                             // pembagi Avg/Day
}
```

Pembagi nol menghasilkan `null`, bukan `Infinity` atau `NaN`.

`PnlService.getGroupComparison(filter, groupIds)` membaca `route_group_routes` lewat join di
atas, bukan lewat `RouteGroupsService` — tidak ada ketergantungan antar modul, dan nama group
untuk `columns` diambil query kedua di method yang sama.

### Permission

Empat nilai baru pada enum `Permission` di `packages/shared/src/auth/index.ts`:

```ts
// Route Group (rute-rute yang dikelompokkan untuk perbandingan PnL)
READ_ROUTE_GROUP = 'read.route_group',
CREATE_ROUTE_GROUP = 'create.route_group',
UPDATE_ROUTE_GROUP = 'update.route_group',
DELETE_ROUTE_GROUP = 'delete.route_group',
```

Tidak perlu migration untuk permission: modul permissions menyemai tabel `permissions` dari
enum ini saat `onApplicationBootstrap`. Nama-namanya lolos check constraint
`^(read|create|update|delete)\.[a-z][a-z0-9_]*$`.

Konsekuensi yang perlu dikerjakan saat deploy: role yang memakai PnL perlu ditambahi
`read.route_group` lewat halaman Roles, kalau tidak multi-select group di tab baru akan
kosong.

## Frontend

### Menu Route Group

**`components/layout/sidebar.tsx`** — satu `NavLink` baru sebagai item terakhir section Air
Shipments, setelah Barhal, dengan icon dari `lucide-react` dan gating
`hasPermission('read.route_group')`.

**`app/(dashboard)/route-groups/page.tsx`** — halaman berada di top level, bukan di bawah
`/air-shipments`, karena `air-shipments/layout.tsx` memaksa redirect `/air-shipments` ke tab
sheet pertamanya. Mengikuti pola halaman `settings/organizations`: daftar dalam tabel,
`PageHeader` dengan tombol aksi, state modal berupa discriminated union
(`{type:'create'} | {type:'edit', group} | null`), `Dialog` shadcn untuk form, dialog konfirmasi
terpisah untuk hapus. Tombol Add / Edit / Delete masing-masing digating permission-nya sendiri.

**`features/route-groups/`**

- **`types.ts`** — `RouteGroup`, `RouteGroupRoute`, `AvailableRoute`.
- **`hooks/useRouteGroups.ts`** — react-query mengikuti pola `features/barhal/hooks/useBarhal.ts`:
  `useRouteGroups()`, `useAvailableRoutes()` dengan `staleTime` panjang karena daftar rute
  jarang berubah, serta `useCreateRouteGroup` / `useUpdateRouteGroup` / `useDeleteRouteGroup`
  memakai `useMutation` + `invalidateQueries`.
- **`components/RouteGroupForm.tsx`** — prop `initial` untuk mode edit, `onSubmit` / `onCancel`,
  error diambil dari `err.response.data.message` seperti `organization-form.tsx`.
- **`components/RoutePicker.tsx`** — daftar checkbox rute dikelompokkan di bawah heading CGK
  dan SUB, dengan penanda halus untuk rute ber-`hasData: false`. Komponen terkontrol:
  menerima `value: RouteGroupRoute[]` dan `onChange`, tidak tahu apa-apa soal form.
- **`components/DeleteRouteGroupDialog.tsx`** — konfirmasi hapus.

### Tab Group Comparison

**`app/(dashboard)/pnl/page.tsx`** — empat suntingan yang sama seperti tab-tab sebelumnya:
literal `'groups'` masuk union `PnlView`, satu entri `VIEW_SUBTITLE`, satu tombol di button
group, satu cabang di rantai render. Komponennya hanya menerima `filter`.

**`features/pnl/hooks/usePnl.ts`** — `usePnlGroupComparison(filter, groupIds)` beserta tipe
di atas. Query dimatikan (`enabled: false`) selama `groupIds` kosong, sehingga tab yang baru
dibuka tidak memanggil backend.

**`features/pnl/components/PnlGroupComparisonView.tsx`** — kontainer tab. Memuat daftar group
lewat `useRouteGroups()`, merender multi-select, menangani loading / error / keadaan kosong,
memunculkan catatan irisan, lalu merender tabel. Tidak berisi logika angka.

**`features/pnl/components/PnlGroupComparisonTable.tsx`** — komponen presentasional. Satu-satunya
state miliknya adalah `Set<string>` berisi tanggal yang sedang terbuka.

Header dua tingkat: baris atas `Tanggal` (sticky `left-0`) ditambah header blok `Revenue` dan
`Cost` dengan `colSpan` sebanyak group terpilih; baris bawah berisi nama group, urut sesuai
urutan user memilihnya. Klik cell Cost mana pun membuka empat baris anak — SMU, RA, SG Out,
SG In — terisi untuk **seluruh** group sekaligus, dengan blok Revenue dibiarkan kosong pada
baris-baris itu. Beberapa tanggal boleh terbuka bersamaan. Klik lagi menutup. Cell Revenue
tidak bisa diklik. Baris footer berisi Total dan Avg/Day per kolom dan bisa dibuka dengan cara
yang sama.

Angka memakai `num()` dari `features/pnl/utils/format.ts`. Sel tanpa data dirender `—`, nol
sungguhan dirender `0`, dan cell cost yang mengandung TO tanpa biaya mendapat penanda amber
beserta tooltip berisi jumlahnya — ketiga konvensi diambil apa adanya dari `PnlMatrixTable`.

**`features/pnl/utils/groupComparison.ts`** — fungsi murni yang memproyeksikan response API
menjadi props tabel, plus `overlappingRoutes(groups)` yang mendeteksi rute yang dimiliki lebih
dari satu group terpilih. Deteksi irisan sepenuhnya di frontend: daftar rute tiap group sudah
ikut terbawa `GET /route-groups`, jadi tidak perlu bantuan API.

Kolom sengaja berdiri sendiri, sehingga rute yang menjadi anggota Group A dan Group B menyumbang
ke keduanya dan kolom-kolomnya tidak menjumlah menjadi total periode. Catatan ringkas di atas
tabel — misalnya "Group A dan Group B berbagi 2 rute" — mencegah kolom terbaca sebagai partisi.

### `PnlMatrixTable` tidak disentuh

Modelnya satu nilai per cell dengan grup kolom bertint origin; tabel baru ini butuh dua blok
metrik dan baris anak yang bisa dibuka. Memaksanya melayani keduanya akan membuat Daily Report
lebih sulit dibaca tanpa keuntungan sepadan. Bagian yang benar-benar bersama — `num()`, aturan
`—` versus `0`, kolom pertama sticky — sudah kecil dan sudah terpisah.

## Rencana Pengujian

Dikerjakan dengan TDD: test lebih dulu, lalu implementasi.

**`pnl.service.spec.ts`**, mengikuti pola mock `dataSource.query` yang sudah ada:

- sel tersusun sejajar dengan `columns`, urut mengikuti `groupIds`;
- pasangan (tanggal, group) tanpa data menghasilkan `null`;
- baris kalender lengkap, termasuk tanggal tanpa shipment;
- **keempat komponen cost menjumlah tepat ke `cost`** — regression guard untuk klausa `FILTER`;
- TO pada rute yang masuk dua group terhitung di kedua kolom;
- matematika footer: `avgRevenuePerDay`, `avgCostPerDay`, dan total tiap komponen;
- pembagi nol menghasilkan `null`, bukan `Infinity` atau `NaN`;
- `groupIds` kosong mengembalikan hasil kosong tanpa menyentuh database.

**`route-groups.service.spec.ts`:**

- CRUD dasar;
- nama duplikat ditolak dengan 409;
- group tanpa rute ditolak;
- rute di luar daftar `available-routes` ditolak;
- hapus group ikut menghapus barisnya di `route_group_routes`;
- `getAvailableRoutes` mengembalikan bentuk `{ origin, originLabel, dest, hasData }`, dengan
  fallback label ke nilai asli untuk origin yang belum dipetakan.

**`route-groups.controller.spec.ts`** dan satu tes wiring di `pnl.controller.spec.ts`
(`groupIds` dipecah menjadi array dan diteruskan).

**Frontend (RTL, mengikuti `PnlMatrixTable.spec.tsx` yang ada):**

- `groupComparison.spec.ts` — proyeksi response menjadi props tabel, dan `overlappingRoutes`
  untuk kasus tanpa irisan, irisan dua group, dan irisan tiga group;
- `PnlGroupComparisonTable.spec.tsx` — klik cell cost membuka empat baris untuk seluruh group,
  klik lagi menutup, dua tanggal bisa terbuka bersamaan, cell revenue tidak bisa diklik, `—`
  versus `0`, dan penanda `incompleteTos`;
- `RoutePicker.spec.tsx` — pengelompokan CGK/SUB, selection round-trip, penanda `hasData`;
- `PnlGroupComparisonView.spec.tsx` — keadaan kosong sebelum group dipilih, dan catatan irisan
  muncul saat group terpilih berbagi rute.

## Di Luar Cakupan

- Export Excel. Seluruh perhitungan sengaja ditaruh di backend supaya export bisa memakai ulang
  angka yang sama saat nanti dikerjakan.
- Kolom margin atau % margin. Permintaannya revenue dan cost.
- Chart.
- Pengelompokan berdasarkan apa pun selain pasangan station.
- Membuat tab Daily Report ikut sadar group.
- Memindahkan filter halaman PnL ke URL query param.
