# Barhal Export CSV Per TO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah export CSV dashboard Barhal dari satu baris per Koli (8 kolom) menjadi satu baris per TO (23 kolom), menggabungkan data TO dari sheet `air_shipments_compileaircgk` dengan data Koli dari `barhal_koli`.

**Architecture:** Dua berkas berubah dan keduanya sudah ada. `barhal-csv.builder.ts` adalah modul murni tanpa dependensi NestJS/DB — bentuk baris dan format kolom didefinisikan di sana dan diuji terpisah. `BarhalService.exportCsv` menyusun satu query SQL yang menarik baris dari `barhal_koli_to`, lalu menyerahkan hasilnya ke builder. Endpoint, DTO, controller, dan frontend tidak tersentuh.

**Tech Stack:** NestJS 10, TypeORM (dipakai sebagai `DataSource.query` raw SQL), PostgreSQL, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-08-24-barhal-csv-per-to-design.md`

## Global Constraints

- Perintah tes **wajib** memakai `NODE_OPTIONS=--max-old-space-size=3072` dan `--runInBand`. Tanpa keduanya suite ini kena OOM dan proses mati dengan exit code 134 tanpa pesan yang berguna. Jalankan dari `apps/backend/`.
- Gaya kode mengikuti berkas di sekitarnya: tanpa titik koma di akhir baris, kutip tunggal, indentasi 2 spasi, lebar baris ~120 kolom.
- Komentar penjelas ditulis dalam Bahasa Indonesia bila berada di `barhal.service.ts` (mengikuti komentar yang sudah ada di sana) dan Bahasa Inggris bila di `barhal-csv.builder.ts` (mengikuti komentar yang sudah ada di sana).
- Driver `pg` mengembalikan kolom `numeric` sebagai **string**, bukan number, dan kolom `date`/`timestamptz` sebagai objek `Date`. Setiap tipe field pada `BarhalCsvRow` harus mencerminkan hal ini.
- Urutan 23 kolom tidak boleh berubah. Baris header harfiah:
  ```
  Date (TO),Vendor,Origin,Destination,LT Number,TO Number,Gross Weight,Qty Parcel,Remarks,ID Packing Kayu,Berat sebelum,Berat Setelah Packing Kayu,Kenaikan Berat,SMU,Airlines,Flight No,STD,STA,Panjang (P),Lebar (L),Tinggi (T),Volume,Jumlah Batang Kayu
  ```
- Pemisah baris tetap CRLF (`\r\n`), seperti implementasi sekarang.

## File Structure

| Berkas | Peran | Aksi |
|---|---|---|
| `apps/backend/src/modules/barhal/barhal-csv.builder.ts` | Modul murni: bentuk baris (`BarhalCsvRow`), judul kolom, dan seluruh aturan format sel. Tanpa impor NestJS/TypeORM agar dapat diuji tanpa boot aplikasi. | Modifikasi (tulis ulang isi) |
| `apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts` | Tes unit builder. | Modifikasi (tulis ulang) |
| `apps/backend/src/modules/barhal/barhal.service.ts` | Menyusun SQL dan meneruskan hasilnya ke builder. Hanya konstanta CTE baru dan badan `exportCsv` yang berubah. | Modifikasi |
| `apps/backend/src/modules/barhal/barhal.service.spec.ts` | Tes SQL `exportCsv` (mock `DataSource.query`, memeriksa string SQL). | Modifikasi (hanya blok `describe('exportCsv')`) |

Tidak ada berkas baru. Tidak ada migrasi database — seluruh kolom yang dibutuhkan sudah ada.

Dua task: Task 1 menyelesaikan builder secara utuh (dapat di-review dan ditolak sendiri tanpa menyentuh SQL), Task 2 menyambungkannya ke query. Task 1 harus selesai lebih dulu karena Task 2 mengimpor tipe yang dihasilkannya.

---

### Task 1: Bentuk baris dan format sel di builder

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal-csv.builder.ts` (tulis ulang seluruh isi)
- Test: `apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts` (tulis ulang seluruh isi)

**Interfaces:**
- Consumes: tidak ada (task pertama).
- Produces:
  - `export interface BarhalCsvRow` dengan 22 field (lihat kode di Step 3) — dipakai Task 2 sebagai tipe hasil `dataSource.query`. Nama field inilah yang harus dipakai sebagai alias kolom SQL di Task 2.
  - `export function buildBarhalCsv(rows: BarhalCsvRow[]): string`
