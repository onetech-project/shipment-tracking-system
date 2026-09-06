/**
 * Per-route views of the same daily series: who contributes the margin, how concentrated that is,
 * and how steady each route's margin per kg runs day to day.
 */

import { AnalyticsDailySeries } from '../types'
import { routeLabel, splitRouteKey } from './cycle'
import { div, foldByRoute, kpis, num, routeKeysIn } from './series'

export interface RouteContributionRow {
  routeKey: string
  label: string
  revenue: number
  cost: number
  margin: number
  marginPct: number
  weight: number
  incompleteTos: number
  /** false when the route's days carry incomplete cost, or it has no cost-bearing day at all. */
  costComplete: boolean
  sharePct: number
}

export function routeContribution(
  series: AnalyticsDailySeries | undefined,
  keys?: string[],
): RouteContributionRow[] {
  const routeKeys = keys?.length ? keys : routeKeysIn(series)
  const rows = routeKeys.map((key) => {
    const days = foldByRoute(series, [key])
    const k = kpis(days)
    const { origin, dest } = splitRouteKey(key)
    const incompleteTos = days.reduce((s, d) => s + num(d.incompleteTos), 0)
    const daysWithCost = days.filter((d) => d.cost > 0).length
    // A route whose days carry incomplete cost — or that has no cost-bearing day at all — cannot
    // be trusted as a margin figure. Flagged here rather than silently dropped, so the table still
    // shows every route and `concentration` can choose to exclude it.
    const costComplete = incompleteTos === 0 && daysWithCost > 0
    return {
      routeKey: key,
      label: routeLabel(origin, dest),
      revenue: k.revenue,
      cost: k.cost,
      margin: k.margin,
      marginPct: k.marginPct,
      weight: k.weight,
      incompleteTos,
      costComplete,
    }
  })

  const totalMargin = rows.reduce((s, r) => s + r.margin, 0)
  return rows
    .map((r) => ({ ...r, sharePct: div(r.margin, totalMargin) * 100 }))
    .sort((a, b) => b.margin - a.margin)
}

export interface Concentration {
  top1Pct: number
  top3Pct: number
  hhi: number
  routesCounted: number
  routesExcluded: number
}

/**
 * How much of the margin rests on how few routes? HHI on absolute margin share; above ~0.25 the
 * portfolio is concentrated. Rows flagged `costComplete: false` — a bulk backfill with no
 * attributed cost, reading as a false 100% margin — are excluded so a data artifact never
 * masquerades as a concentration risk. `routesExcluded` says how many, so the caller can show it.
 *
 * The share is on ABSOLUTE margin: a route losing money is exposure too, and signing it as
 * negative would let it cancel out a profitable one.
 */
export function concentration(contribution: RouteContributionRow[] | undefined): Concentration {
  const all = contribution ?? []
  const rows = all
    .filter((r) => r.costComplete !== false)
    .slice()
    .sort((a, b) => Math.abs(num(b.margin)) - Math.abs(num(a.margin)))
  const total = rows.reduce((s, r) => s + Math.abs(num(r.margin)), 0)
  const share = (r: RouteContributionRow) => div(Math.abs(num(r.margin)), total)
  return {
    top1Pct: rows.length ? share(rows[0]) * 100 : 0,
    top3Pct: rows.slice(0, 3).reduce((s, r) => s + share(r), 0) * 100,
    hhi: rows.reduce((s, r) => s + share(r) * share(r), 0),
    routesCounted: rows.length,
    routesExcluded: all.length - rows.length,
  }
}

export interface MarginStability {
  cv: number
  days: number
  mean: number
}

/**
 * Coefficient of variation of daily margin per kg — lower is steadier. Days with incomplete cost
 * are excluded, and below five usable days the number means nothing, so it returns null rather
 * than a figure someone would read as stability.
 */
export function marginStability(
  series: AnalyticsDailySeries | undefined,
  key: string,
): MarginStability | null {
  const days = foldByRoute(series, [key]).filter(
    (d) => d.weight > 0 && d.cost > 0 && !d.incompleteTos,
  )
  if (days.length < 5) return null
  const vals = days.map((d) => div(d.margin, d.weight))
  const mean = div(
    vals.reduce((s, v) => s + v, 0),
    vals.length,
  )
  if (!mean) return null
  const variance = div(
    vals.reduce((s, v) => s + (v - mean) * (v - mean), 0),
    vals.length,
  )
  return { cv: Math.sqrt(variance) / Math.abs(mean), days: vals.length, mean }
}
