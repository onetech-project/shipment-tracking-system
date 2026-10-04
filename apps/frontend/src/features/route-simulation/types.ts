// ── API (mirrors apps/backend/src/modules/route-simulation/route-simulation.types.ts) ──────────
export type DateBasis = 'date' | 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'

export interface SimulationRoute {
  origin: string
  originLabel: string
  dest: string
  rateSpx: number | null
  pph2: number | null
  disc15: number | null
  hasData: boolean
}

export interface SimulationRouteGroup {
  id: string
  name: string
  description: string | null
  routes: { origin: string; originLabel: string; dest: string }[]
}

export interface SimulationVendor {
  vendor: string
  inMaster: boolean
  hasData: boolean
}

export interface SimulationHistoryRow {
  cycle: string
  origin: string
  dest: string
  vendor: string | null
  airline: string | null
  awbCount: number
  weight: number
  revenue: number
  costAll: number
  costSmu: number
  laneWeightAll: number
  laneCostAll: number
  laneWeightSmu: number
  laneCostSmu: number
}

export interface SimulationSource {
  basis: DateBasis
  cycles: string[]
  routes: SimulationRoute[]
  routeGroups: SimulationRouteGroup[]
  vendors: SimulationVendor[]
  history: SimulationHistoryRow[]
}

export interface ScenarioSummary {
  id: string
  name: string
  description: string | null
  revision: number
  updatedAt: string
  updatedBy: string | null
}

export interface ScenarioDetail extends ScenarioSummary {
  payload: ScenarioPayload
}

// ── Simulation state ───────────────────────────────────────────────────────────────────────────
export type CostBasis = 'smu' | 'all'

export interface Tranche {
  id: string
  label: string
  amount: number
  cofType: 'percent' | 'nominal'
  cofValue: number
  cofUnit: 'month' | 'day'
  cycleDays: number
}

export interface Account {
  id: string // = raw vendor name
  name: string
  isEsp: boolean
  enabled: boolean
  tranches: Tranche[]
}

export interface Slot {
  start: string // HH:MM
  end: string
}

export interface SimRoute {
  origin: string
  originLabel: string
  dest: string
  key: string // origin|dest
  rateSpx: number
  slots: Slot[]
  overrideTon: number | null
  custom: boolean // added by the user, not in the source
}

export interface LaneEdit {
  costPerKg?: number
  loadKg?: number
  enabled?: false
}

export interface Lane {
  id: string // vendor~origin|dest~airline
  route: string
  vendor: string
  airline: string
  costPerKg: number
  loadKg: number
  enabled: boolean
  hasData: boolean // has lane weight in the history range
  costKnown: boolean // some booked, non-estimated weight exists on the active cost basis
  actualKgDay: number
  db: { costPerKg: number; loadKg: number }
  edited: { costPerKg: boolean; loadKg: boolean }
}

export interface SimSettings {
  days: number | null // null = jalan terus
  cash: Record<string, number> // tranche id → sisa duit
  kg: Record<string, number> | null // lane id → kg/hari; null = ikut rekomendasi
}

export interface SimState {
  histStart: string
  histEnd: string
  costBasis: CostBasis
  accounts: Account[]
  routes: SimRoute[]
  laneEdits: Record<string, LaneEdit>
  sim: SimSettings
  lanes: Lane[] // derived by buildLanes; never persisted
}

// What is saved to route_simulation_scenarios.payload. Routes are stored as overrides keyed by
// route key so a scenario survives the master gaining or losing routes.
export interface ScenarioPayload {
  version: 1
  histStart: string
  histEnd: string
  costBasis: CostBasis
  accounts: Account[]
  routeEdits: Record<string, { rateSpx?: number; overrideTon?: number | null; slots?: Slot[] }>
  customRoutes: SimRoute[]
  removedRoutes: string[]
  laneEdits: Record<string, LaneEdit>
  sim: SimSettings
}

// ── Engine results ─────────────────────────────────────────────────────────────────────────────
export interface PlanRow {
  lane: string
  kg: number
}

export interface Scope {
  groups: Set<string>
  routes: Set<string>
}

export interface SimOpts {
  days: number | null
  cash: Record<string, number>
}
