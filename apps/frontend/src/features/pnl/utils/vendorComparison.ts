import {
  PnlRouteFilter,
  PnlVendorComparison,
  PnlVendorComparisonColumn,
} from '../hooks/usePnl'
import { displayRouteLabel } from './routeLabels'
import { PeriodBounds } from './periodBounds'
import {
  CLEAN,
  COST_COMPONENTS,
  ComparisonFooterRowModel,
  ComparisonRowModel,
  ComparisonTableModel,
  emptyComponents,
} from './comparison'

// The row identity on the vendor axis. Station names are guaranteed free of '|', so this is
// reversible by splitting at the first separator — which is what a clicked cell does.
export function vendorRowKey(row: { origin: string; dest: string }): string {
  return `${row.origin}|${row.dest}`
}

export function toVendorComparisonTable(
  data: PnlVendorComparison,
): ComparisonTableModel<PnlVendorComparisonColumn> {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      rowKey: vendorRowKey(row),
      // Formatted here, not in the renderer: the renderer serves both the date axis and this one
      // and must not know which it is drawing.
      rowLabel: displayRouteLabel(row),
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      // `issues` and `margin` are non-optional in the type, but frontend and backend roll out in
      // parallel, so a new frontend can briefly hit an old backend whose cells lack the field. A
      // missing margin renders as an em dash, never NaN.
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
      warnings: data.footer.map((f) => ({
        issues: f.issues ?? [],
        incompleteTos: f.incompleteTos,
      })),
    },
    {
      // Divided by routes that have a cell, not by every route the view knows — the backend sends
      // that divisor as routesWithData, and the view names it under the table because it differs
      // per column. No component breakdown: the average of a component is not a cost anyone books.
      label: 'Avg / Route',
      revenue: data.footer.map((f) => f.avgRevenuePerRoute ?? null),
      cost: data.footer.map((f) => f.avgCostPerRoute ?? null),
      margin: data.footer.map((f) => f.avgMarginPerRoute ?? null),
      components: null,
      warnings: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}

// Vendors belonging to more than one of the selected columns. Each TO carries at most one vendor,
// so two columns can only double-count when they share a vendor — and then they genuinely do, in
// both columns. Surfacing it stops the table being read as a partition. Computed from the response
// columns rather than the saved groups, so a bare vendor pick that duplicates a group member is
// caught by the same code.
export function overlappingVendors(
  columns: PnlVendorComparisonColumn[],
): { vendor: string; columnNames: string[] }[] {
  const byVendor = new Map<string, string[]>()
  for (const column of columns) {
    for (const vendor of column.vendors) {
      const names = byVendor.get(vendor)
      if (names) names.push(column.name)
      else byVendor.set(vendor, [column.name])
    }
  }
  return [...byVendor.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([vendor, columnNames]) => ({ vendor, columnNames }))
}

// A clicked vendor comparison cell as an AWB drilldown filter. The cell covers the whole period, so
// the dates come from the period bounds rather than from the row — the row is a route, not a day.
export function routeFromVendorComparisonCell(
  column: PnlVendorComparisonColumn,
  rowKey: string,
  bounds: PeriodBounds,
): PnlRouteFilter {
  // First separator only. Station names contain spaces but never '|', so this is exact; splitting
  // on every '|' would break the moment a name ever did.
  const separator = rowKey.indexOf('|')
  const origin = separator === -1 ? rowKey : rowKey.slice(0, separator)
  const dest = separator === -1 ? '' : rowKey.slice(separator + 1)
  return {
    routes: [{ origin, dest }],
    vendors: column.vendors,
    ...(bounds.min ? { dateFrom: bounds.min } : {}),
    ...(bounds.max ? { dateTo: bounds.max } : {}),
  }
}
