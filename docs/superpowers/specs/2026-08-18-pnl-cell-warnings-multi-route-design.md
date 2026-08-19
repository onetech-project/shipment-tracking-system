# PnL — Cell Warnings, Multi-Route Filter & Route Columns

**Tanggal:** 2026-08-18
**Area:** `apps/backend/src/modules/pnl`, `apps/frontend/src/features/pnl`, `apps/frontend/src/features/route-groups`, `apps/frontend/src/components/shared`
**Branch:** cabang baru dari `development` (baik `feature/pnl-daily-matrix` maupun `feature/route-group-comparison` sudah ter-merge ke sana)

## Latar

Empat perubahan yang menyentuh dua fitur yang sudah jalan — Daily Report (matrix harian) dan Group Comparison:

1. AWB yang punya masalah data quality membuat cell yang memuatnya berubah kuning, dengan penjelasan masalahnya.
2. Filter rute di AWB drilldown jadi multi-pilih.
3. Cell di Group Comparison bisa diklik dan mengarah ke AWB drilldown, terfilter ke rute-rute kolom itu pada tanggal cell tersebut.
4. Group Comparison bisa membandingkan rute langsung, bukan hanya group.

Poin 3 dan 4 bergantung pada poin 2: sebuah group berisi banyak rute, jadi drilldown harus bisa difilter oleh sekumpulan pasangan rute sekaligus.

## Keputusan Desain

### 1. Definisi "warning" per cell

Sebuah cell (rute × tanggal di Daily Report, kolom × tanggal di Group Comparison) bermasalah bila salah satu dari dua hitungan ini > 0:

| Field | Sumber | Arti |
|---|---|---|
| `issues[]` | `v_pnl_to.issue IS NOT NULL`, `COUNT(DISTINCT awb)` per jenis | **sebab**: `no_booking`, `smu_rate_missing`, `ra_rate_missing`, `sgout_name_missing`, `revenue_missing`, `station_mapping_missing`, `sg_in_rate_missing` |
| `incompleteTos` | `COUNT(*) FILTER (WHERE cost_to IS NULL)` | **akibat**: TO tanpa cost. Sudah ada hari ini sebagai penanda titik `•`. |

Keduanya disimpan terpisah karena bukan himpunan yang sama: `revenue_missing` bisa punya cost lengkap, dan sebuah TO bisa kehilangan cost tanpa `issue` yang ter-klasifikasi.

Tipe baru, dipakai backend dan frontend:

```ts
interface PnlCellIssue { issue: string; awbs: number }
```

Penanda titik `•` yang ada sekarang **dihapus** dari tabel Daily Report dan Group Comparison. Latar kuning menggantikan perannya; dua penanda untuk satu kondisi hanya membingungkan.

### 2. Backend

#### 2a. `/pnl/breakdown/daily-matrix`

`PnlDailyMatrixCell` dan `PnlDailyMatrixFooter` bertambah `issues: PnlCellIssue[]`.

Satu query tambahan, dijalankan berdampingan dengan query fact yang sudah ada:

```sql
SELECT TO_CHAR(<dateCol>::DATE, 'YYYY-MM-DD') AS d,
       origin_station, dest_station, issue,
       COUNT(DISTINCT awb)::int AS awbs
FROM v_pnl_to
WHERE <filter> AND <dateCol> IS NOT NULL AND issue IS NOT NULL
GROUP BY 1, 2, 3, 4
```

`WHERE`-nya identik dengan query fact kecuali tambahan `issue IS NOT NULL`, sehingga himpunan grup-nya adalah subset — tidak ada baris issue yang bisa jatuh ke cell yang tidak terbentuk. Cell tanpa issue mendapat array kosong, bukan `null`, supaya frontend tidak perlu membedakan dua bentuk "tidak ada masalah".

#### 2b. `/pnl/awb-drilldown` — filter multi-rute

Param `origin` dan `dest` **diganti** satu param `routes`, berisi pasangan `origin|dest` dipisah koma:

```
routes=Jabo|Denpasar,Jabo|Aceh
```

Klausa rute di dalam `EXISTS` per-AWB menjadi:

```sql
AND (m.origin_station, m.dest_station)
    IN (SELECT * FROM UNNEST($n::text[], $m::text[]))
```

