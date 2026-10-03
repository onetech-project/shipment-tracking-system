import { DAYS_PER_PERIOD } from './constants'
import { periodsBetween } from './period'
import {
  Account,
  Lane,
  ScenarioPayload,
  SimRoute,
  SimState,
  SimulationRoute,
  SimulationSource,
  Tranche,
} from '../types'

export const routeKey = (r: { origin: string; dest: string }) => `${r.origin}|${r.dest}`
export const routeLabel = (r: { originLabel: string; dest: string }) => `${r.originLabel} → ${r.dest}`
export const laneId = (vendor: string, route: string, airline: string) => `${vendor}~${route}~${airline}`

export const histPeriodsOf = (s: Pick<SimState, 'histStart' | 'histEnd'>) => periodsBetween(s.histStart, s.histEnd)
export const histDays = (s: Pick<SimState, 'histStart' | 'histEnd'>) => histPeriodsOf(s).length * DAYS_PER_PERIOD
export const cycleDays = (t: Pick<Tranche, 'cycleDays'>) => Math.max(1, Math.round(Number(t.cycleDays) || 1))

export const accountOf = (s: Pick<SimState, 'accounts'>, id: string) => s.accounts.find((a) => a.id === id)
export const routeOf = (s: Pick<SimState, 'routes'>, key: string) => s.routes.find((r) => r.key === key)
export const laneOf = (s: Pick<SimState, 'lanes'>, id: string) => s.lanes.find((l) => l.id === id)
export function trancheOf(s: Pick<SimState, 'accounts'>, id: string): { account: Account; tranche: Tranche } | null {
  for (const account of s.accounts) {
    const tranche = account.tranches.find((t) => t.id === id)
    if (tranche) return { account, tranche }
  }
  return null
}

// What SPX actually pays per kg: v_pnl_to bills gross_weight * (rate_spx - pph_2 - disc_15).
export const netRate = (r: SimulationRoute) =>
  Math.max(0, (r.rateSpx ?? 0) - (r.pph2 ?? 0) - (r.disc15 ?? 0))

const toSimRoute = (r: SimulationRoute): SimRoute => ({
  origin: r.origin,
  originLabel: r.originLabel,
  dest: r.dest,
  key: routeKey(r),
  rateSpx: netRate(r),
  slots: [{ start: '05:00', end: '19:00' }],
  overrideTon: null,
  custom: false,
})

export const emptyTranche = (id: string, label: string): Tranche => ({
  id, label, amount: 0, cofType: 'percent', cofValue: 0, cofUnit: 'month', cycleDays: 30,
})

// A new page starts with one empty account per vendor that has flown, so lanes are immediately
// usable and the planner only has to type capital. ESP is flagged by name, as in the prototype.
export function createState(source: SimulationSource): SimState {
  const cycles = source.cycles
  const s: SimState = {
    histStart: cycles[Math.max(0, cycles.length - 6)] ?? '',
    histEnd: cycles[cycles.length - 1] ?? '',
    costBasis: 'smu',
    accounts: source.vendors
      .filter((v) => v.hasData)
      .map((v) => ({
        id: v.vendor,
        name: v.vendor,
        isEsp: v.vendor === 'ESP',
        enabled: true,
        tranches: [emptyTranche(`${v.vendor}-1`, `Modal ${v.vendor}`)],
      })),
    routes: source.routes.map(toSimRoute),
    laneEdits: {},
    sim: { days: 30, cash: {}, kg: null },
    lanes: [],
  }
  s.lanes = buildLanes(source, s)
  return s
}

interface LaneAcc {
  id: string
  route: string
  vendor: string
  airline: string
  all: { weight: number; cost: number }
  range: { weight: number; cost: number; laneWeight: number }
  byCycle: Record<string, number>
}

