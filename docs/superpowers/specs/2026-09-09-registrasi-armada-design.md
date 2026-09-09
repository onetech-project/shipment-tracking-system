# Registrasi Armada — Design

**Tanggal:** 2026-09-09
**Status:** Disetujui, siap masuk implementation plan
**Sumber:** `sistem-registrasi-armada.html` (prototipe mandiri, 1158 baris)

## 1. Ringkasan

Port prototipe HTML mandiri "Registrasi Armada" menjadi modul penuh di esp-dashboard:
buku induk kendaraan angkutan barang dengan pemantauan masa berlaku dokumen,
softcopy berkas, dan angsuran leasing.

Dikerjakan dalam 4 phase yang masing-masing bisa di-merge sendiri.

Prototipe menyimpan segalanya di localStorage/connector `window.claude.db` dengan foto
sebagai data URI base64. Port ini memindahkan data ke Postgres (mengikuti pola modul
existing) dan berkas ke MinIO/S3 lewat presigned URL.

### Cakupan

Termasuk: master data dropdown, data sopir, registrasi kendaraan, dokumen & masa berlaku,
softcopy berkas, kontrak leasing/sewa, kartu ringkasan, daftar "Perlu tindakan", ekspor CSV.

Tidak termasuk: notifikasi email/WhatsApp untuk dokumen jatuh tempo, riwayat servis
sebagai modul sendiri, integrasi GPS/telematik, penjadwalan uji KIR. Semuanya di luar
prototipe dan tidak diminta.

### Prinsip

Modul ini **tidak memperkenalkan pola arsitektur baru**. Semua mengikuti `vendor-groups`
(entity UUID + service + controller ber-`@Authorize` + DTO ber-`class-validator`, feature
frontend dengan React Query hooks) dan `air-shipments` (sub-nav lewat `layout.tsx`).
Satu-satunya infrastruktur baru adalah `StorageModule` untuk MinIO, yang memang belum ada
padanannya di repo.

## 2. Keputusan desain

Delapan keputusan yang diambil saat brainstorming, dengan alasannya. Yang berbeda dari
prototipe diberi tanda ⚠.

### 2.1 Master data: satu tabel generik + kategori

`fleet_master_data` dengan kolom `category`, bukan lima tabel terpisah.

Dropdown yang di-master-data-kan: jenis armada, kepemilikan, leasing, status kendaraan,
pool, jenis dokumen, jenis berkas, jenis SIM.

**Alasan:** delapan kategori × (entity + service + controller + DTO + permission + halaman UI)
adalah boilerplate yang tidak dibayar oleh perbedaan apa pun di antara mereka — semuanya
daftar label berurut. Menambah kategori baru nanti tidak butuh migration.

**Trade-off yang diterima:** tiga kolom nullable khusus-kategori (`warn_days`,
`default_valid_months`, `is_required`) hidup di tabel generik. Alternatifnya `config jsonb`,
ditolak karena `warn_days` dipakai langsung di predikat query alert — kolom nyata lebih baik
daripada `(config->>'warnDays')::int` yang tidak terindeks dan tidak bertipe.

### 2.2 ⚠ Pool jadi master data (prototipe: teks bebas)

**Alasan:** prototipe membangun dropdown filter pool dari nilai distinct yang diketik operator,
sehingga "Pool Cakung" dan "pool cakung" jadi dua pool berbeda. Ini juga sumber bug filter
hantu di prototipe (`renderFilters`, baris 482): saat pool terakhir yang memakai suatu nilai
dihapus, dropdown reset ke "Semua pool" tapi state filter masih menolak semua baris —
tampil "0 dari N" tanpa penjelasan. Dengan referensi FK, bug ini tidak bisa terjadi.

### 2.3 ⚠ Jenis berkas jadi master data (prototipe: 4 slot hardcoded)

Kategori `jenis_berkas` menggantikan array `BERKAS` yang di-hardcode. Admin bisa menambah
slot (Kartu Pengawasan, Faktur, Form A) tanpa deploy. Kolom `is_required` menentukan slot
mana yang dihitung untuk indikator kelengkapan.

### 2.4 ⚠ Dokumen di tabel terpisah (prototipe: 12 kolom tanggal)

`fleet_vehicle_documents` menggantikan `kir_exp`, `stnk_exp`, `pajak_exp`, dst.