Dua array sejajar, bukan penggabungan string, supaya tetap ramah index. Bentuk `EXISTS` per-AWB tidak berubah, jadi aturan yang sudah berlaku tetap: **rute menentukan AWB mana yang dilist, bukan TO mana yang dijumlahkan** — kolom cost adalah `MAX(cost_*_awb)` atas seluruh AWB, sehingga membuang TO di sini akan mengecilkan revenue terhadap cost satu AWB penuh dan mengarang kerugian.

Pasangan yang bentuknya rusak (tidak ada `|`, atau salah satu sisi kosong) ditolak dengan `400`, senada dengan penanganan uuid invalid yang sudah ada di group comparison.

#### 2c. `/pnl/breakdown/group-comparison` — kolom group + kolom rute

Param `groupIds` **diganti** `columns`: satu daftar terurut bertipe, sehingga kolom group dan kolom rute bisa dicampur dalam urutan yang dipilih user.

```
columns=g:8f3ac1de-...,r:Jabo|Denpasar,g:1a2bc3de-...
```

Backend menerjemahkan setiap deskriptor menjadi daftar pasangan rute:

- `g:<uuid>` — di-resolve dari `route_group_routes` di server, bukan dipercaya dari frontend.
- `r:<origin>|<dest>` — satu pasangan.

Query fact lalu join ke satu daftar `VALUES (col_idx, origin_station, dest_station)` alih-alih langsung ke `route_group_routes`:

```sql
WITH col_routes(col_idx, origin_station, dest_station) AS (VALUES ...)
SELECT TO_CHAR(<dateCol>::DATE, 'YYYY-MM-DD') AS d, cr.col_idx, ...
FROM v_pnl_to v
JOIN col_routes cr
  ON cr.origin_station = v.origin_station
 AND cr.dest_station   = v.dest_station
WHERE <filter> AND <dateCol> IS NOT NULL
GROUP BY 1, 2
```

Satu jalur untuk dua jenis kolom. Sifat yang sudah ada tetap berlaku dan tetap disengaja: sebuah TO pada rute yang dimiliki tiga kolom menghasilkan tiga baris hasil join dan masuk ke ketiga kolom — kolom-kolom itu pertanyaan yang independen, bukan partisi periode, jadi tidak boleh dijumlahkan.

`PnlGroupComparisonColumn` bertambah:

```ts
kind: 'group' | 'route'
routes: { origin: string; originLabel: string; dest: string }[]
```

`routes` di kolom adalah kunci dua hal sekaligus: frontend memakainya untuk mengisi filter drilldown saat cell diklik (poin 3), dan untuk menghitung peringatan overlap dari respons — sehingga rute ad-hoc yang kebetulan anggota group terpilih ikut terdeteksi tanpa logika kedua.

`PnlGroupComparisonCell` dan `PnlGroupComparisonFooter` juga bertambah `issues: PnlCellIssue[]`, diisi query tambahan yang sama polanya dengan 2a tapi dikelompokkan per `(d, col_idx, issue)`.

Deduplikasi deskriptor tetap mempertahankan urutan pilih, seperti perlakuan `groupIds` sekarang: `columnIndex` dikunci per kolom, jadi deskriptor berulang akan menimpa kolom sebelumnya dan meninggalkannya permanen kosong.

> `columns` menggantikan `groupIds`, dan `routes` menggantikan `origin`/`dest`. Keduanya breaking, tetapi kedua endpoint ini hanya dikonsumsi frontend di repo ini, jadi diganti sekaligus daripada menyisakan dua jalur yang harus dijaga selamanya.

### 3. Frontend

#### 3a. Komponen bersama

`MultiRouteFilter` dipindah dari `features/air-shipments/components/MultiRouteFilter.tsx` ke `components/shared/multi-route-filter.tsx`, mengikuti konvensi kebab-case folder itu; import di `SlaPage` disesuaikan. API-nya tidak diubah — sudah generik (`routes: string[]` berisi label, `selected: string[]`, `onChange`), lengkap dengan pencarian, tombol All/None, dan ringkasan "N routes".

#### 3b. Dua bentuk label rute

Util baru `features/pnl/utils/routeLabels.ts` menyimpan keduanya secara eksplisit:

| Bentuk | Contoh | Dipakai di |
|---|---|---|
| **dropdown** — origin & dest mentah | `Jabo → Denpasar` | isi dan ringkasan `MultiRouteFilter` saja |
| **tampilan** — label origin | `CGK → Denpasar` | header matrix Daily Report, `RoutePicker`, kalimat peringatan overlap |