- Catatan: 22 field menghasilkan 23 kolom karena kolom `Kenaikan Berat` adalah turunan dari `weightBefore` dan `weightAfter`, bukan field tersendiri.

- [ ] **Step 1: Tulis tes yang gagal**

Ganti **seluruh isi** `apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts` dengan:

```ts
import { buildBarhalCsv, BarhalCsvRow } from './barhal-csv.builder'

const EXPECTED_HEADER =
  'Date (TO),Vendor,Origin,Destination,LT Number,TO Number,Gross Weight,Qty Parcel,Remarks,' +
  'ID Packing Kayu,Berat sebelum,Berat Setelah Packing Kayu,Kenaikan Berat,SMU,Airlines,Flight No,' +
  'STD,STA,Panjang (P),Lebar (L),Tinggi (T),Volume,Jumlah Batang Kayu'

/** A fully-populated row; each test overrides only the fields it is about. */
function row(overrides: Partial<BarhalCsvRow> = {}): BarhalCsvRow {
  return {
    shipmentDate: '2026-06-01',
    vendor: 'ESP',
    originName: 'Kosambi',
    destName: 'Badung',
    ltNumber: 'LT1Q511GUY9S1',
    toNumber: 'TO20260601ABCDE',
    grossWeight: 7.44,
    qtyParcel: '1',
    remarks: 'BARHAL',
    koliNumber: '1Jun-Kosambi-Badung-Barhal1',
    weightBefore: 15,
    weightAfter: 20,
    smuNumber: '990-12345678',
    airlines: 'Garuda',
    flightNo: 'GA-712',
    std: new Date('2026-06-01T07:30:00.000Z'),
    sta: new Date('2026-06-01T09:45:00.000Z'),
    lengthCm: 120,
    widthCm: 80,
    heightCm: 60,
    volume: 0.576,
    batangKayu: 4,
    ...overrides,
  }
}

describe('buildBarhalCsv', () => {
  it('emits the 23 per-TO columns in order', () => {
    const [header, line] = buildBarhalCsv([row()]).split('\r\n')

    expect(header).toBe(EXPECTED_HEADER)
    expect(line).toBe(
      '01 Jun 2026,ESP,Kosambi,Badung,LT1Q511GUY9S1,TO20260601ABCDE,7.4,1,BARHAL,' +
        '1Jun-Kosambi-Badung-Barhal1,15.0,20.0,5.0,990-12345678,Garuda,GA-712,' +
        '01 Jun 2026 14:30,01 Jun 2026 16:45,120,80,60,0.576,4',
    )
  })

  it('renders STD/STA in WIB, not in UTC', () => {
    // 2026-06-01T17:00Z is already 2026-06-02 00:00 in Jakarta: the date must roll over.
    const [, line] = buildBarhalCsv([row({ std: new Date('2026-06-01T17:00:00.000Z') })]).split('\r\n')

    expect(line.split(',')[16]).toBe('02 Jun 2026 00:00')
  })

  it('leaves STD/STA blank when the Koli has no flight yet', () => {
    const [, line] = buildBarhalCsv([row({ std: null, sta: null })]).split('\r\n')

    const cells = line.split(',')
    expect(cells[16]).toBe('')
    expect(cells[17]).toBe('')
  })

  it('leaves dimensions blank when unmeasured, rather than reporting them as zero', () => {
    const [, line] = buildBarhalCsv([
      row({ lengthCm: null, widthCm: null, heightCm: null, volume: null, batangKayu: null }),
    ]).split('\r\n')

    expect(line.split(',').slice(18, 23)).toEqual(['', '', '', '', ''])
  })

  it('leaves Kenaikan Berat blank when either weight is missing', () => {
    const [, unweighed] = buildBarhalCsv([row({ weightAfter: null })]).split('\r\n')
    expect(unweighed.split(',')[12]).toBe('')

    const [, weighed] = buildBarhalCsv([row({ weightBefore: 15, weightAfter: 20.5 })]).split('\r\n')
    expect(weighed.split(',')[12]).toBe('5.5')
  })

  it('blanks the TO columns when the TO is no longer in the sheet', () => {
    const [, line] = buildBarhalCsv([
      row({ shipmentDate: null, vendor: null, ltNumber: null, qtyParcel: null, remarks: null, grossWeight: null }),
    ]).split('\r\n')

    const cells = line.split(',')
    expect(cells.slice(0, 2)).toEqual(['', ''])
    expect(cells[4]).toBe('')
    // Gross Weight keeps the weight columns' numeric 0.0, unlike the blanked text columns.
    expect(cells[6]).toBe('0.0')
    expect(cells.slice(7, 9)).toEqual(['', ''])
  })

  it('quotes Remarks containing a comma so the column count stays 23', () => {
    const csv = buildBarhalCsv([row({ remarks: 'BARHAL, urgent' })])
    const [, line] = csv.split('\r\n')

    expect(line).toContain('"BARHAL, urgent"')
  })

  it('formats numerics returned as strings by the pg driver', () => {
    const [, line] = buildBarhalCsv([
      row({ grossWeight: '7.44', weightBefore: '15.25', weightAfter: '20', volume: '0.576', lengthCm: '120' }),
    ]).split('\r\n')

    const cells = line.split(',')
    expect(cells[6]).toBe('7.4')
    expect(cells[10]).toBe('15.3')
    expect(cells[11]).toBe('20.0')
    expect(cells[12]).toBe('4.8')
    expect(cells[18]).toBe('120')
    expect(cells[21]).toBe('0.576')
  })

  it('formats a shipment date returned as a Date by the pg driver', () => {
    const [, line] = buildBarhalCsv([row({ shipmentDate: new Date(Date.UTC(2026, 5, 1)) })]).split('\r\n')

    expect(line.split(',')[0]).toBe('01 Jun 2026')
  })

  it('emits only the header when there are no rows', () => {
    expect(buildBarhalCsv([])).toBe(EXPECTED_HEADER)
  })
})
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest src/modules/barhal/barhal-csv.builder.spec.ts --runInBand
```

