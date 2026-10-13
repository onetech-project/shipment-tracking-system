import { DAYS_PER_MONTH, DAYS_PER_PERIOD, ESP_CASHBACK } from './constants'
import { accountOf, histPeriodsOf, routeKey, routeOf } from './state'
import { Account, Lane, SimRoute, SimState, SimulationSource, Tranche } from '../types'

export function trancheCofPerDay(t: Pick<Tranche, 'amount' | 'cofType' | 'cofValue' | 'cofUnit'>): number {
  const daysPerUnit = t.cofUnit === 'day' ? 1 : DAYS_PER_MONTH
  const value = Number(t.cofValue) || 0
  const base = t.cofType === 'percent' ? ((Number(t.amount) || 0) * value) / 100 : value
  return base / daysPerUnit
}

// Average route kg per day over the history range — every TO, booked or not, because unbooked
// weight is still freight the route has to move.
export function routeHistTon(source: SimulationSource, s: Pick<SimState, 'histStart' | 'histEnd'>, key: string): number {
  const periods = new Set(histPeriodsOf(s))
  if (!periods.size) return 0
  let weight = 0
  for (const h of source.history) {
    if (routeKey(h) === key && periods.has(h.cycle)) weight += h.weight
  }
  return weight / (periods.size * DAYS_PER_PERIOD)
}

export const hasOverride = (r: Pick<SimRoute, 'overrideTon'>) => r.overrideTon !== null && !Number.isNaN(Number(r.overrideTon))

export function routeDemand(source: SimulationSource, s: SimState, key: string): number {
  const r = routeOf(s, key)
  if (!r) return 0
  return hasOverride(r) ? Math.max(0, Number(r.overrideTon)) : routeHistTon(source, s, key)
}

export interface LaneMargin {
  revPerKg: number
  costPerKg: number
  cashbackPerKg: number
  netPerKg: number
}

export function laneMargin(s: Pick<SimState, 'routes' | 'accounts'>, lane: Lane): LaneMargin {
  const r = routeOf(s, lane.route)
  const a = accountOf(s, lane.vendor)
  const rev = r ? Number(r.rateSpx) || 0 : 0
  const cost = Number(lane.costPerKg) || 0
  const cashback = a?.isEsp ? rev * ESP_CASHBACK : 0
  return { revPerKg: rev, costPerKg: cost, cashbackPerKg: cashback, netPerKg: rev - cost + cashback }
}

export interface CompareLane {
  lane: Lane
  m: LaneMargin
  costKg: number
  costDay: number
  marginKg: number
  marginDay: number
  deltaKg: number
  deltaDay: number
  isBest: boolean
}

export interface RouteComparison {
  route: SimRoute
  demand: number
  bestKg: number
  vendors: { account: Account; bestKg: number; lanes: CompareLane[] }[]
  lanes: CompareLane[]
}

export function compareRoutes(source: SimulationSource, s: SimState): RouteComparison[] {
  return s.routes.map((route) => {
    const demand = routeDemand(source, s, route.key)
    const lanes: CompareLane[] = s.lanes
      .filter((l) => l.route === route.key && l.enabled && accountOf(s, l.vendor)?.enabled)
      .map((lane) => {
        const m = laneMargin(s, lane)
        return {
          lane, m, costKg: m.costPerKg, costDay: m.costPerKg * demand,
          marginKg: m.netPerKg, marginDay: m.netPerKg * demand, deltaKg: 0, deltaDay: 0, isBest: false,
        }
      })
      .sort((a, b) => b.marginKg - a.marginKg || a.lane.id.localeCompare(b.lane.id))
    const bestKg = lanes.length ? lanes[0].marginKg : 0
    lanes.forEach((x, i) => {
      x.deltaKg = x.marginKg - bestKg
      x.deltaDay = x.deltaKg * demand
      x.isBest = i === 0
    })
    const vendors: RouteComparison['vendors'] = []
    for (const x of lanes) {
      let v = vendors.find((g) => g.account.id === x.lane.vendor)
      if (!v) vendors.push((v = { account: accountOf(s, x.lane.vendor)!, bestKg: x.marginKg, lanes: [] }))
      v.lanes.push(x)
    }
    return { route, demand, bestKg, vendors, lanes }
  })
}

export interface LaneEconomics {
  lane: Lane
  account: Account
  m: LaneMargin
}

export interface EspVsPartner {
  esp: LaneEconomics | null // ESP's best lane on the route
  partners: LaneEconomics[] // each partner vendor's best lane, best first
  bestPartner: LaneEconomics | null
  winner: 'esp' | 'partner' | 'tie' | null
  gap: number // esp - bestPartner margin/kg; 0 unless both exist
}

// Pure lane economics on one route: ESP's own best lane (cashback included) against each partner
// vendor's best lane. Capital and load are ignored on purpose — the plan above it in tab 8 answers
// "who runs it", this answers "whose lane earns more per kg". Within Rp 0,5/kg is a tie.
export function espVsPartner(s: Pick<SimState, 'lanes' | 'routes' | 'accounts'>, routeKey: string): EspVsPartner {
  const lanes = s.lanes
    .filter((l) => l.route === routeKey && l.enabled)
    .map((lane) => ({ lane, account: accountOf(s, lane.vendor), m: laneMargin(s, lane) }))
    .filter((x): x is LaneEconomics => !!x.account && x.account.enabled && x.account.tranches.length > 0 && x.m.netPerKg > 0)
  const byNet = (a: LaneEconomics, b: LaneEconomics) => b.m.netPerKg - a.m.netPerKg
  const esp = lanes.filter((x) => x.account.isEsp).sort(byNet)[0] ?? null
  const best: Record<string, LaneEconomics> = {}
  for (const x of lanes) {
    if (x.account.isEsp) continue
    const prev = best[x.account.id]
    if (!prev || prev.m.netPerKg < x.m.netPerKg) best[x.account.id] = x
  }
  const partners = Object.values(best).sort(byNet)
  const bestPartner = partners[0] ?? null
  const gap = esp && bestPartner ? esp.m.netPerKg - bestPartner.m.netPerKg : 0
  const winner = !esp && !bestPartner ? null
    : !esp ? 'partner'
    : !bestPartner ? 'esp'
    : gap > 0.5 ? 'esp'
    : gap < -0.5 ? 'partner'
    : 'tie'
  return { esp, partners, bestPartner, winner, gap }
}
