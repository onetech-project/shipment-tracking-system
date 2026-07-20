/**
 * Pure CSV builder for the Barhal dashboard export. Kept free of NestJS/DB dependencies so it
 * can be unit-tested in isolation, mirroring the air-shipments SLA export builder's shape
 * (sla-export.builder.ts) — just plain RFC4180 CSV instead of a styled .xlsx workbook.
 */

export interface BarhalCsvRow {
  koliNumber: string
  koliDate: string
  route: string
  totalTo: number
  weightBefore: number
  weightAfter: number
  chwt: number
}

const HEADERS = ['No. Koli', 'Tanggal', 'Rute', 'Total TO', 'Weight Before', 'Weight After', 'ChWt']

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildBarhalCsv(rows: BarhalCsvRow[]): string {
  const lines = [HEADERS.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.koliNumber,
        row.koliDate,
        row.route,
        row.totalTo,
        row.weightBefore,
        row.weightAfter,
        row.chwt,
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
