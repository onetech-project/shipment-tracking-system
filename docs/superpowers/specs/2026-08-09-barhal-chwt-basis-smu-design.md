# Barhal — chWt dipindah ke basis No. SMU

Tanggal: 2026-08-09
Status: disetujui, siap diimplementasikan

## Masalah

Operator membuat Koli, memilih TO, dan belum mengisi No. SMU — tetapi kolom chWt Airlines
sudah menampilkan angka. Operator mengharapkan chWt baru muncul setelah No. SMU diisi.

Penyebabnya bukan bug, melainkan jalur data yang memang tidak melewati SMU. `attachTos`
menyalin `air_shipments_compileaircgk.awb` ke `barhal_koli_to.awb` pada saat TO dipilih
(`barhal.service.ts:293-311`). Seluruh agregat chWt lalu membaca Reservasi lewat kolom itu:

```sql
LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
```

AWB sudah diketahui dari sheet TO jauh sebelum SMU diinput, sehingga chWt ikut muncul lebih
awal. Kolom `smu_number` diisi belakangan lewat `updateSmu` dan tidak pernah masuk ke jalur
lookup chWt kecuali di SMU List, yang query-nya memang difilter `k.smu_number IS NOT NULL`.

## Aturan baru

chWt bersumber dari tabel Reservasi dan dicocokkan lewat:

```
air_shipments_smu_rate_cgk_spx.awb = barhal_koli.smu_number
```

No. SMU (Surat Muatan Udara) adalah nomor AWB yang sama dengan yang dipakai Reservasi, dan
`awb` adalah satu-satunya kolom identitas di tabel itu — tidak ada kolom nomor SMU terpisah.
Field bernama `trackingan_smu` di `extra_fields` berisi status (`Onboard`/`In Transit`), bukan
nomor, sehingga tidak dipakai.

Koli yang `smu_number`-nya kosong tidak menyumbang chWt. `barhal_koli_to.awb` berhenti menjadi
sumber angka mana pun.

## Dedupe per AWB

Unique key `air_shipments_smu_rate_cgk_spx` sudah dilebarkan dari `[awb]` menjadi
`[awb, account, via, dest]`, sehingga satu AWB dapat memiliki lebih dari satu baris — satu baris
rate yang bersih ditambah baris parsial/kotor (lihat `20260711000001-pnl-dedup-booking-per-awb.ts`).
`SUM(r.chwt)` atas join `r.awb = ...` yang dipakai sekarang karena itu sudah berpotensi
menggandakan chWt hari ini, terlepas dari perubahan ini.

Karena join-nya ditulis ulang, dedupe-nya disamakan dengan cara `v_pnl_to` memilih satu baris
booking per AWB. Satu CTE dipakai bersama oleh recap, CSV export, dan SMU List:

```sql
smu_chwt AS (
  SELECT DISTINCT ON (awb) awb, chwt
  FROM air_shipments_smu_rate_cgk_spx
  ORDER BY awb,
    -- utamakan baris yang join key-nya lengkap (baris rate yang benar-benar terpakai)
    (NULLIF(BTRIM(account), '') IS NOT NULL
     AND NULLIF(BTRIM(via),  '') IS NOT NULL
     AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
    updated_at DESC NULLS LAST
)
```

CTE ini diekspos dari `buildScopeSql` bersama `scopedCte`/`koliScopedCte`/`packedCte` agar
definisinya tunggal. `exportCsv` dan `getSmuList` tidak memakai `buildScopeSql`, sehingga
konstanta SQL-nya diangkat ke satu string modul-level yang dipakai ketiga jalur.

## Perubahan per query

### `buildScopeSql`

- `t.awb` dilepas dari `packedCte` dan `e.awb` dilepas dari `scopedCte` — keduanya menjadi
  kolom mati setelah perubahan ini. LATERAL-nya tetap dibutuhkan untuk `gross_weight` dan
  `matches_koli`.
