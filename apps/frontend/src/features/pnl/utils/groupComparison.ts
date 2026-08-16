import { RouteGroup } from '@/features/route-groups/types'
import { PnlGroupComparison, PnlGroupComparisonColumn } from '../hooks/usePnl'

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
  incompleteTos: number[]
  components: Record<CostComponentKey, (number | null)[]>
}

export interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  components: Record<CostComponentKey, (number | null)[]> | null // null = this row does not expand
  incompleteTos: number[] | null
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
      incompleteTos: row.cells.map((c) => (c ? c.incompleteTos : 0)),
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
      incompleteTos: data.footer.map((f) => f.incompleteTos),
    },
    {
      // No component breakdown: the average of a component is not itself a cost anyone books.
      label: 'Avg / Day',
      revenue: data.footer.map((f) => f.avgRevenuePerDay),
      cost: data.footer.map((f) => f.avgCostPerDay),
      components: null,
      incompleteTos: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}

// Routes belonging to more than one of the selected groups. The comparison columns are deliberately
// independent, so a shared route contributes to every column that holds it and the columns do not
// sum to a period total. Surfacing the overlap stops the table being read as a partition.
export function overlappingRoutes(
  groups: RouteGroup[],
): { route: string; groupNames: string[] }[] {
  const byRoute = new Map<string, string[]>()
  for (const group of groups) {
    for (const route of group.routes) {
      const label = `${route.originLabel} → ${route.dest}`
      const names = byRoute.get(label)
      if (names) names.push(group.name)
      else byRoute.set(label, [group.name])
    }
  }
  return [...byRoute.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([route, groupNames]) => ({ route, groupNames }))
}
