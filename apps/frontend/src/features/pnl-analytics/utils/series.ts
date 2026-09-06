/**
 * Folding the per-(date × route) response into a daily series, and the KPIs derived from it.
 *
 * The response is per-route on purpose: the Routes & Groups section needs a daily series for every
 * route, and changing the scope selector must not cost a request. Everything below is a fold over
 * the same rows.
 */

import {
  AnalyticsDailySeries,
  KPI_KEYS,
  KpiDelta,
  KpiSet,
  Kpis,
  SeriesDay,
} from '../types'
import { routeKey } from './cycle'

export const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)
export const div = (a: number, b: number): number => (b ? a / b : 0)

/** The API's marker for "not attributed" — an em dash, not an empty string. */
export const UNATTRIBUTED = '—'

export const COST_COMPONENTS = [
  { key: 'smu', field: 'costSmu', label: 'SMU' },
  { key: 'ra', field: 'costRa', label: 'RA' },
  { key: 'sgOut', field: 'costSgOut', label: 'SG Outgoing' },
  { key: 'sgIn', field: 'costSgIn', label: 'Incoming (SG In)' },
] as const

function emptyDay(date: string): SeriesDay {
  return {
    date,
    revenue: 0,
    costSmu: 0,
    costRa: 0,
    costSgOut: 0,
    costSgIn: 0,
    incompleteTos: 0,
    cost: 0,
    margin: 0,
    weight: 0,
  }
}

/**
 * Folds the response into one day per calendar date. `keys` narrows to those route keys; null
 * folds every route. Days with no rows are still emitted at zero — the period's "per day" figures
 * divide by the calendar length, not by the number of days that happened to ship.
 */
export function foldByRoute(
  series: AnalyticsDailySeries | undefined,
  keys: string[] | null,
): SeriesDay[] {
  const dates = series?.dates ?? []
  const byDate = new Map(dates.map((d) => [d, emptyDay(d)]))
  const wanted = keys ? new Set(keys) : null

  for (const r of series?.rows ?? []) {
    if (wanted && !wanted.has(routeKey(r.origin, r.dest))) continue
    const day = byDate.get(r.date)
    // A row on a date the calendar does not list cannot be placed. It should not happen — the
    // backend derives both from the same filter — so it is dropped rather than invented into the
    // series, where it would show up as an unexplained extra day.
    if (!day) continue
    day.revenue += num(r.revenue)
    day.costSmu += num(r.costSmu)
    day.costRa += num(r.costRa)
    day.costSgOut += num(r.costSgOut)
    day.costSgIn += num(r.costSgIn)
    day.incompleteTos += num(r.incompleteTos)
    day.weight += num(r.weight)
  }

  return dates.map((d) => {
    const day = byDate.get(d)!
    // Cost is ALWAYS the component sum. The summary endpoint's totalCost disagrees with it and is
    // shown only in Data Health, as a diagnostic.
    day.cost = day.costSmu + day.costRa + day.costSgOut + day.costSgIn
    day.margin = day.revenue - day.cost
    return day
  })
}

export function foldAll(series: AnalyticsDailySeries | undefined): SeriesDay[] {
  return foldByRoute(series, null)
}

export function routeKeysIn(series: AnalyticsDailySeries | undefined): string[] {
  const keys = new Set<string>()
  for (const r of series?.rows ?? []) keys.add(routeKey(r.origin, r.dest))
  return Array.from(keys)
}

export function sliceSeries(days: SeriesDay[], start?: string, end?: string): SeriesDay[] {
  return days.filter((d) => (!start || d.date >= start) && (!end || d.date <= end))
}

export function kpis(days: SeriesDay[]): Kpis {
  const count = days.length
  const sum = (f: (d: SeriesDay) => number) => days.reduce((s, d) => s + num(f(d)), 0)
  const weight = sum((d) => d.weight)
  const revenue = sum((d) => d.revenue)
  const cost = sum((d) => d.cost)
  const margin = revenue - cost
  return {
    days: count,
    weight,
    weightPerDay: div(weight, count),
    revenue,
    revenuePerDay: div(revenue, count),
    revenuePerKg: div(revenue, weight),
    cost,
    costPerDay: div(cost, count),
    costPerKg: div(cost, weight),
    margin,
    marginPerDay: div(margin, count),
    marginPerKg: div(margin, weight),
    marginPct: div(margin, revenue) * 100,
  }
}

/**
 * `deltaPct` is null — never 0 — when there is no usable baseline. A zero baseline gives no
 * percentage change, and rendering that as 0% would claim the figure held steady.
 */
export function withDelta(value: number, prev: number | null): KpiDelta {
  const usable = typeof prev === 'number' && isFinite(prev) && prev !== 0
  return { value, prev: prev ?? null, deltaPct: usable ? ((value - prev!) / prev!) * 100 : null }
}

export function kpisWithDelta(curr: Kpis, prev: Kpis | null): KpiSet {
  const out = {} as KpiSet
  for (const k of KPI_KEYS) out[k] = withDelta(num(curr[k]), prev ? num(prev[k]) : null)
  return out
}

/**
 * Share of revenue falling on days whose cost is fully attributed. This is the measure the tab
 * gates on: whether a route has any cost at all cannot tell a real margin from an artifact.
 */
export function completeRevenueShare(days: SeriesDay[]): number {
  const total = days.reduce((s, d) => s + num(d.revenue), 0)
  const clean = days.filter((d) => !d.incompleteTos).reduce((s, d) => s + num(d.revenue), 0)
  return div(clean, total) * 100
}

export interface Outlier {
  date: string
  weight: number
  median: number
  ratio: number
  sharePct: number
}

/**
 * A single day holding a large share of a period's tonnage is almost always a bulk backfill rather
 * than a real shipping day. Named here so the health panel can report the cause, not the symptom.
 * The comparison is against the MEDIAN: one huge day drags a mean above every normal day, hiding
 * itself.
 */
export function dailyOutliers(days: SeriesDay[], opts?: { factor?: number }): Outlier[] {
  const factor = opts?.factor ?? 5
  const rows = days.filter((d) => num(d.weight) > 0)
  if (rows.length < 4) return []
  const sorted = rows.map((d) => num(d.weight)).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  if (!median) return []
  const total = rows.reduce((s, d) => s + num(d.weight), 0)
  return rows
    .filter((d) => num(d.weight) > median * factor)
    .map((d) => ({
      date: d.date,
      weight: num(d.weight),
      median,
      ratio: div(num(d.weight), median),
      sharePct: div(num(d.weight), total) * 100,
    }))
    .sort((a, b) => b.weight - a.weight)
}

export interface CostComponentShare {
  key: string
  label: string
  value: number
  pct: number
  perKg: number
}

export interface CostComposition {
  total: number
  totalPerKg: number
  components: CostComponentShare[]
}

export function costComposition(days: SeriesDay[]): CostComposition {
  const weight = days.reduce((s, d) => s + num(d.weight), 0)
  const values = COST_COMPONENTS.map((c) => ({
    key: c.key as string,
    label: c.label as string,
    value: days.reduce((s, d) => s + num(d[c.field] as number), 0),
  }))
  const total = values.reduce((s, v) => s + v.value, 0)
  return {
    total,
    totalPerKg: div(total, weight),
    components: values.map((v) => ({
      key: v.key,
      label: v.label,
      value: v.value,
      pct: div(v.value, total) * 100,
      perKg: div(v.value, weight),
    })),
  }
}
