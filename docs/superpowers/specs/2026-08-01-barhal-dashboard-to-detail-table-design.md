# Barhal Dashboard — Tabel Detail TO (2 Tab)

**Tanggal:** 2026-08-01
**Status:** Approved

## Tujuan

Menambahkan tabel detail level-TO di halaman Barhal Dashboard, dengan dua tab:

- **TO dalam koli** — TO barhal yang sudah dipacking ke sebuah Koli
- **TO belum masuk koli** — TO barhal yang belum terikat ke Koli manapun

Tabel rekap yang sudah ada (Rekap Per Tanggal / Per Rute) bersifat agregat. Tabel ini melengkapinya dengan
daftar TO satuan supaya operator bisa menelusuri TO mana yang belum tertangani.

## Kolom

**Tab `TO dalam koli`**

| Kolom | Sumber |
|---|---|
| Tanggal | `air_shipments_compileaircgk.completed_date` |
| Origin | `origin_station`, dinormalisasi |
| Destinasi | `dest_station`, dinormalisasi |
| No. TO | `to_number` |
| No. Koli | `barhal_koli.koli_number` |
| Gross Weight | `air_shipments_compileaircgk.gross_weight` |

**Tab `TO belum masuk koli`** — sama, tanpa kolom No. Koli.

Weight Before / Weight After sengaja **tidak** dipakai: keduanya tersimpan di level Koli
(`barhal_koli`), bukan per TO, sehingga tidak bermakna pada baris TO. Gross Weight per-TO adalah
angka yang benar untuk granularitas ini.

Tanggal yang ditampilkan adalah `completed_date` milik TO (bukan `koli_date`), supaya kedua tab
konsisten dan cocok dengan filter tanggal yang diterapkan.

## Backend

### Endpoint

`GET /barhal/to-detail` — guard `JwtAuthGuard`, `@Authorize(Permission.READ_BARHAL)`.

### Query DTO — `dto/barhal-to-detail-query.dto.ts`

| Field | Tipe | Keterangan |
|---|---|---|
| `tab` | `'in-koli' \| 'not-in-koli'` | wajib |
| `startDate` | `string?` | ISO date; berlaku bersama `endDate` |
| `endDate` | `string?` | ISO date |
| `origin` | `string?` | nama station ternormalisasi |
| `dest` | `string?` | nama station ternormalisasi |
| `page` | `number?` | default 1 |
| `pageSize` | `number?` | default 25, maksimal 100 |

### Service — `BarhalService.getToDetail(dto)`

Basis filter mengikuti `getDashboard()`:

```
e.remarks ILIKE '%barhal%'
AND e.to_number IS NOT NULL
AND e.completed_date IS NOT NULL
```

Ditambah, bila diisi:

- `e.completed_date BETWEEN $start AND $end` (hanya bila `startDate` **dan** `endDate` terisi)
- `normalizedStationSql('e.origin_station') = $origin`
- `normalizedStationSql('e.dest_station') = $dest`

Klausa pembeda antar-tab:

- `in-koli` → `JOIN barhal_koli_to bkt ON bkt.to_number = e.to_number JOIN barhal_koli k ON k.id = bkt.koli_id`
- `not-in-koli` → `NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = e.to_number)`

`barhal_koli_to.to_number` punya unique constraint, sehingga join pada tab `in-koli` tidak
menggandakan baris.

Urutan: `completed_date DESC, to_number`. Paginasi via `LIMIT`/`OFFSET`, dengan `COUNT(*)` terpisah
memakai predikat yang sama.

Response:

```ts
{ data: BarhalToDetailItem[], total: number, page: number, pageSize: number }
```

```ts
interface BarhalToDetailItem {
  date: string
  originName: string
  destName: string
  toNumber: string
  koliNumber: string | null   // selalu null pada tab not-in-koli
  grossWeight: number | null
}
```

## Frontend

### Hook — `features/barhal/hooks/useBarhalDashboard.ts`

`useBarhalToDetail(params)` memakai `useQuery` dengan key `['barhal', 'to-detail', params]`,
memanggil `GET /barhal/to-detail`. Mengikuti pola `useBarhalDashboardStats` yang sudah ada
(`staleTime: 30_000`).

### Komponen — `features/barhal/components/BarhalToDetailTable.tsx`

- Menerima props filter dashboard: `startDate`, `endDate`, `origin`, `dest`
- State lokal: `tab` dan `page`
- Tab switcher dua tombol; `page` di-reset ke 1 saat tab berganti atau saat props filter berubah
- Kolom dirender kondisional: `No. Koli` hanya muncul pada tab `in-koli`
- Markup tabel mengikuti `BarhalRecapToTable` (`overflow-x-auto rounded-lg border bg-card`, header
  `bg-muted/50`, `divide-y divide-border`)
- Gross Weight diformat dengan `Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })` + suffix `kg`
- State kosong: baris `colSpan` penuh bertuliskan "No data for this range."
- Kontrol paginasi Prev/Next dengan indikator `page` dari `total`

### Halaman — `app/(dashboard)/barhal/dashboard/page.tsx`

Section baru berjudul "Detail TO", ditempatkan setelah "Rekap Per Rute" dan **di luar** blok
`isLoading || !data`, supaya fetch-nya independen dari query dashboard dan tabel tetap tampil
walau agregat masih loading.

## Testing

`barhal.service.spec.ts` — tambahkan test untuk `getToDetail`:

1. Tab `in-koli` menghasilkan SQL dengan join ke `barhal_koli_to` dan mengembalikan `koliNumber`
2. Tab `not-in-koli` menghasilkan SQL dengan `NOT EXISTS` dan `koliNumber` null
3. Filter tanggal/origin/dest diteruskan sebagai parameter terikat (bound parameters)
4. `page`/`pageSize` diterjemahkan ke `LIMIT`/`OFFSET` yang benar

Mengikuti pola mock `dataSource.query` yang sudah dipakai di spec tersebut.

## Di luar cakupan

- Search box pada tabel
- Export CSV untuk tabel ini
- Aksi baris (klik ke detail Koli)
