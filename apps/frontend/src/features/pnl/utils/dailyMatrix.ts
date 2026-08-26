import { PnlDailyMatrix, PnlDailyMatrixColumn, PnlRouteFilter } from '../hooks/usePnl'
import { CellWarning } from './cellWarning'

export interface OriginGroup {
  label: string
  span: number
}

export interface MatrixFooterRow {
  label: string
  values: (number | null)[] // index-aligned with columns
  format: 'number' | 'percent'
  // index-aligned with columns; absent means this row's value does not derive from the warned
  // quantities (cost, incomplete TOs) — e.g. a gross weight total.
  warnings?: CellWarning[]
}

// Everything PnlMatrixTable needs to render, with no knowledge of revenue or margin. Both tables
// project into this same shape so they share one renderer and stay visually identical.
export interface MatrixTableModel {
  columns: PnlDailyMatrixColumn[]
  dates: string[]
  values: (number | null)[][] // [rowIndex][columnIndex]; null = no shipment, distinct from 0
  warnings: CellWarning[][] // [rowIndex][columnIndex]; always present, clean cells included
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

// An absent cell still gets a clean warning rather than being left undefined, so the renderer and
// the tests have exactly one shape to read.
const CLEAN: CellWarning = { issues: [], incompleteTos: 0 }

function cellWarnings(matrix: PnlDailyMatrix): CellWarning[][] {
  return matrix.rows.map((row) =>
    row.cells.map((cell) =>
      // `issues` is non-optional in the type, but the deploy pipeline brings backend and frontend up
      // in parallel, so a new frontend can briefly hit an old backend whose cells lack the field.
      cell ? { issues: cell.issues ?? [], incompleteTos: cell.incompleteTos } : CLEAN,
    ),
  )
}

export function toRevenueTable(matrix: PnlDailyMatrix): MatrixTableModel {
  // Every value in this table's footer derives from totalRevenue, which is understated by the same
  // missing cost that produces these warnings, so both rows below carry them. `issues` is
  // non-optional in the type, but the deploy pipeline brings backend and frontend up in parallel, so
  // a new frontend can briefly hit an old backend whose footer lacks the field — hence `?? []`.
  const footerWarnings = matrix.footer.map((f) => ({ issues: f.issues ?? [], incompleteTos: f.incompleteTos }))
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.revenue : null))),
    warnings: cellWarnings(matrix),
    footerRows: [
      { label: 'Total', values: matrix.footer.map((f) => f.totalRevenue), format: 'number', warnings: footerWarnings },
      {
        label: 'Avg / Day',
        values: matrix.footer.map((f) => f.avgRevenuePerDay),
        format: 'number',
        warnings: footerWarnings,
      },
    ],
    highlightNegative: false,
  }
}

export function toMarginTable(matrix: PnlDailyMatrix): MatrixTableModel {
  // Total, Avg / Day, % Margin and Space per Kg all divide or carry totalMargin, so they inherit its
  // warnings. Total Tonase is gross weight — it never touches cost — so it stays clean. `issues` is
  // non-optional in the type, but the deploy pipeline brings backend and frontend up in parallel, so
  // a new frontend can briefly hit an old backend whose footer lacks the field — hence `?? []`.
  const footerWarnings = matrix.footer.map((f) => ({ issues: f.issues ?? [], incompleteTos: f.incompleteTos }))
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.margin : null))),
    warnings: cellWarnings(matrix),
    footerRows: [
      { label: 'Total', values: matrix.footer.map((f) => f.totalMargin), format: 'number', warnings: footerWarnings },
      {
        label: 'Avg / Day',
        values: matrix.footer.map((f) => f.avgMarginPerDay),
        format: 'number',
        warnings: footerWarnings,
      },
      {
        label: '% Margin',
        values: matrix.footer.map((f) => f.marginPct),
        format: 'percent',
        warnings: footerWarnings,
      },
      { label: 'Total Tonase', values: matrix.footer.map((f) => f.totalWeight), format: 'number' },
      {
        label: 'Space per Kg',
        values: matrix.footer.map((f) => f.spacePerKg),
        format: 'number',
        warnings: footerWarnings,
      },
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
