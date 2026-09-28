# Upload Berkas dari Form Armada — Design

**Tanggal:** 2026-09-18
**Modul:** Fleet — Armada (form tambah/ubah)
**Sumber requirement:** `Requirements Form Tambah Kendaraan.md` §5
**Spec terkait:** `2026-09-12-form-armada-lengkap-design.md`, `2026-09-17-fleet-berkas-preview-modal-design.md`

## 1. Masalah

Form tambah/ubah armada menanyakan nomor STNK dan masa berlakunya, tapi tidak menerima
softcopy-nya. Operator yang memegang berkas pindaian harus menyimpan armada dulu, pindah ke
tab Berkas, mencari unit yang baru saja diketiknya, lalu mengunggah satu per satu lewat
`BerkasUploadDialog`.

Requirement §5 menyebut field upload sebagai bagian dari section Dokumen Kendaraan, bukan
sebagai layar terpisah. Spec `2026-09-12` menundanya secara sadar karena `StorageModule`
belum ada (§3 "Keputusan scope"). Modul itu sekarang ada, berikut tiga langkah unggahnya.

## 2. Hasil yang diinginkan

Operator memilih berkas di form yang sedang diisinya — foto kendaraan dan softcopy
dokumen — dan satu klik Simpan menyimpan keduanya.

## 3. Keputusan dan alasannya

| Keputusan | Alasan |
|---|---|
| Berkas ditahan di memori sampai Simpan, di **kedua** mode | Mode Tambah tidak punya pilihan: endpoint unggah butuh `vehicleId` yang belum ada. Membuat mode Ubah berperilaku lain berarti Batal membatalkan sebagian saja, dan operator harus tahu ia sedang berada di mode yang mana |
| Gagal unggah **tidak** menutup dialog | Data armada sudah aman; yang belum selesai hanya berkasnya. Menutup dialog memaksa operator mencari lagi unit yang baru diketiknya untuk melengkapi satu berkas |
| Armada yang sudah tersimpan **tidak** dibatalkan saat berkas gagal | Menghapus unit yang datanya sudah benar karena satu foto gagal naik membuang pekerjaan yang valid — dan penghapusan itu sendiri bisa gagal, menyisakan keadaan yang lebih buruk daripada yang diperbaiki |
| Foto dan dokumen jadi dua section terpisah | Keduanya punya aturan berbeda (5 MB gambar vs 10 MB termasuk pdf) dan dibaca operator sebagai dua hal berbeda. Satu section dengan tujuh kartu beraturan campur tidak memberi tahu aturan mana yang berlaku di kartu mana |
| Unggah berurutan, bukan paralel | Satu berkas = tiga permintaan (intent, PUT, confirm). Tujuh berkas paralel berarti dua puluh satu permintaan dari satu klik |
| Lihat dan Hapus tidak masuk form | Keduanya sudah ada di tab Berkas lengkap dengan konfirmasi hapus. Di dalam form keduanya berarti modal di atas modal setinggi 90vh. "Ganti" sudah menutupi kebutuhan mengoreksi berkas salah |

## 4. Data

### 4.1 Migrasi: empat slot foto

`jenis_berkas` hari ini hanya punya STNK, Buku Uji (KIR), dan BPKB. Requirement §5 minta
empat foto, jadi slotnya di-seed:

```sql
INSERT INTO fleet_master_data (category, code, label, sort_order, warn_days, default_valid_months, is_required)
VALUES
  ('jenis_berkas','foto_depan','Foto Depan',40,NULL,NULL,FALSE),
  ('jenis_berkas','foto_belakang','Foto Belakang',50,NULL,NULL,FALSE),
  ('jenis_berkas','foto_kiri','Foto Kiri',60,NULL,NULL,FALSE),
  ('jenis_berkas','foto_kanan','Foto Kanan',70,NULL,NULL,FALSE)
ON CONFLICT (category, code) DO NOTHING
```

`is_required FALSE`: requirement menyebut foto sebagai lampiran, bukan syarat. `sort_order`
40–70 menaruhnya setelah tiga dokumen yang ada.

`down()` menghapus keempat baris berdasarkan `code`. FK `fk_fleet_vehicle_files_slot` adalah
`ON DELETE RESTRICT`, jadi penghapusan gagal bila sudah ada berkas menggantung di sana —
perilaku yang benar, bukan kecelakaan: migrasi turun tidak boleh membuang berkas operator.

Total tujuh slot: 4 foto + STNK + KIR + BPKB. Requirement menyebut enam (4 foto + STNK +
KIR); BPKB adalah slot yang sudah berjalan sejak `2026-09-16` dan tidak dicabut di sini.

### 4.2 `berkasCount` disaring ke slot wajib