**Alasan:** jenis dokumen ikut master data, jadi menambah jenis dokumen tidak butuh migration.
Lebih penting: perpanjangan KIR menjadi baris baru dengan `is_current=false` pada yang lama,
sehingga riwayat perpanjangan tersimpan. Prototipe menimpa tanggal lama dan kehilangannya.

### 2.5 ⚠ Kontrak leasing di tabel terpisah (prototipe: kolom di kendaraan)

`fleet_lease_contracts` dengan `closed_at` nullable. Satu kendaraan bisa punya riwayat
kontrak (lunas, lalu kredit lagi); prototipe hanya menyimpan yang terakhir.

**`contract_type` (`kredit` | `sewa`) adalah kolom yang tidak ada di prototipe.** Prototipe
menjumlahkan cicilan leasing dan biaya sewa lepas kunci ke dalam satu angka, lalu melabelinya
"sisa kewajiban leasing" (`renderTiles`, baris 442) — padahal unit sewa punya
`leasing:"Tanpa leasing"`. Angkanya benar sebagai total kewajiban, labelnya keliru. Dengan
`contract_type` kartu ringkasan bisa memisah keduanya dan tetap jujur.

### 2.6 ⚠ Sopir jadi entitas sendiri (prototipe: teks bebas + SIM di kendaraan)

`fleet_drivers` dengan nomor SIM, jenis SIM, dan masa berlakunya.

**Alasan:** SIM adalah milik orang, bukan milik kendaraan. Di prototipe, satu sopir yang
memegang dua unit berarti data SIM-nya diketik dua kali dan bisa berbeda; sopir yang pindah
unit meninggalkan data SIM yang salah di unit lama. Peringatan SIM kedaluwarsa sekarang
melekat pada sopir dan muncul di "Perlu tindakan" lewat kendaraan yang sedang dipegangnya.

### 2.7 Kalkulasi status di backend

Backend menghitung severity dokumen, sisa hari, dan sisa angsuran; frontend hanya menampilkan.

**Alasan:** filter "Kedaluwarsa" / "≤ 30 hari" harus jadi predikat SQL supaya bekerja bersama
pagination. Prototipe memfilter di klien, yang hanya benar bila seluruh baris sudah dimuat.
Efek samping yang diinginkan: ekspor CSV dijamin konsisten dengan yang tampil di layar,
karena keduanya membaca perhitungan yang sama.

### 2.8 ⚠ Ambang peringatan per jenis dokumen (prototipe: konstanta 30 hari global)

`warn_days` per baris di kategori `jenis_dokumen` dan `jenis_sim`. Lead time perpanjangan tiap dokumen
berbeda secara operasional — KIR butuh jadwal uji, servis berkala cukup beberapa hari.
Default seed 30 hari untuk semua, kecuali servis 14 hari.

### 2.9 ⚠ Nopol unique per unit aktif (prototipe: tanpa cek duplikat sama sekali)

```sql
CREATE UNIQUE INDEX "uq_fleet_vehicles_nopol_active"
  ON "fleet_vehicles" ("nopol") WHERE "is_active";
```

Mengikuti preseden `uq_invitations_org_email_pending` di
`20260314000009-create-indexes.ts`.

**`is_active` ≠ status kendaraan.** Dua konsep yang sengaja dipisah:

| | Arti | Nilai |
|---|---|---|
| `status_id` → master | Status **operasional** | Aktif, Servis, Nonaktif |
| `is_active` (bool) | Status **registrasi** | terdaftar / diarsipkan |

Unit berstatus "Nonaktif" (diparkir menunggu perpanjangan KIR) tetap `is_active=true` dan
tetap memegang nopolnya. Hanya unit yang diarsipkan — dijual, dilepas dari kontrak sewa —
yang melepaskan nopol untuk dipakai unit lain.

`nopol` dinormalisasi saat tulis: uppercase, spasi berlebih dipadatkan jadi satu.
`"b  9114   kyz"` dan `"B 9114 KYZ"` bertabrakan sebagaimana mestinya.

**Hapus jadi arsipkan.** Tombol Hapus menjalankan `is_active=false`. Hard delete tetap
tersedia untuk pemegang `delete.fleet_vehicle`, tapi hanya bila kendaraan belum punya
dokumen, berkas, atau kontrak — salah input bisa dibersihkan, unit dengan riwayat tidak
bisa lenyap.

Daftar menyembunyikan unit arsip secara default, dengan toggle "Tampilkan arsip".
Kartu ringkasan, alert, dan ekspor CSV hanya menghitung unit aktif.

## 3. Data model

