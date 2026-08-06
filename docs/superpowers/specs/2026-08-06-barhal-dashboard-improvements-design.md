# Barhal — Sorting, Format Tanggal, Drilldown Rekap & Rute dari Master Data

**Tanggal:** 2026-08-06
**Status:** Approved

## Tujuan

Empat perbaikan pada modul Barhal yang berdiri sendiri satu sama lain:

1. Memastikan `Detail TO` di dashboard terurut berdasarkan `Tanggal`.
2. Menyeragamkan format kolom tanggal (`DD-MMM-YYYY`) dan datetime (`DD-MMM-YYYY HH:mm`) di seluruh
   tabel Barhal.
3. Membuat baris `Rekap Per Tanggal` dan `Rekap Per Rute` bisa di-drilldown.
4. Mengambil Rute pada pemilihan TO (wizard Koli step 2) dari master `air_shipments_data`, bukan lagi
   dari `air_shipments_compileaircgk`.

Poin 1 ternyata sudah benar dan tidak menghasilkan pekerjaan; rinciannya tetap dicatat di bawah agar
tidak diperiksa ulang di kemudian hari.

---

## 1. Sorting `Detail TO` — sudah benar, tidak ada perubahan

`BarhalToDetailTable` tidak melakukan sorting di sisi klien; urutannya sepenuhnya datang dari backend
pada `barhal.service.ts` (`getToDetail`):

```sql
ORDER BY b.completed_date DESC, b.to_number
```

`air_shipments_compileaircgk.completed_date` adalah kolom bertipe `DATE` (generated, `STORED`) —
sudah diverifikasi lewat `information_schema.columns` — sehingga pengurutan ini benar-benar
kronologis, bukan leksikografis. Berlaku untuk kedua tab (`in-koli` dan `not-in-koli`).

**Kontrak:** terbaru di atas, `to_number` sebagai tie-breaker. Tidak ada pekerjaan untuk poin ini.

---

## 2. Format tanggal & datetime di tabel Barhal

### Utility baru

`apps/frontend/src/features/barhal/utils/dateFormat.ts`, dibangun di atas `moment` (sudah menjadi
dependency frontend dan sudah dipakai `AirShipmentTable`):

| Fungsi | Keluaran | Nilai kosong / tidak valid |
| --- | --- | --- |
| `formatDate(v)` | `DD-MMM-YYYY` | `'—'` |
| `formatDateTime(v)` | `DD-MMM-YYYY HH:mm` | `'—'` |

Keduanya menerima `string \| null \| undefined`. Input tanggal dari backend berupa `YYYY-MM-DD`
(kolom `date`) atau ISO-8601 dengan zona (kolom `timestamptz`).

### Cakupan

Hanya `features/barhal/`. Tabel di luar Barhal (Air Shipments, PNL, Settlement, Settings, Audit)
sengaja tidak disentuh pada perubahan ini. Karena itu utility diletakkan di dalam folder fitur Barhal,
bukan di `shared/utils` — kalau nanti dipakai lintas fitur, barulah dipromosikan.

### Daftar call site

| Berkas | Field | Format |
| --- | --- | --- |
| `BarhalToDetailTable.tsx:103` | `row.date` | date |
| `BarhalRecapToTable.tsx:18` | label grup tanggal | date |
| `BarhalRecapBatangKayuTable.tsx:36` | `row.date` | date |
| `BarhalListTable.tsx:104` | `koli.koli_date` | date |
| `BarhalSmuInlineTable.tsx:40` | `koli.koli_date` | date |
| `BarhalSmuInlineTable.tsx:53` | `koli.std` (tampilan) | datetime |
| `BarhalSmuListTable.tsx:30` | `item.date` | date |
| `BarhalSmuListTable.tsx:38` | `item.std` / `item.sta` | datetime |
| `ToMultiSelect.tsx:17-22` | menggantikan `formatDate` lokal | date |
| `Step1CreateKoli.tsx:63` | `existingKoli.koli_date` | date |

### Dua catatan penting