`fleet-vehicles.service.ts` menghitung `wajib` sebagai jumlah **semua** slot `jenis_berkas`
aktif, dan `ada` sebagai jumlah **semua** berkas unit itu apa pun slotnya. Dengan empat slot
baru, setiap unit yang tadinya "3/3 lengkap" berubah jadi "3/7", dan filter "Belum lengkap"
di tab Berkas memunculkan seluruh armada. Sebaliknya unit dengan empat foto tapi tanpa STNK
akan terbaca "4/3" — lengkap, padahal tidak.

Kedua sisi hitungan disaring ke `is_required = TRUE`:

- `wajib`: `count({ category: 'jenis_berkas', isActive: true, isRequired: true })`
- `ada`: join ke slot, hitung hanya baris yang slotnya wajib

Data hari ini tidak bergeser — ketiga slot yang ada semuanya `TRUE`, jadi `wajib` tetap 3.
Yang berubah adalah artinya: angka itu sekarang benar-benar mengatakan berapa dokumen wajib
yang sudah ada, bukan berapa lampiran apa pun yang kebetulan terkumpul.

## 5. Backend

### 5.1 Aturan per slot

`storage.constants.ts` bertambah:

```ts
export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const PHOTO_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_SLOT_PREFIX = 'foto_'
```

`FleetVehicleFilesService.createIntent` dan `confirm` sama-sama sudah memanggil `assertSlot`
dan memegang baris slotnya, jadi aturannya ditegakkan di situ: slot berkode awalan `foto_`
menolak mime di luar `PHOTO_MIME_TYPES` dan ukuran di atas `PHOTO_MAX_UPLOAD_BYTES`, dengan
`BadRequestException` yang menyebut batasnya.

`UploadIntentDto` tetap memegang batas global 10 MB dan allow-list penuh. Ia tidak bisa
melakukan lebih: `slotId` ada di path, bukan di body, jadi DTO tidak tahu slot mana yang
dituju. Dua lapis, masing-masing menyaring apa yang bisa dilihatnya.

`confirm` ikut memeriksa, bukan hanya `createIntent`. Di `confirm`-lah ukuran dan mime yang
sebenarnya ada di bucket diketahui lewat `statObject`; `createIntent` hanya melihat angka
yang diklaim klien.

### 5.2 Yang tidak berubah

Tidak ada endpoint baru. Tiga langkah unggah (`upload-intent` → PUT presigned → `confirm`)
melayani form ini apa adanya.

## 6. Frontend

### 6.1 `useVehicleBerkas`

Hook baru di `components/vehicle-form/`, memegang berkas tertunda dan status unggahnya:

```ts
type SlotState =
  | { status: 'idle' }
  | { status: 'picked'; file: File; previewUrl: string | null }
  | { status: 'uploading' }
  | { status: 'failed'; file: File; previewUrl: string | null; message: string }

interface VehicleBerkasApi {
  slotState: (slotId: string) => SlotState
  pick: (slot: FleetMasterRow, file: File) => string | null  // pesan galat, atau null
  clear: (slotId: string) => void
  pendingCount: number
  uploadAll: (vehicleId: string) => Promise<{ failed: { slotLabel: string; message: string }[] }>
}
```

`useVehicleForm` tidak disentuh. Berkas tidak pernah masuk `buildPayload` — ia tidak lewat
payload JSON sama sekali, melainkan langsung ke object storage lewat tiga langkahnya sendiri.
Menaruhnya di hook itu berarti satu hook dengan dua jenis keluaran yang tidak berhubungan,
pada file yang sudah 317 baris.

`pick` memvalidasi tipe dan ukuran menurut slotnya sebelum apa pun dikirim, dan mengembalikan
pesan galat alih-alih melempar: pemilihan berkas yang salah adalah hal biasa, bukan kondisi
luar biasa.

`uploadAll` menjalankan slot berurutan dan melanjutkan ke slot berikutnya meski satu gagal —
operator yang memilih lima berkas lebih baik mendapat empat daripada nol. Slot yang gagal
tetap memegang `File`-nya dalam status `failed`, supaya "Coba lagi" tidak menyuruh operator
memilih ulang dari disk.

`previewUrl` dari `URL.createObjectURL` di-revoke saat slot diganti, dibersihkan, berhasil
naik, atau hook di-unmount. Tanpa itu operator yang mengganti foto lima kali meninggalkan
lima blob hidup sampai tab ditutup.

### 6.2 `BerkasFormSection`

Satu komponen, dipakai dua kali. Bedanya lewat props, bukan lewat dua komponen kembar yang
akan menyimpang pada perubahan pertama — alasan yang sama yang membuat `DocumentSection`
melayani tiga section sekaligus.

| Section | Slot | Kolom | Terima | Batas | Thumbnail |
|---|---|---|---|---|---|
| Foto Kendaraan | kode berawalan `foto_` | 4 | jpg, png, webp | 5 MB | ya |
| Softcopy Berkas | sisanya | 3 | jpg, png, webp, pdf | 10 MB | tidak |