Semua tabel prefiks `fleet_`, primary key `uuid`, `created_at`/`updated_at` mengikuti
konvensi entity existing. Tidak di-scope per organization — mengikuti `vendor_groups` dan
`route_groups` yang juga global.

### 3.1 `fleet_master_data` — Phase 1

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `category` | varchar(40) | lihat daftar kategori di bawah |
| `code` | varchar(60) | slug stabil, dipakai kode & seed |
| `label` | varchar(120) | teks yang tampil |
| `sort_order` | int, default 0 | urutan di dropdown |
| `is_active` | bool, default true | nonaktif = tidak muncul di dropdown baru |
| `warn_days` | int null | `jenis_dokumen` dan `jenis_sim` |
| `default_valid_months` | int null | hanya `jenis_dokumen` (KIR = 6) |
| `is_required` | bool null | hanya `jenis_berkas` |

`UNIQUE (category, code)` · index `(category, sort_order)`

**Kategori dan seed awal** (diambil dari konstanta prototipe):

| Kategori | Isi seed |
|---|---|
| `jenis_armada` | Pickup, Colt Diesel Engkel, Colt Diesel Double, Fuso 6 Ban, Tronton, Wingbox, Trailer 20ft, Trailer 40ft, Dump Truck, Mobil Operasional |
| `kepemilikan` | Milik GMS, Milik ESP, Sewa Lepas Kunci |
| `leasing` | Lunas, MTF, Mitsui, Yusuf Finance, Tanpa leasing |
| `status_kendaraan` | Aktif, Servis, Nonaktif |
| `pool` | Pool Cakung, Pool Marunda, Pool Bekasi |
| `jenis_dokumen` | KIR (warn 30, valid 6 bln), STNK (30), Pajak Tahunan (30), Asuransi (30), Kartu Pengawasan (30), Uji Emisi (30), Servis Berkala (14) |
| `jenis_berkas` | STNK, Buku Uji (KIR), BPKB — semua `is_required=true` |
| `jenis_sim` | B1 Umum, B2 Umum, A Umum — semua `warn_days=30` |

⚠ SIM tidak muncul di `jenis_dokumen` maupun `jenis_berkas`. Prototipe memperlakukan SIM
sebagai dokumen kendaraan dan softcopy-nya sebagai slot berkas kendaraan; keduanya pindah ke
sopir mengikuti §2.6. Slot berkas kendaraan karena itu tiga, bukan empat — softcopy SIM
diunggah di halaman Sopir (§4.5).

**Penghapusan master data yang sedang dipakai ditolak** dengan HTTP 409 beserta jumlah
pemakainya. Menonaktifkan (`is_active=false`) selalu boleh: nilai lama tetap terbaca di
kendaraan yang sudah ada, hanya tidak bisa dipilih untuk yang baru. Ini menutup bug prototipe
di `field()` (baris 637), yang mencocokkan option secara persis sehingga nilai tersimpan yang
tidak ada di daftar diam-diam jatuh ke option pertama dan tertulis balik saat simpan —
kehilangan data walau user hanya mengubah odometer.

### 3.2 `fleet_drivers` — Phase 1

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `nama` | varchar(120) | |
| `telepon` | varchar(30) null | |
| `sim_nomor` | varchar(40) null | |
| `sim_jenis_id` | uuid null → master | kategori `jenis_sim` |
| `sim_expires_at` | date null | dipantau di "Perlu tindakan" |
| `is_active` | bool, default true | |

Index `(is_active, nama)` · index `(sim_expires_at) WHERE is_active`

### 3.3 `fleet_vehicles` — Phase 2

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `nopol` | varchar(20) | dinormalisasi; partial unique (§2.9) |
| `merk`, `tipe` | varchar(60) null | |
| `tahun` | int null | |
| `kapasitas` | varchar(60) null | teks bebas: "8 ton / 24 m3" |
| `no_rangka`, `no_mesin`, `no_bpkb` | varchar(60) null | |
| `pemilik_unit` | varchar(120) null | vendor, untuk sewa lepas kunci |
| `odometer` | int null | |
| `catatan` | text null | |
| `jenis_armada_id` | uuid null → master | |
| `kepemilikan_id` | uuid null → master | |
| `pool_id` | uuid null → master | |
| `status_id` | uuid null → master | status operasional |
| `driver_id` | uuid null → `fleet_drivers` | `ON DELETE SET NULL` |
| `is_active` | bool, default true | status registrasi |

FK ke master data `ON DELETE RESTRICT` — konsisten dengan penolakan 409 di §3.1.