Diharapkan: GAGAL saat kompilasi ts-jest, dengan galat bertipe `Object literal may only specify known properties, and 'shipmentDate' does not exist in type 'BarhalCsvRow'` — `BarhalCsvRow` masih berbentuk lama.

- [ ] **Step 3: Tulis implementasinya**

Ganti **seluruh isi** `apps/backend/src/modules/barhal/barhal-csv.builder.ts` dengan:

```ts
/**
 * Pure CSV builder for the Barhal dashboard export. Kept free of NestJS/DB dependencies so it
 * can be unit-tested in isolation, mirroring the air-shipments SLA export builder's shape
 * (sla-export.builder.ts) — just plain RFC4180 CSV instead of a styled .xlsx workbook.
 */

/**
 * One row per TO attached to a Koli.
 *
 * The Koli-owned fields (originName, destName, and everything from koliNumber onwards) are
 * REPEATED on every TO row of that Koli, so each row stands alone for filtering and pivoting.
 * The cost is that summing the weight, volume, or batang kayu columns counts a single Koli once
 * per TO and therefore overstates the total — the dashboard recap, which counts each Koli once,
 * is the number to trust for totals.
 *
 * The pg driver returns `numeric` columns as strings and `date`/`timestamptz` columns as Date
 * objects, so the field types admit both shapes.
 */
export interface BarhalCsvRow {
  /** Date of the TO itself (shipment_date), not the date its Koli was packed. */
  shipmentDate: string | Date | null
  vendor: string | null
  originName: string
  destName: string
  ltNumber: string | null
  toNumber: string
  grossWeight: number | string | null
  /** Raw sheet text, not coerced to a number: the sheet is filled in by hand. */
  qtyParcel: string | null
  remarks: string | null
  /** The Koli number doubles as the packing-kayu identifier — there is no separate ID. */
  koliNumber: string
  weightBefore: number | string | null
  weightAfter: number | string | null
  smuNumber: string | null
  airlines: string | null
  flightNo: string | null
  std: string | Date | null
  sta: string | Date | null
  lengthCm: number | string | null
  widthCm: number | string | null
  heightCm: number | string | null
  volume: number | string | null
  batangKayu: number | string | null
}

const HEADERS = [
  'Date (TO)',
  'Vendor',
  'Origin',
  'Destination',
  'LT Number',
  'TO Number',
  'Gross Weight',
  'Qty Parcel',
  'Remarks',
  'ID Packing Kayu',
  'Berat sebelum',
  'Berat Setelah Packing Kayu',
  'Kenaikan Berat',
  'SMU',
  'Airlines',
  'Flight No',
  'STD',
  'STA',
  'Panjang (P)',
  'Lebar (L)',
  'Tinggi (T)',
  'Volume',
  'Jumlah Batang Kayu',
]

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCsvDate(date: string | Date | null): string {
  if (date === null || date === undefined || date === '') return ''
  if (date instanceof Date) {
    return `${pad2(date.getUTCDate())} ${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCFullYear()}`
  }
  const [year, month, day] = date.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return date
  return `${pad2(day)} ${MONTH_ABBR[month - 1]} ${year}`
}

/**
 * STD/STA are timestamptz, and operators read them as Jakarta wall-clock time in the dashboard.
 * The offset is hardcoded rather than read from the server's zone: the API may well run in UTC,
 * and the times would then silently disagree with what the same user sees on screen.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

function formatCsvDateTime(value: string | Date | null): string {
  if (value === null || value === undefined || value === '') return ''
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const wib = new Date(parsed.getTime() + WIB_OFFSET_MS)
  return (
    `${pad2(wib.getUTCDate())} ${MONTH_ABBR[wib.getUTCMonth()]} ${wib.getUTCFullYear()} ` +
    `${pad2(wib.getUTCHours())}:${pad2(wib.getUTCMinutes())}`
  )
}

/** Weighed values: always present in the normal flow, so a missing one reads as 0.0. */
function formatCsvWeight(value: number | string | null): string {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num.toFixed(1) : '0.0'
}

/**
 * Measured values: a missing one is left blank rather than zeroed. A forced 0 on a dimension
 * reads as "it measures zero", when it in fact means nobody has measured it yet.
 */
function formatCsvNumber(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : ''
}

/** Blank unless both weights are in, which distinguishes "not weighed yet" from "no increase". */
function formatCsvDelta(before: number | string | null, after: number | string | null): string {
  if (before === null || before === undefined || before === '') return ''
  if (after === null || after === undefined || after === '') return ''
  const delta = Number(after) - Number(before)
  return Number.isFinite(delta) ? delta.toFixed(1) : ''
}

export function buildBarhalCsv(rows: BarhalCsvRow[]): string {
  const lines = [HEADERS.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        formatCsvDate(row.shipmentDate),
        row.vendor,
        row.originName,
        row.destName,
        row.ltNumber,
        row.toNumber,
        formatCsvWeight(row.grossWeight),
        row.qtyParcel,
        row.remarks,
        row.koliNumber,
        formatCsvWeight(row.weightBefore),
        formatCsvWeight(row.weightAfter),
        formatCsvDelta(row.weightBefore, row.weightAfter),
        row.smuNumber,
        row.airlines,
        row.flightNo,
        formatCsvDateTime(row.std),
        formatCsvDateTime(row.sta),
        formatCsvNumber(row.lengthCm),
        formatCsvNumber(row.widthCm),
        formatCsvNumber(row.heightCm),
        formatCsvNumber(row.volume),
        formatCsvNumber(row.batangKayu),
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
```

