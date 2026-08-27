import { PnlDailyMatrix, PnlDailyMatrixColumn, PnlRoutePair, PnlRouteFilter } from '../hooks/usePnl'
import { CellWarning, revenueWarning } from './cellWarning'

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
  // Scoped to revenue: yellow on this table means the revenue number itself is unreliable, never
  // that its cost is. Both footer rows derive from totalRevenue = SUM(revenue_total), which a
  // missing cost cannot move — only a NULL revenue_total can, by dropping out of the sum. `issues`
  // is non-optional in the type, but the deploy pipeline brings backend and frontend up in
  // parallel, so a new frontend can briefly hit an old backend whose footer lacks it — hence `?? []`.
  const footerWarnings = matrix.footer.map(
    (f) => revenueWarning({ issues: f.issues ?? [], incompleteTos: f.incompleteTos }),
  )
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.revenue : null))),
    warnings: cellWarnings(matrix).map((row) => row.map((w) => revenueWarning(w))),
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
  // Unscoped, unlike the revenue table: margin is revenue - discount - cost, so a missing cost and
  // a missing revenue each spoil it, and both halves of the warning belong here.
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

// A column the user picked that carries no shipments in this period. Its shape is identical to a
// real column with no data, so nothing downstream has to tell the two apart.
const EMPTY_FOOTER = {
  totalRevenue: 0,
  totalMargin: 0,
  totalWeight: 0,
  avgRevenuePerDay: 0,
  avgMarginPerDay: 0,
  marginPct: null,
  spacePerKg: null,
  incompleteTos: 0,
  issues: [],
}

function routeKey(pair: { origin: string; dest: string }): string {
  return `${pair.origin}|${pair.dest}`
}

/**
 * The matrix narrowed to the routes the user picked, ready to hand to toRevenueTable/toMarginTable.
 *
 * Filtering happens here rather than in the request because it is pure projection: daily-matrix
 * columns come from the whole view, not the selected period, and every footer entry is computed per
 * column independently — so no total needs recomputing and no round-trip is warranted.
 *
 * Two rules make the result honest:
 *
 * - A picked route the matrix has no column for still becomes a column, filled with nulls. The
 *   route list comes from the DC-pair master, which offers more pairs than have ever shipped; a
 *   dropped column reads as a broken filter, while an all-em-dash one reads as the real answer.
 * - Column order stays the matrix's own, never the pick order. groupOrigins builds the header's
 *   colSpans from CONSECUTIVE same-origin columns, so reordering by clicks would fracture them.
 *   An empty column is inserted after the last column sharing its origin for the same reason.
 */
export function selectMatrixColumns(matrix: PnlDailyMatrix, routes: PnlRoutePair[]): PnlDailyMatrix {
  if (routes.length === 0) return matrix

  const picked = new Set(routes.map(routeKey))
  // Indices into the source matrix, in source order; -1 marks a picked route with no column.
  const keptIndices = matrix.columns.flatMap((c, i) => (picked.has(routeKey(c)) ? [i] : []))

  const columns: PnlDailyMatrixColumn[] = keptIndices.map((i) => matrix.columns[i])
  // -1 for a synthetic column, so cells and footer below read from the same single list.
  const sources: number[] = [...keptIndices]

  for (const route of routes) {
    if (matrix.columns.some((c) => routeKey(c) === routeKey(route))) continue
    const column: PnlDailyMatrixColumn = {
      origin: route.origin,
      // The matrix is the only place holding the display label, so an origin it has never carried
      // falls back to its raw value — the same rule originLabel() applies on the backend.
      originLabel:
        matrix.columns.find((c) => c.origin === route.origin)?.originLabel ?? route.origin,
      dest: route.dest,
    }
    const lastOfOrigin = columns.map((c) => c.origin).lastIndexOf(route.origin)
    const at = lastOfOrigin === -1 ? columns.length : lastOfOrigin + 1
    columns.splice(at, 0, column)
    sources.splice(at, 0, -1)
  }

  return {
    columns,
    rows: matrix.rows.map((row) => ({
      date: row.date,
      cells: sources.map((i) => (i === -1 ? null : row.cells[i])),
    })),
    footer: sources.map((i) => (i === -1 ? { ...EMPTY_FOOTER } : matrix.footer[i])),
    periodDays: matrix.periodDays,
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