### 3.4 `fleet_vehicle_documents` — Phase 2

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `vehicle_id` | uuid → `fleet_vehicles` `ON DELETE CASCADE` |
| `doc_type_id` | uuid → master (`jenis_dokumen`) |
| `nomor` | varchar(80) null |
| `issued_at` | date null |
| `expires_at` | date null |
| `is_current` | bool, default true |

```sql
CREATE UNIQUE INDEX "uq_fleet_vehicle_documents_current"
  ON "fleet_vehicle_documents" ("vehicle_id", "doc_type_id") WHERE "is_current";
```

Index `(expires_at) WHERE is_current` untuk query alert.

Perpanjangan = `UPDATE ... SET is_current=false` pada baris lama, lalu insert baru — dalam
satu transaksi.

### 3.5 `fleet_lease_contracts` — Phase 3

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_id` | uuid → vehicles CASCADE | |
| `leasing_id` | uuid null → master | |
| `contract_type` | varchar(10) | `kredit` \| `sewa` |
| `nomor_kontrak` | varchar(60) null | |
| `cicilan_per_bulan` | numeric(14,2) null | |
| `tenor_bulan` | int null | |
| `angsuran_mulai` | date null | |
| `angsuran_terbayar_override` | int null | kosong = hitung dari tanggal mulai |
| `closed_at` | date null | terisi = kontrak selesai |

```sql
CREATE UNIQUE INDEX "uq_fleet_lease_contracts_open"
  ON "fleet_lease_contracts" ("vehicle_id") WHERE "closed_at" IS NULL;
```

### 3.6 `fleet_vehicle_files` — Phase 3

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_id` | uuid → vehicles CASCADE | |
| `slot_id` | uuid → master (`jenis_berkas`) | |
| `storage_key` | varchar(255) null | key MinIO |
| `original_name` | varchar(255) null | |
| `mime_type` | varchar(100) null | |
| `size_bytes` | bigint null | **byte asli**, bukan panjang base64 |
| `external_url` | text null | alternatif: tautan arsip |
| `uploaded_by` | uuid null → users | |
| `uploaded_at` | timestamptz | |

`UNIQUE (vehicle_id, slot_id)` — satu berkas per slot, ganti = replace.

`CHECK ((storage_key IS NOT NULL) <> (external_url IS NOT NULL))` — tepat satu terisi.

⚠ `size_bytes` menyimpan byte asli. Prototipe menyimpan panjang string base64 untuk gambar
tapi byte asli untuk PDF (baris 822), sehingga `kb()` melebihkan ukuran gambar ~33% dan dua
satuan berbeda tampil berdampingan.

### 3.7 View `fleet_vehicle_document_status` — Phase 2

Menghindari N+1 dan membuat filter severity bisa jadi predikat SQL:

```sql
CREATE VIEW fleet_vehicle_document_status AS
SELECT
  d.vehicle_id,
  MIN(d.expires_at - CURRENT_DATE)                         AS min_days_left,
  MIN(CASE
        WHEN d.expires_at < CURRENT_DATE                          THEN 0  -- crit
        WHEN d.expires_at - CURRENT_DATE <= COALESCE(m.warn_days,30) THEN 1  -- warn
        ELSE 2                                                            -- ok
      END)                                                 AS severity_rank
FROM fleet_vehicle_documents d
JOIN fleet_master_data m ON m.id = d.doc_type_id
WHERE d.is_current AND d.expires_at IS NOT NULL
GROUP BY d.vehicle_id;
```

`severity_rank` numerik supaya `MIN()` menghasilkan yang terburuk dan `ORDER BY` langsung
benar. Kendaraan tanpa dokumen berarti tidak ada baris → `LEFT JOIN` menghasilkan NULL,
dipetakan ke severity `none`.

Kalkulasi ini memakai `CURRENT_DATE` (timezone server). Ambang dokumen bergerak per hari,
bukan per jam, jadi ketepatan sampai hari sudah memadai.

## 4. Object storage (MinIO/S3)

### 4.1 `StorageModule`

Modul shared di `apps/backend/src/modules/storage/`, dibangun di atas
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (bukan SDK MinIO — S3-compatible,
jadi produksi bisa diarahkan ke S3 asli tanpa ganti kode).

Antarmuka yang diekspor sengaja sempit, supaya modul fleet tidak tahu-menahu soal S3:

