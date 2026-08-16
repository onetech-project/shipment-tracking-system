# PnL Station Lookup — Mengisi origin_station / destination_station dari air_shipments_data

**Tanggal:** 2026-08-16
**Status:** Disetujui, siap masuk rencana implementasi

## Latar Belakang

Di staging dan production, sheet Compile Air CGK tidak mengisi kolom `origin_station` dan
`destination_station` untuk bulan Juni, Juli, dan Agustus. Karena seluruh modul PnL mengambil
rute dari kedua kolom itu, baris-baris tersebut tidak punya rute sama sekali: hilang dari kolom
Daily Report, tidak bisa difilter di AWB Drilldown, dan tidak muncul di breakdown per rute.

`air_shipments_data` adalah tabel master pasangan Distribution Center yang memuat station untuk
tiap pasangan DC. Nilai yang hilang bisa diambil dari sana dengan mencocokkan nama DC.

## Kelayakan

Tidak ada migrasi skema tabel. Yang berubah hanya definisi materialized view `v_pnl_to`.

| Kebutuhan | Sumber |
| --- | --- |
| Nama DC asal per TO | `air_shipments_compileaircgk.extra_fields->>'origin'`, mis. `'Kosambi DC'` |
| Nama DC tujuan per TO | `air_shipments_compileaircgk.extra_fields->>'destination'`, mis. `'Aceh DC'` |
| Station asal | `air_shipments_data.extra_fields->>'origin_station'`, mis. `'Jabo'` |
| Station tujuan | `air_shipments_data.extra_fields->>'destination_station'`, mis. `'Aceh'` |
| Kunci pencocokan | `air_shipments_data.origin_dc` / `.destination_dc` (kolom asli, bukan `extra_fields`) |

## Bukti dari Database

Semua angka di bawah diukur langsung terhadap database lokal (66.203 baris `v_pnl_to`,
67.465 baris `air_shipments_compileaircgk`, 76 baris `air_shipments_data`) sebelum desain ini
disusun.

**1. Lookup cocok sempurna dengan sheet.** Dari 67.190 baris compile yang punya pasangan di
`air_shipments_data`, hasil lookup identik dengan nilai sheet: **0 selisih** pada `origin_station`
maupun `destination_station`. Perubahan ini karena itu tidak menggeser satu pun angka pada data
yang sudah bersih.

**2. Master belum lengkap.** 275 baris (3 pasangan DC) tidak ada di master, dan sheet-nya benar:

| origin | destination | station di sheet | baris |
| --- | --- | --- | --- |
| Sidoarjo DC | Banjarmasin DC | Surabaya → Banjarmasin | 131 |
| Sidoarjo DC | Banjarmasin 2 DC | Surabaya → Banjarmasin | 84 |
| Sidoarjo DC | Banjarbaru DC | Surabaya → Banjarmasin | 60 |

Karena itu sheet tetap dipakai sebagai pengisi saat lookup tidak ketemu.

**3. Ada risiko fan-out yang nyata.** `air_shipments_data` berisi 76 baris tetapi hanya 75
pasangan DC unik: `Kosambi DC → Tanjung Pinang DC` terdaftar dua kali, sekali sebagai `Air` dan
sekali sebagai `Sea`. **1.262 baris compile mereferensikan pasangan itu.** `LEFT JOIN` tanpa
dedup akan menggandakannya menjadi 2.524 baris — revenue, tonase, dan jumlah TO untuk rute
CGK → Tanjung Pinang menjadi dua kali lipat, dan `id` tidak lagi unik sehingga
`REFRESH MATERIALIZED VIEW CONCURRENTLY` gagal. Repo ini pernah mengalami kelas bug yang sama
(migration `20260711000001-pnl-dedup-booking-per-awb`).

