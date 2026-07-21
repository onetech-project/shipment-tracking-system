# Periode Invoice manual selection saat upload settlement

## Problem

Di PnL Actual vs Estimate, kolom "Periode Invoice" saat ini dihitung otomatis dari kolom `DATE` pada `air_shipments_compileaircgk.extra_fields` (lihat migration `20260718000001-pnl-invoice-period.ts`), dengan aturan bi-mingguan: hari 1-15 → `YYYY-MM-1H`, hari 16-akhir bulan → `YYYY-MM-2H`.

Nilai ini tidak akurat karena `DATE` adalah tanggal operasional shipment, bukan tanggal periode invoice yang sebenarnya dipakai user untuk menagih. Periode invoice perlu ditentukan manual oleh user saat upload invoice settlement.

## Solution

Saat upload file settlement (di `SettlementUploadDialog`), user memilih "Periode Invoice" dari dropdown **sebelum** memilih file. Pilihan yang tersedia:

- 4 periode bi-mingguan terakhir, dihitung otomatis dari tanggal hari ini, mengikuti pola 1H (hari 1-15) / 2H (hari 16-akhir bulan) yang sudah ada — contoh: `2026-07-2H`, `2026-07-1H`, `2026-06-2H`, `2026-06-1H`.
- `Custom` — user memilih start date & end date sendiri.

Nilai periode yang dipilih berlaku untuk **seluruh file** yang di-upload dalam satu batch (semua shipment yang match di file tsb mendapat periode yang sama). Nilai ini disimpan langsung ke `air_shipments_compileaircgk` saat commit, dan menggantikan (bukan sekadar fallback) mekanisme derive dari `DATE`.

Shipment yang sudah settled sebelum fitur ini ada (kolom baru masih `NULL`) akan menampilkan `-` di kolom Periode Invoice — tidak ada fallback ke hasil derive dari `DATE` yang lama.

## Data model

Migration baru menambah 3 kolom ke `air_shipments_compileaircgk`:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `invoice_period_label` | `TEXT NULL` | Label yang ditampilkan, mis. `"2026-07-2H"` atau (custom) `"2026-07-05 - 2026-07-22"` |
| `invoice_period_start` | `DATE NULL` | Awal rentang periode |
| `invoice_period_end` | `DATE NULL` | Akhir rentang periode |

`v_pnl_to`: ekspresi `invoice_period` yang sekarang di-derive via `parse_flexible_timestamp(c.extra_fields->>'date')` diganti menjadi seleksi langsung `c.invoice_period_label AS invoice_period`. Logika derivasi lama dihapus dari view — tidak dipertahankan sebagai fallback.

`invoice_period_start`/`invoice_period_end` disimpan untuk keperluan filter/query di masa depan tapi tidak wajib diekspos di `v_pnl_to` untuk kebutuhan UI saat ini (cukup `invoice_period_label`).

## Backend

- `POST /pnl-settlement/commit` (multipart) menerima field tambahan di body: `periodLabel` (string, wajib), `periodStart` (ISO date, wajib), `periodEnd` (ISO date, wajib).
  - Validasi: `periodLabel` tidak boleh kosong; `periodStart <= periodEnd`.
- Bulk `UPDATE ... FROM (VALUES ...)` yang sudah menulis `actual_revenue`/`settled_at` per baris (`pnl-settlement.service.ts` commit) diperluas untuk juga men-set `invoice_period_label`, `invoice_period_start`, `invoice_period_end` — nilai yang sama untuk semua baris yang match di batch tsb.
- `POST /pnl-settlement/preview` **tidak berubah** — endpoint ini read-only dan tidak perlu tahu periode.

## Frontend

`SettlementUploadDialog.tsx`:
- Dropdown "Periode Invoice" ditempatkan di atas file picker, berisi 4 opsi periode terakhir (dihitung dari tanggal hari ini via helper baru, mis. `getLastInvoicePeriods(4)`) + opsi `Custom`.
- File picker & tombol upload/preview **disabled** sampai periode valid dipilih (untuk `Custom`, sampai start & end date terisi dan valid, `start <= end`).
- Saat `Custom` dipilih: tampilkan 2 input `type="date"` (start, end), mengikuti pola native date input yang sudah dipakai di `apps/frontend/src/app/(dashboard)/pnl/page.tsx` (mode range).
- Label yang dikirim ke backend saat `Custom`: `"{start} - {end}"` (format `YYYY-MM-DD - YYYY-MM-DD`).

`useSettlement.ts`:
- Mutation `commit` menambahkan `periodLabel`, `periodStart`, `periodEnd` ke `FormData` yang dikirim.

## Display

Komponen tabel PnL comparison yang sudah expose field `invoicePeriod` (dari `getToComparison`) tidak berubah strukturnya. Pastikan cell merender `-` saat value `null`/kosong (tambahkan fallback kecil bila belum ada).

## Out of scope

- Tidak ada tabel "upload batch" baru — pendekatan tetap menulis langsung ke `air_shipments_compileaircgk` per baris seperti sekarang (tidak ada perubahan arsitektur di luar penambahan kolom periode).
- Tidak ada perubahan pada endpoint read lain (`/summary`, `/unsettled`) di luar apa yang otomatis mengikuti perubahan `v_pnl_to`.
- Tidak ada UI untuk mengedit/mengoreksi periode invoice setelah commit (di luar scope; kalau salah, user re-upload/re-settle).
