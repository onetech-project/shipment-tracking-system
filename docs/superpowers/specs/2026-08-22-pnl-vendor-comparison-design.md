# PnL — Route Comparison, Margin, Vendor Group & Vendor Comparison

Tanggal: 2026-08-22
Status: disetujui untuk perencanaan

## Latar

Lima permintaan datang bersamaan dan saling mengunci, sehingga didesain sebagai satu paket:

1. Pilihan group dan rute di tab Group Comparison hilang setiap kali user pindah tab.
2. Tab itu belum menampilkan profit margin.
3. Belum ada cara membuat group vendor.
4. Nama "Group Comparison" ambigu setelah tab perbandingan kedua muncul.
5. Butuh tab Vendor Comparison: bandingkan group vendor atau vendor satuan, dengan bentuk tabel yang sama seperti Route Comparison tetapi sumbu barisnya rute, bukan tanggal.

Poin 5 memaksa refactor yang juga dipakai poin 2, dan bergantung pada poin 3. Poin 4 menyentuh hampir setiap file yang disentuh poin 2. Karena itu urutannya tidak bebas — lihat [Urutan Kerja](#urutan-kerja).

## Kelayakan

`v_pnl_to` sudah memuat `vendor` per baris TO ([`20260816000001-pnl-station-lookup.ts:195`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), berasal dari `booking.account`. Bersama `origin_station` / `dest_station` dan kolom biaya yang sudah ada, biaya per vendor per rute bisa dihitung tanpa mengubah view.

`air_shipments_smu` adalah master data vendor: tabel rate card SMU dengan kolom `vendor`, `airlines`, `origin`, `destination` dan unique index `idx_smu_lookup(vendor, airlines, origin, destination)` ([`20260503000002-pnl-generated-columns-pricing.ts:40-64`](../../../apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts)). View men-join master ini ke booking dengan `s.vendor = b.vendor` ([`20260816000001:101-102`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)).

Kedua tabel ini berbeda dan mudah tertukar:

| Tabel | Grain | Peran |
|---|---|---|
| `air_shipments_smu` | vendor × airline × origin × destination | **master** rate card — sumber daftar vendor |
| `air_shipments_smu_rate_cgk_spx` | per AWB | booking; kolom `account` yang jadi `v_pnl_to.vendor` |

## Keputusan Desain

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Revenue di Route Comparison berubah jadi **netto** (`revenue_total − revenue_discount`) | Supaya `Revenue − Cost = Margin` benar secara visual **dan** cocok dengan margin Daily Report. Alternatifnya adalah tabel yang kolomnya tidak bisa dikurangkan, yang sudah pernah butuh caption penjelas. |
| 2 | Margin dalam rupiah saja, tanpa persen | Tabel sudah tumbuh jadi 1+3N kolom; persen per baris tidak stabil saat revenue harian kecil. |
| 3 | Sumbu baris model comparison digeneralisasi ke `rowKey`/`rowLabel` | Vendor Comparison butuh sumbu rute. Tanpa generalisasi, kolom Margin harus ditulis dua kali di dua komponen. |
| 4 | Rename sampai endpoint HTTP, lewat alias dua rilis | FE dan BE naik paralel; alias menghindari jendela 404. |
| 5 | Permission `read.route_group` **tidak** di-rename | `permissions` di-insert insert-only saat boot ([`permissions.service.ts:19-33`](../../../apps/backend/src/modules/permissions/permissions.service.ts)). Rename enum meninggalkan baris lama yatim dan mencabut akses tiap role secara diam-diam. |
| 6 | `picks` diangkat ke state halaman, bukan URL / localStorage | Pola yang sama sudah dipakai `drilldownRoute`. Menghindari masalah encoding nama vendor di URL dan pilihan basi yang "nempel" berhari-hari. |
| 7 | Anggota vendor group disimpan sebagai teks mentah, tanpa normalisasi | View men-join vendor dengan kesetaraan eksak. Pencocokan ternormalisasi akan membuat grup mencocokkan vendor yang perhitungan biayanya sendiri tidak cocokkan. |
| 8 | Sel Vendor Comparison berisi Revenue/Cost/Margin penuh, detail biaya lewat expander | Tiap TO punya tepat satu vendor sehingga revenue terbagi bersih. Expander `COST_COMPONENTS` sudah ada dan menunjukkan porsi SMU yang benar-benar milik vendor itu. |
| 9 | Baris Vendor Comparison = semua pasangan dari `getStations()` | Baris stabil antar periode, sama seperti kolom Daily Report. |
| 10 | Footer kedua = **Avg / Route**, bukan Avg / Day | Sumbu baris bukan lagi tanggal. |
| 11 | `columns` di endpoint vendor dikirim sebagai query param **berulang** | Nama vendor teks bebas dari Google Sheet dan bisa memuat `,` atau `|`, yang merusak parser berbasis delimiter. |
| 12 | Tab Vendor Comparison digerbangi `read.vendor_group` | Meniru gerbang tab Route Comparison. |

## Asumsi

- `picks` **tidak** direset saat periode / date basis berubah. `drilldownRoute` direset karena menyimpan tanggal di dalamnya; `picks` tidak. Mengganti periode lalu membandingkan group yang sama adalah alur normal.
- Menu sidebar "Route Group" dan halaman `/route-groups` tetap bernama demikian — ia memang group berisi rute. Yang di-rename hanya tab perbandingannya.
- Vendor dengan nama kosong / NULL tidak muncul di master, jadi tidak bisa dipilih. Biayanya tidak masuk kolom mana pun (issue `no_booking`).
- Satu vendor boleh berada di lebih dari satu group, seperti rute di route group. Overlap-nya disurfacekan, bukan dilarang.
- Route Comparison tetap memakai parser `columns` yang ada; hanya endpoint vendor yang memakai param berulang. Kode stasiun dijamin bebas `|` dan `,` ([`pnl-columns.util.ts:21-22`](../../../apps/backend/src/modules/pnl/pnl-columns.util.ts)); nama vendor tidak.

## Refactor Fondasi

Model tabel comparison sekarang terkunci ke sumbu tanggal:

- `ComparisonRowModel.date` ([`groupComparison.ts:16-22`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts))
- `openDates` dan `FOOTER_KEY` ([`PnlGroupComparisonTable.tsx:66`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx))
- test id `${field}-${date}-${columnId}`
- skeleton baris dari `calendarDatesForFilter`

Digeneralisasi jadi:

```ts
interface ComparisonRowModel {
  rowKey: string        // '2026-05-01' | 'CGK|SUB'
  rowLabel: string      // '1 Mei' | 'CGK → SUB'
  revenue: (number | null)[]
  cost: (number | null)[]
  margin: (number | null)[]
  warnings: CellWarning[]
  components: Record<CostComponentKey, (number | null)[]>
}
```

Header kolom pertama jadi prop (`Date` / `Route`). `openDates` jadi `openRows`. `formatDayLabel` dipanggil di sisi projeksi (`toRouteComparisonTable`), bukan di dalam renderer, sehingga renderer tidak lagi tahu apa-apa soal tanggal.

`ComparisonTableModel`, `toComparisonTable`, `routeFromComparisonCell`, dan `overlappingRoutes` sudah agnostik terhadap group dan bertahan tanpa perubahan semantik.

## Fitur 4 — Rename ke Route Comparison

Dilakukan pertama supaya fitur berikutnya tidak menulis kode di file yang sebentar lagi berpindah nama.

### Endpoint, tiga langkah

1. Backend melayani `GET /pnl/breakdown/route-comparison` **dan** `group-comparison`, keduanya menunjuk handler yang sama.
2. Frontend pindah ke path baru.
3. Alias `group-comparison` dihapus di rilis berikutnya.

Langkah 1 dan 2 boleh satu PR; langkah 3 harus PR terpisah setelah rilis 1–2 naik penuh.

### Rename di frontend

| Dari | Ke |
|---|---|
| `PnlGroupComparisonView.tsx` (+spec) | `PnlRouteComparisonView.tsx` |
| `PnlGroupComparisonTable.tsx` (+spec) | `PnlComparisonTable.tsx` |
| `utils/groupComparison.ts` (+spec) | `utils/routeComparison.ts` |
| view key `'groups'` | `'routes'` |
| `usePnlGroupComparison` | `usePnlRouteComparison` |
| query key `['pnl','group-comparison',…]` | `['pnl','route-comparison',…]` |

Tabel di-rename jadi `PnlComparisonTable` (bukan `PnlRouteComparisonTable`) karena Vendor Comparison memakai komponen yang sama.

### Copy yang ikut berubah

Label tab ([`page.tsx:181`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>)), `VIEW_SUBTITLE.groups` (`:70`), heading picker `Group` ([`View.tsx:98`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)), empty state (`:140`), error (`:67`), empty-data (`:83`), aria-label group (`:104`), kalimat overlap (`:130`).

Label tab diekspor sebagai konstanta supaya rename berikutnya menyentuh satu tempat; jest saat ini mengassert literalnya.

### Yang **tidak** di-rename

- Permission `read.route_group` — lihat Keputusan #5. Tab tetap digerbangi permission ini walau namanya sudah "Route Comparison".
- Menu sidebar "Route Group", halaman `/route-groups`, modul backend `route-groups`.

## Fitur 1 — Persist pilihan antar tab

`picks` naik dari [`PnlGroupComparisonView.tsx:19`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx) ke `PnlPageContent`, sebelah `drilldownRoute` ([`page.tsx:84`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>)).

Dua set terpisah sejak awal:

```ts
const [routePicks, setRoutePicks] = useState<PnlColumnPick[]>([])
const [vendorPicks, setVendorPicks] = useState<PnlVendorPick[]>([])
```

View jadi controlled (`picks` + `onPicksChange`). Reducer `toggleGroup` dan `setRouteLabels` ([`:32-52`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)) tetap di dalam view tetapi menerima `picks` sebagai argumen dan memanggil `onPicksChange`. Urutan pick tetap urutan kolom.

Effect reset di [`page.tsx:95-97`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>) tidak diubah — ia hanya menyentuh `drilldownRoute`.

Group yang dihapus sejak picker dimuat sudah di-drop di server ([`pnl.service.ts:1043`](../../../apps/backend/src/modules/pnl/pnl.service.ts)). Karena pilihan kini bertahan lebih lama, pick basi juga dibersihkan di client saat daftar group dimuat ulang, sehingga checkbox tidak menunjuk group yang sudah tidak ada.

Spec yang perlu disesuaikan: `PnlGroupComparisonView.spec.tsx` (`:372-393`, `:401-412`) mengasumsikan state internal; `page.spec.tsx:69-75` mem-mock view.

## Fitur 2 — Kolom Margin

### Perubahan angka

| Kolom | Sekarang | Sesudah |
|---|---|---|
| Revenue | `COALESCE(SUM(revenue_total),0)` | `COALESCE(SUM(revenue_total),0) − COALESCE(SUM(revenue_discount),0)` |
| Cost | `COALESCE(SUM(cost_to),0)` | tidak berubah |
| Margin | — | `Revenue(netto) − Cost` |

Setara `gross_profit_to` di view ([`20260816000001:204-206`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)) dan sama dengan margin Daily Report ([`pnl.service.ts:899-900`](../../../apps/backend/src/modules/pnl/pnl.service.ts)).

### Backend

- Fact query [`pnl.service.ts:1090-1116`](../../../apps/backend/src/modules/pnl/pnl.service.ts): tambah `revenue_discount` ke SELECT, ubah ekspresi `revenue`, tambah `margin`.
- `PnlGroupComparisonCell` (`:199-214`) dan `PnlGroupComparisonFooter` (`:221-233`): tambah `margin` / `totalMargin`.
- Agregasi footer JS (`:1170-1202`): tambah `totalMargin`. `avgMarginPerDay` mengikuti pola `avgRevenuePerDay`.

### Frontend

- Tipe wire [`usePnl.ts:223-232`, `:239-250`](../../../apps/frontend/src/features/pnl/hooks/usePnl.ts), dibaca dengan fallback `?? ` mengikuti konvensi rolling deploy ([`groupComparison.ts:56-59`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts)). Selama backend lama masih melayani, `margin` absen — sel menampilkan `—`, bukan `NaN`.
- Blok header ketiga di renderer, dan `(['revenue','cost'] as const)` ([`Table.tsx:168`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)) jadi `(['revenue','cost','margin'] as const)`. Test id ikut tergeneralisasi.
- Margin negatif diwarnai merah, meniru `highlightNegative` ([`dailyMatrix.ts:26`](../../../apps/frontend/src/features/pnl/utils/dailyMatrix.ts)) dan `cellClass` ([`PnlMatrixTable.tsx:43-47`](../../../apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx)).

### Caption

Caption "Revenue di sini bruto … tidak dimaksudkan untuk dikurangkan" ([`View.tsx:158-159`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)) dihapus. Diganti catatan bahwa Revenue kini netto, sehingga angkanya lebih rendah dari rilis sebelumnya sebesar `revenue_discount`.

## Fitur 3 — Vendor Group

### Data Model

Migrasi baru, timestamp > `20260816000002`:

```sql
CREATE TABLE vendor_groups (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_vendor_groups PRIMARY KEY (id),
  CONSTRAINT uq_vendor_groups_name UNIQUE (name)
);

CREATE TABLE vendor_group_vendors (
  vendor_group_id UUID NOT NULL,
  vendor          TEXT NOT NULL,
  CONSTRAINT pk_vendor_group_vendors PRIMARY KEY (vendor_group_id, vendor),
  CONSTRAINT fk_vendor_group_vendors_group
    FOREIGN KEY (vendor_group_id) REFERENCES vendor_groups(id) ON DELETE CASCADE
);

CREATE INDEX idx_vendor_group_vendors_group ON vendor_group_vendors(vendor_group_id);
```

Tanpa `organization_id`, tanpa soft delete — mengikuti [`20260816000002-route-groups.ts`](../../../apps/backend/src/database/migrations/20260816000002-route-groups.ts).

### Backend

Modul `apps/backend/src/modules/vendor-groups/` menyalin 9 file dari [`route-groups/`](../../../apps/backend/src/modules/route-groups/): dua entity, `CreateVendorGroupDto` (`@ArrayMinSize(1)`, `@ValidateNested`), `UpdateVendorGroupDto` all-optional tulisan tangan, controller 5 route dengan `@Authorize` per method dan `@HttpCode(204)` pada DELETE, service dengan raw-SQL read, delete-then-insert anak dalam transaksi, pre-check nama + remap PG `23505`, dan `''`→`null` pada description. Daftarkan di `app.module.ts`.

`GET /vendor-groups/available-vendors` meniru pola master ∪ used di [`route-groups.service.ts:42-69`](../../../apps/backend/src/modules/route-groups/route-groups.service.ts):

```sql
WITH master AS (
  SELECT DISTINCT BTRIM(vendor) AS vendor
  FROM air_shipments_smu
  WHERE NULLIF(BTRIM(vendor), '') IS NOT NULL
),
used AS (
  SELECT DISTINCT BTRIM(vendor) AS vendor
  FROM v_pnl_to
  WHERE NULLIF(BTRIM(vendor), '') IS NOT NULL
)
SELECT m.vendor, (u.vendor IS NOT NULL) AS has_data
FROM master m LEFT JOIN used u ON u.vendor = m.vendor
ORDER BY m.vendor
```

`assertVendorsExist` menolak vendor di luar master, meniru `assertRoutesExist` ([`:178-186`](../../../apps/backend/src/modules/route-groups/route-groups.service.ts)).

Catatan: `v_pnl_to` adalah materialized view yang hanya di-refresh saat sheet sync ([`air-shipments.service.ts:1143`](../../../apps/backend/src/modules/air-shipments/air-shipments.service.ts)) dan upload settlement ([`pnl-settlement.service.ts:125`](../../../apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts)). Vendor baru muncul di master segera, tetapi `hasData`-nya menyusul setelah refresh.

### Permission

Empat member baru di [`packages/shared/src/auth/index.ts`](../../../packages/shared/src/auth/index.ts) setelah `:93`:

```ts
READ_VENDOR_GROUP   = 'read.vendor_group',
CREATE_VENDOR_GROUP = 'create.vendor_group',
UPDATE_VENDOR_GROUP = 'update.vendor_group',
DELETE_VENDOR_GROUP = 'delete.vendor_group',
```

Sesuai CHECK constraint `^(read|create|update|delete)\.[a-z][a-z0-9_]*$` ([`20260314000004-create-roles-permissions.ts:31-32`](../../../apps/backend/src/database/migrations/20260314000004-create-roles-permissions.ts)).

Panel Roles mengelompokkan berdasarkan `name.split('.')[1]` ([`role-permissions-panel.tsx:56-61`](../../../apps/frontend/src/features/roles/components/role-permissions-panel.tsx)), jadi seksi "vendor_group" muncul tanpa kerja frontend.

### Frontend

`features/vendor-groups/` (types, hooks berkunci `['vendor-groups']`, `VendorPicker`, `VendorGroupForm`, `DeleteVendorGroupDialog`) dan halaman `/vendor-groups` menyalin struktur route-groups. Validasi manual, tanpa Zod — di app ini hanya form login yang memakai Zod.

Sidebar: entri baru setelah [`sidebar.tsx:155`](../../../apps/frontend/src/components/layout/sidebar.tsx), digerbangi `read.vendor_group`, di dalam grup "Air Shipments" bersebelahan dengan Route Group.

## Fitur 5 — Tab Vendor Comparison

### Kontrak API

```
GET /pnl/breakdown/vendor-comparison
  ?cycle=2026-05-1H | ?start=…&end=…
  &basis=…
  &columns=vg:<uuid>
  &columns=v:<nama vendor mentah>
  &columns=…
```

`columns` adalah query param **berulang**. Tiap nilai dipecah di titik dua **pertama** saja, sehingga nama vendor yang memuat `:`, `,`, atau `|` aman. Urutan param = urutan kolom. Parser baru `parseVendorColumnPicks` di [`pnl-columns.util.ts`](../../../apps/backend/src/modules/pnl/pnl-columns.util.ts), terpisah dari `parseColumnPicks` yang tetap melayani Route Comparison.

Group yang dihapus antara picker dimuat dan request dikirim di-drop, meniru [`pnl.service.ts:1043`](../../../apps/backend/src/modules/pnl/pnl.service.ts).

### Agregasi

```sql
WITH col_vendors(col_idx, vendor) AS (
  SELECT * FROM UNNEST($n::int[], $n+1::text[])
)
SELECT
  v.origin_station,
  v.dest_station,
  cv.col_idx,
  COALESCE(SUM(v.revenue_total),0) - COALESCE(SUM(v.revenue_discount),0)  AS revenue,
  COALESCE(SUM(v.cost_to),0)                                             AS cost,
  COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)                      AS cost_smu,
  COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)                      AS cost_ra,
  COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
           FILTER (WHERE v.cost_to IS NOT NULL), 0)                      AS cost_sg_out,
  COALESCE(SUM(COALESCE(v.cost_sg_in_to,0))
           FILTER (WHERE v.cost_to IS NOT NULL), 0)                      AS cost_sg_in,
  COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int                         AS incomplete_tos
FROM v_pnl_to v
JOIN col_vendors cv ON cv.vendor = v.vendor
WHERE <buildFilter>
GROUP BY 1, 2, 3
```

`margin = revenue − cost` dihitung di JS, satu tempat dengan Fitur 2.

Prorata `weight_share` dipakai untuk komponen biaya, bukan `MAX(cost_smu_awb) GROUP BY awb` seperti [`getCostByVendor:657-668`](../../../apps/backend/src/modules/pnl/pnl.service.ts). Rollup per-AWB itu tidak bisa membawa kunci rute: AWB yang TO-nya melintasi dua pasangan stasiun akan memposting biaya penuhnya ke kedua rute.

Issue diambil lewat satu query `GROUPING SETS ((origin_station, dest_station, col_idx, issue), (col_idx, issue))` dan `indexIssueRows` ([`pnl-cell-issues.util.ts:46-61`](../../../apps/backend/src/modules/pnl/pnl-cell-issues.util.ts)), meniru Route Comparison.

### Baris dan footer

Baris = semua pasangan dari `getStations()` ([`pnl.service.ts:259-271`](../../../apps/backend/src/modules/pnl/pnl.service.ts)), termasuk yang kosong. `rowKey = '<origin>|<dest>'`, `rowLabel = '<originLabel> → <dest>'` lewat `displayRouteLabel` yang sudah ada.

Footer dua baris:

| Baris | Definisi |
|---|---|
| Total | jumlah seluruh sel kolom itu |
| Avg / Route | Total ÷ jumlah rute yang **ada datanya** untuk kolom itu |

Pembagi memakai jumlah rute berisi, bukan jumlah baris — membagi dengan baris em-dash akan mengencerkan angka tanpa alasan. Kolom tanpa data sama sekali menghasilkan `—`, bukan pembagian nol.

### Klik sel → drilldown

Sel adalah (kolom vendor × rute × seluruh periode). `GET /pnl/awb-drilldown` mendapat parameter `vendor` berulang — kolom group membawa banyak vendor. `getAwbDrilldown` sudah `GROUP BY awb, vendor, airline` ([`:433`](../../../apps/backend/src/modules/pnl/pnl.service.ts)) dan `PnlAwbDrilldown` sudah menampilkan kolom vendor per baris ([`:277`](../../../apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx)), jadi yang ditambah hanya klausa WHERE, param di `routeToParams` ([`usePnl.ts:298-307`](../../../apps/frontend/src/features/pnl/hooks/usePnl.ts)), dan field di `PnlRouteFilter`.

Klik sel memanggil `applyDrilldownRoute` dengan `routes: [rute baris]`, `vendors: [vendor kolom]`, dan batas tanggal periode penuh.

### Frontend

- `PnlView` jadi `'estimate' | 'actual' | 'daily' | 'routes' | 'vendors'`, plus entri `VIEW_SUBTITLE`.
- Tombol tab kelima. Baris tab di [`page.tsx:157`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>) sekarang `w-fit` tanpa wrap — diberi `flex-wrap` karena lima label termasuk "Actual vs Estimate" dan "Vendor Comparison" tidak muat di viewport sempit.
- Gerbang ganda meniru [`:103-107`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>) dan `:176-183`: tombol disembunyikan tanpa `read.vendor_group`, dan effect backstop memindahkan `view` keluar dari `'vendors'` kalau permission hilang.
- `usePnlVendorComparison` berkunci `['pnl','vendor-comparison',filter,picks]`, `enabled: !!filter && picks.length > 0`.
- `PnlVendorComparisonView` dengan picker group vendor (checkbox) + picker vendor satuan (`MultiVendorFilter`, menyalin [`multi-route-filter.tsx`](../../../apps/frontend/src/components/shared/multi-route-filter.tsx)).
- `toVendorComparisonTable` memproyeksikan ke `ComparisonTableModel` yang sudah digeneralisasi; renderer `PnlComparisonTable` dipakai apa adanya dengan `firstColumnHeader="Route"`.

### Catatan wajib di UI

1. Banner overlap kalau satu vendor ada di lebih dari satu group terpilih — analog [`overlappingRoutes`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts) dan banner di [`View.tsx:124-134`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx).
2. Kolom tidak menjumlah ke total rute: TO tanpa booking (`vendor IS NULL` → issue `no_booking`) tidak masuk kolom mana pun, dan kolom yang overlap dihitung ganda.

### Index

Migrasi terpisah, `CREATE INDEX IF NOT EXISTS` pada matview:

```sql
CREATE INDEX IF NOT EXISTS idx_v_pnl_to_vendor ON v_pnl_to(vendor);
CREATE INDEX IF NOT EXISTS idx_v_pnl_to_route  ON v_pnl_to(origin_station, dest_station);
```

Belum ada satu pun index untuk kolom-kolom ini ([`20260816000001:30-39`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), sehingga grouping vendor × rute jadi seq scan penuh. Dibuat sebagai migrasi terpisah, bukan dengan mengubah migrasi view, agar tidak perlu DROP dan recreate seluruh matview beserta delapan index-nya.

## Urutan Kerja

```
Fitur 4 (rename)  →  Fitur 1 (angkat state)  →  Fitur 2 (margin)  →  Fitur 3 (vendor group)  →  Fitur 5
       │                                              │                                            │
       └── refactor rowKey/rowLabel ikut di sini ─────┴────────────────────────────────────────────┘
```

- Fitur 4 duluan supaya Fitur 2 tidak menulis kolom Margin di file yang sebentar lagi di-rename.
- Refactor `rowKey`/`rowLabel` masuk bersama Fitur 4, sebelum Fitur 2, supaya Margin cukup ditulis sekali.
- Fitur 3 memblokir Fitur 5.
- Penghapusan alias `group-comparison` adalah PR terakhir, setelah rilis yang memuat Fitur 4 naik penuh.

## Rencana Pengujian

Gate: `pnpm exec tsc --noEmit` di kedua app, plus jest. `next lint` sudah rusak sebelum pekerjaan ini (`role-permissions-panel.tsx`) dan bukan gate. Suite backend butuh `NODE_OPTIONS="--max-old-space-size=5120"` **dan** `--runInBand`.

| Area | Uji |
|---|---|
| Refactor fondasi | `routeComparison.spec.ts` — projeksi `rowKey`/`rowLabel` untuk sumbu tanggal tetap sama seperti sebelumnya |
| Fitur 4 | spec yang mengassert literal "Group Comparison" diperbarui ke "Route Comparison"; controller spec membuktikan **kedua** path melayani handler yang sama |
| Fitur 1 | pindah tab lalu kembali mempertahankan pick dan urutannya; ganti periode **tidak** menghapus pick; pick group yang sudah dihapus dibersihkan saat daftar dimuat ulang |
| Fitur 2 | service spec: revenue netto = `revenue_total − revenue_discount`, margin = revenue − cost; projeksi memberi `—` (bukan `NaN`) saat `margin` absen dari response backend lama; margin negatif berwarna merah |
| Fitur 3 | service spec: nama duplikat → 409; vendor di luar master ditolak; delete-then-insert anak; `available-vendors` menandai `hasData` dengan benar. Tiga spec komponen meniru route-groups |
| Fitur 5 | integration spec meniru [`pnl-group-comparison.integration.spec.ts`](../../../apps/backend/src/modules/pnl/pnl-group-comparison.integration.spec.ts): agregasi vendor × rute; nama vendor mengandung `,`/`|`/`:` bertahan lewat param berulang; AWB yang TO-nya melintasi dua rute terbagi menurut `weight_share` dan tidak dihitung penuh di kedua rute; Avg / Route membagi dengan rute berisi; kolom overlap terdeteksi |
| Drilldown | filter `vendor` mempersempit hasil; tanpa `vendor` perilaku lama tidak berubah |

Route Comparison dan Vendor Comparison sama-sama belum punya e2e. Cakupan ini tidak dinaikkan di paket ini — konsisten dengan route groups yang punya tiga spec komponen tanpa page spec maupun e2e.

## Risiko & Catatan

1. **Permission baru tidak otomatis aktif.** Empat member `*.vendor_group` hanya terdaftar setelah backend restart ([`permissions.service.ts:19-33`](../../../apps/backend/src/modules/permissions/permissions.service.ts)) dan tidak diberikan ke role mana pun. Menu Vendor Group dan tab Vendor Comparison tak terlihat oleh siapa pun — termasuk admin — sampai di-grant manual di Settings → Roles. Masuk skrip QA dan rilis.
2. **Angka Revenue turun** di Route Comparison setelah Fitur 2, sebesar `revenue_discount`. Perlu diumumkan; screenshot lama tidak akan cocok.
3. **Vendor Comparison tidak akan rekonsiliasi** dengan panel "Cost by Vendor" di tab Estimated, dan tidak bisa dibuat cocok. Panel itu memakai rollup per-AWB yang tidak bisa membawa kunci rute; tab baru memakai prorata `weight_share`. Perbedaan ini by design.
4. **Nama vendor bisa berubah di sheet kapan saja** dan group yang memakainya akan diam-diam mengosong. Tidak ada deteksi. Indikator "vendor tidak ditemukan lagi" di halaman Vendor Group adalah kandidat lanjutan, di luar cakupan paket ini.
5. **Margin optimistis.** `COALESCE(SUM(cost_to),0)` memperlakukan TO tanpa biaya sebagai gratis. Setiap sel margin baru mewarisi sifat ini; `incompleteTos` adalah satu-satunya sinyal, disurfacekan lewat tint warning yang sudah ada.
6. **Rolling deploy.** FE dan BE naik paralel. Setiap field response baru dibaca dengan fallback `?? ` di titik projeksinya.
7. **Pertumbuhan horizontal.** Route Comparison jadi 1+3N kolom; Vendor Comparison 1+3N kolom dengan baris sebanyak seluruh pasangan stasiun. Hanya kolom pertama yang sticky-left ([`Table.tsx:112-117`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)). Perlu diperiksa di viewport sempit sebelum merge.
8. `weight_share` NULL saat `sum_gw_per_awb = 0` ([`20260816000001:167`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)). Baris seperti ini juga membuat `cost_to` NULL, sehingga sudah tertangkap `incompleteTos` — tidak butuh penanganan tambahan, tetapi diverifikasi lewat test.

## Di Luar Cakupan

- Group vendor yang mencakup counterparty selain vendor SMU. RA (`ra_name`) dan SG Out (`sg_out`) adalah pihak berbeda dan bukan kolom `v_pnl_to`; mendukungnya mengubah bentuk data model dan Fitur 5.
- Normalisasi nama vendor (`vendor_norm`) dan deteksi vendor yang hilang dari master.
- Persist pilihan lewat URL atau localStorage.
- Kolom Margin % di tab comparison mana pun.
- E2E untuk tab comparison.
- Rename permission `read.route_group`, menu Route Group, atau modul backend `route-groups`.
