# Toggle "Wajib" di Master Data — Design

**Tanggal:** 2026-09-22
**Status:** Disetujui, siap dibuatkan rencana implementasi

## Masalah

Kolom `is_required` sudah didukung penuh dari database sampai service, tetapi tidak pernah
terpasang di form Master Data. Akibatnya nilai flag ini hanya bisa berasal dari migrasi seed.

Migrasi `20260912000003-fleet-doc-required-flags.ts` sendiri menuliskan niat itu secara eksplisit:

> "an admin who changes that policy should be able to flip it from the Master Data screen instead
> of waiting for a deploy."

Layarnya tidak pernah dibuat. Konsekuensinya ada dua:

1. **Baris baru lahir sebagai `NULL`.** Kolomnya `nullable` tanpa default, dan `create()` langsung
   menyimpan apa adanya. Setiap `jenis_berkas` baru yang dibuat operator muncul di grid dan bisa
   diunggah, tetapi tidak pernah menaikkan penyebut chip kelengkapan — dan tidak ada cara
   menjadikannya wajib lewat UI.
2. **Kebijakan terkunci di deploy.** Mengubah satu dokumen dari opsional menjadi wajib memerlukan
   migrasi baru.

## Layer yang sudah ada vs yang hilang

| Layer | `is_required` | Keterangan |
|---|---|---|
| DB | ada | kolom `boolean NULL` |
| Entity | ada | `fleet-master-data.entity.ts:42` |
| DTO create & update | ada | keduanya menerima `isRequired` |
| Service | ada | `fleet-master-data.service.ts:70` meng-`patch` |
| Tipe & hook FE | ada | `types.ts:42` sudah membawanya |
| **Form UI** | **hilang** | `MasterDataFormDialog.tsx` tidak punya field-nya |
| **Kolom tabel** | **hilang** | `master-data/page.tsx` tidak menampilkannya |

Pekerjaan ini hampir seluruhnya di frontend; backend hanya perlu satu default.

## Keputusan desain

### 1. Cakupan: `jenis_berkas` dan `jenis_dokumen` saja

Hanya dua kategori ini yang benar-benar membaca `is_required`:

- `jenis_berkas` → `fleet-vehicles.service.ts:644`, penyebut chip kelengkapan (`3/3`)
- `jenis_dokumen` → `fleet-vehicles.service.ts:507`, validasi tanggal kedaluwarsa di form kendaraan

Enam kategori lain (`pool`, `leasing`, `kepemilikan`, `jenis_armada`, `status_kendaraan`,
`jenis_sim`) tidak pernah membacanya. Menampilkan toggle di sana berarti memberi operator kontrol
yang tidak berefek apa pun.

Polanya mengikuti `CATEGORIES_WITH_WARN_DAYS` yang sudah ada — konstanta daftar kategori, dipakai
untuk merender field secara kondisional.

### 2. Default `FALSE`, plus migrasi backfill `NULL` → `FALSE`

Baris baru eksplisit `FALSE` (tidak wajib). `TRUE` sebagai default berbahaya: setiap slot baru
akan langsung menaikkan penyebut chip menjadi `/4`, `/5`, dan membuat seluruh armada terbaca
"belum lengkap" seketika.

Migrasi membersihkan `NULL` yang ada menjadi `FALSE` supaya kolomnya tidak lagi ambigu — `NULL`
dan `FALSE` sama-sama dibaca "tidak wajib" oleh service, jadi backfill ini tidak mengubah
perilaku sistem sama sekali, hanya menyamakan representasinya.

Dibatasi ke dua kategori yang memakai flag ini. Enam kategori lain tetap `NULL`, karena bagi
mereka kolom itu memang tak bermakna dan menuliskan `FALSE` akan mengklaim sebuah kebijakan yang
tidak ada.

### 3. Peringatan berupa teks, bukan dialog