**4. Membatasi ke `service = 'Air'` menutup risiko itu dan tidak membuang apa pun.**
55 baris Air menghasilkan 55 pasangan unik setelah `BTRIM`; tidak ada nilai `origin_dc` /
`destination_dc` yang punya spasi di ujung; dan **0 pasangan** yang direferensikan compile hanya
terdaftar sebagai Sea.

## Keputusan Desain

### 1. Lookup hidup di definisi `v_pnl_to`

Satu migration baru yang drop dan recreate materialized view beserta seluruh index-nya. Seluruh
modul PnL — `getSummary`, `getDailyMargin`, semua breakdown, `getDailyMatrix`, `getAwbDrilldown`,
`getAwbTos`, `getStations` — plus modul `pnl-settlement` membaca view yang sama, jadi satu
perubahan memenuhi permintaan "seluruh modul PnL".

Dua alternatif ditolak. **Backfill `extra_fields` saat sync** menulis nilai turunan ke dalam
cermin mentah sheet, memerlukan backfill sekali jalan untuk data lama, dan tidak ikut terkoreksi
bila master diperbaiki kemudian. **Join di tiap query service** menyebar logika yang sama ke
belasan query di dua modul; satu yang terlewat sudah cukup membuat angka tidak konsisten.

Generated column tidak bisa dipakai: Postgres mensyaratkan ekspresi immutable yang hanya membaca
baris yang sama, sehingga tidak boleh menyentuh tabel lain.

### 2. Hasil lookup menang, sheet mengisi yang kosong

`COALESCE(lookup, sheet)`. `air_shipments_data` menjadi sumber kebenaran, sehingga nilai sheet
yang salah ikut terkoreksi, sementara 275 baris Sidoarjo yang belum ada di master tetap terlayani
oleh sheet.

Risiko yang diterima secara sadar: master tidak menyimpan masa berlaku. Bila suatu DC pernah
berpindah station, seluruh riwayat akan mengikuti pemetaan terbaru, bukan kondisi saat pengiriman
terjadi. Pada data saat ini konsekuensinya nol, karena lookup dan sheet tidak pernah berbeda.

### 3. Hanya jalur Air

PnL saat ini hanya mencakup jalur udara, jadi baris `service = 'Sea'` diabaikan. Ini sekaligus
menghapus duplikat Kosambi → Tanjung Pinang di poin bukti 3.

### 4. Baris tanpa station ditandai, bukan dibuang

Bila sheet kosong **dan** pasangan DC tidak ada di master, `origin_station` / `dest_station` tetap
`NULL`. Baris tersebut tetap masuk PnL — revenue dan cost-nya tetap terhitung di KPI — tetapi
tidak muncul sebagai kolom Daily Report karena tidak punya rute. Modul ini sudah punya mekanisme
`issue`, jadi ditambah satu nilai baru `station_mapping_missing` agar panel Check Data Quality
memunculkan pasangan DC mana yang perlu didaftarkan ke `air_shipments_data`.

## Perubahan

### Migration baru

`apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts`, mengikuti pola
migration PnL sebelumnya: `DROP MATERIALIZED VIEW`, `CREATE MATERIALIZED VIEW` dengan definisi
baru, lalu membuat ulang seluruh index termasuk index unik yang dibutuhkan
`REFRESH ... CONCURRENTLY`. Method `down()` mengembalikan definisi lama secara utuh.

**CTE baru**, menghasilkan tepat satu baris per pasangan DC:

```sql
station_map AS (
  SELECT DISTINCT ON (BTRIM(origin_dc), BTRIM(destination_dc))
    BTRIM(origin_dc)      AS origin_dc,
    BTRIM(destination_dc) AS destination_dc,
    NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin_station,
    NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest_station
  FROM air_shipments_data
  WHERE service = 'Air'
  ORDER BY BTRIM(origin_dc), BTRIM(destination_dc)
)
```

