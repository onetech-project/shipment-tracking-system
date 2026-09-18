# Pratinjau Softcopy Berkas dalam Modal

**Tanggal:** 2026-09-17
**Modul:** Fleet — Armada (tab Berkas) & Sopir (softcopy SIM)

## 1. Masalah

Tombol "Lihat" pada softcopy berkas mengunduh berkas, bukan menampilkannya. Operator
yang ingin memeriksa STNK harus membuka berkas terunduh dari luar aplikasi, lalu
membersihkan salinan yang menumpuk di folder unduhan.

Penyebabnya ada di dua tempat:

1. `StorageService.createDownloadUrl` menandatangani setiap presigned GET dengan
   `ResponseContentDisposition: attachment`. Browser tidak punya pilihan selain
   mengunduh, apa pun yang dilakukan frontend.
2. Halaman Armada dan Sopir memanggil `window.open` atas URL tersebut, sehingga
   pemeriksaan berkas selalu meninggalkan halaman yang sedang dikerjakan.

## 2. Hasil yang diinginkan

"Lihat" berarti melihat, di seluruh modul Fleet. Berkas gambar dan PDF tampil dalam
modal di atas halaman; mengunduh tetap tersedia sebagai tindakan terpisah yang
diminta secara sadar.

## 3. Keputusan dan alasannya

| Keputusan | Alasan |
|---|---|
| Gambar **dan** PDF dipratinjau dalam modal | PDF punya viewer bawaan browser yang bekerja baik di `<iframe>`; operator yang membuka STNK pdf sama-sama ingin melihat |
| Tautan eksternal tetap membuka tab baru | Host arsip luar tidak kita kendalikan; `X-Frame-Options` di sana menghasilkan kotak kosong yang menyesatkan |
| Armada dan Sopir sekaligus | Keduanya memakai `createDownloadUrl` yang sama, jadi perubahan backend mengenai keduanya; membiarkan Sopir setengah jalan berarti "Lihat" berperilaku dua macam dalam satu modul |
| Unduh lewat query param, bukan `<a download>` | Atribut `download` diabaikan browser untuk URL lintas-origin, dan MinIO berada di origin lain dari frontend — tombolnya akan membuka, bukan menyimpan |

## 4. Backend

### 4.1 StorageService

```ts
async createDownloadUrl(
  key: string,
  filename: string,
  disposition: 'inline' | 'attachment' = 'attachment',
): Promise<string>
```

Default `attachment` disengaja: hanya pemanggil yang meminta berubah yang berubah,
tidak ada perilaku lain yang bergeser diam-diam.

### 4.2 Controller

Dua endpoint menerima query `?disposition=inline`:

- `GET /fleet/vehicles/:id/files/:fileId/download-url`
- `GET /fleet/drivers/:id/sim-file/download-url`

Nilainya divalidasi DTO dengan `@IsIn(['inline', 'attachment'])`. Ini bukan
formalitas: nilai tersebut masuk ke dalam header `Content-Disposition` yang
ditandatangani, jadi ia harus berasal dari daftar tertutup, bukan dari apa pun yang
dikirim klien. Query kosong tetap berarti `attachment`.

Berkas bertipe `externalUrl` dikembalikan apa adanya oleh service — tidak ada yang
bisa ditandatangani di sana.

### 4.3 Catatan keamanan

Menyajikan objek `inline` hanya berbahaya bila objeknya dapat memuat skrip — HTML
atau SVG. Allow-list di `storage.constants.ts` hanya mengizinkan jpeg, png, webp,
dan pdf, dan `confirm()` mem-`HEAD` objek untuk memastikan mime tersimpan cocok
dengan yang dikonfirmasi. Tidak ada jalan menaruh dokumen aktif di bucket lalu
membukanya inline.

Komentar pada `BerkasSlotCard.tsx` yang melarang thumbnail perlu diperbarui:
larangannya menyangkut data URI mentah dari prototipe, bukan URL presigned.
Dibiarkan apa adanya, ia terbaca sebagai larangan atas apa yang dibangun di sini.