- [ ] **Step 4: Jalankan tes untuk memastikan lolos**

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest src/modules/barhal/barhal-csv.builder.spec.ts --runInBand
```

Diharapkan: LOLOS, `Tests: 10 passed, 10 total`.

Catatan: `barhal.service.ts` **tetap** dapat dikompilasi setelah task ini, karena `DataSource.query<T = any>` mengembalikan `Promise<T>` sehingga anotasi `const rows: BarhalCsvRow[]` selalu lolos typecheck berapa pun bentuk SQL-nya. Alias kolom yang belum cocok tidak akan tertangkap oleh TypeScript — itulah sebabnya Task 2 menguji string SQL secara langsung. Jangan menyentuh `barhal.service.ts` di task ini.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal-csv.builder.ts apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts
git commit -m "feat(barhal): bentuk baris CSV per TO dengan 23 kolom"
```

---

### Task 2: Query per-TO di `exportCsv`

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` — tambah konstanta `TO_LATEST_CTE` (letakkan tepat setelah `SMU_CHWT_CTE`, sekitar baris 132) dan tulis ulang badan metode `exportCsv` (sekarang di baris 988–1027)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` — ganti blok `describe('exportCsv', …)` (sekarang di baris 742–755)

**Interfaces:**
- Consumes dari Task 1: `BarhalCsvRow` dan `buildBarhalCsv` — sudah diimpor di baris 17 `barhal.service.ts`, impor tidak perlu diubah. Alias kolom SQL harus persis sama dengan nama field `BarhalCsvRow`.
- Produces: `BarhalService.exportCsv(dto: BarhalDashboardQueryDto): Promise<string>` — tanda tangan tidak berubah, sehingga controller dan frontend tetap utuh.