```ts
interface StorageService {
  createUploadUrl(key: string, mime: string, maxBytes: number): Promise<string>
  createDownloadUrl(key: string, filename: string): Promise<string>
  statObject(key: string): Promise<{ size: number; mime: string } | null>
  deleteObject(key: string): Promise<void>
}
```

Env var (dibaca lewat `ConfigService`, mengikuti pola `app.module.ts`):

```
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000   # yang dilihat browser
S3_REGION=us-east-1
S3_ACCESS_KEY / S3_SECRET_KEY
S3_BUCKET=esp-fleet
S3_FORCE_PATH_STYLE=true                   # wajib untuk MinIO
```

`S3_PUBLIC_ENDPOINT` terpisah karena presigned URL harus di-sign untuk host yang dipakai
browser. Di devcontainer backend menjangkau MinIO sebagai `minio:9000`, browser sebagai
`localhost:9000`; menandatangani dengan host yang salah membuat MinIO menolak dengan
`SignatureDoesNotMatch`.

### 4.2 Alur upload

```
1. POST /fleet/vehicles/:id/files/:slotId/upload-intent
   { filename, mimeType, sizeBytes }
   → backend validasi mime & ukuran, buat key, kembalikan presigned PUT (5 menit)
   key: fleet/{vehicleId}/{slotCode}/{uuid}.{ext}

2. Browser PUT langsung ke MinIO — tidak lewat backend

3. POST /fleet/vehicles/:id/files/:slotId/confirm
   { storageKey, originalName, mimeType, sizeBytes }
   → backend HEAD object: verifikasi objek ada, ukuran & mime cocok
   → baru simpan baris

Lihat: GET /fleet/vehicles/:id/files/:fileId/download-url → presigned GET (2 menit)
```

**Langkah 3 memverifikasi ke MinIO, tidak percaya klien.** Tanpa `HEAD`, klien bisa
mengirim confirm tanpa pernah meng-upload, meninggalkan baris yang menunjuk objek tak ada.

**Validasi:** MIME `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Maksimum
10 MB — jauh di atas batas ~190 KB prototipe, yang ada semata karena base64 harus muat di
localStorage. Ekstensi diturunkan dari MIME hasil verifikasi, bukan dari nama file kiriman.

**Ganti berkas:** baris di-update ke key baru, objek lama dihapus setelah commit berhasil.
Kegagalan penghapusan objek lama di-log tapi tidak menggagalkan request — objek yatim lebih
murah daripada baris yang menunjuk objek yang sudah hilang.

### 4.3 Keamanan yang didapat

Presigned URL menghapus tiga kerentanan XSS prototipe sekaligus, karena berkas tidak pernah
menjadi string yang dirender ke DOM:

| Prototipe | Port ini |
|---|---|
| `f.data` mentah di `<img src>` (585) | `<img>` menunjuk URL presigned HTTPS |
| `f.data` mentah di `<img>`/`<iframe>` (754/757) | idem |
| `f.url` tanpa cek skema — `javascript:` lolos (802) | `external_url` divalidasi harus `http`/`https` di DTO |

### 4.4 Devcontainer

Ditambahkan ke `.devcontainer/docker-compose.yml` yang sudah ada:

```yaml
  minio:
    image: minio/minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # console
    volumes:
      - minio-data:/data
```

Plus service `minio-init` sekali-jalan (`mc mb --ignore-existing`) untuk membuat bucket dan
memasang CORS agar PUT dari `localhost:3000` diizinkan. `workspace` mendapat
`depends_on: minio` dan env var di atas; volume `minio-data` ditambahkan.

### 4.5 Softcopy SIM sopir

Karena SIM pindah ke sopir (§2.6), softcopy-nya ikut. Kolom di `fleet_drivers`, memakai
`StorageService` yang sama:

| Kolom | Tipe |
|---|---|
| `sim_storage_key` | varchar(255) null |
| `sim_original_name` | varchar(255) null |
| `sim_mime_type` | varchar(100) null |
| `sim_size_bytes` | bigint null |

Kolom langsung di `fleet_drivers`, bukan tabel `fleet_driver_files` — sopir hanya punya satu
jenis berkas dan tidak ada indikasi akan bertambah. Bila kelak bertambah, ekstraksinya
lurus.

Ditambahkan di Phase 3 bersama `StorageModule`, dengan endpoint yang sebentuk:

```
POST /fleet/drivers/:id/sim-file/upload-intent   update.fleet_vehicle
POST /fleet/drivers/:id/sim-file/confirm         update.fleet_vehicle
GET  /fleet/drivers/:id/sim-file/download-url    read.fleet_vehicle
DELETE /fleet/drivers/:id/sim-file               update.fleet_vehicle
```

Key: `fleet/drivers/{driverId}/sim/{uuid}.{ext}`

## 5. API

Semua di bawah `/fleet`, dijaga `JwtAuthGuard` + `@Authorize(...)`.

### Master data — Phase 1
```
GET    /fleet/master-data?category=&includeInactive=   read.fleet_master_data
POST   /fleet/master-data                              create.fleet_master_data
PATCH  /fleet/master-data/:id                          update.fleet_master_data
DELETE /fleet/master-data/:id                          delete.fleet_master_data → 409 bila dipakai
```

### Sopir — Phase 1
```
GET    /fleet/drivers?q=&includeInactive=              read.fleet_vehicle
POST   /fleet/drivers                                  create.fleet_vehicle
PATCH  /fleet/drivers/:id                              update.fleet_vehicle
DELETE /fleet/drivers/:id                              delete.fleet_vehicle → arsip bila dipakai
```

### Kendaraan — Phase 2
```
GET    /fleet/vehicles                                 read.fleet_vehicle
       ?q= &page= &pageSize= &sort=
       &severity=crit|warn|ok|none
       &kepemilikanId= &poolId= &statusId= &includeArchived=
