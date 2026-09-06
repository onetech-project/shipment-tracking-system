/**
 * Whether a period's numbers can be trusted, and why not when they cannot.
 *
 * The gate is day-level, not route-level. Every real period with a plausible margin has at least
 * 94% of its revenue on days whose cost is fully attributed; every artifact period has 15% or less
 * — while route-level coverage certifies both as "100% covered".
 */

import { SeriesDay, SlaOverview } from '../types'
import { mapSlaRoutes } from './cycle'
import { completeRevenueShare, num, UNATTRIBUTED } from './series'

export const COVERAGE_MIN = 95

const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0)

function attributedPct(rows: Array<Record<string, unknown>>, nameField: string): number {
  const total = rows.reduce((s, r) => s + num(r.totalWeight), 0)
  const known = rows
    .filter((r) => r[nameField] && r[nameField] !== UNATTRIBUTED)
    .reduce((s, r) => s + num(r.totalWeight), 0)
  return pct(known, total)
}

export interface DqInput {
  profitByRoute?: Array<{ route: string; totalRevenue: number; avgCostPerKg: number }>
  series?: SeriesDay[]
  costTotals?: { smu: number; ra: number; sgOut: number; sgIn: number }
  summary?: { totalCost: number }
  costByVendor?: Array<{ vendor: string; totalWeight: number }>
  costByRa?: Array<{ name: string; totalWeight: number }>
  sla?: SlaOverview
  dataQuality?: Array<{ issue: string; rows: number; awbs: number }>
}

export interface DqReport {
  coveragePct: number
  coverageOk: boolean
  routeCoveragePct: number
  completeDaysPct: number | null
  cleanDays: number | null
  totalDays: number | null
  routesWithoutCost: string[]
  revenueWithoutCost: number
  costSourceDelta: {
    componentSum: number
    summaryTotal: number
    delta: number
    /** null means the two sources could not be compared — NOT that they agree. */
    deltaPct: number | null
    agrees: boolean
    comparable: boolean
  }
  vendorAttributedPct: number
  raAttributedPct: number
  unmappedSlaRoutes: string[]
  backendIssues: Array<{ issue: string; rows: number; awbs: number }>
  level: 'ok' | 'warn' | 'bad'
}

export function dqReport(input: DqInput): DqReport {
  const profitByRoute = input.profitByRoute ?? []
  const totalRevenue = profitByRoute.reduce((s, r) => s + num(r.totalRevenue), 0)
  const noCost = profitByRoute.filter((r) => !r.avgCostPerKg)
  const revenueWithoutCost = noCost.reduce((s, r) => s + num(r.totalRevenue), 0)
  // Whether a route has ANY cost attributed. Kept as a secondary diagnostic — which routes have no
  // rate card — but it cannot tell a healthy period from one whose "covered" revenue landed on days
  // that never completed.
  const routeCoveragePct = pct(totalRevenue - revenueWithoutCost, totalRevenue)

  const series = input.series ?? null
  let completeDaysPct: number | null = null
  let cleanDays: number | null = null
  let totalDays: number | null = null
  if (series) {
    totalDays = series.length
    cleanDays = series.filter((d) => !d.incompleteTos).length
    completeDaysPct = completeRevenueShare(series)
  }

  // Everything below gates on this. It is the day-level measure when a series is available, and
  // falls back to the route-level number for callers that have no day-level data.
  const coveragePct = series ? completeDaysPct! : routeCoveragePct

  const ct = input.costTotals ?? { smu: 0, ra: 0, sgOut: 0, sgIn: 0 }
  const componentSum = num(ct.smu) + num(ct.ra) + num(ct.sgOut) + num(ct.sgIn)
  const summaryTotal = num(input.summary?.totalCost)
  const delta = componentSum - summaryTotal
  const comparable = summaryTotal !== 0
  const bothEmpty = componentSum === 0 && summaryTotal === 0
  const deltaPct = comparable ? Math.abs(pct(delta, summaryTotal)) : null
  const agrees = bothEmpty ? true : comparable ? deltaPct! < 1 : false

  const unmapped = mapSlaRoutes(input.sla?.summary?.otp?.breakdown).unmapped
  const vendorAttributedPct = attributedPct(input.costByVendor ?? [], 'vendor')
  const raAttributedPct = attributedPct(input.costByRa ?? [], 'name')

  const coverageOk = coveragePct >= COVERAGE_MIN
  let level: DqReport['level'] = 'ok'
  if (!coverageOk || (comparable && deltaPct! >= 5) || (!comparable && !agrees)) level = 'bad'
  else if (
    (comparable && deltaPct! >= 1) ||
    // Guarded on rows actually having been supplied: an absent breakdown is not the same as a
    // poorly-attributed one. `attributedPct([])` divides by zero and returns 0, which would
    // otherwise flag every period whose vendor/RA query simply has not loaded. Rows that ARE
    // present and thin still warn — the guard suppresses the missing case, not the real signal.
    (!!input.costByVendor?.length && vendorAttributedPct < 90) ||
    (!!input.costByRa?.length && raAttributedPct < 90) ||
    unmapped.length
  ) {
    level = 'warn'
  }

  return {
    coveragePct,
    coverageOk,
    routeCoveragePct,
    completeDaysPct,
    cleanDays,
    totalDays,
    routesWithoutCost: noCost.map((r) => r.route),
    revenueWithoutCost,
    costSourceDelta: { componentSum, summaryTotal, delta, deltaPct, agrees, comparable },
    vendorAttributedPct,
    raAttributedPct,
    unmappedSlaRoutes: unmapped,
    backendIssues: input.dataQuality ?? [],
    level,
  }
}
