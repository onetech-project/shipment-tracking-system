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

`v_pnl_to` sudah memuat `vendor` per baris TO ([`20260816000001-pnl-station-lookup.ts:195`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), berasal dari `booking.account`. Bersama `origin_station` / `dest_station` dan kolom biaya yang ada, biaya per vendor per rute bisa dihitung tanpa mengubah view.

`air_shipments_smu` adalah master data vendor: tabel rate card SMU dengan kolom `vendor`, `airlines`, `origin`, `destination` dan unique index `idx_smu_lookup(vendor, airlines, origin, destination)` ([`20260503000002-pnl-generated-columns-pricing.ts:40-64`](../../../apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts)). View men-join master ini ke booking dengan `s.vendor = b.vendor` ([`20260816000001:101-102`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)).

Kedua tabel ini berbeda dan mudah tertukar:

| Tabel | Grain | Peran |
|---|---|---|
| `air_shipments_smu` | vendor × airline × origin × destination | **master** rate card — sumber daftar vendor |
| `air_shipments_smu_rate_cgk_spx` | per AWB | booking; kolom `account` yang jadi `v_pnl_to.vendor` |

### Cakupan vendor — diukur, bukan diasumsikan

Diukur pada database saat ini (`v_pnl_to`: 66.203 baris):

| Ukuran | Nilai |
|---|---|
| TO dengan `vendor IS NULL` (issue `no_booking`) | 57.006 dari 66.203 (86%) |
| TO dengan vendor | 9.197 |
| Di cycle `2026-05-1H` (satu-satunya yang punya booking) | 9.197 dari 29.890 TO = **30,8% TO / 30,2% `revenue_total`** |
| Distinct `vendor` di `v_pnl_to` | 3 |

**Konsekuensi:** Vendor Comparison memakai inner join ke daftar vendor, jadi ia hanya bisa menjelaskan sekitar sepertiga aktivitas periode. Ini bukan bug dan tidak bisa diperbaiki dari sisi tab — datanya memang belum ada booking-nya. Karena itu tab wajib membawa indikator cakupan (lihat [Indikator cakupan](#indikator-cakupan)).

**Diukur 2026-08-22 — vendor di `v_pnl_to` yang tidak ada di `air_shipments_smu`: 0.** Union tetap dipakai apa pun angkanya: ia snapshot satu sheet sync, bukan sifat skema.

```sql
SELECT count(*) FROM (
  SELECT DISTINCT vendor FROM v_pnl_to          WHERE vendor IS NOT NULL AND vendor <> ''
  EXCEPT
  SELECT DISTINCT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> ''
) x;
```

Filter `<> ''` ada di kedua sisi supaya angkanya terdefinisi atas himpunan yang sama dengan `available-vendors`, yang juga membuang nama kosong. Tanpa itu, TO bernama vendor `''` akan terhitung sebagai orphan di sini tapi tidak pernah muncul di endpoint, dan selisihnya terbaca sebagai bug di query union. **Koreksi, diukur 2026-08-22:** baris seperti itu **nol** di seluruh view — draf awal spec ini menyatakan "yang memang ada" tanpa mengukurnya. Filter tetap dipasang karena murah dan menyamakan himpunan kedua angka, bukan karena kasusnya terbukti terjadi.

Angkanya menentukan apakah `available-vendors` boleh master-only. Route Group aman master-only hanya karena containment-nya diukur dan dicatat ([`route-groups.service.ts:38-41`](../../../apps/backend/src/modules/route-groups/route-groups.service.ts)); vendor belum punya bukti setara.

Perlu diluruskan: issue `smu_rate_missing` **bukan** bukti bahwa ada vendor ter-booking yang absen dari master. Issue itu menyala saat `cost_smu_awb IS NULL` ([`20260816000001:209`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), dan `cost_smu_awb` berasal dari join empat kolom `s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest` ([`:101-102`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)) — meleset di airline, origin, atau destination menghasilkan issue yang sama dengan vendor yang justru ada di master. Diukur: 56 baris ber-`smu_rate_missing` punya vendor yang ada di `air_shipments_smu`, dan query containment di atas mengembalikan 0.

Union sejati tetap dipilih, tapi alasannya bukan itu: master adalah snapshot Google Sheet yang ditulis ulang setiap sync, jadi containment yang diukur hari ini adalah fakta tentang isi sheet hari ini, bukan tentang skema. Union tidak memakan biaya apa pun dan menghapus ketergantungan pada pengukuran itu — lihat [Backend Fitur 3](#backend).

## Keputusan Desain

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Revenue tetap **bruto**; Margin = `SUM(revenue_total) − SUM(revenue_discount) − SUM(cost_to)` | Definisi ini identik dengan Daily Report, ranking rute, dan KPI summary. Menetto-kan Revenue hanya di tab comparison akan menutup satu ketidakcocokan dan membuka yang lain: header "Revenue" akan berarti dua hal berbeda di dua tab bersebelahan. |
| 2 | Margin rupiah saja, tanpa persen | Tabel sudah tumbuh jadi 1+3N kolom; persen per baris tidak stabil saat revenue harian kecil. |
| 3 | Sumbu baris model comparison digeneralisasi ke `rowKey`/`rowLabel`, kolom ke `ComparisonColumn` | Vendor Comparison butuh sumbu rute dan kolom vendor. Tanpa generalisasi, kolom Margin harus ditulis dua kali. |
| 4 | Rename sampai endpoint HTTP, lewat alias `@Get([...])` dua rilis | FE dan BE naik paralel; alias menghindari jendela 404. |
| 5 | Permission `read.route_group` **tidak** di-rename | `permissions` di-insert insert-only saat boot ([`permissions.service.ts:19-33`](../../../apps/backend/src/modules/permissions/permissions.service.ts)). Rename enum meninggalkan baris lama yatim dan mencabut akses tiap role secara diam-diam. |
| 6 | `picks` diangkat ke state halaman, bukan URL / localStorage | Pola yang sama sudah dipakai `drilldownRoute`. Menghindari masalah encoding nama vendor di URL dan pilihan basi yang "nempel" berhari-hari. |
| 7 | Nama vendor dipakai **mentah** (raw) dari ujung ke ujung — tanpa BTRIM, tanpa lowercase | Nilai yang dipilih user, yang disimpan, dan yang di-join harus byte-identical dengan `v_pnl_to.vendor`, sehingga `has_data` dan agregasi tidak pernah bisa berbeda pendapat. Menormalkan satu sisi saja adalah bug diam. |
| 8 | Sel Vendor Comparison berisi Revenue/Cost/Margin, detail biaya lewat expander | Tiap TO punya **paling banyak** satu vendor, jadi antar kolom vendor tidak ada dobel hitung. Expander `COST_COMPONENTS` sudah ada dan menunjukkan porsi SMU yang benar-benar milik vendor itu. |
| 9 | Baris Vendor Comparison = semua pasangan dari `getStations()` | Baris stabil antar periode, sama seperti kolom Daily Report. |
| 10 | Footer kedua = **Avg / Route**, dibagi jumlah rute yang selnya non-null | Sumbu baris bukan lagi tanggal. Divisor dihitung di service dan ikut dikirim, supaya slot footer yang sama tidak berarti dua hal berbeda di dua tab. |
| 11 | `columns` di endpoint vendor dikirim sebagai query param **berulang** | Nama vendor teks bebas dari Google Sheet dan bisa memuat `,` atau `|`, yang merusak parser berbasis delimiter. |
| 12 | Tab Vendor Comparison digerbangi `read.vendor_group` **di UI saja** | Persis seperti Route Comparison hari ini: endpoint `/pnl/breakdown/*` hanya butuh `read.pnl`; yang benar-benar dijaga adalah daftar group-nya. Mengubah ini butuh `@Authorize` multi-permission — di luar cakupan. |
| 13 | Tidak ada migrasi index baru pada `v_pnl_to` | EXPLAIN membuktikan tidak ada seq scan di cycle mode — lihat [Performa](#performa). |

## Asumsi

- `picks` **tidak** direset saat periode / date basis berubah. `drilldownRoute` direset karena menyimpan tanggal di dalamnya; `picks` tidak.
- Menu sidebar "Route Group" dan halaman `/route-groups` tetap bernama demikian — ia memang group berisi rute. Yang di-rename hanya tab perbandingannya.
- Satu vendor boleh berada di lebih dari satu group, seperti rute di route group. Overlap-nya disurfacekan, bukan dilarang.
- Route Comparison tetap memakai parser `columns` yang ada; hanya endpoint vendor yang memakai param berulang. Kode stasiun dijamin bebas `|` dan `,` ([`pnl-columns.util.ts:21-22`](../../../apps/backend/src/modules/pnl/pnl-columns.util.ts)); nama vendor tidak.

## Refactor Fondasi

### Sumbu baris

Model tabel comparison sekarang terkunci ke tanggal:

- `ComparisonRowModel.date` ([`groupComparison.ts:16-22`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts))
- `openDates` ([`Table.tsx:66`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)) dan call site-nya di `:164-165`, `:198`
- test id `${field}-${date}-${columnId}`
- skeleton baris dari `calendarDatesForFilter`

`FOOTER_KEY` ([`Table.tsx:19`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)) sudah netral — `'__footer__'` tidak bertabrakan dengan tanggal maupun `'CGK|SUB'` — dan hanya ikut di-rename demi konsistensi.

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

interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  margin: (number | null)[]        // baru — footer ikut 3 blok
  components: Record<CostComponentKey, (number | null)[]> | null
  warnings: CellWarning[] | null
}
```

### Sumbu kolom

`ComparisonTableModel.columns` sekarang bertipe `PnlGroupComparisonColumn` yang mewajibkan `routes` dan `routeCount` ([`usePnl.ts:201-210`](../../../apps/frontend/src/features/pnl/hooks/usePnl.ts)). Kolom vendor tidak punya rute. Renderer sendiri hanya membaca `column.id` dan `column.name` ([`Table.tsx:132-147`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)), jadi tipe minimum strukturalnya:

```ts
export interface ComparisonColumn { id: string; name: string }

export interface ComparisonTableModel<TColumn extends ComparisonColumn = ComparisonColumn> {
  columns: TColumn[]
  rows: ComparisonRowModel[]
  footerRows: ComparisonFooterRowModel[]
}
```

Tiap view membawa tipe kolomnya sendiri: `PnlRouteComparisonColumn` (yang ada sekarang, dengan `routes`) dan `PnlVendorComparisonColumn` (dengan `vendors: string[]`, `vendorCount`, `kind: 'group' | 'vendor'`).

### Kontrak klik

```ts
onCellClick?: (column: TColumn, rowKey: string) => void
```

Argumen kedua kini `rowKey` opaque yang **view**-lah yang menafsirkan:

- Route Comparison memanggil `routeFromComparisonCell(column, rowKey)` — `rowKey` kebetulan sebuah tanggal, jadi fungsi ini tidak berubah isinya.
- Vendor Comparison memanggil `routeFromVendorComparisonCell(column, rowKey, periodBounds)` — memecah `rowKey` di `|` pertama dan mengisi `dateFrom`/`dateTo` dari batas periode, bukan dari baris.

### Copy di renderer

`cellTitle` menempelkan kalimat berhardcode `'Lihat AWB kolom ini pada tanggal ini'` ke setiap sel yang bisa diklik ([`Table.tsx:30-34`, `:178`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)). Sel Vendor Comparison mencakup seluruh periode, jadi kalimat itu akan salah di setiap sel tab baru. `cellHint` jadi prop: Route Comparison mengirim kalimat lama, Vendor Comparison mengirim `'Lihat AWB kolom ini pada rute ini'`. `DateCell` di-rename `RowHeaderCell`, dan `formatDayLabel` dipanggil di sisi projeksi. Barulah renderer benar-benar tidak tahu apa-apa soal tanggal.

### Yang berubah, bukan yang bertahan

- `overlappingRoutes` bertahan untuk sumbu rute, dan mendapat saudara `overlappingVendors`.
- `toComparisonTable` di-rename `toRouteComparisonTable` dan **berubah** (rowKey/rowLabel, margin).
- `routeFromComparisonCell` bertahan apa adanya.

## Fitur 4 — Rename ke Route Comparison

Dilakukan pertama supaya fitur berikutnya tidak menulis kode di file yang sebentar lagi berpindah nama.

### Endpoint

Nest tidak bisa menumpuk dua dekorator `@Get` pada satu method. Implementasinya array path:

```ts
@Get(['breakdown/route-comparison', 'breakdown/group-comparison'])
```

Urutan deploy — arah proteksinya perlu diperjelas, karena alias melindungi *FE lama → BE baru*, bukan sebaliknya:

1. **BE yang memuat alias harus sudah naik penuh** sebelum build FE yang pindah path dirilis. Kalau tidak, FE baru menabrak BE lama dan dapat 404 di path baru.
2. FE pindah ke path baru.
3. Alias `group-comparison` dihapus di PR terpisah, setelah rilis 1–2 naik penuh.

### Rename di frontend

| Dari | Ke |
|---|---|
| `PnlGroupComparisonView.tsx` (+spec) | `PnlRouteComparisonView.tsx` |
| `PnlGroupComparisonTable.tsx` (+spec) | `PnlComparisonTable.tsx` |
| `utils/groupComparison.ts` (+spec) | `utils/routeComparison.ts` |
| view key `'groups'` | `'routes'` |
| `usePnlGroupComparison` | `usePnlRouteComparison` |
| query key `['pnl','group-comparison',…]` | `['pnl','route-comparison',…]` |

Tabel jadi `PnlComparisonTable` (bukan `PnlRouteComparisonTable`) karena Vendor Comparison memakai komponen yang sama.

### Copy yang ikut berubah

Label tab ([`page.tsx:181`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>)), `VIEW_SUBTITLE.groups` (`:70`), heading picker `Group` ([`View.tsx:98`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)), empty state (`:140`), error (`:67`), empty-data (`:83`), aria-label group (`:104`), kalimat overlap (`:130`).

Label tab diekspor sebagai konstanta supaya rename berikutnya menyentuh satu tempat.

### Yang **tidak** di-rename

Permission `read.route_group` (Keputusan #5), menu sidebar "Route Group", halaman `/route-groups`, modul backend `route-groups`.

## Fitur 1 — Persist pilihan antar tab

`picks` naik dari [`View.tsx:19`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx) ke `PnlPageContent`, sebelah `drilldownRoute` ([`page.tsx:84`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>)):

```ts
export type PnlVendorPick =
  | { kind: 'group';  id: string }
  | { kind: 'vendor'; name: string }

const [routePicks,  setRoutePicks]  = useState<PnlColumnPick[]>([])
const [vendorPicks, setVendorPicks] = useState<PnlVendorPick[]>([])
```

View jadi controlled (`picks` + `onPicksChange`). Reducer `toggleGroup` dan `setRouteLabels` ([`:32-52`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)) tetap di dalam view tetapi menerima `picks` sebagai argumen. Urutan pick tetap urutan kolom. Effect reset di [`page.tsx:95-97`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>) tidak diubah — ia hanya menyentuh `drilldownRoute`.

### Pembersihan pick basi

Group yang dihapus sejak picker dimuat sudah di-drop di server ([`pnl.service.ts:1043`](../../../apps/backend/src/modules/pnl/pnl.service.ts)). Karena pilihan kini bertahan lebih lama, pick group juga dibersihkan di client — **tetapi hanya setelah daftar benar-benar termuat**:

```ts
useEffect(() => {
  if (!groups) return   // undefined = cold cache atau error, bukan "tidak ada group"
  setPicks((prev) => prev.filter((p) => p.kind !== 'group' || groups.some((g) => g.id === p.id)))
}, [groups])
```

Penjagaan `if (!groups) return` bukan opsional. [`useRouteGroups.ts:5-12`](../../../apps/frontend/src/features/route-groups/hooks/useRouteGroups.ts) tidak punya `initialData`, dan `gcTime` default react-query 5 menit ([`query-provider.tsx:9-16`](../../../apps/frontend/src/shared/providers/query-provider.tsx)). Setelah user lebih dari 5 menit di tab lain, query-nya di-GC dan view remount dengan `groups === undefined` — tanpa penjagaan ini, seluruh fitur justru terhapus persis di kasus yang ia ada untuk melayani.

Pick vendor mentah (`kind: 'vendor'`) **tidak** dibersihkan. Nama vendor bisa hilang dari sheet kapan saja (Risiko #4) dan tidak ada cara membedakan "vendor dihapus" dari "sheet belum ter-sync". Pick semacam itu merender kolom kosong, yang jujur dan bisa diperbaiki user sendiri.

## Fitur 2 — Kolom Margin

### Perubahan angka

| Kolom | Ekspresi |
|---|---|
| Revenue | `COALESCE(SUM(revenue_total),0)` — **tidak berubah, tetap bruto** |
| Cost | `COALESCE(SUM(cost_to),0)` — tidak berubah |
| Margin | `COALESCE(SUM(revenue_total),0) − COALESCE(SUM(revenue_discount),0) − COALESCE(SUM(cost_to),0)` |

Ekspresi Margin identik karakter-per-karakter dengan Daily Report ([`pnl.service.ts:899-900`](../../../apps/backend/src/modules/pnl/pnl.service.ts)), dan konvensi yang sama dipakai ranking rute (`:846-855`) serta `getSummary` (`:286`). Jadi Revenue **dan** Margin sama-sama cocok lintas tab.

> **Bukan** setara `SUM(gross_profit_to)`. Kolom `gross_profit_to` di view bersifat NULL-propagating ([`20260816000001:202-206`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), sedangkan `COALESCE(SUM(...))` melewati baris NULL. Diukur pada data sekarang: ekspresi di atas = 13.381.411.758, `SUM(gross_profit_to)` = 178.011.287 — beda 75×, karena 56.191 dari 66.203 baris punya `gross_profit_to IS NULL`. Per baris identitasnya tetap berlaku untuk TO dengan `cost_to IS NOT NULL`. Test harus ditulis terhadap ekspresi Daily Report, bukan terhadap `SUM(gross_profit_to)`.

Karena Revenue bruto, `Revenue − Cost ≠ Margin` secara visual — selisihnya `revenue_discount`. Caption yang ada ([`View.tsx:158-159`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx)) karena itu **dipertahankan dan diperbarui**, bukan dihapus: ia menjelaskan tepat selisih ini, dan sekarang ada kolom Margin yang membuat pertanyaannya makin mudah muncul.

### Backend

- Fact query [`pnl.service.ts:1090-1116`](../../../apps/backend/src/modules/pnl/pnl.service.ts): tambah ekspresi `margin`. `revenue` tidak disentuh.
- `PnlGroupComparisonCell` (`:199-214`) dan `PnlGroupComparisonFooter` (`:221-233`): tambah `margin` / `totalMargin` / `avgMarginPerDay`.
- Agregasi footer JS (`:1170-1202`): tambah `totalMargin`, `avgMarginPerDay` mengikuti pola `avgRevenuePerDay`.

### Frontend — tiga tempat, bukan satu

Renderer memancarkan sel nilai di **tiga** tempat. Mengubah satu saja membuat tabel de-align:

| Tempat | Sekarang | Jadi |
|---|---|---|
| Body row ([`Table.tsx:168`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)) | `(['revenue','cost'] as const)` | `(['revenue','cost','margin'] as const)`, diekstrak jadi konstanta `FIELDS` |
| Detail row (`:92-96`) | satu blok kosong `Array.from({length: groupCount})` sebelum blok cost | **dua** blok kosong — satu sebelum, satu sesudah |
| Footer (`:220`, `:229`) | `footerRow.revenue.map` lalu `footerRow.cost.map` literal | loop atas `FIELDS` yang sama |

Selain itu: tipe wire [`usePnl.ts:223-232`, `:239-250`](../../../apps/frontend/src/features/pnl/hooks/usePnl.ts) dibaca dengan fallback `?? ` mengikuti konvensi rolling deploy ([`groupComparison.ts:56-59`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts)) — selama backend lama masih melayani, `margin` absen dan projeksi mengembalikan `null`, yang dirender `formatValue` sebagai `—`.

Margin negatif diwarnai merah lewat cabang `field === 'margin'` di dalam flatMap, meniru `cellClass` ([`PnlMatrixTable.tsx:43-47`](../../../apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx)). `WARNING_TINT` tetap menang di atas warna negatif.

## Fitur 3 — Vendor Group

### Data Model

Migrasi baru, timestamp > `20260816000002`, kelas `VendorGroups<timestamp> implements MigrationInterface` dengan properti `name`:

```sql
CREATE TABLE IF NOT EXISTS vendor_groups (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "pk_vendor_groups"      PRIMARY KEY (id),
  CONSTRAINT "uq_vendor_groups_name" UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS vendor_group_vendors (
  vendor_group_id UUID         NOT NULL,
  vendor          VARCHAR(200) NOT NULL,
  CONSTRAINT "pk_vendor_group_vendors" PRIMARY KEY (vendor_group_id, vendor),
  CONSTRAINT "fk_vendor_group_vendors_group"
    FOREIGN KEY (vendor_group_id) REFERENCES vendor_groups(id) ON DELETE CASCADE
);

-- Melayani lookup arah balik ("group mana saja yang memuat vendor ini") untuk banner overlap.
-- Kolom leading PK sudah melayani arah maju, jadi index atas vendor_group_id akan mubazir.
CREATE INDEX IF NOT EXISTS idx_vendor_group_vendors_vendor
  ON vendor_group_vendors (vendor);
```

`down()` men-drop `vendor_group_vendors` sebelum `vendor_groups`. Tanpa `organization_id`, tanpa soft delete — mengikuti [`20260816000002-route-groups.ts`](../../../apps/backend/src/database/migrations/20260816000002-route-groups.ts), yang juga tidak punya keduanya meski README menyebut CLS org-scoping.

`VARCHAR(200)` dipilih agar nama kelewat panjang jadi 400 yang bersih, bukan error row-size btree saat insert.

### Backend

Modul `apps/backend/src/modules/vendor-groups/` menyalin 9 file dari [`route-groups/`](../../../apps/backend/src/modules/route-groups/): dua entity, DTO create + update, controller 5 route dengan `@Authorize` per method dan `@HttpCode(204)` pada DELETE, service dengan raw-SQL read, delete-then-insert anak dalam transaksi, pre-check nama + remap PG `23505`, dan `''`→`null` pada description. Daftarkan di `app.module.ts`.

DTO-nya **bukan** salinan langsung. Anggota route group adalah objek `{origin_station, dest_station}` sehingga pakai `@ValidateNested` + `@Type`; anggota vendor group adalah string telanjang:

```ts
@IsArray()
@ArrayMinSize(1)
@IsString({ each: true })
@IsNotEmpty({ each: true })
@MaxLength(200, { each: true })
vendors: string[]
```

`GET /vendor-groups/available-vendors` — **union sejati**, bukan LEFT JOIN master-only seperti route-groups. Alasannya bukan `smu_rate_missing` (lihat [Kelayakan](#cakupan-vendor--diukur-bukan-diasumsikan)) melainkan bahwa master adalah snapshot sheet yang bisa ditulis ulang kapan saja, sehingga containment tidak boleh diandalkan sebagai properti permanen:

```sql
WITH master AS (
  SELECT DISTINCT vendor FROM air_shipments_smu
  WHERE vendor IS NOT NULL AND vendor <> ''
),
used AS (
  SELECT DISTINCT vendor FROM v_pnl_to
  WHERE vendor IS NOT NULL AND vendor <> ''
)
SELECT v.vendor,
       (v.vendor IN (SELECT vendor FROM used))   AS has_data,
       (v.vendor IN (SELECT vendor FROM master)) AS in_master
FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
ORDER BY v.vendor
```

Nilai `vendor` diambil **mentah**, tanpa `BTRIM` (Keputusan #7). Yang dibuang hanya NULL dan string kosong, dengan perbandingan eksplisit `<> ''` — bukan `NULLIF(BTRIM(...))`, yang akan menormalkan diam-diam dan membuat nilai tersimpan berbeda dari `v_pnl_to.vendor`.

`assertVendorsExist` menerima apa pun yang ada di master ∪ used, meniru `assertRoutesExist` ([`:178-186`](../../../apps/backend/src/modules/route-groups/route-groups.service.ts)).

`v_pnl_to` adalah materialized view yang hanya di-refresh saat sheet sync ([`air-shipments.service.ts:1143`](../../../apps/backend/src/modules/air-shipments/air-shipments.service.ts)) dan upload settlement ([`pnl-settlement.service.ts:125`](../../../apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts)), jadi `has_data` menyusul refresh.

### Permission

Empat member baru di [`packages/shared/src/auth/index.ts`](../../../packages/shared/src/auth/index.ts) setelah `:93`:

```ts
READ_VENDOR_GROUP   = 'read.vendor_group',
CREATE_VENDOR_GROUP = 'create.vendor_group',
UPDATE_VENDOR_GROUP = 'update.vendor_group',
DELETE_VENDOR_GROUP = 'delete.vendor_group',
```

Sesuai CHECK constraint `^(read|create|update|delete)\.[a-z][a-z0-9_]*$` ([`20260314000004-create-roles-permissions.ts:31-32`](../../../apps/backend/src/database/migrations/20260314000004-create-roles-permissions.ts)).

Panel Roles mengelompokkan berdasarkan `p.name.split('.')[1]` ([`role-permissions-panel.tsx:57-62`](../../../apps/frontend/src/features/roles/components/role-permissions-panel.tsx)), jadi seksi "Vendor_group" muncul tanpa kerja frontend, sebelah seksi "Route_group" yang sudah ada.

### Frontend

`features/vendor-groups/` (types, hooks berkunci `['vendor-groups']`, `VendorPicker`, `VendorGroupForm`, `DeleteVendorGroupDialog`) dan halaman `/vendor-groups`. Validasi manual, tanpa Zod — di app ini hanya form login yang memakai Zod.

`VendorPicker` **tidak** menyalin `RoutePicker` mentah-mentah: `RoutePicker` bersandar pada sumbu pengelompokan origin dan ~31 rute ([`RoutePicker.tsx:57-64`](../../../apps/frontend/src/features/route-groups/components/RoutePicker.tsx)), sementara vendor tidak punya sumbu semacam itu. Bentuknya: daftar alfabetis datar + input pencarian + titik amber untuk `has_data === false` + penghitung terpilih. Vendor dengan `in_master === false` diberi label terpisah ("ada data, tidak ada rate card") — vendor yang punya TO tapi tidak punya baris rate card sama sekali.

Sidebar: entri baru setelah [`sidebar.tsx:155`](../../../apps/frontend/src/components/layout/sidebar.tsx), digerbangi `read.vendor_group`, di dalam grup "Air Shipments" bersebelahan dengan Route Group.

## Fitur 5 — Tab Vendor Comparison

### Kontrak API

```
GET /pnl/breakdown/vendor-comparison
  ?cycle=2026-05-1H | ?start=…&end=…
  &basis=…
  &columns=vg:<uuid>
  &columns=v:<nama vendor mentah>
```

**Runtime param berulang.** Express 4 dengan parser `qs` default memberi **string** untuk satu kemunculan dan **array** untuk dua atau lebih. Handler karena itu bertipe `@Query('columns') columns?: string | string[]`, dan parser menormalkan lebih dulu:

```ts
const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
```

Tanpa ini, kasus satu kolom — hal pertama yang dilakukan user mana pun — akan mengiterasi karakter string.

**Serializer sisi FE.** `apiClient` tidak punya `paramsSerializer` ([`client.ts:6-9`](../../../apps/frontend/src/shared/api/client.ts)), dan serializer array default axios menambahkan kurung: `columns%5B%5D=`. Request ini karena itu mengirim `paramsSerializer: { indexes: null }` supaya menghasilkan `?columns=…&columns=…` seperti kontrak di atas.

`parseVendorColumnPicks` memecah tiap nilai di titik dua **pertama** saja, sehingga nama vendor yang memuat `:`, `,`, atau `|` aman. Urutan param = urutan kolom. Duplikat di-dedupe per `vg:<id>` / `v:<name>`, meniru `parseColumnPicks` ([`pnl-columns.util.ts:52-71`](../../../apps/backend/src/modules/pnl/pnl-columns.util.ts)). Deskriptor berbentuk salah → 400. Nama vendor tak dikenal **diloloskan** sebagai kolom kosong, bukan 400 — nama itu teks bebas dari sheet dan bisa hilang kapan saja. Maksimum 12 kolom.

Group yang dihapus antara picker dimuat dan request dikirim di-drop, meniru [`pnl.service.ts:1043`](../../../apps/backend/src/modules/pnl/pnl.service.ts).

### Bentuk response

```ts
interface PnlVendorComparisonColumn {
  id: string                    // 'vg:<uuid>' | 'v:<name>'
  name: string
  kind: 'group' | 'vendor'
  vendors: string[]
  vendorCount: number
}

interface PnlVendorComparisonCell {
  revenue: number; cost: number; margin: number
  costSmu: number; costRa: number; costSgOut: number; costSgIn: number
  incompleteTos: number
  issues: PnlCellIssue[]
}

interface PnlVendorComparisonRow {
  origin: string; originLabel: string; dest: string
  cells: (PnlVendorComparisonCell | null)[]
}

interface PnlVendorComparisonFooter {
  totalRevenue: number; totalCost: number; totalMargin: number
  totalCostSmu: number; totalCostRa: number; totalCostSgOut: number; totalCostSgIn: number
  routesWithData: number            // divisor Avg / Route, dihitung di service
  avgRevenuePerRoute: number | null // null saat routesWithData = 0
  avgCostPerRoute: number | null
  avgMarginPerRoute: number | null
  incompleteTos: number
  issues: PnlCellIssue[]
}

interface PnlVendorComparison {
  columns: PnlVendorComparisonColumn[]
  rows: PnlVendorComparisonRow[]
  footer: PnlVendorComparisonFooter[]
  coverage: { revenueInColumns: number; revenuePeriod: number }  // indikator cakupan
}
```

"Ada data" didefinisikan sebagai **sel non-null** — bukan non-nol. Divisor dikirim eksplisit sebagai `routesWithData` supaya slot footer yang sama tidak diam-diam berarti dua hal berbeda di dua tab yang berbagi satu renderer.

### Agregasi

```sql
WITH col_vendors(col_idx, vendor) AS (
  SELECT * FROM UNNEST($n::int[], $n+1::text[])
)
SELECT
  v.origin_station,
  v.dest_station,
  cv.col_idx,
  COALESCE(SUM(v.revenue_total),0)                                       AS revenue,
  COALESCE(SUM(v.cost_to),0)                                             AS cost,
  COALESCE(SUM(v.revenue_total),0) - COALESCE(SUM(v.revenue_discount),0)
    - COALESCE(SUM(v.cost_to),0)                                         AS margin,
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
  AND v.origin_station IS NOT NULL
  AND v.dest_station   IS NOT NULL
GROUP BY 1, 2, 3
```

`cost_sg_in_to` **sudah** mengandung `weight_share` di dalam definisinya ([`20260816000001:199-201`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), jadi ia tidak dikalikan lagi — tiga komponen lain AWB-grain dan harus. Dengan begitu keempatnya berjumlah persis `cost`.

Prorata `weight_share` dipakai, bukan `MAX(cost_smu_awb) GROUP BY awb` seperti [`getCostByVendor:657-668`](../../../apps/backend/src/modules/pnl/pnl.service.ts). Rollup per-AWB itu tidak bisa membawa kunci rute: AWB yang TO-nya melintasi dua pasangan stasiun akan memposting biaya penuhnya ke kedua rute.

**Penjagaan `origin_station IS NOT NULL` wajib.** Route Comparison membedakan baris footer dari baris body lewat kunci baris yang NULL ([`pnl.service.ts:1142`](../../../apps/backend/src/modules/pnl/pnl.service.ts)), dan itu hanya aman karena kuncinya dijamin non-null oleh `AND ${dateCol} IS NOT NULL` (`:1112`, `:1131`). Kunci baris di sini adalah `(origin_station, dest_station)`, yang **nullable** — issue `station_mapping_missing` ada persis untuk kasus itu ([`20260816000001:74`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), dan `getStations()` sudah menyaringnya (`pnl.service.ts:263`). Tanpa penjagaan ini, satu baris ber-station NULL byte-identical dengan baris super-aggregate dari grouping set kedua, dan `indexIssueRows` akan mencatatnya sebagai footer kedua. Saat ini nol baris seperti itu ada, jadi bug-nya laten, bukan aktif.

Issue diambil lewat satu query `GROUPING SETS ((origin_station, dest_station, col_idx, issue), (col_idx, issue))` dengan penjagaan NOT NULL yang sama, lalu `indexIssueRows` ([`pnl-cell-issues.util.ts:46-61`](../../../apps/backend/src/modules/pnl/pnl-cell-issues.util.ts)).

### Baris dan footer

Baris = semua pasangan dari `getStations()` ([`pnl.service.ts:259-271`](../../../apps/backend/src/modules/pnl/pnl.service.ts)), termasuk yang kosong. `rowKey = '<origin>|<dest>'`, `rowLabel` lewat `displayRouteLabel`.

| Baris footer | Definisi |
|---|---|
| Total | jumlah seluruh sel kolom itu |
| Avg / Route | Total ÷ `routesWithData` (sel non-null); `—` saat `routesWithData = 0` |

Baris Avg membawa tooltip yang menyebut divisornya, karena slot yang sama di Route Comparison membagi dengan hari kalender.

### Indikator cakupan

Banner permanen di atas tabel, dari field `coverage`:

> Kolom di bawah mencakup **30%** revenue periode ini. Sisanya berasal dari TO yang tidak punya vendor.

Tanpa ini tabel akan dibaca sebagai dekomposisi revenue periode, padahal saat ini hanya ~30% TO yang ter-atribusi (lihat [Cakupan vendor](#cakupan-vendor--diukur-bukan-diasumsikan)).

### Klik sel → drilldown

`PnlRouteFilter` mendapat field `vendors?: string[]`. `GET /pnl/awb-drilldown` mendapat parameter `vendor` berulang — kolom group membawa banyak vendor.

Filter vendor masuk **predikat luar** (`v.vendor = ANY($n)`), bukan ke dalam `EXISTS` yang menyaring rute ([`pnl.service.ts:380-391`](../../../apps/backend/src/modules/pnl/pnl.service.ts)) — predikat luar itulah yang cakupannya sama dengan kolom vendor pada sel yang diklik.

Angka di drilldown **tidak** akan sama dengan sel yang membukanya: agregat luar menjumlahkan seluruh TO dari AWB yang cocok dan memakai `MAX(cost_*_awb)` (`:405-421`), sedangkan sel memakai prorata `weight_share` yang dibatasi satu pasangan stasiun. Ini harus tertulis di panel drilldown, bukan hanya di dokumen ini.

Filter vendor juga harus **terlihat dan bisa dilepas**. `PnlAwbDrilldown` sekarang hanya merender kontrol rute dan tanggal; `hasRoute` ([`:121`](../../../apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx)) menggerbangi tombol Clear, dan `setRoutes`/`setDate` menyebar `...route` (`:130`, `:134`) sehingga filter tersembunyi akan bertahan melewati setiap suntingan user. Jadi: `vendors` masuk `hasRoute`, dan tiap vendor dirender sebagai chip yang bisa dihapus di baris filter.

### Frontend

- `PnlView` jadi `'estimate' | 'actual' | 'daily' | 'routes' | 'vendors'`, plus entri `VIEW_SUBTITLE`.
- **Baris tab jadi lima.** Baris sekarang segmented control: `flex w-fit rounded-md border overflow-hidden` ([`page.tsx:157`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>)) dengan pemisah berupa `border-l` per tombol (`:165`, `:171`, `:178`). Menambah `flex-wrap` saja akan merusak tampilan: tombol pertama di baris kedua tetap membawa `border-l` sehingga menggambar garis nyasar, dan tidak ada `border-t` sehingga kedua baris berdempet tanpa pemisah. Diganti **baris pill bercelah**: `flex flex-wrap gap-2` pada container tanpa border/overflow, `rounded-md border` pada tiap tombol, `border-l` dihapus.
- Gerbang ganda meniru [`:103-107`](<../../../apps/frontend/src/app/(dashboard)/pnl/page.tsx>) dan `:176-183`.
- `usePnlVendorComparison` berkunci `['pnl','vendor-comparison',filter,picks]`, `enabled: !!filter && picks.length > 0`.
- `PnlVendorComparisonView` dengan checkbox group vendor + `MultiVendorFilter` untuk vendor satuan. Keduanya disuapi `/vendor-groups/available-vendors` (gerbang `read.vendor_group` yang sama dengan tab). `MultiVendorFilter` menyalin `MultiRouteFilter` berikut pencariannya ([`multi-route-filter.tsx:43-45`](../../../apps/frontend/src/components/shared/multi-route-filter.tsx)).
- `toVendorComparisonTable` memproyeksikan ke `ComparisonTableModel<PnlVendorComparisonColumn>`; renderer `PnlComparisonTable` dipakai dengan `firstColumnHeader="Route"` dan `cellHint="Lihat AWB kolom ini pada rute ini"`.

### Catatan wajib di UI

1. Banner overlap kalau satu vendor ada di lebih dari satu group terpilih — analog [`overlappingRoutes`](../../../apps/frontend/src/features/pnl/utils/groupComparison.ts), banner di [`View.tsx:124-134`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx).
2. Kolom tidak menjumlah ke total rute. **Sebab utama, dan yang paling sering:** vendor lain yang tidak dicentang user — TO itu bisa muncul, tinggal dicentang. Draf awal spec ini melewatkannya sama sekali dan menyebut hanya tiga sebab data-quality, sehingga banner sempat berbunyi "tidak bisa muncul", yang salah untuk setiap pilihan parsial — yaitu pemakaian normal.

   Tiga sebab data-quality tetap disebut, tapi sebagai kasus tepi: TO tanpa vendor (`vendor IS NULL` → `no_booking`); TO dengan nama vendor kosong (`''`, yang jatuh ke `smu_rate_missing`, **bukan** `no_booking`, karena kolom `vendor` tidak di-`NULLIF` saat masuk view); dan TO ber-`station_mapping_missing`, yang punya vendor dan biaya tetapi tidak punya rute sehingga disaring keluar oleh penjagaan NOT NULL.

   **Diukur 2026-08-22, seluruh view:** `no_booking` 57.006 baris; `vendor = ''` **0**; `station_mapping_missing` **0**. Jadi dua dari tiga sebab data-quality itu belum pernah terjadi, sementara sebab yang dominan justru yang tidak tertulis.

### Performa

Tidak ada migrasi index baru. EXPLAIN (ANALYZE) atas query di atas dalam cycle mode:

```
HashAggregate (actual time=17.200..17.216 rows=13)
  ->  Hash Join  Hash Cond: (v.vendor = unnest.unnest_1)
        ->  Bitmap Heap Scan on v_pnl_to v
              ->  Bitmap Index Scan on idx_v_pnl_to_cycle_ata
Execution Time: 17.452 ms
```

Tidak ada seq scan — predikat date-basis dari `buildFilter` sudah memungut index yang ada. `vendor` cuma punya 3 nilai distinct atas 66k baris dan di-hash-join ke UNNEST kecil; grouping rute adalah HashAggregate.

Mode date-range memang seq scan (20,9 ms), tetapi filternya `date_ata >= … AND date_ata < …` ([`pnl-filter.util.ts:40-42`](../../../apps/backend/src/modules/pnl/pnl-filter.util.ts)) dan yang kurang adalah index atas `date_ata` / `date_completed` / `date_atd` — bukan atas `vendor` atau stasiun. Itu masalah yang lebih luas dari paket ini dan sengaja tidak dikerjakan di sini.

Kalau kelak ada index `v_pnl_to` yang ditambahkan: ia **harus** masuk `createIndexes()` di migrasi yang memiliki definisi view. Setiap migrasi view di repo ini men-DROP dan membangun ulang matview beserta daftar 8 index yang di-hardcode ([`20260816000001:19-21, 30-39`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), jadi migrasi `CREATE INDEX IF NOT EXISTS` yang berdiri sendiri hanya bertahan sampai edit view berikutnya.

## Urutan Kerja

```
Fitur 4 (rename)  →  Fitur 1 (angkat state)  →  Fitur 2 (margin)  →  Fitur 3 (vendor group)  →  Fitur 5
       │                                              │                                            │
       └── refactor rowKey/rowLabel + ComparisonColumn ┴────────────────────────────────────────────┘
```

- Fitur 4 duluan supaya Fitur 2 tidak menulis kolom Margin di file yang sebentar lagi di-rename.
- Refactor fondasi masuk bersama Fitur 4, sebelum Fitur 2, supaya Margin cukup ditulis sekali.
- Fitur 3 memblokir Fitur 5.
- Penghapusan alias `group-comparison` adalah PR terakhir, setelah rilis yang memuat Fitur 4 naik penuh.

## Rencana Pengujian

Gate: `pnpm exec tsc --noEmit` di kedua app, plus jest. Suite backend butuh `NODE_OPTIONS="--max-old-space-size=5120"` **dan** `--runInBand`.

`next lint` sudah gagal sebelum pekerjaan ini pada tujuh file (`SlaPage.tsx`, `useSyncNotification.spec.tsx`, `PnlAwbDrilldown.spec.tsx`, `PnlDailyMatrixView.spec.tsx`, `routeLabels.spec.ts`, `SettlementView.tsx`, `role-permissions-panel.tsx`) dan bukan gate.

| Area | Uji |
|---|---|
| Refactor fondasi | `routeComparison.spec.ts` — projeksi `rowKey`/`rowLabel` untuk sumbu tanggal menghasilkan angka yang sama seperti sebelumnya |
| Fitur 4 | spec yang mengassert literal "Group Comparison" diperbarui. Kesetaraan dua path diuji lewat `Reflect.getMetadata(PATH_METADATA, …)` yang memuat keduanya — bukan lewat `pnl.controller.spec.ts`, yang memanggil method controller langsung dan tidak pernah menyentuh metadata route |
| Fitur 1 | pindah tab lalu kembali mempertahankan pick dan urutannya; ganti periode **tidak** menghapus pick; pick group survive remount saat cache `/route-groups` sudah di-GC (`groups === undefined`). Mock view di `page.spec.tsx:69-75` harus dibuat merender prop `picks`-nya, kalau tidak state yang diangkat tidak teramati |
| Fitur 2 — service | margin = ekspresi Daily Report di [`pnl.service.ts:899-900`](../../../apps/backend/src/modules/pnl/pnl.service.ts), **bukan** `SUM(gross_profit_to)`; revenue tetap bruto |
| Fitur 2 — projeksi | `margin` absen dari response → projeksi mengembalikan `null` (`toBeNull`) |
| Fitur 2 — renderer | `null` dirender `—`; margin negatif merah; `WARNING_TINT` menang atas merah; body, detail row, dan kedua baris footer sama-sama 1+3N sel |
| Fitur 3 | service spec: nama duplikat → 409; vendor di luar master ∪ used ditolak; delete-then-insert anak; `available-vendors` menandai `has_data` dan `in_master` dengan benar, termasuk vendor yang hanya ada di `used` |
| Fitur 5 — parser | unit test `parseVendorColumnPicks`: satu kolom (string, bukan array); banyak kolom; nama mengandung `,` `|` `:`; duplikat di-dedupe; deskriptor rusak → 400; vendor tak dikenal → kolom kosong; melebihi 12 kolom |
| Fitur 5 — HTTP | satu kasus supertest untuk param `columns` berulang, karena integration spec memanggil `PnlService` langsung dan tidak pernah mengeksekusi parsing query string |
| Fitur 5 — agregasi | integration spec: agregasi vendor × rute; AWB yang TO-nya melintasi dua rute terbagi menurut `weight_share` dan tidak dihitung penuh di kedua rute; empat komponen berjumlah persis `cost`; Avg / Route membagi dengan `routesWithData`; baris ber-station NULL tidak muncul sebagai footer kedua; kolom overlap terdeteksi |
| Drilldown | filter `vendor` di predikat luar mempersempit hasil; tanpa `vendor` perilaku lama tidak berubah; chip vendor terlihat dan bisa dihapus; `hasRoute` menyalakan Clear saat hanya `vendors` yang terisi |

Route Comparison dan Vendor Comparison sama-sama belum punya e2e. Cakupan ini tidak dinaikkan di paket ini — konsisten dengan route groups yang punya tiga spec komponen tanpa page spec maupun e2e.

## Risiko & Catatan

1. **Permission baru tidak otomatis aktif — kecuali untuk super admin.** Empat member `*.vendor_group` hanya terdaftar setelah backend restart ([`permissions.service.ts:19-33`](../../../apps/backend/src/modules/permissions/permissions.service.ts)) dan tidak diberikan ke role mana pun. Tetapi super admin menembus kedua gerbang — [`rbac.guard.ts:38-41`](../../../apps/backend/src/common/guards/rbac.guard.ts) dan [`use-permissions.ts:9-10`](../../../apps/frontend/src/shared/hooks/use-permissions.ts) — sehingga menu dan tab langsung terlihat olehnya. **QA wajib memakai akun non-super-admin**, kalau tidak langkah grant akan lolos verifikasi secara keliru.
2. **Endpoint `/pnl/breakdown/vendor-comparison` hanya butuh `read.pnl`.** `PnlController` ber-`@Authorize(Permission.READ_PNL)` di level kelas ([`pnl.controller.ts:12`](../../../apps/backend/src/modules/pnl/pnl.controller.ts)) dan `RbacGuard` memakai `getAllAndOverride([handler, class])` ([`rbac.guard.ts:22-25`](../../../apps/backend/src/common/guards/rbac.guard.ts)) — `@Authorize` di level method **menggantikan**, bukan menambah. Jadi gerbang `read.vendor_group` bersifat UI saja, persis seperti Route Comparison hari ini. Yang benar-benar terjaga adalah `/vendor-groups`.
3. **Vendor Comparison tidak akan rekonsiliasi** dengan panel "Cost by Vendor" di tab Estimated (rollup per-AWB vs prorata `weight_share`), maupun dengan drilldown yang dibukanya sendiri (agregat seluruh AWB vs irisan satu rute). Keduanya by design dan keduanya harus tertulis di UI.
4. **Nama vendor bisa berubah di sheet kapan saja** dan group yang memakainya akan diam-diam mengosong. Tidak ada deteksi. Indikator "vendor tidak ditemukan lagi" di halaman Vendor Group adalah kandidat lanjutan, di luar cakupan.
5. **Margin optimistis, dan `incompleteTos` tidak menangkap semuanya.** `COALESCE(SUM(cost_to),0)` memperlakukan TO tanpa biaya sebagai gratis. Lebih halus lagi: TO ber-issue `sg_in_rate_missing` punya `cost_to` non-NULL dengan komponen SG In di-`COALESCE` ke 0 ([`20260816000001:199-203`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)), sehingga **tidak** terhitung di `incompleteTos`. Sinyalnya adalah `incompleteTos` **dan** daftar issue per sel.
6. **Rolling deploy.** FE dan BE naik paralel. Setiap field response baru dibaca dengan fallback `?? ` di titik projeksinya. Untuk Fitur 4, BE ber-alias harus naik penuh sebelum FE yang pindah path.
7. **Pertumbuhan horizontal.** Kedua tabel jadi 1+3N kolom; Vendor Comparison punya baris sebanyak seluruh pasangan stasiun. Hanya kolom pertama yang sticky-left ([`Table.tsx:112-117`](../../../apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx)). Diperiksa di viewport sempit sebelum merge.
8. **`weight_share` NULL** saat `sum_gw_per_awb = 0` ([`20260816000001:167`](../../../apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts)). Baris seperti ini juga membuat `cost_to` NULL sehingga sudah tertangkap `incompleteTos` — diverifikasi lewat test, tidak butuh penanganan khusus.

## Di Luar Cakupan

- Group vendor yang mencakup counterparty selain vendor SMU. RA (`ra_name`) dan SG Out (`sg_out`) adalah pihak berbeda dan bukan kolom `v_pnl_to`.
- Normalisasi nama vendor dan deteksi vendor yang hilang dari master.
- Persist pilihan lewat URL atau localStorage.
- Kolom Margin % di tab comparison mana pun.
- E2E untuk tab comparison.
- Rename permission `read.route_group`, menu Route Group, atau modul backend `route-groups`.
- `@Authorize` multi-permission, dan karenanya penjagaan `read.vendor_group` di sisi server.
- Index atas kolom date-basis `v_pnl_to`, meski EXPLAIN menunjukkan itulah yang kurang di mode date-range.
