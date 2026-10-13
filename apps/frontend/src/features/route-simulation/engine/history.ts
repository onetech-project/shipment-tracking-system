import { UNBOOKED_LABEL } from './constants'
import { histDays, histPeriodsOf, routeKey, routeOf } from './state'
import { resolveScope } from './scope'
import { Scope, SimRoute, SimState, SimulationHistoryRow, SimulationSource } from '../types'

export interface Sum {
  weight: number
  revenue: number
  cost: number
  margin: number
}

export interface HistFilter {
  periods: string[]
  vendors: Set<string> // raw vendor names, plus UNBOOKED_LABEL for vendor === null
}

export const vendorLabel = (h: Pick<SimulationHistoryRow, 'vendor'>) => h.vendor ?? UNBOOKED_LABEL

// Historical PnL is all-in by definition — it reports what the period actually cost — so it reads
// costAll, never the lane-cost components that price lanes.
export function sumRow(rows: { weight: number; revenue: number; cost?: number; costAll?: number }[]): Sum {
  const o = { weight: 0, revenue: 0, cost: 0, margin: 0 }
  for (const r of rows) {
    o.weight += r.weight
    o.revenue += r.revenue
    o.cost += r.cost ?? r.costAll ?? 0
  }
  o.margin = o.revenue - o.cost
  return o
}

function filtered(source: SimulationSource, filter: HistFilter, routes: SimRoute[]) {
  const periods = new Set(filter.periods)
  const keys = new Set(routes.map((r) => r.key))
  return source.history.filter((h) => periods.has(h.cycle) && filter.vendors.has(vendorLabel(h)) && keys.has(routeKey(h)))
}

export function consolidateHistory(source: SimulationSource, s: SimState, filter: HistFilter & { scope: Scope }) {
  const { sections, union, dupes } = resolveScope(source, s, filter.scope)
  const hist = filtered(source, filter, union)
  const byRoute: Record<string, SimulationHistoryRow[]> = {}
  for (const h of hist) (byRoute[routeKey(h)] ??= []).push(h)
  const groups = sections
    .map((sec) => {
      const rows = sec.routes.filter((r) => byRoute[r.key]).map((r) => ({ route: r, dupe: dupes.has(r.key), ...sumRow(byRoute[r.key]) }))
      return { id: sec.id, name: sec.name, kind: sec.kind, rows, subtotal: sumRow(rows) }
    })
    .filter((g) => g.rows.length)
  return { groups, grand: sumRow(hist), numPeriods: filter.periods.length, dupes: [...dupes].filter((k) => byRoute[k]).length }
}

export function historyDetailByPeriod(source: SimulationSource, s: SimState, filter: HistFilter & { scope: Scope }) {
  const { union } = resolveScope(source, s, filter.scope)
  const hist = filtered(source, filter, union)
  return filter.periods
    .map((cycle) => {
      const inCycle = hist.filter((h) => h.cycle === cycle)
      const rows = union
        .map((r) => ({ route: r, items: inCycle.filter((h) => routeKey(h) === r.key) }))
        .filter((x) => x.items.length)
        .map((x) => ({ route: x.route, ...sumRow(x.items) }))
      return { cycle, rows, subtotal: sumRow(rows) }
    })
    .filter((p) => p.rows.length)
}

export interface ActualRow extends Sum {
  vendor: string // raw vendor, or UNBOOKED_LABEL
  route: SimRoute
  airline: string
  kgDay: number
  costDay: number
  marginDay: number
  marginKg: number
}

export function actualDistribution(source: SimulationSource, s: SimState): ActualRow[] {
  const set = new Set(histPeriodsOf(s))
  const days = histDays(s)
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  const map: Record<string, { vendor: string; route: SimRoute; airline: string; weight: number; revenue: number; cost: number }> = {}
  for (const h of source.history) {
    const route = routeOf(s, routeKey(h))
    if (!set.has(h.cycle) || !route) continue
    const vendor = vendorLabel(h)
    const airline = h.airline ?? '—'
    const id = [vendor, route.key, airline].join('~')
    const o = (map[id] ??= { vendor, route, airline, weight: 0, revenue: 0, cost: 0 })
    o.weight += h.weight
    o.revenue += h.revenue
    o.cost += h.costAll
  }
  return Object.values(map)
    .map((o) => {
      const margin = o.revenue - o.cost
      return { ...o, margin, kgDay: o.weight / days, costDay: o.cost / days, marginDay: margin / days, marginKg: o.weight > 0 ? margin / o.weight : 0 }
    })
    .sort((a, b) => routeIdx(a.route.key) - routeIdx(b.route.key) || a.vendor.localeCompare(b.vendor) || a.airline.localeCompare(b.airline))
}
