/**
 * Which vendor × airline combination earns most per kg on a route, and what moving the rest of the
 * route's tonnage onto it would be worth.
 */

import { AnalyticsJourneyRow } from '../types'
import { routeKey, routeLabel } from './cycle'
import { div, num } from './series'

export interface BestRouteRow {
  routeKey: string
  label: string
  best: AnalyticsJourneyRow
  tonnageOnBest: number
  attributedTonnage: number
  actualMarginPerKg: number
  optimalPct: number
  upside: number
  /** false means no combination carried the minimum share, so `best` came from the whole set. */
  floorCleared: boolean
}

export interface BestCombinationResult {
  byRoute: BestRouteRow[]
  overall: { attributedTonnage: number; optimalPct: number; upside: number }
}

export function bestCombination(
  journey: AnalyticsJourneyRow[] | undefined,
  opts?: { minSharePct?: number },
): BestCombinationResult {
  const minSharePct = opts?.minSharePct ?? 5

  const byRouteMap = new Map<string, AnalyticsJourneyRow[]>()
  for (const r of journey ?? []) {
    const key = routeKey(r.origin, r.dest)
    const list = byRouteMap.get(key) ?? []
    list.push(r)
    byRouteMap.set(key, list)
  }

  const byRoute: BestRouteRow[] = []
  for (const [key, rows] of byRouteMap) {
    const attributedTonnage = rows.reduce((s, r) => s + num(r.gw), 0)
    const totalMargin = rows.reduce((s, r) => s + num(r.margin), 0)
    const actualMarginPerKg = div(totalMargin, attributedTonnage)

    // A combination must carry a real share of the route before it can set the benchmark: a single
    // lucky AWB at 1% of the tonnage is not a rate anyone can repeat.
    const eligible = rows.filter((r) => div(num(r.gw), attributedTonnage) * 100 >= minSharePct)
    // When nothing clears the floor, the unfiltered set beats having no benchmark at all — but the
    // caller must be able to tell the floor did not actually hold.
    const floorCleared = eligible.length > 0
    const pool = eligible.length ? eligible : rows
    const best = pool.slice().sort((a, b) => num(b.marginPerKg) - num(a.marginPerKg))[0]

    const tonnageOnBest = rows
      .filter((r) => r.vendor === best.vendor && r.airline === best.airline)
      .reduce((s, r) => s + num(r.gw), 0)
    // Clamped at zero: when the best combination already carries everything, or its rate is below
    // the route average because the floor forced a fallback, there is no upside to claim.
    const upside = Math.max(
      0,
      (attributedTonnage - tonnageOnBest) * (num(best.marginPerKg) - actualMarginPerKg),
    )

    byRoute.push({
      routeKey: key,
      label: routeLabel(best.origin, best.dest),
      best,
      tonnageOnBest,
      attributedTonnage,
      actualMarginPerKg,
      optimalPct: div(tonnageOnBest, attributedTonnage) * 100,
      upside,
      floorCleared,
    })
  }
  byRoute.sort((a, b) => b.upside - a.upside)

  const attributedTonnage = byRoute.reduce((s, r) => s + r.attributedTonnage, 0)
  const onBest = byRoute.reduce((s, r) => s + r.tonnageOnBest, 0)
  return {
    byRoute,
    overall: {
      attributedTonnage,
      optimalPct: div(onBest, attributedTonnage) * 100,
      upside: byRoute.reduce((s, r) => s + r.upside, 0),
    },
  }
}
