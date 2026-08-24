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

/** A bare CR must be quoted too: CR-tolerant readers treat it as a record break and split the row. */
function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
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