## 5. Frontend

### 5.1 FilePreviewDialog

Komponen baru di `features/fleet/components/`, dipakai kedua halaman. Ia tidak tahu
apa-apa soal kendaraan atau sopir — ia menerima apa yang dibutuhkan untuk menggambar:

```ts
interface Props {
  open: boolean
  title: string          // "Softcopy STNK" / "Softcopy SIM"
  subtitle?: string      // "B 9114 KYZ" / nama sopir
  state:
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; url: string; mimeType: string | null; filename: string | null }
  onDownload: () => void
  onClose: () => void
}
```

Pemilihan render dari `mimeType`:

- `image/*` → `<img>`
- `application/pdf` → `<iframe>`
- selain itu → "Pratinjau tidak tersedia" plus tombol Unduh

Cabang terakhir bukan paranoia: `mimeType` berasal dari baris database yang bisa
ditulis sebelum allow-list sekarang berlaku, dan komponen yang menganggap nilainya
pasti salah satu dari dua akan menampilkan `<img>` kosong tanpa penjelasan.

Modal memakai `Dialog` dari `components/ui/dialog.tsx` (Radix), sehingga fokus-trap,
Escape, dan `aria-modal` sudah benar tanpa ditulis ulang. `DialogContent` di-override
menjadi `max-w-4xl` dengan tinggi dibatasi `max-h-[85vh]`; default `max-w-lg` terlalu
sempit untuk memeriksa STNK.

### 5.2 Hook

`useFileDownloadUrl` dan `useDriverSimDownloadUrl` menerima `disposition` opsional
dan meneruskannya sebagai query param.

### 5.3 Halaman Armada

`handleViewFile` berhenti memanggil `window.open`. Sebagai gantinya: buka modal dalam
status `loading`, ambil URL `inline`, lalu pindah ke `ready` atau `error`.

Untuk berkas `externalUrl` perilaku lama dipertahankan: tab baru dengan
`noopener,noreferrer`.

### 5.4 Halaman Sopir

Bentuk yang sama, tanpa cabang `externalUrl` karena SIM tidak punya konsep itu.
`simError` yang ada tetap melayani kegagalan unggah dan hapus; kegagalan membuka
pindah ke dalam modal, di tempat operator sedang melihat.

### 5.5 Tombol Unduh

Memanggil ulang hook download-url tanpa `disposition` — mendapat URL `attachment`,
lalu `window.open`. Permintaan kedua ini murah: presigned GET hanya berlaku dua
menit, jadi menyimpannya untuk dipakai belakangan pun percuma.

## 6. Pengujian

Mengikuti pola berkas `.spec.tsx` bersebelahan yang sudah dipakai modul ini.

**`FilePreviewDialog.spec.tsx`**
- tiap cabang mime merender elemen yang benar
- status loading dan error tampil
- tombol Unduh memanggil `onDownload`
- mime tak dikenal tetap memberi jalan keluar berupa unduhan

**`page.spec.tsx` (Armada & Sopir)**
- klik "Lihat" pada berkas terunggah membuka modal dan **tidak** memanggil `window.open`
- klik "Lihat" pada berkas `externalUrl` memanggil `window.open` dan tidak membuka modal
- kegagalan mengambil URL menampilkan pesan di dalam modal

**`storage.service.spec.ts`**
- `inline` menghasilkan `ResponseContentDisposition` inline
- tanpa argumen tetap `attachment` — menjaga default tidak tergeser tanpa sengaja

**Controller spec**
- `?disposition=inline` diteruskan ke service
- nilai di luar daftar ditolak 400

Suite backend butuh `NODE_OPTIONS` heap bump **plus** `--runInBand`.

## 7. Di luar cakupan

- Meng-embed tautan arsip eksternal
- Navigasi antar berkas dari dalam modal (prev/next)
- Zoom, rotasi, atau anotasi gambar
- Thumbnail pada kartu slot