`DISTINCT ON` dipertahankan sebagai asuransi meskipun `service = 'Air'` sudah cukup hari ini:
UNIQUE constraint tabel itu ada pada kolom mentah `(service, origin_dc, destination_dc)`,
sedangkan join memakai `BTRIM`. Bila kelak masuk nilai `'Kosambi DC '` dengan spasi, constraint
tetap lolos tetapi join akan menggandakan baris. Satu baris SQL untuk mencegah revenue berlipat
diam-diam pada dashboard keuangan.

**Station diresolusi sekali, di CTE paling awal.** `origin_station` bukan hanya kolom tampilan —
ia dipakai di empat tempat di dalam view, dan tiga di antaranya menghitung biaya:

| Lokasi | Peran |
| --- | --- |
| `awb_totals` | `MAX(origin_station)` per AWB, diteruskan ke `awb_cost` |
| `awb_cost` | `CASE WHEN origin_station = 'Surabaya' THEN 0` pada **cost RA** dan **cost SG Out** |
| `base` | join `sgi.origin = c.origin_station AND sgi.destination = c.dest_station` → tarif **SG Incoming** |
| `base` | `CASE WHEN c.origin_station = 'Surabaya' THEN 0 ELSE 5000` → **admin SG In** |

Karena itu resolusi dilakukan satu kali di CTE `compile`, dan `awb_totals` maupun `base` membaca
dari CTE itu — bukan lagi langsung dari tabel. Dengan begitu tidak mungkin ada bagian yang memakai
station mentah sementara bagian lain memakai hasil lookup.

```sql
compile AS (
  SELECT c.*,
    COALESCE(sm.origin_station, NULLIF(BTRIM(c.origin_station), '')) AS origin_station_resolved,
    COALESCE(sm.dest_station,   NULLIF(BTRIM(c.dest_station),   '')) AS dest_station_resolved
  FROM air_shipments_compileaircgk c
  LEFT JOIN station_map sm
    ON sm.origin_dc      = BTRIM(c.extra_fields->>'origin')
   AND sm.destination_dc = BTRIM(c.extra_fields->>'destination')
)
```

Nama kolom diberi akhiran `_resolved` supaya `c.*` tetap boleh membawa kolom generated aslinya
tanpa tabrakan nama; seluruh pemakaian di dalam view kemudian menunjuk kolom `_resolved`, dan
`base` mengekspornya kembali sebagai `origin_station` / `dest_station` sehingga bentuk output view
tidak berubah sama sekali.

### Dampak pada biaya, bukan hanya tampilan

Untuk baris yang station-nya kosong di production, keadaan sekarang bukan hanya "rute tidak
muncul": join SG Incoming gagal sehingga `cost_sg_in_to` NULL dan barisnya bertanda
`sg_in_rate_missing`, dan cabang Surabaya pada RA serta SG Out tidak pernah aktif sehingga
pengiriman asal Surabaya dibebani biaya yang seharusnya nol. Setelah lookup diterapkan ke seluruh
konsumen, biaya-biaya itu ikut terkoreksi — **margin Juni–Agustus akan berubah**, ke arah yang
benar. Ini konsekuensi yang diinginkan, bukan efek samping, tetapi tim keuangan perlu diberi tahu
bahwa angka bulan-bulan tersebut bergerak setelah deploy.

Pada data lokal yang bersih tidak ada satu angka pun yang bergeser, karena lookup dan sheet
identik di 67.190 baris. Verifikasi "tidak boleh berubah" di bawah karena itu tetap berlaku
sebagai jaring pengaman.

**Rantai `issue`** ditambah satu cabang di urutan paling akhir:

```sql
WHEN origin_station IS NULL OR dest_station IS NULL THEN 'station_mapping_missing'
```

### Backend

`apps/backend/src/modules/pnl/pnl.service.ts`: `ISSUE_RANK` bertambah
`station_mapping_missing: 7`. Tidak ada perubahan query — semuanya membaca kolom yang sama.

### Frontend