GET    /fleet/vehicles/:id                             read.fleet_vehicle
POST   /fleet/vehicles                                 create.fleet_vehicle
PATCH  /fleet/vehicles/:id                             update.fleet_vehicle
POST   /fleet/vehicles/:id/archive                     update.fleet_vehicle
POST   /fleet/vehicles/:id/restore                     update.fleet_vehicle
DELETE /fleet/vehicles/:id                             delete.fleet_vehicle → 409 bila ada riwayat
PUT    /fleet/vehicles/:id/documents                   update.fleet_vehicle
```

`q` mencari nopol, merk, tipe, no rangka, no mesin, dan nama sopir.

`PUT .../documents` menerima seluruh set dokumen sekaligus (bentuk yang cocok dengan satu
form), menangani transisi `is_current` dalam satu transaksi.

### Berkas & kontrak — Phase 3
```
POST   /fleet/vehicles/:id/files/:slotId/upload-intent  update.fleet_vehicle
POST   /fleet/vehicles/:id/files/:slotId/confirm        update.fleet_vehicle
POST   /fleet/vehicles/:id/files/:slotId/external-url   update.fleet_vehicle
GET    /fleet/vehicles/:id/files/:fileId/download-url   read.fleet_vehicle
DELETE /fleet/vehicles/:id/files/:fileId                update.fleet_vehicle

GET    /fleet/vehicles/:id/contracts                    read.fleet_vehicle
POST   /fleet/vehicles/:id/contracts                    update.fleet_vehicle
PATCH  /fleet/contracts/:id                             update.fleet_vehicle
POST   /fleet/contracts/:id/close                       update.fleet_vehicle

GET    /fleet/summary                                   read.fleet_vehicle
GET    /fleet/export.csv                                read.fleet_vehicle
```

### Alert — Phase 4
```
GET    /fleet/alerts?limit=                             read.fleet_vehicle
```

Menggabungkan dokumen kendaraan dan SIM sopir dalam satu daftar terurut, masing-masing
memakai `warn_days` jenisnya — SIM mengambilnya dari baris `jenis_sim` sopir yang
bersangkutan, jadi tidak ada ambang yang di-hardcode di kode.

### Bentuk response daftar kendaraan

```json
{
  "rows": [{
    "id": "…", "nopol": "B 9114 KYZ", "merk": "Mitsubishi", "tipe": "Canter FE 74 HD",
    "jenisArmada":  { "id": "…", "label": "Colt Diesel Engkel" },
    "kepemilikan":  { "id": "…", "label": "Milik ESP" },
    "pool":         { "id": "…", "label": "Pool Cakung" },
    "status":       { "id": "…", "label": "Aktif" },
    "driver": { "id": "…", "nama": "Ahmad Fauzi",
                "simExpiresAt": "2027-03-14", "simDaysLeft": 186, "simSeverity": "ok" },
    "documents": [{ "docTypeId": "…", "code": "kir", "label": "KIR",
                    "nomor": "JKT-II/…", "expiresAt": "2026-09-02",
                    "daysLeft": -7, "severity": "crit" }],
    "worstSeverity": "crit", "minDaysLeft": -7,
    "activeContract": { "contractType": "kredit", "leasing": "MTF",
                        "cicilanPerBulan": 8750000, "tenorBulan": 48,
                        "terbayar": 30, "sisaBulan": 18, "sisaNilai": 157500000,
                        "jatuhTempoBerikutnya": "2026-09-15" },
    "berkasCount": { "ada": 2, "wajib": 3 },
    "isActive": true
  }],
  "total": 8, "page": 1, "pageSize": 25
}
```

Setiap `daysLeft`/`severity` dihitung backend (§2.7). Frontend tidak pernah menghitung tanggal.

`berkasCount` dan `activeContract` baru terisi di Phase 3, saat tabelnya ada. Di Phase 2
keduanya dihilangkan dari response — wire type frontend menjadikannya opsional (§6.2),
jadi tidak ada perubahan kontrak yang memutus saat Phase 3 mengaktifkannya.

## 6. Frontend

### 6.1 Navigasi

Sidebar `NavLink` flat tanpa dukungan nesting. Mengikuti preseden `air-shipments`: satu entri
sidebar, sub-nav di `layout.tsx`.

```
Sidebar                        Area halaman
──────────────────────         ─────────────────────────────────
🚚 Registrasi Armada    →      [Armada] [Sopir] [Master Data]
   (/fleet)                     └─ konten tab
