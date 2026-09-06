/**
 * The operational side: SLA on-time performance mapped onto P&L route keys, and offloaded AWBs
 * joined to the routes they were flying.
 */

import { SlaOverview } from '../types'
import { mapSlaRoutes, routeKey, routeLabel, splitRouteKey } from './cycle'
import { div, num } from './series'

/** The SLA API's alert keys, in English to match the rest of the P&L page. */
export const ALERT_LABELS: Record<string, string> = {
  reservasiPenerbangan: 'Flight not reserved',
  reservasiKapal: 'Vessel not reserved',
  flightTracking: 'Flight tracking issue',
  potensiMelebihiSla: 'At risk of missing SLA',
  melewatiSla: 'Past SLA',
  potensiMelebihiTjph: 'At risk of missing TJPH',
  melewatiTjph: 'Past TJPH',
  spxSlaAlert: 'SLA alert (SPX)',
  spxTjphAlert: 'TJPH alert (SPX)',
}

export interface SlaRouteRow {
  routeKey: string
  label: string
  otpPct: number
  onTimeWeight: number
  lateWeight: number
}

export interface SlaView {
  otpPct: number
  onTimeWeight: number
  lateWeight: number
  byRoute: SlaRouteRow[]
  noDataRoutes: Array<{ routeKey: string; label: string }>
  alerts: Array<{ type: string; label: string; routes: number; tonnage: number }>
  unmapped: string[]
  scoped: boolean
}

export function slaView(sla: SlaOverview | undefined, routeKeys?: string[]): SlaView {
  const summary = sla?.summary ?? { alerts: {} }
  const otp = summary.otp ?? { percentage: 0, onTimeWeight: 0, lateWeight: 0, breakdown: [] }
  const mapping = mapSlaRoutes(otp.breakdown ?? [])

  const wanted = routeKeys?.length ? new Set(routeKeys) : null
  const byRoute: SlaRouteRow[] = []
  const noDataRoutes: SlaView['noDataRoutes'] = []
  for (const [key, row] of mapping.mapped) {
    if (wanted && !wanted.has(key)) continue
    const { origin, dest } = splitRouteKey(key)
    const label = routeLabel(origin, dest)
    const onTimeWeight = num(row.onTimeWeight)
    const lateWeight = num(row.lateWeight)
    // A route with zero on-time AND zero late weight has no measurement to rank: its 0.0% is an
    // upstream 0/0 artifact, not a real failure. Reported separately so the data-health panel can
    // name it, rather than letting it pose as the worst performer at the top of a worst-first table.
    if (onTimeWeight + lateWeight <= 0) {
      noDataRoutes.push({ routeKey: key, label })
      continue
    }
    byRoute.push({ routeKey: key, label, otpPct: num(row.percentage), onTimeWeight, lateWeight })
  }
  // Worst-first, deliberately: this table's purpose is to surface the routes that are failing.
  byRoute.sort((a, b) => a.otpPct - b.otpPct)

  // Unscoped, trust the API's own headline. Scoped, recompute from the ranked (measured) member
  // weights only, so a zero-weight route can never drag a scoped OTP toward zero.
  let onTimeWeight = num(otp.onTimeWeight)
  let lateWeight = num(otp.lateWeight)
  let otpPct = num(otp.percentage)
  if (wanted) {
    onTimeWeight = byRoute.reduce((s, r) => s + r.onTimeWeight, 0)
    lateWeight = byRoute.reduce((s, r) => s + r.lateWeight, 0)
    otpPct = div(onTimeWeight, onTimeWeight + lateWeight) * 100
  }

  const alerts = Object.entries(summary.alerts ?? {})
    .map(([type, a]) => ({
      type,
      label: ALERT_LABELS[type] ?? type,
      routes: num(a?.routes),
      tonnage: num(a?.tonnage),
    }))
    .filter((a) => a.tonnage > 0 || a.routes > 0)
    .sort((a, b) => b.tonnage - a.tonnage)

  return {
    otpPct,
    onTimeWeight,
    lateWeight,
    byRoute,
    noDataRoutes,
    alerts,
    unmapped: mapping.unmapped,
    scoped: !!wanted,
  }
}

export interface OffloadView {
  count: number
  byAirline: Array<{ name: string; count: number }>
  byRoute: Array<{ routeKey: string; label: string; count: number }>
  joinRatePct: number
}

/**
 * Offload rows carry only an AWB number, so the route comes from joining to the per-AWB data. The
 * join rate is reported because AWB formats differ between the two sources — a low rate means the
 * route breakdown below it is only a slice, not the whole picture.
 */
export function offloadView(
  offloaded: Array<{ awb: string; airline: string | null }> | undefined,
  awbs: Array<{ awb: string; origin: string | null; dest: string | null }> | undefined,
): OffloadView {
  const rows = offloaded ?? []
  const routeOf = new Map(
    (awbs ?? [])
      .filter((a) => a.origin && a.dest)
      .map((a) => [a.awb, routeKey(a.origin as string, a.dest as string)]),
  )
  const airlineAcc = new Map<string, number>()
  const routeAcc = new Map<string, number>()
  let joined = 0
  for (const r of rows) {
    const airline = r.airline ?? '—'
    airlineAcc.set(airline, (airlineAcc.get(airline) ?? 0) + 1)
    const rk = routeOf.get(r.awb)
    if (rk) {
      joined += 1
      routeAcc.set(rk, (routeAcc.get(rk) ?? 0) + 1)
    }
  }

  return {
    count: rows.length,
    byAirline: Array.from(airlineAcc.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byRoute: Array.from(routeAcc.entries())
      .map(([key, count]) => {
        const { origin, dest } = splitRouteKey(key)
        return { routeKey: key, label: routeLabel(origin, dest), count }
      })
      .sort((a, b) => b.count - a.count),
    joinRatePct: div(joined, rows.length) * 100,
  }
}