Dua bentuk ini hidup berdampingan dengan sengaja: Daily Report meniru spreadsheet yang memakai kode bandara, sementara dropdown menyebut stasiun sebagaimana tertulis di data sumber. Util ini juga membangun peta `label ↔ { origin, dest }` dari daftar stasiun, sehingga `MultiRouteFilter` yang berbasis string tetap bisa mengembalikan pasangan rute yang tepat tanpa mem-parsing label.

Catatan data: `dest_station` di `v_pnl_to` sudah berupa nama kota (`Aceh`, `Pontianak`, `Tanjung Pinang`, `Denpasar`) — tidak ada kode IATA di sisi destination dan tidak ada mapping yang perlu dibuat. Hanya origin yang punya mapping, lewat `common/utils/origin-labels.util.ts`.

#### 3c. Tipe filter drilldown

```ts
interface PnlRoutePair { origin: string; dest: string }

interface PnlRouteFilter {
  routes?: PnlRoutePair[]   // menggantikan origin?/dest?
  dateFrom?: string         // YYYY-MM-DD
  dateTo?: string           // YYYY-MM-DD, inklusif
}
```

`routeToParams()` menserialisasi `routes` menjadi `Jabo|Denpasar,Jabo|Aceh`, dan tetap menghilangkan field kosong sepenuhnya sehingga filter yang belum disentuh menghasilkan request yang identik dengan sebelum filter rute ada.

#### 3d. AWB Drilldown (poin 2)

Dua `<select>` Origin/Destination diganti satu `MultiRouteFilter`. Sumber daftarnya `/pnl/stations` yang sudah dipakai komponen ini — **bukan** `/route-groups/available-routes`, karena tab Estimated hanya dijaga `read.pnl` sedangkan endpoint route-group menuntut `read.route_group`, sehingga user tanpa izin itu akan mendapat 403 dan kehilangan filternya.