**Konteks yang perlu diketahui sebelum menulis:**

`SMU_CHWT_CTE` **tetap dipakai** oleh `buildScopeSql` dan `getSmuList`; jangan hapus konstantanya walaupun `exportCsv` tidak lagi memakainya.

Kolom `vendor` dan `qty_parcel` **bukan** generated column di `air_shipments_compileaircgk` — keduanya hanya ada di dalam `extra_fields` dan harus dibaca lewat `extra_fields->>'…'`. Sebaliknya `shipment_date`, `lt_number`, `remarks`, `gross_weight`, dan `to_number` sudah berupa generated column dan dapat dirujuk langsung.

- [ ] **Step 1: Tulis tes yang gagal**

Di `apps/backend/src/modules/barhal/barhal.service.spec.ts`, ganti blok `describe('exportCsv', …)` yang ada — termasuk tes chWt lama di dalamnya, yang memang tidak lagi berlaku karena export baru tidak memuat kolom ChWt — dengan:

```ts
  describe('exportCsv', () => {
    it('emits one row per attached TO, joined to its Koli', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.exportCsv({ startDate: '2026-06-01', endDate: '2026-06-30' })

      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('FROM barhal_koli_to t')
      expect(sql).toContain('JOIN barhal_koli k ON k.id = t.koli_id')
      // Vendor and qty parcel are not generated columns — only extra_fields carries them.
      expect(sql).toContain("extra_fields->>'vendor'")
      // Tanpa ::text, driver pg mengirim tengah malam waktu lokal dan tanggalnya mundur sehari
      // di kontainer produksi yang ber-TZ Asia/Jakarta.
      expect(sql).toContain('c.shipment_date::text')
      expect(sql).toContain("extra_fields->>'qty_parcel'")
      // The export no longer carries a ChWt column, so it must not pay for that CTE.
      expect(sql).not.toContain('smu_chwt')
    })

    it('collapses a TO that has several LT rows in the sheet down to its latest one', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.exportCsv({})

      const [sql] = dataSource.query.mock.calls[0]
      // air_shipments_compileaircgk is unique on (lt_number, to_number), so one TO can hold
      // several rows; without DISTINCT ON the join multiplies TO rows past the Koli's total_to.
      expect(sql).toContain('DISTINCT ON (to_number)')
      expect(sql).toContain('ORDER BY to_number, updated_at DESC NULLS LAST')
    })

    it('keeps a Koli line whose TO has vanished from the sheet', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.exportCsv({})

      const [sql] = dataSource.query.mock.calls[0]
      // barhal_koli_to is a snapshot: an inner join would silently drop the line and make the
      // CSV disagree with the Koli's total_to.
      expect(sql).toContain('LEFT JOIN to_latest c ON c.to_number = t.to_number')
    })

    it('filters the date range on the TO date, matching the exported Date (TO) column', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.exportCsv({ startDate: '2026-06-01', endDate: '2026-06-30', origin: 'Kosambi' })

      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('c.shipment_date BETWEEN $1 AND $2')
      expect(sql).not.toContain('k.koli_date BETWEEN')
      expect(sql).toContain('k.origin_name = $3')
      expect(params).toEqual(['2026-06-01', '2026-06-30', 'Kosambi'])
    })

    it('orders newest TO first, keeping each Koli grouped together', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.exportCsv({})

      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('ORDER BY c.shipment_date DESC NULLS LAST, k.koli_number, t.to_number')
    })

    it('hands the query rows to the CSV builder', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          shipmentDate: '2026-06-01',
          vendor: 'ESP',
          originName: 'Kosambi',
          destName: 'Badung',
          ltNumber: 'LT1',
          toNumber: 'TO1',
          grossWeight: '7.44',
          qtyParcel: '1',
          remarks: 'BARHAL',
          koliNumber: '1Jun-Kosambi-Badung-Barhal1',
          weightBefore: '15',
          weightAfter: '20',
          smuNumber: null,
          airlines: null,
          flightNo: null,
          std: null,
          sta: null,
          lengthCm: null,
          widthCm: null,
          heightCm: null,
          volume: null,
          batangKayu: null,
        },
      ])

      const csv = await service.exportCsv({})

      const [header, line] = csv.split('\r\n')
      expect(header.startsWith('Date (TO),Vendor,Origin,Destination')).toBe(true)
      expect(line).toBe('01 Jun 2026,ESP,Kosambi,Badung,LT1,TO1,7.4,1,BARHAL,1Jun-Kosambi-Badung-Barhal1,15.0,20.0,5.0,,,,,,,,,,')
    })
  })
```