- `packedCte` **tidak** perlu membawa `ks.smu_number`: chWt dan kedua counter SMU membaca
  `koli_scoped` langsung, sedangkan `to_without_chwt` membaca `barhal_koli` global. Menambahkannya
  hanya akan menjadi kolom mati baru, persis alasan `t.awb` dilepas.

### `queryPerTanggal` dan `queryPerRute`

Empat ekspresi berubah di kedua query, dengan predikat grup masing-masing
(`ks.koli_date = g.koli_date` versus `ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name`):

**`chwt`** — dijumlahkan atas No. SMU distinct milik Koli dalam grup, bukan atas AWB:

```sql
(SELECT COALESCE(SUM(sc.chwt), 0)
   FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
           FROM koli_scoped ks
          WHERE <predikat grup> AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
   LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number)::numeric AS chwt
```

**`koli_without_awb` menjadi `koli_without_smu`** — Koli yang belum diisi No. SMU:

```sql
(SELECT COUNT(*) FROM koli_scoped ks
   WHERE <predikat grup> AND NULLIF(BTRIM(ks.smu_number), '') IS NULL)::int AS koli_without_smu
```

**`koli_awb_without_chwt` menjadi `koli_smu_without_chwt`** — No. SMU distinct dalam grup yang
tidak menemukan chWt di Reservasi:

```sql
(SELECT COUNT(*)
   FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
           FROM koli_scoped ks
          WHERE <predikat grup> AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
   LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number
  WHERE sc.chwt IS NULL)::int AS koli_smu_without_chwt
```

**`to_without_chwt`** — TO yang belum masuk ke Koli ber-SMU yang punya chWt:

```sql
(SELECT COUNT(DISTINCT s.to_number) FROM scoped s
   WHERE <predikat grup>
     AND NOT EXISTS (
       SELECT 1
         FROM barhal_koli_to bkt
         JOIN barhal_koli bk ON bk.id = bkt.koli_id
         JOIN smu_chwt sc ON sc.awb = NULLIF(BTRIM(bk.smu_number), '')
        WHERE bkt.to_number = s.to_number AND sc.chwt IS NOT NULL))::int AS to_without_chwt
```

Pencarian Koli-nya sengaja lewat `barhal_koli_to` + `barhal_koli` global, **bukan** lewat
`packed` yang sudah ter-scope Koli. Alasannya dijelaskan di komentar `toRecapMetrics`
(`barhal-recap.builder.ts:50-72`): `to_without_chwt` harus tetap menjadi properti TO itu
sendiri agar status dapat roll-up dua arah. Membacanya lewat `packed` membuat baris parent bisa
kembali berstatus Completed di atas child yang Incomplete. Pola query global ini sama dengan
yang sudah dipakai `unpacked_to`.

Konsekuensinya `to_without_chwt` kini mencakup `unpacked_to` — TO yang belum dipacking pasti
belum punya Koli ber-SMU. Kedua counter tetap dipertahankan terpisah karena tidak ada biayanya
dan keduanya menjawab pertanyaan operator yang berbeda.

### `exportCsv`

Baris per Koli, chWt diambil langsung dari No. SMU Koli tersebut:

```sql
COALESCE((SELECT sc.chwt FROM smu_chwt sc
           WHERE sc.awb = NULLIF(BTRIM(k.smu_number), '')), 0)::numeric AS "chwt"
```

Satu SMU dapat dipakai beberapa Koli, dan pada kasus itu chWt milik SMU ditampilkan **penuh di
setiap baris** — chWt adalah properti SMU, bukan properti Koli. Total kolom chWt di CSV karena
itu bisa lebih besar dari total di recap, dan itu memang disengaja. Perilaku ini didokumentasikan
di komentar `barhal-csv.builder.ts` agar kolomnya tidak dijumlahkan mentah-mentah.

### `getSmuList`