**`ToMultiSelect` sudah punya formatter sendiri** yang menghasilkan `08 Jan 2026` (pakai spasi).
Formatter lokal itu dihapus dan diganti utility bersama, sehingga keluarannya menjadi `08-Jan-2026`.

**`std` / `sta` bertipe `timestamptz`.** `BarhalSmuInlineTable.tsx:17` sekarang mengisi input
`datetime-local` dengan `koli.std.slice(0, 16)`, yaitu jam dinding **UTC**. Kalau tampilannya diformat
ke waktu lokal browser sementara input dibiarkan apa adanya, keduanya akan berselisih 7 jam di WIB.
Karena itu input ikut diubah menjadi `moment(koli.std).format('YYYY-MM-DDTHH:mm')` agar tampilan dan
field edit konsisten.

**Di luar cakupan:** jalur tulisnya sendiri (`applySmuFields` memanggil `new Date(dto.std)` atas string
tanpa zona, sehingga diinterpretasikan sebagai waktu lokal server) tetap seperti sekarang. Ini bug
lama yang berdiri sendiri dan tidak diperbaiki di sini.

---

## 3. Drilldown pada tabel Rekap

### Endpoint

Satu endpoint baru yang memakai ulang SQL rekap yang sudah ada:

```
GET /barhal/dashboard/drilldown?groupBy=route|date&startDate&endDate&origin&dest
```

| Baris yang diklik | Panggilan frontend | Respons |
| --- | --- | --- |
| `Rekap Per Tanggal` | `groupBy=route`, `startDate=endDate=<tanggal baris>`, filter lain diteruskan | `BarhalRecapPerRuteItem[]` |
| `Rekap Per Rute` | `groupBy=date`, `origin`/`dest` = rute baris, range dashboard dipertahankan | `BarhalRecapPerTanggalItem[]` |

Identitas baris yang diklik melebur secara alami ke dalam parameter filter yang sudah ada, sehingga
tidak perlu nama parameter baru dan tidak perlu tipe respons baru — kedua bentuk itu sudah ada di
`types.ts`.

DTO baru `dto/barhal-drilldown-query.dto.ts` meng-extend `BarhalDashboardQueryDto` dengan satu field
`groupBy: 'route' | 'date'` (wajib, divalidasi `@IsIn`). Permission tetap `Permission.READ_BARHAL`.

### Refactor yang menyertainya

`getDashboard` sekarang ±230 baris dan memuat kedua query agregat secara inline. Kedua query itu
diekstrak menjadi method privat `queryPerTanggal(...)` dan `queryPerRute(...)`, dipakai bersama oleh
`getDashboard` dan `getDrilldown`. SQL dan `toRecapMetrics` yang sama dipakai kedua jalur, sehingga
angka drilldown pasti rekonsiliasi dengan baris induknya — bukan karena kebetulan, tapi karena memang
satu sumber.

### Densifikasi sengaja dilewati di drilldown

Tabel induk sengaja mengisi setiap tanggal kalender (`densifyPerTanggal`) dan setiap rute master
(`densifyPerRute`). Perilaku itu **tidak** dibawa ke drilldown: menampilkan 31 baris untuk satu rute
yang hanya 3 hari ada aktivitas, atau seluruh daftar rute di bawah satu tanggal, hanya jadi noise.

**Kontrak:** drilldown hanya menampilkan baris yang punya aktivitas. Kalau kosong, tampilkan pesan
`Tidak ada aktivitas`.

### Frontend

`BarhalRecapToTable` mendapat baris yang bisa dibuka:

- Chevron di kolom grup; klik untuk toggle. Beberapa baris boleh terbuka bersamaan.
- Isi baris yang terbuka dirender sebagai `<tr><td colSpan={10}>` berisi sub-tabel dengan 10 kolom
  yang sama, dengan indentasi dan warna yang lebih redup.
- Hook baru `useBarhalRecapDrilldown(params, enabled)` di `useBarhalDashboard.ts`. `enabled` bernilai
  false sampai barisnya dibuka, sehingga tidak ada fetch saat halaman dimuat. Loading / error / empty
  ditangani per baris.