`apps/frontend/src/features/pnl/utils/issueLabels.ts`: satu label baru,
`station_mapping_missing: 'Station mapping missing (DC pair not in air_shipments_data)'`.
Tidak ada perubahan komponen: badge di AWB Drilldown, panel Data Quality, dan ringkasannya
semuanya sudah membaca nilai `issue` apa adanya.

## Catatan yang Diterima

Rantai `CASE` mengembalikan **satu** issue per baris dengan urutan akar masalah lebih dulu. Baris
yang juga `no_booking` akan menampilkan `no_booking` dan menyembunyikan masalah station-nya sampai
booking-nya beres. Ini konsisten dengan perilaku issue yang sudah ada dan diterima apa adanya;
menambah kolom terpisah hanya untuk station akan menggandakan jalur data di panel Data Quality
tanpa manfaat sepadan.

## Rencana Pengujian

**Verifikasi terhadap database lokal — perubahan tidak boleh menggeser apa pun.** Data lokal
bersih, sehingga sebelum dan sesudah migration harus identik. Bandingkan, dengan snapshot
sebelum migration sebagai pembanding:

- jumlah baris `v_pnl_to` — harus tetap 66.203, membuktikan tidak ada fan-out;
- khusus rute CGK → Tanjung Pinang, jumlah baris harus tetap, bukan berlipat;
- `SUM(revenue_total)`, `SUM(gross_weight)`, dan `COUNT(DISTINCT awb)` per pasangan
  `(origin_station, dest_station)` — harus sama persis;
- jumlah baris dengan `issue = 'station_mapping_missing'` harus 0 pada data lokal yang bersih;
- `SUM(cost_smu_awb)`, `SUM(cost_ra_awb)`, `SUM(cost_sg_out_awb)`, dan `SUM(cost_sg_in_to)` harus
  identik — ini yang membuktikan pemindahan `awb_totals` dan join SG Incoming ke kolom `_resolved`
  tidak menggeser biaya apa pun;
- daftar kolom view (`information_schema.columns`) harus identik nama dan urutannya, membuktikan
  akhiran `_resolved` tidak bocor ke output.

**Skenario kotor.** Karena data lokal tidak punya baris tanpa station, buat fixture sementara
di dalam transaksi yang di-rollback: kosongkan `origin_station` / `destination_station` pada
sejumlah baris compile, refresh view, dan pastikan lookup mengisinya kembali dengan nilai yang
sama. Lalu kosongkan juga pasangan DC-nya dari master dan pastikan baris tersebut mendapat
`issue = 'station_mapping_missing'` serta tetap terhitung di `getSummary`.

**Tes unit** (`DataSource` di-mock, mengikuti `pnl.service.spec.ts` yang ada):

- `getAwbDrilldown` memetakan `issue_rank` 7 ke `station_mapping_missing`;
- `getDataQuality` dan ringkasannya meneruskan nilai issue baru tanpa perubahan.

**Frontend:** `issueLabel('station_mapping_missing')` mengembalikan label barunya, bukan
mengembalikan string mentahnya.

## Di Luar Cakupan

- Jalur Sea, sampai PnL memang mencakupnya.
- Kolom `3lc_origin` / `3lc_destination`. Pencocokan tarif SMU sudah berjalan lewat `via` / `dest`
  yang dibawa sheet `air_shipments_smu_rate_cgk_spx` sendiri (join `vendor + airlines + via +
  dest`) dan tidak bergantung pada kolom station yang kosong itu.
- Mendaftarkan 3 pasangan Sidoarjo → Banjarmasin ke `air_shipments_data`. Itu perbaikan data,
  bukan kode, dan setelah perubahan ini panel Data Quality akan memunculkannya bila sheet-nya
  ikut kosong.
- Memperbaiki AWB tanpa booking (`126-93066761`, `888-10650426`, `920-28684692`) — juga perbaikan
  data sumber.
