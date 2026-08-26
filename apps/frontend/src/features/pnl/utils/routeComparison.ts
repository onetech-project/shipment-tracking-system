import { PnlRouteComparison, PnlRouteComparisonColumn, PnlRouteFilter } from '../hooks/usePnl'
import { displayRouteLabel } from './routeLabels'
import { formatDayLabel } from './dailyMatrix'
import {
  CLEAN,
  COST_COMPONENTS,
  ComparisonFooterRowModel,
  ComparisonRowModel,
  ComparisonTableModel,
  emptyComponents,
} from './comparison'

export function toRouteComparisonTable(
  data: PnlRouteComparison,
): ComparisonTableModel<PnlRouteComparisonColumn> {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      rowKey: row.date,
      // Formatted here, not in the renderer: the renderer serves two axes and must not know that
      // this one holds dates.
      rowLabel: formatDayLabel(row.date),
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      // `issues` and `margin` are non-optional in the type, but the deploy pipeline brings backend
      // and frontend up in parallel, so a new frontend can briefly hit an old backend whose cells
      // lack the field. A missing margin renders as an em dash, never NaN.
      margin: row.cells.map((c) => (c ? (c.margin ?? null) : null)),
      warnings: row.cells.map((c) =>
        c ? { issues: c.issues ?? [], incompleteTos: c.incompleteTos } : CLEAN,
      ),
      components,
    }
  })

  const totalComponents = emptyComponents()
  totalComponents.costSmu = data.footer.map((f) => f.totalCostSmu)
  totalComponents.costRa = data.footer.map((f) => f.totalCostRa)
  totalComponents.costSgOut = data.footer.map((f) => f.totalCostSgOut)
  totalComponents.costSgIn = data.footer.map((f) => f.totalCostSgIn)

  const footerRows: ComparisonFooterRowModel[] = [
    {
      label: 'Total',
      revenue: data.footer.map((f) => f.totalRevenue),
      cost: data.footer.map((f) => f.totalCost),
      margin: data.footer.map((f) => f.totalMargin ?? null),
      components: totalComponents,
      warnings: data.footer.map((f) => ({ issues: f.issues ?? [], incompleteTos: f.incompleteTos })),
    },
    {
      // No component breakdown: the average of a component is not itself a cost anyone books.
      label: 'Avg / Day',
      revenue: data.footer.map((f) => f.avgRevenuePerDay),
      cost: data.footer.map((f) => f.avgCostPerDay),
      margin: data.footer.map((f) => f.avgMarginPerDay ?? null),
      components: null,
      warnings: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}

// Routes belonging to more than one of the selected columns. The comparison columns are
// deliberately independent, so a shared route contributes to every column that holds it and the
// columns do not sum to a period total. Surfacing the overlap stops the table being read as a
// partition. Computed from the response columns rather than the saved groups, so a bare route that
// duplicates a group member is caught by the same code.
export function overlappingRoutes(
  columns: PnlRouteComparisonColumn[],
): { route: string; groupNames: string[] }[] {
  const byRoute = new Map<string, string[]>()
  for (const column of columns) {
    for (const route of column.routes) {
      const label = displayRouteLabel(route)
      const names = byRoute.get(label)
      if (names) names.push(column.name)
      else byRoute.set(label, [column.name])
    }
  }
  return [...byRoute.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([route, groupNames]) => ({ route, groupNames }))
}

// A clicked comparison cell as an AWB drilldown filter. A group column carries every route it
// aggregates, so the drilldown answers exactly the question the cell did — for that one day.
export function routeFromComparisonCell(
  column: PnlRouteComparisonColumn,
  date: string,
): PnlRouteFilter {
  return {
    routes: column.routes.map((r) => ({ origin: r.origin, dest: r.dest })),
    dateFrom: date,
    dateTo: date,
  }
}
