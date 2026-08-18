import { PnlDailyMatrix, PnlDailyMatrixColumn, PnlRouteFilter } from '../hooks/usePnl'

export interface OriginGroup {
  label: string
  span: number
}

export interface MatrixFooterRow {
  label: string
  values: (number | null)[] // index-aligned with columns
  format: 'number' | 'percent'
  incompleteTos?: number[] // index-aligned with columns, same convention as values
}

// Everything PnlMatrixTable needs to render, with no knowledge of revenue or margin. Both tables
// project into this same shape so they share one renderer and stay visually identical.
export interface MatrixTableModel {
  columns: PnlDailyMatrixColumn[]
  dates: string[]
  values: (number | null)[][] // [rowIndex][columnIndex]; null = no shipment, distinct from 0
  incompleteTos: number[][] | null // null = cost completeness is irrelevant to this table
  footerRows: MatrixFooterRow[]
  highlightNegative: boolean
}

// Fixed English abbreviations rather than a locale format, so the header reads the same as the
// spreadsheet this report replaces regardless of where it is rendered.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${Number(day)}-${MONTHS[Number(month) - 1]}-${year}`
}

// Consecutive columns sharing an origin label become one spanning header cell (CGK, then SUB).
export function groupOrigins(columns: PnlDailyMatrixColumn[]): OriginGroup[] {
  const groups: OriginGroup[] = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last && last.label === column.originLabel) last.span += 1
    else groups.push({ label: column.originLabel, span: 1 })
  }
  return groups
}

export function toRevenueTable(matrix: PnlDailyMatrix): MatrixTableModel {
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.revenue : null))),
    incompleteTos: null,
    footerRows: [
      { label: 'Total', values: matrix.footer.map((f) => f.totalRevenue), format: 'number' },
      { label: 'Avg / Day', values: matrix.footer.map((f) => f.avgRevenuePerDay), format: 'number' },
    ],
    highlightNegative: false,
  }
}

export function toMarginTable(matrix: PnlDailyMatrix): MatrixTableModel {
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.margin : null))),
    incompleteTos: matrix.rows.map((r) => r.cells.map((c) => (c ? c.incompleteTos : 0))),
    footerRows: [
      {
        label: 'Total',
        values: matrix.footer.map((f) => f.totalMargin),
        format: 'number',
        incompleteTos: matrix.footer.map((f) => f.incompleteTos),
      },
      { label: 'Avg / Day', values: matrix.footer.map((f) => f.avgMarginPerDay), format: 'number' },
      { label: '% Margin', values: matrix.footer.map((f) => f.marginPct), format: 'percent' },
      { label: 'Total Tonase', values: matrix.footer.map((f) => f.totalWeight), format: 'number' },
      { label: 'Space per Kg', values: matrix.footer.map((f) => f.spacePerKg), format: 'number' },
    ],
    highlightNegative: true,
  }
}

// A clicked matrix cell as an AWB drilldown filter. The column carries both forms of the origin;
// the drilldown filters on the raw value ('Jabo'), while the matrix header shows the label ('CGK').
export function routeFromCell(column: PnlDailyMatrixColumn, date: string): PnlRouteFilter {
  return {
    routes: [{ origin: column.origin, dest: column.dest }],
    dateFrom: date,
    dateTo: date,
  }
}