// Lane = route + vendor + airline seen in booked history. Unbooked rows (vendor null) are route
// tonnage, not lanes: nobody can be allocated to "no vendor". Cost/kg reads only the lane-cost
// fields (booked, non-estimated), on the scenario's cost basis.
export function buildLanes(source: SimulationSource, s: Omit<SimState, 'lanes'> & { lanes?: Lane[] }): Lane[] {
  const periods = new Set(histPeriodsOf(s))
  const days = histDays(s)
  const routeKeys = new Set(s.routes.map((r) => r.key))
  const smu = s.costBasis === 'smu'
  const map: Record<string, LaneAcc> = {}
  for (const h of source.history) {
    if (!h.vendor) continue
    const route = routeKey(h)
    if (!routeKeys.has(route)) continue
    const airline = h.airline ?? '—'
    const id = laneId(h.vendor, route, airline)
    const o = (map[id] ??= {
      id, route, vendor: h.vendor, airline,
      all: { weight: 0, cost: 0 }, range: { weight: 0, cost: 0, laneWeight: 0 }, byCycle: {},
    })
    const lw = smu ? h.laneWeightSmu : h.laneWeightAll
    const lc = smu ? h.laneCostSmu : h.laneCostAll
    o.all.weight += lw
    o.all.cost += lc
    if (!periods.has(h.cycle)) continue
    o.range.weight += h.weight
    o.range.laneWeight += lw
    o.range.cost += lc
    o.byCycle[h.cycle] = (o.byCycle[h.cycle] ?? 0) + h.weight
  }
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  return Object.values(map)
    .map((o): Lane => {
      const hasData = o.range.weight > 0
      // Cost from the range when the range has costed weight, otherwise from all history — the
      // prototype's fallback, so a lane idle this range still carries a usable price.
      const costSrc = o.range.laneWeight > 0 ? { w: o.range.laneWeight, c: o.range.cost } : { w: o.all.weight, c: o.all.cost }
      const db = {
        costPerKg: costSrc.w > 0 ? Math.round(costSrc.c / costSrc.w) : 0,
        loadKg: hasData ? Math.round(Math.max(...Object.values(o.byCycle)) / DAYS_PER_PERIOD) : 0,
      }
      const edit = s.laneEdits[o.id] ?? {}
      return {
        id: o.id, route: o.route, vendor: o.vendor, airline: o.airline,
        costPerKg: edit.costPerKg ?? db.costPerKg,
        loadKg: edit.loadKg ?? db.loadKg,
        enabled: edit.enabled !== false,
        hasData,
        costKnown: costSrc.w > 0 || edit.costPerKg != null,
        actualKgDay: days ? o.range.weight / days : 0,
        db,
        edited: { costPerKg: edit.costPerKg != null, loadKg: edit.loadKg != null },
      }
    })
    .sort((a, b) => routeIdx(a.route) - routeIdx(b.route) || a.vendor.localeCompare(b.vendor) || a.airline.localeCompare(b.airline))
}

export function toPayload(s: SimState): ScenarioPayload {
  const routeEdits: ScenarioPayload['routeEdits'] = {}
  for (const r of s.routes) {
    if (r.custom) continue
    routeEdits[r.key] = { rateSpx: r.rateSpx, overrideTon: r.overrideTon, slots: r.slots }
  }
  return {
    version: 1,
    histStart: s.histStart,
    histEnd: s.histEnd,
    costBasis: s.costBasis,
    accounts: s.accounts,
    routeEdits,
    customRoutes: s.routes.filter((r) => r.custom),
    removedRoutes: [], // filled by fromPayload's caller diff — see below
    laneEdits: s.laneEdits,
    sim: s.sim,
  }
}

// Source routes absent from state were removed by the user. Computed against the source the
// state was built from, which toPayload does not have — so the reducer (plan 3) calls this pair.
export function toPayloadWithSource(source: SimulationSource, s: SimState): ScenarioPayload {
  const present = new Set(s.routes.map((r) => r.key))
  return { ...toPayload(s), removedRoutes: source.routes.map(routeKey).filter((k) => !present.has(k)) }
}

// Routes the master gained since the scenario was saved are included with defaults; routes it
// lost survive only as long as the scenario edited them (their edit is the only rate left).
export function fromPayload(source: SimulationSource, p: ScenarioPayload): SimState {
  const removed = new Set(p.removedRoutes)
  const sourceRoutes = source.routes
    .filter((r) => !removed.has(routeKey(r)))
    .map((r) => {
      const base = toSimRoute(r)
      const e = p.routeEdits[base.key]
      return e ? { ...base, ...e, overrideTon: e.overrideTon ?? null, slots: e.slots ?? base.slots } : base
    })
  const s: SimState = {
    histStart: p.histStart,
    histEnd: p.histEnd,
    costBasis: p.costBasis,
    accounts: p.accounts,
    routes: [...sourceRoutes, ...p.customRoutes.filter((r) => !sourceRoutes.some((x) => x.key === r.key))],
    laneEdits: p.laneEdits,
    sim: p.sim,
    lanes: [],
  }
  s.lanes = buildLanes(source, s)
  return s
}