- Dua prop baru: `groupBy: 'date' | 'route'` (menggantikan inferensi `'date' in row` yang sekarang)
  dan `filters` berisi filter dashboard yang aktif.
- State baris terbuka di-reset saat filter berubah, mengikuti pola reset halaman di
  `BarhalToDetailTable`.

---

## 4. Rute dari `air_shipments_data`

### Latar

Sekarang `getAvailableTos` dan `getStations` membaca rute dari
`air_shipments_compileaircgk.extra_fields.origin_station` / `.destination_station`. Sumber yang benar
adalah master `air_shipments_data`, dijoin lewat pasangan DC.

`air_shipments_data` punya kolom top-level asli `origin_dc` dan `destination_dc` (bukan generated),
dengan nama stasiun tersimpan di `extra_fields`.

### CTE bersama

```sql
route_master AS (
  SELECT DISTINCT ON (origin_dc, destination_dc)
    origin_dc, destination_dc,
    extra_fields->>'origin_station'      AS origin_station,
    extra_fields->>'destination_station' AS dest_station
  FROM air_shipments_data
  WHERE origin_dc IS NOT NULL AND destination_dc IS NOT NULL
  ORDER BY origin_dc, destination_dc, service
)
```

`DISTINCT ON` bersifat wajib, bukan kosmetik: `air_shipments_data` unik pada
`(service, origin_dc, destination_dc)`, sehingga satu pasangan DC bisa punya baris `Air` **dan** `Sea`.
Tanpa `DISTINCT ON`, join akan menggandakan baris TO. Satu-satunya pasangan yang ganda saat ini
(`Kosambi DC → Tanjung Pinang DC`) membawa nama stasiun yang identik di kedua baris, jadi pemilihan
deterministik lewat `ORDER BY ... service` aman.

### `getAvailableTos`

**INNER JOIN** ke `route_master`:

```sql
JOIN route_master rm
  ON rm.origin_dc      = c.extra_fields->>'origin'
 AND rm.destination_dc = c.extra_fields->>'destination'
```

Baris yang dikembalikan memakai `rm.origin_station` / `rm.dest_station` sebagai `origin_station` /
`dest_station`. Karena filter `normalizeStationName` yang sudah ada berjalan di atas nilai hasil join
ini, syarat "filter ikut hasil join" terpenuhi tanpa mengubah logika filter itu sendiri.

### `getStations`

Join yang sama, `DISTINCT` atas `rm.origin_station` / `rm.dest_station`, tetap dibatasi pada TO
barhal. Rute yang tidak terdaftar di master hilang dari dropdown wizard maupun dropdown filter
dashboard.

### Konsekuensi yang disengaja

**TO tanpa pasangan di master menjadi tidak bisa dipacking.** Ini keputusan sadar: master data harus
dilengkapi. Saat spesifikasi ini ditulis, 12 TO pada rute `Sidoarjo DC → Banjarmasin DC`,
`→ Banjarbaru DC`, dan `→ Banjarmasin 2 DC` tidak punya baris di `air_shipments_data` dan akan
terdampak.

Agar penyebabnya tidak membingungkan operator, ada dua penanda di UI:

1. Respons `getAvailableTos` berubah bentuk dari `AvailableToRow[]` menjadi
   `{ data: AvailableToRow[]; unmatchedRouteCount: number }`, sehingga `ToMultiSelect` bisa menampilkan
   *"N TO disembunyikan — rutenya belum terdaftar di master air_shipments_data."* Konsumennya hanya
   `Step2SelectTos`, jadi perubahan bentuk ini terkurung di satu tempat.

   `unmatchedRouteCount` dihitung setelah filter tingkat SQL diterapkan (search, tanggal,
   sudah-masuk-Koli) dan **sebelum** `AVAILABLE_TOS_LIMIT` (100) dipotong. Angka ini **tidak** ikut
   dipersempit filter origin/dest — dan memang tidak bisa: baris yang gagal dijoin tidak punya rute
   untuk dibandingkan. Jadi artinya "berapa TO dalam cakupan pencarian ini yang tersaring karena
   rutenya belum terdaftar di master". `data` tetap dipotong 100 seperti sekarang.
