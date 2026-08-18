import { PnlGroupComparison, PnlGroupComparisonColumn, PnlRouteFilter } from '../hooks/usePnl'
import { displayRouteLabel } from './routeLabels'
import { CellWarning } from './cellWarning'

export type CostComponentKey = 'costSmu' | 'costRa' | 'costSgOut' | 'costSgIn'

// Order and labels are fixed here so the expanded rows read the same everywhere. These four sum
// exactly to the cost cell above them — the backend's FILTER clauses guarantee it.
export const COST_COMPONENTS: { key: CostComponentKey; label: string }[] = [
  { key: 'costSmu', label: 'SMU' },
  { key: 'costRa', label: 'RA' },
  { key: 'costSgOut', label: 'SG Out' },
  { key: 'costSgIn', label: 'SG In' },
]

export interface ComparisonRowModel {
  date: string
  revenue: (number | null)[] // index-aligned with columns; null = no shipment, distinct from 0
  cost: (number | null)[]
  warnings: CellWarning[]
  components: Record<CostComponentKey, (number | null)[]>
}

export interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  components: Record<CostComponentKey, (number | null)[]> | null // null = this row does not expand
  warnings: CellWarning[] | null // null = this row has no AWBs behind it
}

export interface ComparisonTableModel {
  columns: PnlGroupComparisonColumn[]
  rows: ComparisonRowModel[]
  footerRows: ComparisonFooterRowModel[]
}

function emptyComponents(): Record<CostComponentKey, (number | null)[]> {
  return { costSmu: [], costRa: [], costSgOut: [], costSgIn: [] }
}

export function toComparisonTable(data: PnlGroupComparison): ComparisonTableModel {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      date: row.date,
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      warnings: row.cells.map((c) =>
        c ? { issues: c.issues, incompleteTos: c.incompleteTos } : { issues: [], incompleteTos: 0 },
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
      components: totalComponents,
      warnings: data.footer.map((f) => ({ issues: f.issues, incompleteTos: f.incompleteTos })),
    },
    {
      // No component breakdown: the average of a component is not itself a cost anyone books.
      label: 'Avg / Day',
      revenue: data.footer.map((f) => f.avgRevenuePerDay),
      cost: data.footer.map((f) => f.avgCostPerDay),
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
  columns: PnlGroupComparisonColumn[],
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
  column: PnlGroupComparisonColumn,
  date: string,
): PnlRouteFilter {
  return {
    routes: column.routes.map((r) => ({ origin: r.origin, dest: r.dest })),
    dateFrom: date,
    dateTo: date,
  }
}