```

`app/(dashboard)/fleet/layout.tsx` merender sub-nav statis (tidak perlu fetch seperti
air-shipments). Tab "Master Data" hanya muncul bila punya `read.fleet_master_data`.

Route: `/fleet/vehicles` · `/fleet/drivers` · `/fleet/master-data`
Entri sidebar dijaga `hasPermission('read.fleet_vehicle')`, ikon `Truck` dari lucide.

Sub-nav dibuat di Phase 1 dengan tab Sopir + Master Data; tab Armada menyusul di Phase 2.

### 6.2 Struktur feature

```
features/fleet/
  types.ts
  hooks/
    useFleetMasterData.ts      useFleetDrivers.ts
    useFleetVehicles.ts        useFleetVehicleFiles.ts
    useFleetContracts.ts       useFleetAlerts.ts
    useFleetSummary.ts
  components/
    MasterDataTab.tsx          MasterDataRowDialog.tsx
    DriverTable.tsx            DriverFormDialog.tsx
    VehicleFilters.tsx         VehicleTable.tsx
    VehicleFormDialog.tsx      VehicleDocumentsFieldset.tsx
    FleetSummaryCards.tsx      FleetAlertList.tsx
    BerkasTab.tsx              BerkasSlotCard.tsx      BerkasUploadDialog.tsx
    AngsuranTab.tsx
  utils/
    formatRupiah.ts            severity.ts
```

Query key mengikuti `useVendorGroups`: prefiks `['fleet', …]` supaya invalidasi bisa
menyapu bagian yang berkaitan.

Wire type dibuat longgar (field baru opsional, di-default di `select`) mengikuti komentar
eksplisit di `useVendorGroups.ts` — frontend dan backend deploy paralel.

### 6.3 Tab & komponen per phase

| Phase | Yang dibangun |
|---|---|
| 1 | `layout.tsx` sub-nav, halaman Master Data (tab per kategori), halaman Sopir |
| 2 | Tab Armada: filter + tabel + form tambah/ubah + fieldset dokumen |
| 3 | Kartu ringkasan, tab Softcopy Berkas, tab Kepemilikan & Angsuran, tombol Ekspor CSV |
| 4 | Section "Perlu tindakan" di atas tabel armada |

Tab "Softcopy Berkas" dan "Kepemilikan & Angsuran" di prototipe adalah tab dalam halaman
armada, bukan sub-nav — dipertahankan begitu (tab di dalam `/fleet/vehicles`).

### 6.4 Perbaikan UX dari prototipe

- **Filter berkas tidak lagi buntu.** Tombol "Berkas" di baris tabel mereset filter
  kelengkapan; prototipe hanya mengisi query pencarian (baris 1003), sehingga dengan filter
  "Lengkap" aktif user mendarat di empty state untuk kendaraan yang baru diklik.
- **Hapus selalu lewat konfirmasi.** Prototipe punya dialog konfirmasi untuk tombol di baris,
  tapi tombol "Hapus kendaraan" di dalam modal edit memanggil penghapusan langsung
  (baris 726) — satu salah klik menghapus kendaraan dan empat berkasnya.
- **Toast sukses hanya setelah server mengonfirmasi.** Prototipe menampilkan
  "Kendaraan dihapus." secara sinkron sebelum promise selesai (baris 882), dan menelan
  kegagalan kuota localStorage setelah toast sukses keluar (891). Di sini setiap toast sukses
  dipicu di `onSuccess` React Query; kegagalan memunculkan toast error.

## 7. Permission

Delapan permission baru di `packages/shared/src/auth/index.ts`, ditambahkan ke seed
permission backend:

```
read.fleet_vehicle      create.fleet_vehicle
update.fleet_vehicle    delete.fleet_vehicle