2. Teks bantuan statis di bawah dropdown origin/dest pada Step 1: *"Hanya rute yang terdaftar di master
   air_shipments_data yang tersedia."*

Karena join bersifat INNER, tidak akan pernah ada Rute yang tampil sebagai `'—'` di daftar TO — TO-nya
memang tidak muncul sama sekali.

### Batasan yang diterima

Perubahan ini terbatas pada pemilihan TO di wizard (poin 4 sebagaimana diminta). Agregasi dashboard
(`getDashboard`, `getToDetail`) dan daftar `masterRoutes` **tetap** memakai
`compileaircgk.origin_station` / `dest_station`.

Akibatnya `Rekap Per Rute` masih akan menampilkan `Surabaya → Banjarmasin` sementara dropdown filter
tidak lagi menawarkannya. Ini nyata dan akan terlihat sampai master sheet dilengkapi. Penyelesaiannya
adalah melengkapi data, bukan menambah kode.

### Verifikasi terhadap data saat ini

Join sudah diuji langsung terhadap database lokal. Untuk seluruh TO barhal yang **berhasil** dijoin,
nama stasiun hasil join **identik** dengan nilai `compileaircgk` yang dipakai sekarang. Jadi perubahan
ini tidak menggeser nama stasiun mana pun, tidak mengubah `koli.origin_name` / `dest_name`, dan tidak
mengubah penomoran Koli yang sudah ada. Satu-satunya perbedaan perilaku adalah hilangnya rute yang
tidak terdaftar di master.

---

## Rencana pengujian

| Area | Uji |
| --- | --- |
| `dateFormat.ts` | Unit test: tanggal valid, datetime valid, `null`, string kosong, string tak terparse |
| `barhal-recap.builder` | Tidak berubah — test yang ada harus tetap hijau |
| `getDrilldown` | Service test: `groupBy=route` untuk satu tanggal, `groupBy=date` untuk satu rute, hasil kosong, `groupBy` tidak valid ditolak |
| Rekonsiliasi | Service test: total drilldown per rute untuk satu tanggal = baris `Rekap Per Tanggal` tanggal itu |
| `getAvailableTos` | Service test: rute cocok, rute tidak cocok tersaring, `unmatchedRouteCount` benar, pasangan DC ganda tidak menggandakan baris |
| `getStations` | Service test: rute tak terdaftar tidak muncul di dropdown |

## Berkas yang tersentuh

**Backend**
- `barhal.service.ts` — ekstrak `queryPerTanggal` / `queryPerRute`, tambah `getDrilldown`, ubah
  `getAvailableTos` & `getStations`
- `barhal.controller.ts` — route `GET dashboard/drilldown`
- `dto/barhal-drilldown-query.dto.ts` — baru

**Frontend**
- `features/barhal/utils/dateFormat.ts` — baru
- `features/barhal/hooks/useBarhalDashboard.ts` — `useBarhalRecapDrilldown`
- `features/barhal/hooks/useBarhal.ts` — penyesuaian bentuk respons `useAvailableTos`
- `features/barhal/types.ts` — tipe respons available-TO & param drilldown
- `features/barhal/components/BarhalRecapToTable.tsx` — baris expandable
- `features/barhal/components/ToMultiSelect.tsx` — hapus formatter lokal, tambah catatan TO tersembunyi
- `features/barhal/components/wizard/Step1CreateKoli.tsx` — teks bantuan + format tanggal
- `features/barhal/components/wizard/Step2SelectTos.tsx` — menyesuaikan bentuk respons
- `BarhalToDetailTable.tsx`, `BarhalRecapBatangKayuTable.tsx`, `BarhalListTable.tsx`,
  `BarhalSmuInlineTable.tsx`, `BarhalSmuListTable.tsx` — format tanggal
- `app/(dashboard)/barhal/dashboard/page.tsx` — teruskan `groupBy` & `filters` ke `BarhalRecapToTable`
