# Form Armada Lengkap — Design

**Tanggal:** 2026-09-12
**Status:** Disetujui, siap dibuatkan implementation plan
**Sumber requirement:** `Requirements Form Tambah Kendaraan.md`, `sistem-registrasi-armada.html`
**Spec induk:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md`

## 1. Tujuan

Form tambah/ubah armada menampilkan seluruh enam section dalam satu dialog — termasuk
dokumen kendaraan yang saat ini terpisah di `VehicleDocumentsDialog` — dengan field leasing
yang lengkap, label dokumen yang sesuai konteksnya, dan daftar armada yang memperlihatkan
detail tiap dokumen seperti prototipe HTML.

Enam section tersebut:

1. Identitas Kendaraan
2. Kepemilikan & Leasing
3. Operasional & Sopir
4. Uji Berkala (KIR)
5. Dokumen Kendaraan
6. Servis dan Perawatan

## 2. Yang ada sekarang

Phase 2 sudah menghasilkan `fleet_vehicles`, `fleet_vehicle_documents`, view
`fleet_vehicle_document_status`, serta UI Armada yang berjalan. Yang belum ada:

| Kebutuhan | Status |
|---|---|
| Tabel kontrak leasing | Belum — spec induk §3.5 menandainya Phase 3 |
| Object storage (MinIO) + 6 lampiran | Belum — spec induk §3.6/§4, Phase 3 |
| Komponen `DropdownMenu` | Belum — `@radix-ui/react-dropdown-menu` sudah terpasang |

## 3. Keputusan scope

**Leasing dikerjakan sekarang; upload lampiran ditunda.** Tabel `fleet_lease_contracts`
dibangun di iterasi ini. Enam lampiran (4 foto + STNK + KIR) tetap menunggu `StorageModule`
di Phase 3 — section Dokumen Kendaraan tampil tanpa field upload, dan tidak ada placeholder
yang menjanjikan sesuatu yang belum bisa dipakai.

**Konsekuensi:** requirement §5 poin "Penambahan field: upload foto & dokumen" tidak
terpenuhi di iterasi ini. Sisanya terpenuhi seluruhnya.

## 4. Database

### 4.1 Tabel baru `fleet_lease_contracts`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `vehicle_id` | uuid NOT NULL → `fleet_vehicles` ON DELETE CASCADE | |
| `leasing_id` | uuid null → `fleet_master_data` ON DELETE RESTRICT | kategori `leasing` |
| `nomor_kontrak` | varchar(60) null | |
| `cicilan_per_bulan` | numeric(14,2) null | |
| `tenor_bulan` | int null | |
| `angsuran_mulai` | date null | |
| `angsuran_terbayar_override` | int null | kosong = dihitung dari `angsuran_mulai` |
| `closed_at` | date null | terisi = kontrak selesai |
| `created_at` / `updated_at` | timestamptz | |

```sql
CREATE UNIQUE INDEX "uq_fleet_lease_contracts_open"
  ON fleet_lease_contracts (vehicle_id) WHERE closed_at IS NULL;