Pemisahannya lewat `code`, seperti `VehicleFormDialog` sudah memisah section 4 dan 6. Slot
yang ditambah admin kemudian jatuh ke Softcopy Berkas — "sisanya", bukan daftar kode
tertutup, supaya slot baru tetap kebagian tempat tanpa menunggu deploy.

Keadaan tiap kartu:

| Keadaan | Baris status | Tombol |
|---|---|---|
| Kosong | "Belum ada berkas" | Pilih berkas |
| Baru dipilih | `depan.jpg · 1,2 MB · belum diunggah` | Ganti · Batalkan pilihan |
| Sudah di server | `depan.jpg · 840 KB` | Ganti |
| Tautan eksternal | "tautan eksternal" | Ganti |
| Sedang diunggah | "Mengunggah…" | — nonaktif |
| Gagal | pesan galat, warna destructive | Coba lagi |

Thumbnail hanya untuk berkas yang **baru dipilih**: itu bytes yang operator sendiri baru ambil
dari disknya, bukan data dari server, jadi larangan di `BerkasSlotCard.tsx` tidak berlaku —
larangan itu menyangkut data URI mentah dari prototipe. Foto yang sudah tersimpan tampil
sebagai nama berkas saja; menariknya jadi thumbnail berarti satu presigned URL per kartu
setiap kali form dibuka.

`GRID_COLS` di `form-primitives.tsx` bertambah `4: 'sm:grid-cols-4'`. Komentar di atasnya
sudah menjelaskan kenapa nilainya harus literal dan bukan interpolasi.

### 6.3 Alur Simpan

1. `form.validate()` — gagal, berhenti, tidak ada apa pun terkirim.
2. `onSubmit(payload)` menyimpan armada dan **mengembalikan** unit tersimpan.
3. Tidak ada berkas tertunda → `onClose()`, persis seperti sekarang.
4. Ada berkas → `uploadAll(vehicle.id)`; tombol jadi "Mengunggah berkas… (2/5)".
5. Semua berhasil → `onClose()`.
6. Ada yang gagal → dialog tetap terbuka, pesan menyebut slot mana dan kenapa. Slot gagal
   menampilkan "Coba lagi"; tombol utama jadi "Unggah ulang berkas yang gagal" dan tidak
   mengirim ulang data armada.

Langkah 2 adalah perubahan kontrak: `onSubmit` yang tadinya `Promise<void>` kini
mengembalikan `FleetVehicle`. Halaman meneruskan hasil `mutateAsync` yang selama ini
dibuangnya.

Langkah 6 adalah alasan dialog perlu id unit: setelah armada dibuat, form berpindah ke mode
Ubah di tempat. Menutupnya berarti operator kehilangan jejak berkas mana yang belum naik.

## 7. Pengujian

Mengikuti pola berkas `.spec` bersebelahan yang sudah dipakai modul ini.

**`useVehicleBerkas.spec.ts`**
- pdf ditolak di slot foto, diterima di slot dokumen
- 6 MB ditolak sebagai foto, diterima sebagai dokumen
- `uploadAll` berjalan berurutan dan melanjutkan setelah satu slot gagal
- slot gagal tetap memegang `File`-nya
- objectURL di-revoke saat diganti, dibersihkan, dan berhasil naik

**`BerkasFormSection.spec.tsx`**
- tiap keadaan kartu merender status dan tombol yang benar
- berkas tak didukung menampilkan galat dan tidak masuk state
- slot foto merender thumbnail untuk berkas baru; slot dokumen tidak

**`VehicleFormDialog.spec.tsx`** (tambahan)
- simpan tanpa berkas tidak memanggil unggah sama sekali
- simpan dengan berkas memanggil `onSubmit` dulu, lalu unggah dengan id yang dikembalikannya
- satu unggahan gagal membiarkan dialog terbuka dan menyebut nama slotnya
- validasi yang gagal tidak mengunggah apa pun

**Backend**
- `createIntent` menolak pdf di slot `foto_*`, menerimanya di slot lain
- `createIntent` menolak 6 MB di slot foto, menerimanya di slot dokumen
- `confirm` menolak objek yang mime atau ukurannya melanggar aturan slot foto
- `berkasCount` mengabaikan slot tak wajib di kedua sisi hitungan

Suite backend butuh `NODE_OPTIONS` heap bump **plus** `--runInBand`.

## 8. Di luar cakupan

- Lihat dan hapus berkas dari dalam form (tetap di tab Berkas)
- Tautan arsip eksternal dari form
- Thumbnail untuk foto yang sudah tersimpan di server
- Banyak berkas dalam satu slot
- Drag-and-drop