Input **Dari**/**Sampai** dan tombol **Reset** tetap seperti sekarang. Logika "buang dest yang tidak cocok dengan origin yang baru dipilih" hilang dengan sendirinya — pasangan rute tidak bisa lagi tidak valid.

#### 3e. Cell kuning (poin 1)

Util baru `features/pnl/utils/cellWarning.ts`:

```ts
interface CellWarning { issues: PnlCellIssue[]; incompleteTos: number }
function hasWarning(w: CellWarning): boolean
function warningTooltip(w: CellWarning): string | undefined
```

Jenis issue diurutkan dengan peringkat keparahan yang sudah dipakai service (`no_booking` lebih dulu). Tooltip:

> `3 AWB bermasalah: SMU rate missing for route (2), Revenue missing (1) · 4 TO belum ada cost`

Bila cell juga bisa diklik, teks ini digabung ke `title` tombolnya mengikuti pola `cellButtonTitle()` yang sudah ada: tombol menutupi seluruh cell, jadi `title` pada `<td>` tidak akan pernah terjangkau kursor.

Latar cell: `bg-amber-100 dark:bg-amber-950/40`.

Di tabel Profit Margin, cell margin negatif yang **juga** bermasalah kehilangan `bg-red-50` tetapi mempertahankan `text-red-700 dark:text-red-400` dan menjadi `font-semibold`, sehingga tidak ada informasi yang hilang: kuning menandai keandalan angka, merah menandai nilainya.

Perubahan model tabel:

- `MatrixTableModel.incompleteTos: number[][] | null` → `warnings: CellWarning[][]`
- `MatrixFooterRow.incompleteTos?: number[]` → `warnings?: CellWarning[]`

`toRevenueTable()` sekarang ikut mengisi `warnings` (sebelumnya `incompleteTos: null`), sehingga **kedua** tabel Daily Report memakai renderer dan aturan warna yang sama persis. Koordinat cell-nya identik (origin, dest, tanggal), jadi datanya cukup diambil sekali dari respons.

Cell footer ikut berlatar kuning dengan tooltip yang meringkas seluruh periode kolom itu, tetapi tetap tidak bisa diklik — sama seperti sekarang. Aturan ini berlaku di Daily Report maupun Group Comparison, sehingga "kuning berarti angka ini tidak sepenuhnya bisa dipercaya" terbaca sama di mana pun ia muncul.

#### 3f. Group Comparison — klik cell (poin 3)

- Chevron expand pindah dari cell Cost ke kolom **Date**: satu per baris, plus satu di baris **Total**. Ini menegaskan perilaku yang sebenarnya sudah ada — mengklik cell Cost kolom manapun hari ini membuka rincian komponen untuk *semua* kolom, jadi toggle itu memang milik baris.
- Cell **Revenue dan Cost** menjadi tombol yang memanggil `onCellClick(column, date)`.
- Baris footer **tidak** bisa diklik untuk drilldown, konsisten dengan footer Daily Report yang sudah inert; baris Total tetap punya chevron rincian komponennya, dan cell footer yang bermasalah tetap berlatar kuning seperti diuraikan di 3e.
- Cell yang bermasalah (Revenue maupun Cost pada kolom dan tanggal yang sama) mendapat latar kuning dan tooltip yang sama seperti 3e.

#### 3g. Group Comparison — pilih rute (poin 4)

Kartu pemilih menjadi dua bagian: checkbox **Group** seperti sekarang, plus satu `MultiRouteFilter` **Rute** bersumber `useAvailableRoutes()` — boleh di sini, karena tab ini memang sudah di balik `read.route_group`.

Satu state terurut menggantikan `selectedIds: string[]`:

```ts
type ColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'route'; origin: string; dest: string }
```

Di-append sesuai urutan klik (bukan di-sort ulang), lalu diserialisasi menjadi param `columns`.

`overlappingRoutes()` dipindah agar bekerja atas `data.columns[].routes` alih-alih atas daftar `RouteGroup`. Dengan begitu kalimat peringatannya otomatis mencakup kasus baru "rute X juga anggota group Y", memakai satu sumber kebenaran yang sama dengan angka di tabelnya.

#### 3h. `page.tsx`

- `handleCellClick` (Daily Report) menghasilkan `{ routes: [pair], dateFrom: date, dateTo: date }`.
- `handleGroupCellClick(column, date)` baru menghasilkan `{ routes: column.routes, dateFrom: date, dateTo: date }`, lalu `setView('estimate')` dan scroll ke drilldown — jalur yang sama persis dengan klik Daily Report yang sudah ada, termasuk `requestAnimationFrame` agar berjalan setelah tab Estimated me-mount drilldown.

Efek yang sudah ada — mengosongkan `drilldownRoute` setiap kali basis/mode/cycle/tanggal berubah — tetap berlaku dan sekarang juga melindungi filter multi-rute dari membawa tanggal periode lama.

## Rencana Pengujian

**Backend**

- `pnl.service.spec` — bentuk `issues` per cell (cell tanpa issue → array kosong); parsing `columns` (urutan campur dipertahankan, duplikat dibuang, uuid invalid → 400, pasangan rute rusak → 400); param `routes` di awb-drilldown menghasilkan klausa `UNNEST` yang benar dan terikat parameter yang tepat.
- `pnl-group-comparison.integration.spec` — satu kolom rute ad-hoc yang beririsan dengan kolom group menghasilkan angka di kedua kolom; `issues` per cell terisi dari data nyata.

**Frontend**

- Unit: `cellWarning` (ambang, urutan keparahan, bentuk kalimat tooltip) dan `routeLabels` (dua bentuk label, peta label ↔ pasangan).
- `PnlMatrixTable` — kuning muncul di kedua tabel; cell negatif + bermasalah jatuh ke teks merah tanpa latar merah; tooltip tergabung ke `title` tombol saat cell bisa diklik.
- `PnlGroupComparisonTable` — chevron expand di kolom Date (baris dan Total), payload `onCellClick` untuk cell Revenue dan Cost, footer tidak memicu drilldown.
- `PnlAwbDrilldown` — pilihan multi-rute terkirim sebagai param `routes`; Reset mengosongkan rute dan tanggal.
- `PnlGroupComparisonView` — urutan kolom mengikuti urutan pilih lintas group dan rute; peringatan overlap muncul untuk rute yang juga anggota group terpilih.
- `page.spec` — kedua jalur klik cell (Daily Report dan Group Comparison) berpindah ke tab Estimated dengan filter yang benar.

## Risiko & Catatan

- **Biaya query.** Dua query grouped tambahan (daily-matrix dan group-comparison) di atas slice yang sudah difilter sama. Biayanya diperkirakan wajar, tetapi diukur pada data nyata sebelum merge.
- **Breaking change internal.** `groupIds` → `columns` dan `origin`/`dest` → `routes` hanya dikonsumsi frontend repo ini; diganti sekaligus agar tidak ada dua jalur param yang harus dijaga.
- **Dua bentuk label rute** hidup berdampingan (3b). Ini disengaja dan didokumentasikan di util-nya supaya tidak "diperbaiki" menjadi satu bentuk oleh perubahan berikutnya.
