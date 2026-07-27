/**
 * Pure CSV builder for the Barhal dashboard export. Kept free of NestJS/DB dependencies so it
 * can be unit-tested in isolation, mirroring the air-shipments SLA export builder's shape
 * (sla-export.builder.ts) — just plain RFC4180 CSV instead of a styled .xlsx workbook.
 */

export interface BarhalCsvRow {
  koliNumber: string
  koliDate: string | Date
  originName: string
  destName: string
  totalTo: number
  weightBefore: number | string | null
  weightAfter: number | string | null
  chwt: number | string | null
}

const HEADERS = ['No. Koli', 'Tanggal', 'Origin', 'Destinasi', 'Total TO', 'Weight Before', 'Weight After', 'ChWt']

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatCsvDate(date: string | Date): string {
  if (date instanceof Date) {
    return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCFullYear()}`
  }
  const [year, month, day] = date.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return date
  return `${String(day).padStart(2, '0')} ${MONTH_ABBR[month - 1]} ${year}`
}

function formatCsvWeight(value: number | string | null): string {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num.toFixed(1) : '0.0'
}

export function buildBarhalCsv(rows: BarhalCsvRow[]): string {
  const lines = [HEADERS.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.koliNumber,
        formatCsvDate(row.koliDate),
        row.originName,
        row.destName,
        row.totalTo,
        formatCsvWeight(row.weightBefore),
        formatCsvWeight(row.weightAfter),
        formatCsvWeight(row.chwt),
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
