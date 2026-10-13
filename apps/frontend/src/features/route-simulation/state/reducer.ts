import {
  buildLanes,
  clampHorizon,
  createState,
  emptyTranche,
  laneOf,
  optimizePlan,
  periodShort,
  routeKey,
  simOpts,
  trancheOf,
} from '../engine'
import { CostField, LaneEdit, SimRoute, SimState, SimulationSource, Slot, Tranche } from '../types'

export interface ReducerState {
  source: SimulationSource
  sim: SimState
  dirty: boolean
  flash: string | null // one-shot toast (a refusal or a confirmation); cleared by the next action
}

// A refusal is a bare message; a confirmation carries the new state with it.
type Outcome = SimState | string | { sim: SimState; flash: string }

type TrancheField = 'label' | 'amount' | 'cofType' | 'cofValue' | 'cofUnit' | 'cycleDays'

export type SimAction =
  | { type: 'load'; sim: SimState }
  | { type: 'markSaved' }
  | { type: 'setSimRange'; simStart: string; horizonPeriods: number }
  | { type: 'acctAdd'; vendor: string; trancheId: string }
  | { type: 'acctSet'; id: string; field: 'enabled' | 'isEsp'; value: boolean }
  | { type: 'acctDel'; id: string }
  | { type: 'trAdd'; accountId: string; trancheId: string }
  | { type: 'trSet'; trancheId: string; field: TrancheField; value: string | number }
  | { type: 'trDel'; trancheId: string }
  | { type: 'laneSet'; id: string; field: CostField | 'loadKg'; value: number | null }
  | { type: 'laneReset'; id: string }
  | { type: 'laneToggle'; id: string; enabled: boolean }
  | { type: 'rateSet'; key: string; value: number }
  | { type: 'tonSet'; key: string; value: number }
  | { type: 'tonReset'; key: string }
  | { type: 'slotAdd'; key: string }
  | { type: 'slotSet'; key: string; index: number; field: keyof Slot; value: string }
  | { type: 'slotDel'; key: string; index: number }
  | { type: 'routeDel'; key: string }
  | { type: 'routeAdd'; route: { origin: string; originLabel: string; dest: string; rateSpx: number; overrideTon: number } }
  | { type: 'simDays'; value: number | null }
  | { type: 'simCash'; trancheId: string; value: number | null }
  | { type: 'simCashReset' }
  | { type: 'simKg'; id: string; value: number }
  | { type: 'simAuto' }

export function initReducer(source: SimulationSource, sim?: SimState): ReducerState {
  return { source, sim: sim ?? createState(source), dirty: false, flash: null }
}

// Mirrors the prototype's rebuildLanes(): lanes are derived from history + edits, and Coba-coba
// entries pointing at a lane or tranche that no longer exists are dropped.
function rebuild(source: SimulationSource, sim: SimState): SimState {
  const next = { ...sim, lanes: buildLanes(source, sim) }
  return cleanSim(next)
}

function cleanSim(sim: SimState): SimState {
  const kg = sim.sim.kg ? Object.fromEntries(Object.entries(sim.sim.kg).filter(([id]) => laneOf(sim, id))) : null
  const cash = Object.fromEntries(Object.entries(sim.sim.cash).filter(([id]) => trancheOf(sim, id)))
  return { ...sim, sim: { ...sim.sim, kg, cash } }
}

const mapRoute = (sim: SimState, key: string, fn: (r: SimRoute) => SimRoute): SimState => ({
  ...sim,
  routes: sim.routes.map((r) => (r.key === key ? fn(r) : r)),
})

const mapTranche = (sim: SimState, id: string, fn: (t: Tranche) => Tranche): SimState => ({
  ...sim,
  accounts: sim.accounts.map((a) => ({ ...a, tranches: a.tranches.map((t) => (t.id === id ? fn(t) : t)) })),
})

function setLaneEdit(source: SimulationSource, sim: SimState, id: string, patch: Partial<Record<keyof LaneEdit, number | false | null>>): SimState {
  const edit: Record<string, unknown> = { ...(sim.laneEdits[id] ?? {}), ...patch }
  Object.keys(edit).forEach((k) => { if (edit[k] == null) delete edit[k] })
  const laneEdits = { ...sim.laneEdits }
  if (Object.keys(edit).length) laneEdits[id] = edit as LaneEdit
  else delete laneEdits[id]
  return rebuild(source, { ...sim, laneEdits })
}