- [ ] **Step 2: Jalankan tes untuk memastikan gagal**

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest src/modules/barhal/barhal.service.spec.ts --runInBand
```

Diharapkan: GAGAL pada assertion, bukan pada kompilasi. `exportCsv` masih menyusun SQL lama, sehingga tes pertama gagal di `expect(sql).toContain('FROM barhal_koli_to t')` dengan SQL yang diterima masih memuat `FROM barhal_koli k`.

Jangan berharap galat tipe di sini: `DataSource.query<T = any>` mengembalikan `Promise<T>`, jadi anotasi `const rows: BarhalCsvRow[]` lolos typecheck walaupun kolom SQL-nya tidak cocok sama sekali. Ketidakcocokan alias hanya dapat tertangkap oleh tes string SQL ini dan oleh verifikasi database di Step 7.

- [ ] **Step 3: Tambahkan konstanta CTE**

Di `apps/backend/src/modules/barhal/barhal.service.ts`, sisipkan tepat setelah blok konstanta `SMU_CHWT_CTE` berakhir (setelah baris ``` ` ``` penutupnya, sekitar baris 132) dan sebelum `@Injectable()`:

```ts
/**
 * Satu baris per TO, diambil yang paling baru.
 *
 * air_shipments_compileaircgk unik pada (lt_number, to_number), sehingga satu TO bisa punya
 * beberapa baris dengan LT dan tanggal berbeda — bukan kasus teoretis, data produksi sudah
 * memuatnya. Tanpa DISTINCT ON, join ke barhal_koli_to menggandakan baris TO dan jumlah baris
 * CSV melampaui total_to Koli-nya. Pola pemilihan barisnya sama seperti SMU_CHWT_CTE.
 *
 * vendor dan qty_parcel dibaca dari extra_fields karena keduanya bukan generated column,
 * berbeda dari shipment_date/lt_number/remarks/gross_weight yang sudah dimaterialisasi.
 */
const TO_LATEST_CTE = `
  to_latest AS (
    SELECT DISTINCT ON (to_number)
      to_number,
      lt_number,
      shipment_date,
      gross_weight,
      remarks,
      extra_fields->>'vendor'     AS vendor,
      extra_fields->>'qty_parcel' AS qty_parcel
    FROM air_shipments_compileaircgk
    WHERE to_number IS NOT NULL
    ORDER BY to_number, updated_at DESC NULLS LAST
  )
`
```

- [ ] **Step 4: Tulis ulang `exportCsv`**

Ganti seluruh metode `exportCsv` (baris 988–1027, dari `async exportCsv(` sampai `return buildBarhalCsv(rows)` beserta kurung penutupnya) dengan:

```ts
  /**
   * Export per TO: satu baris untuk setiap TO yang sudah dilampirkan ke sebuah Koli.
   *
   * Rentang tanggal disaring pada c.shipment_date (tanggal TO), bukan k.koli_date, supaya yang
   * disaring sama dengan yang tampil di kolom "Date (TO)". Konsekuensinya, jumlah baris CSV tidak
   * selalu sama dengan kartu statistik dashboard yang berbasis koli_date — sebuah TO bisa saja
   * dipacking di bulan yang berbeda dari tanggal TO-nya.
   *
   * TO yang tidak lagi ada di sheet bertanggal NULL sehingga tersaring keluar saat rentang
   * tanggal aktif; tanpa tanggal, baris itu memang tidak bisa ditempatkan dalam rentang mana pun.
   */
  async exportCsv(dto: BarhalDashboardQueryDto): Promise<string> {
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`c.shipment_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows: BarhalCsvRow[] = await this.dataSource.query(
      `
      WITH ${TO_LATEST_CTE}
      SELECT
        -- ::text wajib. Driver pg mem-parse kolom `date` menjadi tengah malam waktu LOKAL, dan
        -- kontainer produksi berjalan pada TZ=Asia/Jakarta (Dockerfile:41), sehingga tanggal 1 Juni
        -- sampai ke builder sebagai 31 Mei 17:00Z dan tiap baris mundur satu hari. Tiga query lain
        -- di berkas ini sudah meng-cast (baris 623, 824, 963); hanya export lama yang tidak.
        c.shipment_date::text    AS "shipmentDate",
        c.vendor                 AS "vendor",
        k.origin_name            AS "originName",
        k.dest_name              AS "destName",
        c.lt_number              AS "ltNumber",
        t.to_number              AS "toNumber",
        c.gross_weight::numeric  AS "grossWeight",
        c.qty_parcel             AS "qtyParcel",
        c.remarks                AS "remarks",
        -- No. Koli merangkap sebagai ID packing kayu; tidak ada identitas packing yang terpisah.
        k.koli_number            AS "koliNumber",
        k.weight_before::numeric AS "weightBefore",
        k.weight_after::numeric  AS "weightAfter",
        k.smu_number             AS "smuNumber",
        k.airlines               AS "airlines",
        k.flight_no              AS "flightNo",
        k.std                    AS "std",
        k.sta                    AS "sta",
        k.length_cm::numeric     AS "lengthCm",
        k.width_cm::numeric      AS "widthCm",
        k.height_cm::numeric     AS "heightCm",
        k.volume::numeric        AS "volume",
        k.batang_kayu            AS "batangKayu"
      FROM barhal_koli_to t
      JOIN barhal_koli k ON k.id = t.koli_id
      -- LEFT JOIN, bukan inner: barhal_koli_to adalah snapshot, jadi TO yang hilang dari sheet
      -- tetap harus tampil dengan kolom Koli utuh alih-alih lenyap diam-diam dari export.
      LEFT JOIN to_latest c ON c.to_number = t.to_number
      ${where}
      ORDER BY c.shipment_date DESC NULLS LAST, k.koli_number, t.to_number
      `,
      params,
    )
    return buildBarhalCsv(rows)
  }
```

- [ ] **Step 5: Jalankan tes modul untuk memastikan lolos**

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest src/modules/barhal --runInBand
```

Diharapkan: LOLOS, seluruh suite Barhal hijau (`barhal.service.spec.ts`, `barhal-csv.builder.spec.ts`, `barhal-recap.builder.spec.ts`).

- [ ] **Step 6: Periksa kompilasi TypeScript**

```bash
cd apps/backend && npx tsc --noEmit -p tsconfig.json
```

Diharapkan: keluar tanpa galat. Langkah ini menangkap sisa referensi ke field `BarhalCsvRow` lama di berkas yang tidak punya tes.

- [ ] **Step 7: Verifikasi terhadap database sungguhan**

Query berikut mereplikasi SQL export tanpa filter dan membandingkan jumlah barisnya dengan jumlah TO terlampir. Keduanya harus sama — bila baris CSV lebih banyak, `DISTINCT ON` tidak bekerja:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app -c "
WITH to_latest AS (
  SELECT DISTINCT ON (to_number) to_number, lt_number, shipment_date
  FROM air_shipments_compileaircgk WHERE to_number IS NOT NULL
  ORDER BY to_number, updated_at DESC NULLS LAST
)
SELECT
  (SELECT count(*) FROM barhal_koli_to)                       AS to_terlampir,
  (SELECT count(*) FROM barhal_koli_to t
     LEFT JOIN to_latest c ON c.to_number = t.to_number)      AS baris_csv;"
```

Diharapkan: kedua angka sama.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): export CSV dashboard menjadi per TO"
```

---

## Verifikasi Akhir

- [ ] Jalankan seluruh suite backend sekali sebelum menyerahkan pekerjaan:

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand
```

Diharapkan: hijau. Bila proses mati dengan exit code 134 tanpa pesan, itu OOM — pastikan `NODE_OPTIONS` dan `--runInBand` benar-benar terpasang, bukan pertanda tes gagal.

- [ ] Unduh CSV lewat UI (dashboard Barhal → tombol *Export CSV*) dan buka di spreadsheet. Periksa: baris header berisi 23 kolom sesuai daftar, jam STD/STA sama dengan yang tampil di tabel SMU pada layar, dan kolom dimensi yang belum diisi tampil kosong alih-alih `0`.