```

Satu kontrak terbuka per unit. Kontrak baru menutup yang lama (`closed_at` terisi) alih-alih
menimpanya, sehingga riwayat kredit bertahan — prototipe HTML hanya menyimpan kontrak
terakhir dan kehilangan yang sebelumnya.

`contract_type` dari spec induk §3.5 **tidak diikutkan.** Jenis kontrak sudah tersirat dari
`fleet_vehicles.kepemilikan_id` (sewa lepas kunci vs milik sendiri); menyimpannya dua kali
membuka peluang keduanya berselisih tanpa ada yang menang.

`REFERENCING_COLUMNS` di `fleet-master-data.service.ts` bertambah satu baris
(`fleet_lease_contracts.leasing_id`) supaya penghapusan master data leasing yang masih
dipakai tetap ditolak dengan 409, bukan gagal sebagai 500 dari constraint database.

### 4.2 `is_required` untuk `jenis_dokumen`

Kolom `fleet_master_data.is_required` sudah ada tetapi baru dipakai kategori `jenis_berkas`.
Migration mengisinya untuk `jenis_dokumen`:

| Dokumen | `is_required` |
|---|---|
| STNK, Pajak Tahunan, Asuransi, Uji Emisi | `TRUE` |
| KIR, Kartu Pengawasan, Servis Berkala | `FALSE` |

Kartu Pengawasan sengaja opsional: requirement §5 menyebutnya dikosongkan untuk unit
non-angkutan umum, yang bertentangan dengan kalimat "semua field mandatory" di section yang
sama. Flag master data menyelesaikannya tanpa hardcode — admin bisa mengubahnya lewat
halaman Master Data bila kebijakan berubah.

### 4.3 Normalisasi nomor polisi

Requirement §1 meminta nopol tersimpan rapat (`B9114KYZ`). `normalizeNopol` sekarang
menyisakan satu spasi antar kelompok (`B 9114 KYZ`), jadi fungsinya berubah menjadi membuang
seluruh spasi, titik, dan strip.

Migration ikut menormalisasi baris lama. **Migration ini bisa gagal:** bila dua unit aktif
menjadi identik setelah dinormalisasi (`B 9114 KYZ` dan `B9114KYZ`), `uq_fleet_vehicles_nopol_active`
dilanggar. Migration harus mendeteksinya lebih dulu dan berhenti dengan pesan yang menyebut
nopol yang bentrok, bukan diam-diam mengarsipkan salah satunya — memilih unit mana yang
"kalah" adalah keputusan operator, bukan migration.

Pencarian tetap mengenali ketikan berspasi: predikat `q` untuk kolom `nopol` membandingkan
versi yang sudah di-strip di kedua sisi. Kolom lain (merk, tipe, rangka, mesin, nama sopir)
dicocokkan apa adanya.

## 5. Backend — satu endpoint atomik

`POST /fleet/vehicles` dan `PATCH /fleet/vehicles/:id` menerima bentuk gabungan:

```ts
{
  ...field kendaraan,
  lease?: {
    leasingId, nomorKontrak, cicilanPerBulan,
    tenorBulan, angsuranMulai, angsuranTerbayar
  } | null,
  documents?: FleetVehicleDocumentPayload[]
}
```

Kendaraan, kontrak, dan dokumen ditulis dalam **satu transaksi**. Bila penyimpanan dokumen
gagal, kendaraan ikut batal — tidak ada unit yang tersimpan setengah jadi dan memaksa
operator menebak bagian mana yang perlu diulang.

`PUT /:id/documents` yang sudah ada tetap dipertahankan. Dialog dokumen terpisah masih
berguna untuk perpanjangan cepat tanpa membuka form penuh, dan menghapusnya akan membuang
test yang sudah lulus tanpa imbalan.

### 5.1 Validasi wajib

Ditegakkan di DTO **dan** di form. Kolom database tetap nullable, jadi baris lama yang tidak
lengkap tetap terbaca; tetapi setiap penyimpanan baru harus lengkap.

**Wajib:** `nopol, merk, tipe, jenisArmadaId, tahun, kapasitas, noRangka, noMesin, noBpkb`
(Identitas) · `poolId` (Operasional) · seluruh field leasing kecuali `angsuranTerbayar` ·
dokumen yang `is_required = TRUE`.

**Opsional:** `driverId, statusId, odometer, catatan`, seluruh field Uji Berkala, dan section
Servis & Perawatan.

**Bersyarat:** `pemilikUnit` wajib hanya bila kepemilikan unit ber-`code = 'sewa_lepas_kunci'`.
Dicek di service, bukan DTO, karena butuh membaca master data — DTO tidak punya akses
repository.

### 5.2 Sisa angsuran

Dihitung backend, seperti setiap perhitungan tanggal lain di modul ini (§2.7 spec induk).
`angsuranTerbayar` kosong → jumlah bulan penuh sejak `angsuran_mulai` sampai hari ini di zona
Asia/Jakarta, dibatasi `tenor_bulan`. Terisi → dipakai apa adanya. Response membawa
`lease.angsuranTerbayar`, `lease.sisaAngsuran`, dan `lease.sisaKewajiban` sudah jadi.

## 6. Form — enam section dalam satu dialog

`VehicleFormDialog` melebar ke `sm:max-w-4xl`, tiap section jadi `<fieldset><legend>`
mengikuti struktur prototipe HTML.

**Section 2 (Kepemilikan & Leasing)** bertambah dari dua field menjadi delapan: status
kepemilikan, pemilik/vendor sewa, perusahaan leasing, nomor kontrak, cicilan per bulan,
total bulan angsuran, tanggal angsuran pertama, angsuran sudah dibayar.

**Section 3 (Operasional & Sopir)** — sopir dipilih dari `fleet_drivers`; Nomor SIM dan Masa
Berlaku SIM terisi otomatis dan read-only dari data sopir tersebut. Satu sumber kebenaran:
SIM diperbarui di modul Sopir dan setiap unit ikut terbarui, alih-alih satu SIM diketik ulang
berbeda-beda di tiap kendaraan.

**Section 4 & 5** menggantikan `VehicleDocumentsDialog` sebagai jalur utama. KIR mendapat
section sendiri karena requirement memperlakukannya begitu; dokumen lain berkumpul di
section 5.

**Section 6 (Servis & Perawatan)** membaca dan menulis dokumen ber-`code = 'servis'`,
ditambah field catatan yang menulis ke `fleet_vehicles.catatan`.

### 6.1 Auto-populate

**Tanggal kedaluwarsa** terisi dari `fleet_master_data.default_valid_months` begitu tanggal
terbit diisi (KIR 6 bulan, Pajak 12 bulan — sudah ter-seed). Hanya mengisi kolom yang masih
kosong, jadi nilai yang sudah ditimpa manual tidak tertimpa balik.

**SIM** terisi dari sopir yang dipilih, seperti dijelaskan di atas.

### 6.2 Label dokumen kontekstual

Map hardcode di frontend, memetakan kode dokumen ke pasangan label:

```ts
const DOC_LABELS: Record<string, { issued: string; expires: string }> = {
  servis: { issued: 'Servis terakhir', expires: 'Servis berikutnya' },
  // …
}
```

Kode yang tidak terdaftar memakai default `"<label> terbit"` / `"<label> berlaku sampai"`,
sehingga jenis dokumen baru yang ditambah admin tetap tampil wajar tanpa perlu ubah kode.

## 7. Daftar armada

### 7.1 Kolom

Nopol · Unit · Kepemilikan · Sopir & SIM · **satu kolom per jenis dokumen aktif** · Servis · Aksi.

Kolom dokumen dibangun dari master data, urut `sortOrder` — admin menambah jenis dokumen dan
kolomnya muncul sendiri. Tiap sel berisi tanggal dan chip severity, mengikuti `docCell()` di
prototipe.

Dengan tujuh jenis dokumen, tabel menjadi ~13 kolom dan pasti ber-scroll horizontal. Itu
memang bentuk prototipenya, jadi diterima — tetapi kolom Nopol dibuat sticky supaya baris
tidak kehilangan identitasnya saat digeser.

`DataTableColumn.header` bertipe `string` dan perlu dilebarkan ke `React.ReactNode` agar
kontrol sort bisa masuk ke dalam `<th>`. Perubahan ini sekaligus menghapus baris "Urutkan:"
yang sekarang menempel canggung di atas tabel. `header` yang sudah ada berupa string tetap
sah, jadi tidak ada pemanggil lain yang perlu disentuh.

### 7.2 Aksi three-dots

Komponen `DropdownMenu` baru di `components/ui/` di atas `@radix-ui/react-dropdown-menu`
yang sudah terpasang. Satu tombol `⋮` per baris berisi Ubah · Dokumen · Arsipkan/Pulihkan,
menggantikan tiga tombol inline.

Item tetap ditapis permission seperti sekarang; menu yang seluruh itemnya tertapis tidak
dirender sama sekali, bukan dirender kosong.

## 8. Testing

Mengikuti pola modul: unit test service untuk transaksi gabungan, perhitungan sisa angsuran,
dan penolakan `pemilikUnit` kosong pada unit sewa; DTO spec untuk aturan wajib; test frontend
untuk auto-populate, gating tombol simpan, dan menu aksi.

Yang wajib dipin secara khusus:

- Migration normalisasi nopol berhenti dengan pesan jelas saat ada bentrok.
- Transaksi gabungan membatalkan kendaraan bila dokumen gagal.
- Kolom dokumen dinamis tetap benar ketika `docTypes` masih kosong saat mount.

## 9. Di luar scope

- Upload 6 lampiran dan `StorageModule` MinIO — Phase 3.
- Tab Softcopy Berkas dan tab Angsuran dari prototipe — Phase 3.
- Riwayat kontrak leasing yang sudah ditutup belum punya UI; datanya tersimpan dan bisa
  ditampilkan nanti.