function apply(source: SimulationSource, sim: SimState, a: SimAction): Outcome {
  switch (a.type) {
    case 'setSimRange': {
      const horizonPeriods = clampHorizon(a.horizonPeriods)
      const flash = `Estimasi dijalankan: mulai ${periodShort(a.simStart)}, ${horizonPeriods} periode`
      if (a.simStart === sim.simStart && horizonPeriods === sim.horizonPeriods) return { sim, flash }
      return { sim: { ...sim, simStart: a.simStart, horizonPeriods }, flash }
    }
    case 'acctAdd': {
      const name = a.vendor.trim()
      if (!name) return 'Nama vendor tidak boleh kosong'
      if (sim.accounts.some((x) => x.id === name)) return `Akun ${name} sudah ada`
      return {
        sim: {
          ...sim,
          accounts: [...sim.accounts, { id: name, name, isEsp: name.toUpperCase() === 'ESP', enabled: true, tranches: [emptyTranche(a.trancheId, 'Modal 1')] }],
        },
        flash: `Akun ${name} ditambahkan. Isi modal, COF, dan siklus bayar sesuai kebutuhan.`,
      }
    }
    case 'acctSet':
      return { ...sim, accounts: sim.accounts.map((x) => (x.id === a.id ? { ...x, [a.field]: a.value } : x)) }
    case 'acctDel':
      return rebuild(source, { ...sim, accounts: sim.accounts.filter((x) => x.id !== a.id) })
    case 'trAdd':
      return {
        ...sim,
        accounts: sim.accounts.map((x) => (x.id === a.accountId ? { ...x, tranches: [...x.tranches, emptyTranche(a.trancheId, `Modal ${x.tranches.length + 1}`)] } : x)),
      }
    case 'trSet': {
      let v: string | number = a.value
      if (a.field === 'amount' || a.field === 'cofValue') v = Math.max(0, Number(v) || 0)
      if (a.field === 'cycleDays') v = Math.max(1, Math.round(Number(v) || 1))
      return mapTranche(sim, a.trancheId, (t) => (a.field === 'label' ? { ...t, label: String(v).trim() || t.label } : { ...t, [a.field]: v }))
    }
    case 'trDel':
      return cleanSim({ ...sim, accounts: sim.accounts.map((x) => ({ ...x, tranches: x.tranches.filter((t) => t.id !== a.trancheId) })) })
    case 'laneSet': {
      const lane = laneOf(sim, a.id)
      if (!lane) return sim
      const v = a.value == null ? null : Math.max(0, a.value)
      return setLaneEdit(source, sim, a.id, { [a.field]: v === null || v === lane.db[a.field] ? null : v })
    }
    case 'laneReset':
      return setLaneEdit(source, sim, a.id, { costSgOut: null, costSgIn: null, costRa: null, costSmu: null, loadKg: null })
    case 'laneToggle':
      return setLaneEdit(source, sim, a.id, { enabled: a.enabled ? null : false })
    case 'rateSet':
      return mapRoute(sim, a.key, (r) => ({ ...r, rateSpx: Math.max(0, a.value) }))
    case 'tonSet':
      return mapRoute(sim, a.key, (r) => ({ ...r, overrideTon: Math.max(0, a.value) }))
    case 'tonReset':
      return mapRoute(sim, a.key, (r) => ({ ...r, overrideTon: null }))
    case 'slotAdd':
      return mapRoute(sim, a.key, (r) => ({ ...r, slots: [...r.slots, { start: '06:00', end: '18:00' }] }))
    case 'slotSet':
      return mapRoute(sim, a.key, (r) => ({ ...r, slots: r.slots.map((s, i) => (i === a.index ? { ...s, [a.field]: a.value } : s)) }))
    case 'slotDel':
      return mapRoute(sim, a.key, (r) => ({ ...r, slots: r.slots.filter((_, i) => i !== a.index) }))
    case 'routeDel':
      return rebuild(source, { ...sim, routes: sim.routes.filter((r) => r.key !== a.key) })
    case 'routeAdd': {
      const key = routeKey(a.route)
      if (sim.routes.some((r) => r.key === key)) return `Rute ${a.route.originLabel} → ${a.route.dest} sudah ada`
      return rebuild(source, {
        ...sim,
        routes: [...sim.routes, { ...a.route, key, slots: [], overrideTon: Math.max(0, a.route.overrideTon), rateSpx: Math.max(0, a.route.rateSpx), custom: true }],
      })
    }
    case 'simDays':
      return { ...sim, sim: { ...sim.sim, days: a.value && a.value > 0 ? Math.min(3650, Math.round(a.value)) : null } }
    case 'simCash': {
      const found = trancheOf(sim, a.trancheId)
      if (!found) return sim
      const cash = { ...sim.sim.cash }
      if (a.value == null || a.value === Number(found.tranche.amount)) delete cash[a.trancheId]
      else cash[a.trancheId] = Math.max(0, a.value)
      return { ...sim, sim: { ...sim.sim, cash } }
    }
    case 'simCashReset':
      return { ...sim, sim: { ...sim.sim, cash: {} } }
    case 'simKg': {
      const seeded = sim.sim.kg ?? Object.fromEntries(optimizePlan(source, sim, simOpts(sim)).map((p) => [p.lane, p.kg]))
      const kg = { ...seeded }
      const v = Math.max(0, Math.round(a.value || 0))
      if (v) kg[a.id] = v
      else delete kg[a.id]
      return { ...sim, sim: { ...sim.sim, kg } }
    }
    case 'simAuto':
      return { ...sim, sim: { ...sim.sim, kg: null } }
    default:
      return sim
  }
}

export function simReducer(state: ReducerState, action: SimAction): ReducerState {
  if (action.type === 'load') return { ...state, sim: action.sim, dirty: false, flash: null }
  if (action.type === 'markSaved') return { ...state, dirty: false, flash: null }
  const out = apply(state.source, state.sim, action)
  if (typeof out === 'string') return { ...state, flash: out }
  const [sim, flash] = 'flash' in out ? [out.sim, out.flash] : [out, null]
  return { ...state, sim, dirty: sim !== state.sim || state.dirty, flash }
}
