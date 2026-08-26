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

// The structural minimum the renderer reads. Each tab supplies a richer column type of its own —
// route columns carry their station pairs, vendor columns carry their vendor names — and the
// renderer stays ignorant of both.
export interface ComparisonColumn {
  id: string
  name: string
}

export interface ComparisonRowModel {
  // Opaque to the renderer: a date on the route axis, an `origin|dest` pair on the vendor axis.
  // It is the identity used for expand/collapse state and test ids, never for display.
  rowKey: string
  rowLabel: string
  revenue: (number | null)[] // index-aligned with columns; null = no shipment, distinct from 0
  cost: (number | null)[]
  margin: (number | null)[]
  warnings: CellWarning[]
  components: Record<CostComponentKey, (number | null)[]>
}

export interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  margin: (number | null)[]
  components: Record<CostComponentKey, (number | null)[]> | null // null = this row does not expand
  warnings: CellWarning[] | null // null = this row has no AWBs behind it
}

export interface ComparisonTableModel<TColumn extends ComparisonColumn = ComparisonColumn> {
  columns: TColumn[]
  rows: ComparisonRowModel[]
  footerRows: ComparisonFooterRowModel[]
}

export function emptyComponents(): Record<CostComponentKey, (number | null)[]> {
  return { costSmu: [], costRa: [], costSgOut: [], costSgIn: [] }
}

// An absent cell still gets a clean warning rather than being left undefined, so the renderer and
// the tests have exactly one shape to read. Matches dailyMatrix.ts's CLEAN.
export const CLEAN: CellWarning = { issues: [], incompleteTos: 0 }