Menjadi lookup langsung, menggantikan subquery yang menjumlahkan AWB distinct dari seluruh Koli
yang berbagi No. SMU:

```sql
(SELECT sc.chwt FROM smu_chwt sc WHERE sc.awb = BTRIM(k.smu_number))::numeric AS chwt
```

Filternya memakai `NULLIF(BTRIM(k.smu_number), '') IS NOT NULL` menggantikan
`k.smu_number IS NOT NULL`, agar Koli ber-SMU spasi kosong tidak muncul sebagai grup SMU
tersendiri. `GROUP BY k.smu_number` tetap apa adanya — nilainya masih diperlukan utuh untuk kolom
`smuNumber`, dan korelasi chWt-nya yang di-`BTRIM` supaya No. SMU berspasi tetap menemukan baris
Reservasi yang sama dengan yang ditemukan recap.

Komentar asumsi 4-baris di `barhal.service.ts:421-425` dihapus bersama subquery lamanya —
satu SMU kini memetakan ke tepat satu baris Reservasi, sehingga penjumlahan lintas tanggal/tujuan
yang dikhawatirkan komentar itu tidak lagi mungkin terjadi. Nilai `null` tetap mungkin (SMU tidak
ditemukan di Reservasi) dan tetap ditampilkan sebagai `—`, sama seperti sekarang.

## Builder dan tipe

`RecapAggregateRow` mengganti nama dua field beserta JSDoc-nya:

- `koli_without_awb` → `koli_without_smu` — "Koli dalam grup ini yang belum diisi No. SMU."
- `koli_awb_without_chwt` → `koli_smu_without_chwt` — "No. SMU distinct dalam grup ini yang tidak
  ditemukan di Reservasi atau ditemukan tanpa chWt."

Daftar `outstanding` di `toRecapMetrics` ikut memakai nama baru. Komentar besar di atas fungsi itu
diperbarui agar menyebut SMU, bukan AWB.

`chwt` tetap bertipe `number` dan tetap `COALESCE(..., 0)`. Baris yang belum ada Koli ber-SMU
menampilkan `0 kg` dengan badge status Incomplete sebagai penandanya. Tipe API tidak berubah,
sehingga **frontend tidak disentuh sama sekali** — chart tetap punya titik data di setiap tanggal
dan CSV tetap berisi angka.

## Di luar scope

Tidak ada migration: tidak ada kolom yang ditambah, diubah, atau dihapus. `barhal_koli_to.awb`
tetap ditulis oleh `attachTos` sebagai informasi dan tetap dipakai untuk validasi TO, hanya
berhenti memengaruhi angka chWt dan status. Frontend, DTO, dan bentuk response tidak berubah.

## Testing

`barhal.service.spec.ts` menegaskan bentuk SQL yang dihasilkan (mis. `expect(subquery).toContain(
'air_shipments_smu_rate_cgk_spx r')` di baris 623), sehingga assertion-nya disesuaikan ke bentuk
baru. `barhal-recap.builder.spec.ts` disesuaikan untuk dua counter yang berganti nama.

Kasus baru yang ditambahkan:

1. Koli punya TO ber-AWB tetapi `smu_number` NULL → `chwt` 0 dan status Incomplete. Ini reproduksi
   langsung dari kasus yang dilaporkan operator.
2. Koli ber-SMU yang ditemukan di Reservasi → `chwt` terisi dan status Completed.
3. Dua Koli berbagi satu No. SMU → chWt dihitung sekali di recap, tidak dobel.
4. Satu AWB punya dua baris di Reservasi → chWt dihitung sekali (regresi yang sudah ada sebelum
   perubahan ini).
5. `smu_number` diisi tetapi tidak ada di Reservasi → `chwt` 0 dan status Incomplete.
6. `smu_number` berisi string kosong atau spasi → diperlakukan sama dengan NULL.

Jest dijalankan dengan `--runInBand` mengikuti batasan RAM pada mesin ini.