read.fleet_master_data  create.fleet_master_data
update.fleet_master_data delete.fleet_master_data
```

Sopir, dokumen, berkas, dan kontrak ikut permission kendaraan. Hanya master data yang
terpisah, supaya operator lapangan bisa menginput kendaraan tanpa bisa mengubah daftar
leasing atau pool.

Nama mengikuti check constraint yang ada — hanya verb `read|create|update|delete`.

## 8. Testing

Mengikuti konvensi repo: `*.service.spec.ts` dan `*.dto.spec.ts` di backend,
`*.spec.tsx`/`*.spec.ts` untuk komponen dan hook di frontend.

Yang wajib punya test:

| Area | Kasus |
|---|---|
| Normalisasi nopol | `"b  9114   kyz"` → `"B 9114 KYZ"`; bentrok dengan unit aktif ditolak; nopol yang sama boleh dipakai lagi setelah unit lama diarsipkan |
| Severity dokumen | kedaluwarsa/warn/aman terhadap `warn_days` per jenis; kendaraan tanpa dokumen → `none`; batas tepat pada `warn_days` |
| Sisa angsuran | dihitung dari tanggal mulai; `angsuran_terbayar_override` menang; dibatasi `[0, tenor]`; kontrak lunas tidak dihitung ke total |
| Upload | mime ditolak; ukuran melebihi batas ditolak; confirm gagal bila objek tidak ada di MinIO; ukuran tidak cocok ditolak |
| `external_url` | skema non-http/https ditolak (`javascript:` khususnya) |
| Master data | hapus yang sedang dipakai → 409; nonaktifkan selalu boleh; `(category, code)` unik |
| Arsip | unit arsip hilang dari daftar default, ringkasan, dan CSV; hard delete ditolak bila ada riwayat |
| Frontend | `VehicleTable` merender severity dari server tanpa menghitung ulang; `BerkasUploadDialog` menjalankan intent → PUT → confirm sesuai urutan |

## 9. Urutan phase

Setiap phase berdiri sendiri dan bisa di-merge tanpa menunggu berikutnya.

### Phase 1 — Master data & sopir
Migration `fleet_master_data` + `fleet_drivers` + seed · modul `fleet-master-data` dan
`fleet-drivers` · permission di shared + seed · entri sidebar + `layout.tsx` sub-nav ·
halaman Master Data dan Sopir.

**Selesai bila:** admin bisa mengelola kedelapan kategori dan data sopir lewat UI.

### Phase 2 — Registrasi armada
Migration `fleet_vehicles` + `fleet_vehicle_documents` + view status · modul `fleet-vehicles`
dengan list paginated, search, filter, CRUD, arsip, dan dokumen nested · tab Armada dengan
filter, tabel, form tambah/ubah.

**Selesai bila:** kendaraan bisa didaftarkan lengkap dengan dokumennya, dicari, disaring
per severity, dan diarsipkan.

### Phase 3 — Berkas, angsuran, ringkasan, ekspor
MinIO di devcontainer · `StorageModule` · migration `fleet_lease_contracts` +
`fleet_vehicle_files` + kolom softcopy SIM di `fleet_drivers` (§4.5) · endpoint berkas,
kontrak, summary, export · kartu ringkasan, tab Softcopy Berkas, tab Kepemilikan & Angsuran,
tombol Ekspor CSV · `berkasCount` dan `activeContract` mulai terisi di response daftar.

**Selesai bila:** berkas kendaraan dan softcopy SIM terunggah ke MinIO lewat presigned URL
dan bisa dilihat kembali; tab angsuran menampilkan sisa kewajiban; CSV terunduh.

### Phase 4 — Perlu tindakan
Endpoint `/fleet/alerts` · section "Perlu tindakan" di atas tabel armada.

**Selesai bila:** dokumen dan SIM yang jatuh tempo dalam ambangnya masing-masing tampil
terurut dari yang paling mendesak, dan mengkliknya membuka kendaraan terkait.