Menyalakan toggle pada satu `jenis_berkas` langsung menaikkan penyebut chip untuk **semua**
kendaraan: `3/3` menjadi `3/4`, dan unit yang tadinya hijau berubah kuning. Itu memang gunanya,
tetapi mengejutkan kalau tak diberi tahu.

Pilihan dialog konfirmasi ditolak karena `MasterDataFormDialog` sendiri sudah sebuah `Dialog`;
menumpuk `ConfirmDialog` di atasnya menghasilkan nested Radix dialog yang berebut fokus dan
`onOpenChange`. Sebagai gantinya: satu baris teks peringatan tepat di bawah checkbox, digayakan
sebagai peringatan (bukan hint netral) supaya tetap terbaca.

## Perubahan

### Backend

**Migrasi baru** — `20260922000001-fleet-required-flags-backfill.ts`

```sql
-- up()
UPDATE fleet_master_data SET is_required = FALSE
WHERE is_required IS NULL AND category IN ('jenis_berkas','jenis_dokumen')
```

`down()` mengembalikan `FALSE` → `NULL` untuk dua kategori itu. Ini **tidak simetris**: baris yang
sudah `FALSE` sejak `20260912000003` ikut menjadi `NULL`. Asimetri itu diterima dan didokumentasikan
di komentar migrasi, mengikuti gaya `20260912000003` yang juga menjelaskan alasan `down()`-nya
tidak memulihkan nilai per baris.

**Service** — `fleet-master-data.service.ts`

`create()` mengisi `isRequired: false` bila DTO tidak menyebutnya **dan** kategorinya termasuk dua
di atas. Ini menutup jalur API langsung, bukan hanya mengandalkan form berkelakuan baik.

### Frontend

**`types.ts`** — tambah konstanta sejajar `CATEGORIES_WITH_WARN_DAYS`:

```ts
export const CATEGORIES_WITH_REQUIRED: readonly FleetMasterCategory[] = [
  'jenis_berkas',
  'jenis_dokumen',
]
```

**`MasterDataFormDialog.tsx`**

- state `isRequired`, diinisialisasi `initial?.isRequired ?? false`
- checkbox native mengikuti pola `VehicleFilters.tsx:131-139` (tidak ada komponen `Switch` di
  `components/ui/`, dan tidak perlu menambahkannya)
- dirender hanya bila `CATEGORIES_WITH_REQUIRED.includes(category)`
- teks peringatan di bawahnya
- payload menyertakan `isRequired` hanya untuk kategori relevan

**`master-data/page.tsx`** — kolom "Wajib" (✓ / —), kondisional persis seperti kolom
`Ambang (hari)` yang sudah ada.

## Testing

TDD: test merah lebih dulu.

**Migrasi** — mengikuti pola recording runner di `20260912000003-fleet-doc-required-flags.spec.ts`
(menangkap SQL tanpa database):

- hanya menyentuh `is_required IS NULL`
- hanya dua kategori tersebut
- menulis `FALSE`, bukan `TRUE`

**Form**

- checkbox tampil untuk `jenis_berkas` dan `jenis_dokumen`
- checkbox **tidak** tampil untuk `pool` (kategori tak relevan)
- nilai tercentang terkirim di payload submit
- saat mengubah baris, nilai awal terbaca dari `initial.isRequired`
- baris dengan `isRequired: null` tampil tidak tercentang

**Tabel**

- kolom "Wajib" tampil untuk kategori relevan, tidak untuk yang lain

**Service**

- `create()` tanpa `isRequired` menghasilkan `false` untuk dua kategori itu
- `create()` tanpa `isRequired` membiarkan kategori lain apa adanya
- `isRequired` eksplisit tidak ditimpa

## Yang sengaja tidak dikerjakan

- **Tidak** menambah komponen `Switch` ke `components/ui/`. Checkbox native sudah menjadi pola
  yang konsisten di fleet.
- **Tidak** menyentuh enam kategori lain, baik di migrasi maupun di UI.
- **Tidak** mengubah cara `berkasCount` dihitung. Logikanya sudah benar; yang hilang hanya
  kontrolnya.
