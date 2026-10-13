import { COST_FIELDS, DAYS_PER_PERIOD, DEFAULT_HORIZON_PERIODS, MAX_HORIZON_PERIODS } from './constants'
import { nextPeriod, periodKey, periodParts, periodsBetween, periodsForward } from './period'
import {
  Account,
  CostField,
  Lane,
  LaneCosts,
  ScenarioPayload,
  SimRoute,
  SimState,
  SimulationHistoryRow,
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

export const sumCosts = (c: LaneCosts) => COST_FIELDS.reduce((s, f) => s + (Number(c[f]) || 0), 0)

export const clampHorizon = (v: unknown) =>
  Math.min(MAX_HORIZON_PERIODS, Math.max(1, Math.round(Number(v) || DEFAULT_HORIZON_PERIODS)))
export const horizonDays = (s: Pick<SimState, 'horizonPeriods'>) => clampHorizon(s.horizonPeriods) * DAYS_PER_PERIOD

// Tab 8's start choices: the 12 periods right after the last cycle that has data.
export function simStartOptions(source: Pick<SimulationSource, 'cycles'>): string[] {
  const last = periodParts(source.cycles[source.cycles.length - 1] ?? '')
  if (!last) return []
  return periodsForward(periodKey(...nextPeriod(last.year, last.month, last.half)), 12)
}

const defaultHistRange = (source: SimulationSource) => ({
  histStart: source.cycles[Math.max(0, source.cycles.length - 6)] ?? '',
  histEnd: source.cycles[source.cycles.length - 1] ?? '',
})

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
  const s: SimState = {
    ...defaultHistRange(source),
    simStart: simStartOptions(source)[0] ?? '',
    horizonPeriods: DEFAULT_HORIZON_PERIODS,
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

type CostSum = LaneCosts & { weight: number } // weight = booked, non-estimated (costed) weight

interface LaneAcc {
  id: string
  route: string
  vendor: string
  airline: string
  all: CostSum
  range: CostSum
  rangeWeight: number // every kg in the range, costed or not
  byCycle: Record<string, number>
}

const emptyCost = (): CostSum => ({ weight: 0, costSgOut: 0, costSgIn: 0, costRa: 0, costSmu: 0 })

function addCost(o: CostSum, h: SimulationHistoryRow) {
  o.weight += h.laneWeight
  o.costSgOut += h.laneCostSgOut
  o.costSgIn += h.laneCostSgIn
  o.costRa += h.laneCostRa
  o.costSmu += h.laneCostSmu
}

// Lane = route + vendor + airline seen in booked history. Unbooked rows (vendor null) are route
// tonnage, not lanes: nobody can be allocated to "no vendor". Cost/kg reads only the lane-cost
// fields (booked, non-estimated), one per cost component; the lane's total is their sum.
export function buildLanes(source: SimulationSource, s: Omit<SimState, 'lanes'> & { lanes?: Lane[] }): Lane[] {
  const periods = new Set(histPeriodsOf(s))
  const days = histDays(s)
  const routeKeys = new Set(s.routes.map((r) => r.key))
  const map: Record<string, LaneAcc> = {}
  for (const h of source.history) {
    if (!h.vendor) continue
    const route = routeKey(h)
    if (!routeKeys.has(route)) continue
    const airline = h.airline ?? '—'
    const id = laneId(h.vendor, route, airline)
    const o = (map[id] ??= {
      id, route, vendor: h.vendor, airline, all: emptyCost(), range: emptyCost(), rangeWeight: 0, byCycle: {},
    })
    addCost(o.all, h)
    if (!periods.has(h.cycle)) continue
    o.rangeWeight += h.weight
    addCost(o.range, h)
    o.byCycle[h.cycle] = (o.byCycle[h.cycle] ?? 0) + h.weight
  }
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  const byField = <T,>(fn: (f: CostField) => T) => Object.fromEntries(COST_FIELDS.map((f) => [f, fn(f)])) as Record<CostField, T>
  return Object.values(map)
    .map((o): Lane => {
      const hasData = o.rangeWeight > 0
      // Cost from the range when the range has costed weight, otherwise from all history — the
      // prototype's fallback, so a lane idle this range still carries a usable price.
      const src = o.range.weight > 0 ? o.range : o.all
      const dbCosts = byField((f) => (src.weight > 0 ? Math.round(src[f] / src.weight) : 0))
      const db = {
        ...dbCosts,
        costPerKg: sumCosts(dbCosts),
        loadKg: hasData ? Math.round(Math.max(...Object.values(o.byCycle)) / DAYS_PER_PERIOD) : 0,
      }
      const edit = s.laneEdits[o.id] ?? {}
      const costs = byField((f) => edit[f] ?? db[f])
      const edited = byField((f) => edit[f] != null)
      const costEdited = COST_FIELDS.some((f) => edited[f])
      return {
        id: o.id, route: o.route, vendor: o.vendor, airline: o.airline,
        ...costs,
        costPerKg: sumCosts(costs),
        loadKg: edit.loadKg ?? db.loadKg,
        enabled: edit.enabled !== false,
        hasData,
        costKnown: src.weight > 0 || costEdited,
        actualKgDay: days ? o.rangeWeight / days : 0,
        db,
        edited: { ...edited, costPerKg: costEdited, loadKg: edit.loadKg != null },
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
    version: 2,
    simStart: s.simStart,
    horizonPeriods: s.horizonPeriods,
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

// True iff x looks like a payload this engine's fromPayload can read: a loaded scenario whose
// payload fails this (wrong shape, wrong version, or not an object at all — e.g. a future format,
// or corrupted storage) must not be loaded at all, rather than crash on a missing/renamed key.
export function isScenarioPayload(x: unknown): x is ScenarioPayload {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && (x as { version?: unknown }).version === 2
}

// Routes the master gained since the scenario was saved are included with defaults; routes it
// lost survive only as long as the scenario edited them (their edit is the only rate left).
// Every field beyond `version` is optional here: an older or hand-edited payload missing a key
// (routeEdits, sim, accounts, …) still produces a usable state instead of throwing, falling back
// to the same defaults createState() would pick for a brand-new scenario.
export function fromPayload(source: SimulationSource, p: ScenarioPayload): SimState {
  const accounts = p.accounts ?? []
  const routeEdits = p.routeEdits ?? {}
  const customRoutes = p.customRoutes ?? []
  const laneEdits = p.laneEdits ?? {}
  const sim = p.sim ?? { days: 30, cash: {}, kg: null }
  const removed = new Set(p.removedRoutes ?? [])
  const sourceRoutes = source.routes
    .filter((r) => !removed.has(routeKey(r)))
    .map((r) => {
      const base = toSimRoute(r)
      const e = routeEdits[base.key]
      return e ? { ...base, ...e, overrideTon: e.overrideTon ?? null, slots: e.slots ?? base.slots } : base
    })
  const s: SimState = {
    ...defaultHistRange(source),
    simStart: p.simStart ?? simStartOptions(source)[0] ?? '',
    horizonPeriods: clampHorizon(p.horizonPeriods),
    accounts,
    routes: [...sourceRoutes, ...customRoutes.filter((r) => !sourceRoutes.some((x) => x.key === r.key))],
    laneEdits,
    sim,
    lanes: [],
  }
  s.lanes = buildLanes(source, s)
  return s
}
