# Simulasi Rekomendasi Rute — Plan 2 of 3: TypeScript Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the prototype's engine section (`/* ==ENGINE-START== */` … `/* ==ENGINE-END== */`, lines 109–674 of `simulasi-rekomendasi-rute-v3.backup-2026-10-03b.html`) into tested, typed, pure TypeScript modules that read the `GET /route-simulation/source` response (plan 1) and a `ScenarioPayload`.

**Architecture:** One folder, `apps/frontend/src/features/route-simulation/engine/`, with no React and no fetches at all. Every function takes `(source, state, ...)` and returns plain data. Where the prototype read the `DataSource` global, the code now takes a `source: SimulationSource` parameter. Where it mutated state, it now gets a new state from a reducer (plan 3). The algorithms are preserved **1:1** (simplex with Bland's rule, rounding + greedy fill, cheapest-COF-first tranche ordering, run-out day), so the numbers match the prototype for the same input. That is pinned by a parity fixture test.

**Tech Stack:** TypeScript 5 (strict), Jest + ts-jest (jsdom), no new dependencies.

**Depends on:** plan 1 (response types). **Consumed by:** plan 3 (UI).

## Global Constraints

- Every engine function is **pure**: no `Date.now()`, no `Math.random()`, no globals, no mutation of its arguments. The prototype's `rerender()`-plus-mutation pattern turns into `state → newState` in the reducer (plan 3).
- Behaviour changes vs the prototype (each one deliberate, each one tested):
  1. Lane rows with `vendor === null` (no booking) are **not lanes**: they don't appear in tab 2/6/8/9, but **are** counted in route tonnage (`routeHistTon`), tab 4, and tab 7 (shown as vendor "Tanpa booking").
  2. Cost/kg per lane is selected by `state.costBasis: 'smu' | 'all'` (default `'smu'`) from `laneCostSmu/laneWeightSmu` or `laneCostAll/laneWeightAll`. A lane with zero lane weight gets `cost_per_kg = 0` and `costKnown = false`, so the optimizer skips it (same as the prototype's `cost_per_kg > 0` filter).
  3. The default rate SPX per route = `rateSpx - pph2 - disc15` (net, matching what `v_pnl_to` bills), editable. Null → 0.
  4. The PDF export changes from fixed 15-day periods to `DAYS_PER_PERIOD = 15` **only** in the "per hari" unit of tab 4, exactly as in the prototype. Calendar-day accuracy is out of scope (written in the plan 3 copy).
- Constants are copied verbatim: `ESP_CASHBACK = 0.02`, `DAYS_PER_PERIOD = 15`, `DAYS_PER_MONTH = 30`, `MONTHS_ID`, `NO_GROUP = { id: 'none', name: 'Tanpa Grup' }`.
- Field names in the state and payload are camelCase (the prototype used snake_case). The mapping table is in Task 1.
- Frontend tests: `cd apps/frontend && pnpm exec jest src/features/route-simulation`.
- Type gate: `cd apps/frontend && pnpm exec tsc --noEmit`.

---

## File Structure

All under `apps/frontend/src/features/route-simulation/`.

| File | Responsibility | Prototype origin |
|---|---|---|
| `types.ts` | API response types (copied from plan 1) + `SimState`, `ScenarioPayload`, engine result types | `DataSource`, `createState` |
| `engine/constants.ts` | Constants | lines 113–117 |
| `engine/period.ts` | `periodParts/periodKey/nextPeriod/periodShort/periodsBetween` | lines 199–226 |
| `engine/state.ts` | `createState`, `routeKey/routeLabel/laneId`, `buildLanes`, lookups, `toPayload/fromPayload` | lines 196–332 |
| `engine/scope.ts` | `groupsOfRoute`, `groupNames`, `defaultScope`, `resolveScope` | lines 305–332 |
| `engine/margin.ts` | `trancheCofPerDay`, `routeHistTon`, `routeDemand`, `laneMargin`, `compareRoutes` | lines 334–395 |
| `engine/budget.ts` | `trancheBudget`, `trancheCofRate`, `trancheOrder`, `planCandidates` | lines 397–422 |
| `engine/lp.ts` | `solveLP` | lines 427–467 |
| `engine/optimize.ts` | `optimizePlan`, `simPlan` | lines 469–521 |
| `engine/evaluate.ts` | `evaluatePlan` | lines 523–615 |
| `engine/history.ts` | `sumRow`, `consolidateHistory`, `historyDetailByPeriod`, `actualDistribution` | lines 617–673 |
| `engine/__fixtures__/source.ts` | Fixture `SimulationSource` built from the prototype's `SEED_ROUTES` | lines 124–191 |
| `engine/__fixtures__/prototype-parity.ts` | Expected numbers captured from the HTML in a browser | — |
| `engine/*.spec.ts` | One spec per module + `parity.spec.ts` | — |

---

### Task 1: Types, constants, periods, state, and the fixture

**Files:**
- Create: `apps/frontend/src/features/route-simulation/types.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/constants.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/period.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/state.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/__fixtures__/source.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/period.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/state.spec.ts`

**Interfaces:**
- Produces: every type below; `createState(source): SimState`; `buildLanes(source, state): Lane[]`; `routeKey(r)`, `routeLabel(r)`, `laneId(vendor, route, airline)`; `histPeriodsOf(state)`, `histDays(state)`; `accountOf(state, id)`, `routeOf(state, key)`, `laneOf(state, id)`, `trancheOf(state, id)`; `cycleDays(t)`; `netRate(route)`; `emptyTranche(id, label)`; `toPayload(state)`; `toPayloadWithSource(source, state): ScenarioPayload`; `fromPayload(source, payload): SimState`; `fixtureSource(): SimulationSource`

Naming map from prototype → TS: `hist_start→histStart`, `hist_end→histEnd`, `is_esp→isEsp`, `cof_type→cofType`, `cof_value→cofValue`, `cof_unit→cofUnit`, `cycle_days→cycleDays`, `rate_spx→rateSpx`, `override_ton→overrideTon`, `cost_per_kg→costPerKg`, `load_kg→loadKg`, `has_data→hasData`, `actual_kg_day→actualKgDay`, `rev_per_kg→revPerKg`, `cashback_per_kg→cashbackPerKg`, `net_per_kg→netPerKg`, `per_day→perDay`.

- [ ] **Step 1: Write `types.ts`**

```ts
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
```

- [ ] **Step 2: Write `engine/constants.ts`**

```ts
export const ESP_CASHBACK = 0.02
export const DAYS_PER_PERIOD = 15
export const DAYS_PER_MONTH = 30
export const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const NO_GROUP = { id: 'none', name: 'Tanpa Grup' } as const
// The display name for history rows with no booking. Never an account id: accounts are vendors.
export const UNBOOKED_LABEL = 'Tanpa booking'
```

- [ ] **Step 3: Write the failing period test**

`engine/period.spec.ts`:

```ts
import { nextPeriod, periodParts, periodShort, periodsBetween } from './period'

describe('period helpers', () => {
  it('parses and labels a half-month cycle', () => {
    expect(periodParts('2026-05-2H')).toEqual({ year: 2026, month: 5, half: 2 })
    expect(periodParts('2026-05')).toBeNull()
    expect(periodShort('2026-05-2H')).toBe('Mei 2026 H2')
  })

  it('steps across a year boundary', () => {
    expect(nextPeriod(2026, 12, 2)).toEqual([2027, 1, 1])
    expect(nextPeriod(2026, 3, 1)).toEqual([2026, 3, 2])
  })

  it('lists every half-month inclusive and is empty when start is after end', () => {
    expect(periodsBetween('2026-11-2H', '2027-01-1H')).toEqual(['2026-11-2H', '2026-12-1H', '2026-12-2H', '2027-01-1H'])
    expect(periodsBetween('2026-06-1H', '2026-05-1H')).toEqual([])
  })
})
```

- [ ] **Step 4: Write `engine/period.ts`** (port of lines 199–226, logic unchanged)

```ts
import { MONTHS_ID } from './constants'

export interface PeriodParts {
  year: number
  month: number
  half: number
}

export function periodParts(p: string): PeriodParts | null {
  const m = /^(\d{4})-(\d{2})-(\d)H$/.exec(p)
  if (!m) return null
  return { year: +m[1], month: +m[2], half: +m[3] }
}

export function periodKey(y: number, m: number, h: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${h}H`
}

export function nextPeriod(y: number, m: number, h: number): [number, number, number] {
  if (h === 1) return [y, m, 2]
  if (m === 12) return [y + 1, 1, 1]
  return [y, m + 1, 1]
}

export function periodShort(p: string): string {
  const x = periodParts(p)
  if (!x) return p
  return `${MONTHS_ID[x.month - 1]} ${x.year} H${x.half}`
}

const cmp = (a: PeriodParts, b: PeriodParts) =>
  a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.half - b.half

export function periodsBetween(start: string, end: string): string[] {
  const out: string[] = []
  const s = periodParts(start)
  const e = periodParts(end)
  if (!s || !e) return out
  let [y, m, h] = [s.year, s.month, s.half]
  while (cmp({ year: y, month: m, half: h }, e) <= 0) {
    out.push(periodKey(y, m, h))
    ;[y, m, h] = nextPeriod(y, m, h)
    if (out.length > 240) break
  }
  return out
}
```

- [ ] **Step 5: Run the period test**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine/period`
Expected: PASS.

- [ ] **Step 6: Write the fixture**

`engine/__fixtures__/source.ts` turns the prototype's `SEED_ROUTES` into a `SimulationSource`. It uses the same deterministic `hashSeed/rand01` generator, so the parity test (Task 5) can compare against the prototype's numbers.

```ts
import { SimulationHistoryRow, SimulationSource } from '../../types'

// Verbatim from the prototype (lines 119–141). Deterministic so parity numbers are stable.
function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rand01(seed: number): number {
  return ((seed * 2654435761) >>> 0) / 4294967295
}

type Seed = [string, string, string, number, [string, string, number, number][]]
export const SEED_ROUTES: Seed[] = [
  ['Jabo', 'CGK', 'Aceh', 21500, [['SILI', 'Garuda Air CGK', 19400, 215], ['PRIME', 'Garuda Air CGK', 19900, 135], ['ESP', 'Citilink CGK', 19100, 120]]],
  ['Jabo', 'CGK', 'Ambon', 26800, [['SILI', 'Garuda Air CGK', 24100, 175], ['SILI', 'Citilink CGK', 24600, 120], ['PRIME', 'Garuda Air CGK', 24900, 100]]],
  ['Jabo', 'CGK', 'Balikpapan', 17600, [['SILI', 'Garuda Air CGK', 15600, 345], ['SILI', 'Citilink CGK', 15900, 280], ['ESP', 'Garuda Air CGK', 15800, 175], ['ESP', 'Citilink CGK', 15300, 160]]],
  ['Jabo', 'CGK', 'Banjarmasin', 16200, [['SILI', 'Citilink CGK', 14500, 265], ['ESP', 'Pelita Air', 13900, 175], ['PELITA', 'Pelita Air', 14200, 145]]],
  ['Jabo', 'CGK', 'Batam', 14800, [['SILI', 'Citilink CGK', 13300, 300], ['PRIME', 'Garuda Air CGK', 13900, 145], ['ESP', 'Citilink CGK', 13100, 135]]],
  ['Jabo', 'CGK', 'Denpasar', 13900, [['SILI', 'Garuda Air CGK', 12600, 335], ['ESP', 'Pelita Air', 12100, 200], ['PELITA', 'Pelita Air', 12300, 165]]],
  ['Jabo', 'CGK', 'Kendari', 24200, [['SILI', 'Garuda Air CGK', 21900, 160], ['SILI', 'Citilink CGK', 22300, 120], ['SILI', 'Pelita Air', 21500, 100]]],
  ['Jabo', 'CGK', 'Makassar', 18900, [['SILI', 'Garuda Air CGK', 16900, 400], ['PRIME', 'Garuda Air CGK', 17400, 200], ['ESP', 'Citilink CGK', 16600, 185], ['PELITA', 'Pelita Air', 16700, 135]]],
  ['Jabo', 'CGK', 'Padang', 16900, [['SILI', 'Citilink CGK', 15200, 70], ['ESP', 'Citilink CGK', 14900, 260]]],
  ['Jabo', 'CGK', 'Palangka Raya', 18400, [['SILI', 'Garuda Air CGK', 16700, 25], ['PRIME', 'Garuda Air CGK', 16300, 230]]],
  ['Jabo', 'CGK', 'Pekanbaru', 16100, [['SILI', 'Citilink CGK', 14600, 240], ['ESP', 'Pelita Air', 14100, 135], ['PELITA', 'Pelita Air', 14300, 105]]],
  ['Jabo', 'CGK', 'Tanjung Pandan', 15400, [['SILI', 'Citilink CGK', 14200, 10], ['ESP', 'Citilink CGK', 13900, 165]]],
  ['Jabo', 'CGK', 'Tanjung Pinang', 16800, [['PRIME', 'Garuda Air CGK', 14900, 200], ['SILI', 'Citilink CGK', 15200, 10]]],
  ['Surabaya', 'SUB', 'Balikpapan', 15200, [['SILI', 'Citilink CGK', 13600, 200], ['ESP', 'Citilink CGK', 13300, 120]]],
  ['Surabaya', 'SUB', 'Banjarmasin', 13800, [['SILI', 'Citilink CGK', 12300, 185], ['PELITA', 'Pelita Air', 12000, 120]]],
  ['Surabaya', 'SUB', 'Batam', 17300, [['SILI', 'Citilink CGK', 15700, 190], ['PRIME', 'Garuda Air CGK', 16200, 50]]],
]

export const FIXTURE_CYCLES = [
  '2026-03-1H', '2026-03-2H', '2026-04-1H', '2026-04-2H', '2026-05-1H', '2026-05-2H',
  '2026-06-1H', '2026-06-2H', '2026-07-1H', '2026-07-2H', '2026-08-1H', '2026-08-2H',
]

const seedRoute = (origin: string, dest: string) => {
  const r = SEED_ROUTES.find((x) => x[0] === origin && x[2] === dest)!
  return { origin: r[0], originLabel: r[1], dest: r[2] }
}

// Rows match the prototype's buildHistory() 1:1 (weight, revenue, cost) and fill every lane-cost
// field from `cost`, so on this fixture the SMU and all-in bases agree and both reproduce the
// prototype's cost/kg exactly. rateSpx carries the prototype's rate with pph2 = disc15 = 0, so the
// engine's net default rate equals the prototype's rate.
export function fixtureSource(): SimulationSource {
  const history: SimulationHistoryRow[] = []
  for (const [origin, , dest, rate, lanes] of SEED_ROUTES) {
    for (const [vendor, airline, costPerKg, loadKg] of lanes) {
      for (const cycle of FIXTURE_CYCLES) {
        const r1 = rand01(hashSeed([origin, dest, vendor, airline, cycle].join(':')))
        const r2 = rand01(hashSeed([cycle, airline, vendor, dest].join(':')))
        if (r1 < 0.1) continue
        const weight = Math.round(loadKg * 15 * (0.55 + 0.35 * r1))
        const revenue = Math.round(weight * rate * (0.98 + 0.04 * r1))
        const cost = Math.round(weight * costPerKg * (0.97 + 0.06 * r2))
        history.push({
          cycle, origin, dest, vendor, airline, awbCount: 1, weight, revenue,
          costAll: cost, costSmu: cost,
          laneWeightAll: weight, laneCostAll: cost, laneWeightSmu: weight, laneCostSmu: cost,
        })
      }
    }
  }
  return {
    basis: 'date',
    cycles: FIXTURE_CYCLES,
    routes: SEED_ROUTES.map(([origin, originLabel, dest, rate]) => ({
      origin, originLabel, dest, rateSpx: rate, pph2: 0, disc15: 0, hasData: true,
    })),
    routeGroups: [
      { id: 'grp-sumatera', name: 'Sumatera', description: null, routes: ['Aceh', 'Batam', 'Padang', 'Pekanbaru'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-kalimantan', name: 'Kalimantan', description: null, routes: ['Balikpapan', 'Banjarmasin', 'Palangka Raya'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-timur', name: 'Sulawesi & Timur', description: null, routes: ['Ambon', 'Denpasar', 'Kendari', 'Makassar'].map((d) => seedRoute('Jabo', d)) },
      { id: 'grp-sub', name: 'Ex Surabaya', description: null, routes: ['Balikpapan', 'Banjarmasin', 'Batam'].map((d) => seedRoute('Surabaya', d)) },
      { id: 'grp-prioritas', name: 'Prioritas', description: null, routes: [seedRoute('Jabo', 'Makassar'), seedRoute('Jabo', 'Balikpapan'), seedRoute('Surabaya', 'Balikpapan')] },
    ],
    vendors: ['AURI', 'ESP', 'PELITA', 'PRIME', 'SILI'].map((vendor) => ({ vendor, inMaster: true, hasData: vendor !== 'AURI' })),
    history,
  }
}

// The prototype's createState() accounts (lines 233–242), used by the parity test.
export const PROTOTYPE_ACCOUNTS = (() => {
  const tr = (id: string, label: string, amount: number, cofValue: number, cycleDays: number) => ({
    id, label, amount, cofType: 'percent' as const, cofValue, cofUnit: 'month' as const, cycleDays,
  })
  return [
    { id: 'SILI', name: 'SILI', isEsp: false, enabled: true, tranches: [tr('SILI-1', 'Modal SILI', 1_200_000_000, 0.7, 30)] },
    { id: 'PRIME', name: 'PRIME', isEsp: false, enabled: true, tranches: [tr('PRIME-1', 'Modal PRIME', 800_000_000, 0.85, 60)] },
    { id: 'ESP', name: 'ESP', isEsp: true, enabled: true, tranches: [
      tr('ESP-1', 'Modal sendiri', 500_000_000, 0, 30),
      tr('ESP-2', 'Pinjaman bank', 400_000_000, 0.9, 30),
      tr('ESP-3', 'Dana investor', 300_000_000, 1.2, 60),
    ] },
    { id: 'PELITA', name: 'PELITA', isEsp: false, enabled: true, tranches: [tr('PELITA-1', 'Modal PELITA', 300_000_000, 0.8, 30)] },
  ]
})()
```

- [ ] **Step 7: Write the failing state test**

`engine/state.spec.ts`:

```ts
import { fixtureSource } from './__fixtures__/source'
import { buildLanes, createState, fromPayload, histDays, laneId, toPayloadWithSource } from './state'
import { SimulationSource } from '../types'

describe('createState', () => {
  const src = fixtureSource()

  it('defaults the history range to the last six cycles and SMU cost', () => {
    const s = createState(src)
    expect(s.histStart).toBe('2026-06-1H')
    expect(s.histEnd).toBe('2026-08-2H')
    expect(histDays(s)).toBe(90)
    expect(s.costBasis).toBe('smu')
  })

  it('starts with one empty account per vendor that has data, ESP flagged', () => {
    const s = createState(src)
    expect(s.accounts.map((a) => a.id)).toEqual(['ESP', 'PELITA', 'PRIME', 'SILI'])
    expect(s.accounts.find((a) => a.id === 'ESP')!.isEsp).toBe(true)
    expect(s.accounts.every((a) => a.tranches.length === 1 && a.tranches[0].amount === 0)).toBe(true)
  })

  it('uses the net SPX rate and drops nothing from routes', () => {
    const custom: SimulationSource = { ...src, routes: [{ ...src.routes[0], rateSpx: 32000, pph2: 640, disc15: 480 }] }
    expect(createState(custom).routes[0].rateSpx).toBe(30880)
  })
})

describe('buildLanes', () => {
  it('builds one lane per booked vendor x airline and skips unbooked rows', () => {
    const src = fixtureSource()
    src.history.push({ ...src.history[0], vendor: null, airline: null })
    const s = createState(src)
    expect(s.lanes.some((l) => l.vendor === '' || l.vendor == null)).toBe(false)
    expect(s.lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))).toBeDefined()
  })

  it('computes cost/kg on the chosen basis and load as the best cycle per day', () => {
    const src = fixtureSource()
    // Make SMU and all-in disagree on one lane.
    src.history.forEach((h) => {
      if (h.vendor === 'SILI' && h.dest === 'Aceh') h.laneCostAll = h.laneCostSmu * 2
    })
    const s = createState(src)
    const smu = s.lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))!
    const all = buildLanes(src, { ...s, costBasis: 'all' }).find((l) => l.id === smu.id)!
    expect(all.costPerKg).toBeCloseTo(smu.costPerKg * 2, -1)
    const inRange = src.history.filter((h) => h.vendor === 'SILI' && h.dest === 'Aceh' && h.airline === 'Garuda Air CGK' && h.cycle >= '2026-06')
    expect(smu.loadKg).toBe(Math.round(Math.max(...inRange.map((h) => h.weight)) / 15))
  })

  it('marks a lane with no known cost so the optimizer can skip it', () => {
    const src = fixtureSource()
    src.history.forEach((h) => {
      if (h.vendor === 'PRIME' && h.dest === 'Aceh') { h.laneWeightSmu = 0; h.laneCostSmu = 0 }
    })
    const lane = createState(src).lanes.find((l) => l.id === laneId('PRIME', 'Jabo|Aceh', 'Garuda Air CGK'))!
    expect(lane.costKnown).toBe(false)
    expect(lane.costPerKg).toBe(0)
  })

  it('applies user edits over the data and remembers which fields were edited', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const id = s0.lanes[0].id
    const s = { ...s0, laneEdits: { [id]: { costPerKg: 1, enabled: false as const } } }
    const lane = buildLanes(src, s).find((l) => l.id === id)!
    expect(lane.costPerKg).toBe(1)
    expect(lane.enabled).toBe(false)
    expect(lane.edited).toEqual({ costPerKg: true, loadKg: false })
    expect(lane.db.costPerKg).toBe(s0.lanes[0].costPerKg)
  })
})

describe('payload round trip', () => {
  it('restores every user edit, including custom and removed routes', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const edited = {
      ...s0,
      costBasis: 'all' as const,
      routes: [
        ...s0.routes.filter((r) => r.key !== 'Jabo|Ambon').map((r) => (r.key === 'Jabo|Aceh' ? { ...r, rateSpx: 1, overrideTon: 50 } : r)),
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', key: 'Jabo|Manado', rateSpx: 40000, slots: [], overrideTon: 100, custom: true },
      ],
      sim: { days: 10, cash: { 'ESP-x': 5 }, kg: { a: 1 } },
    }
    const back = fromPayload(src, toPayloadWithSource(src, edited))
    expect(back.costBasis).toBe('all')
    expect(back.routes.find((r) => r.key === 'Jabo|Aceh')).toMatchObject({ rateSpx: 1, overrideTon: 50 })
    expect(back.routes.find((r) => r.key === 'Jabo|Ambon')).toBeUndefined()
    expect(back.routes.find((r) => r.key === 'Jabo|Manado')).toMatchObject({ custom: true })
    expect(back.sim).toEqual(edited.sim)
  })

  it('keeps routes that appeared in the source after the scenario was saved', () => {
    const src = fixtureSource()
    const payload = toPayloadWithSource(src, createState(src))
    const grown: SimulationSource = { ...src, routes: [...src.routes, { origin: 'Jabo', originLabel: 'CGK', dest: 'Ternate', rateSpx: 35000, pph2: 0, disc15: 0, hasData: false }] }
    expect(fromPayload(grown, payload).routes.some((r) => r.key === 'Jabo|Ternate')).toBe(true)
  })
})
```

- [ ] **Step 8: Write `engine/state.ts`**

```ts
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
```

- [ ] **Step 9: Run the state tests**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine/state`
Expected: PASS (all of them).

- [ ] **Step 10: Typecheck + commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add src/features/route-simulation/types.ts src/features/route-simulation/engine
git commit -m "$(cat <<'EOF'
feat(route-sim): port simulation state, periods and lane building

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Scope, margin, comparison, and capital budget

**Files:**
- Create: `apps/frontend/src/features/route-simulation/engine/scope.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/margin.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/budget.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/scope.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/margin.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/budget.spec.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `groupsOfRoute(source, key): SimulationRouteGroup[]`, `groupNames(source, key): string`, `defaultScope(source, s): Scope`, `resolveScope(source, s, scope): { sections: ScopeSection[]; union: SimRoute[]; dupes: Set<string> }` with `ScopeSection = { id; name; kind: 'group' | 'routes'; routes: SimRoute[] }`
  - `trancheCofPerDay(t): number`, `routeHistTon(source, s, key): number`, `hasOverride(r): boolean`, `routeDemand(source, s, key): number`, `laneMargin(s, lane): LaneMargin`, `compareRoutes(source, s): RouteComparison[]`
  - `simOpts(s): SimOpts`, `trancheBudget(t, opts?): { cash; window; perDay }`, `trancheCofRate(t)`, `trancheOrder(account): Tranche[]`, `planCandidates(source, s): Candidate[]` with `Candidate = { lane: Lane; account: Account; m: LaneMargin; load: number; demand: number }`

- [ ] **Step 1: Write the failing tests**

`engine/scope.spec.ts`:

```ts
import { fixtureSource } from './__fixtures__/source'
import { createState } from './state'
import { defaultScope, groupNames, resolveScope } from './scope'

const src = fixtureSource()
const s = createState(src)

it('names every group a route belongs to, or Tanpa Grup', () => {
  expect(groupNames(src, 'Jabo|Makassar')).toBe('Sulawesi & Timur, Prioritas')
  expect(groupNames(src, 'Jabo|Tanjung Pandan')).toBe('Tanpa Grup')
})

it('defaults to every group plus the ungrouped routes', () => {
  const scope = defaultScope(src, s)
  expect(scope.groups.size).toBe(5)
  expect([...scope.routes].sort()).toEqual(['Jabo|Tanjung Pandan', 'Jabo|Tanjung Pinang'])
})

it('lists a route once per group but once in the union, and flags it as a dupe', () => {
  const r = resolveScope(src, s, defaultScope(src, s))
  expect(r.dupes.has('Jabo|Makassar')).toBe(true)
  expect(r.union.filter((x) => x.key === 'Jabo|Makassar')).toHaveLength(1)
  expect(r.sections.at(-1)).toMatchObject({ id: 'picked', kind: 'routes' })
})

it('does not repeat a picked route that a ticked group already shows', () => {
  const r = resolveScope(src, s, { groups: new Set(['grp-prioritas']), routes: new Set(['Jabo|Makassar']) })
  expect(r.sections.map((x) => x.id)).toEqual(['grp-prioritas'])
})
```

`engine/margin.spec.ts`:

```ts
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { compareRoutes, laneMargin, routeDemand, routeHistTon, trancheCofPerDay } from './margin'

const src = fixtureSource()
const base = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('converts percent-per-month COF to rupiah per day', () => {
  expect(trancheCofPerDay({ amount: 300_000_000, cofType: 'percent', cofValue: 1.2, cofUnit: 'month' })).toBeCloseTo(120_000)
  expect(trancheCofPerDay({ amount: 0, cofType: 'nominal', cofValue: 5000, cofUnit: 'day' })).toBe(5000)
})

const UNBOOKED_ACEH = {
  cycle: '2026-07-1H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 3,
  weight: 900, revenue: 1, costAll: 0, costSmu: 0, laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,
}

it('averages route tonnage per day over the history range and counts unbooked weight', () => {
  const withUnbooked = fixtureSource()
  withUnbooked.history.push(UNBOOKED_ACEH)
  const s = createState(withUnbooked)
  expect(routeHistTon(withUnbooked, s, 'Jabo|Aceh') - routeHistTon(src, createState(src), 'Jabo|Aceh')).toBeCloseTo(900 / 90)
})

it('lets an override replace history tonnage', () => {
  const s = { ...base, routes: base.routes.map((r) => (r.key === 'Jabo|Aceh' ? { ...r, overrideTon: 123 } : r)) }
  expect(routeDemand(src, s, 'Jabo|Aceh')).toBe(123)
})

it('adds the 2% cashback only on ESP accounts', () => {
  const esp = base.lanes.find((l) => l.vendor === 'ESP' && l.route === 'Jabo|Aceh')!
  const sili = base.lanes.find((l) => l.vendor === 'SILI' && l.route === 'Jabo|Aceh')!
  expect(laneMargin(base, esp).cashbackPerKg).toBeCloseTo(21500 * 0.02)
  expect(laneMargin(base, sili).cashbackPerKg).toBe(0)
})

it('ranks lanes inside a route by margin/kg and measures the gap to the best', () => {
  const aceh = compareRoutes(src, base).find((x) => x.route.key === 'Jabo|Aceh')!
  expect(aceh.lanes[0].isBest).toBe(true)
  expect(aceh.lanes[0].deltaKg).toBe(0)
  expect(aceh.lanes.every((l, i, a) => i === 0 || a[i - 1].marginKg >= l.marginKg)).toBe(true)
  expect(aceh.vendors[0].account.id).toBe(aceh.lanes[0].lane.vendor)
})
```

`engine/budget.spec.ts`:

```ts
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { planCandidates, trancheBudget, trancheOrder } from './budget'

const t = { id: 'x', label: 'x', amount: 600, cofType: 'percent' as const, cofValue: 1, cofUnit: 'month' as const, cycleDays: 30 }

it('spreads the cash over the payment cycle, or over a shorter horizon', () => {
  expect(trancheBudget(t)).toEqual({ cash: 600, window: 30, perDay: 20 })
  expect(trancheBudget(t, { days: 10, cash: {} })).toEqual({ cash: 600, window: 10, perDay: 60 })
  expect(trancheBudget(t, { days: 90, cash: {} }).window).toBe(30)
  expect(trancheBudget(t, { days: null, cash: { x: 300 } }).perDay).toBe(10)
})

it('spends the cheapest money first', () => {
  const esp = PROTOTYPE_ACCOUNTS.find((a) => a.id === 'ESP')!
  expect(trancheOrder(esp).map((x) => x.id)).toEqual(['ESP-1', 'ESP-2', 'ESP-3'])
})

it('keeps only usable, profitable, costed lanes on routes with demand', () => {
  const src = fixtureSource()
  const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
  const c = planCandidates(src, s)
  expect(c.length).toBeGreaterThan(0)
  expect(c.every((x) => x.m.netPerKg > 0 && x.m.costPerKg > 0 && x.load > 0 && x.demand > 0)).toBe(true)
  const off = { ...s, accounts: s.accounts.map((a) => (a.id === 'SILI' ? { ...a, enabled: false } : a)) }
  expect(planCandidates(src, off).some((x) => x.lane.vendor === 'SILI')).toBe(false)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend && pnpm exec jest 'src/features/route-simulation/engine/(scope|margin|budget)'`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `engine/scope.ts`** (port of lines 305–332)

```ts
import { NO_GROUP } from './constants'
import { routeKey } from './state'
import { Scope, SimRoute, SimState, SimulationRouteGroup, SimulationSource } from '../types'

export interface ScopeSection {
  id: string
  name: string
  kind: 'group' | 'routes'
  routes: SimRoute[]
}

export const groupsOfRoute = (source: SimulationSource, key: string): SimulationRouteGroup[] =>
  source.routeGroups.filter((g) => g.routes.some((r) => routeKey(r) === key))

export const groupNames = (source: SimulationSource, key: string): string =>
  groupsOfRoute(source, key).map((g) => g.name).join(', ') || NO_GROUP.name

export function defaultScope(source: SimulationSource, s: Pick<SimState, 'routes'>): Scope {
  return {
    groups: new Set(source.routeGroups.map((g) => g.id)),
    routes: new Set(s.routes.filter((r) => !groupsOfRoute(source, r.key).length).map((r) => r.key)),
  }
}

// Subtotals are per section; the union counts each route once — a route in two ticked groups is
// shown twice and flagged, never summed twice.
export function resolveScope(source: SimulationSource, s: Pick<SimState, 'routes'>, scope: Scope) {
  const sections: ScopeSection[] = []
  const count: Record<string, number> = {}
  for (const g of source.routeGroups) {
    if (!scope.groups.has(g.id)) continue
    const routes = s.routes.filter((r) => g.routes.some((x) => routeKey(x) === r.key))
    if (!routes.length) continue
    routes.forEach((r) => { count[r.key] = (count[r.key] ?? 0) + 1 })
    sections.push({ id: g.id, name: g.name, kind: 'group', routes })
  }
  const picked = s.routes.filter((r) => scope.routes.has(r.key) && !count[r.key])
  if (picked.length) sections.push({ id: 'picked', name: 'Rute pilihan', kind: 'routes', routes: picked })
  picked.forEach((r) => { count[r.key] = 1 })
  return {
    sections,
    union: s.routes.filter((r) => count[r.key]),
    dupes: new Set(Object.keys(count).filter((k) => count[k] > 1)),
  }
}
```

- [ ] **Step 4: Write `engine/margin.ts`** (port of lines 337–395)

```ts
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
```

- [ ] **Step 5: Write `engine/budget.ts`** (port of lines 404–422)

```ts
import { accountOf, cycleDays } from './state'
import { laneMargin, LaneMargin, routeDemand, trancheCofPerDay } from './margin'
import { Account, Lane, SimOpts, SimState, SimulationSource, Tranche } from '../types'

export const simOpts = (s: Pick<SimState, 'sim'>): SimOpts => ({
  days: s.sim.days && s.sim.days > 0 ? Math.round(s.sim.days) : null,
  cash: s.sim.cash ?? {},
})

// Money spent today returns after the payment cycle, so the daily allowance is cash / cycle. When
// only Y days ahead are simulated and Y is shorter than the cycle, the cash may be spent within Y.
export function trancheBudget(t: Tranche, opts?: SimOpts) {
  const own = opts?.cash?.[t.id] != null
  const cash = Math.max(0, Number(own ? opts!.cash[t.id] : t.amount) || 0)
  const window = opts?.days ? Math.min(Math.max(1, opts.days), cycleDays(t)) : cycleDays(t)
  return { cash, window, perDay: cash / window }
}

export const trancheCofRate = (t: Tranche) => (Number(t.amount) > 0 ? trancheCofPerDay(t) / t.amount : 0)

export const trancheOrder = (account: Account) =>
  [...account.tranches].sort(
    (x, y) => trancheCofRate(x) - trancheCofRate(y) || cycleDays(x) - cycleDays(y) || x.id.localeCompare(y.id),
  )

export interface Candidate {
  lane: Lane
  account: Account
  m: LaneMargin
  load: number
  demand: number
}

export function planCandidates(source: SimulationSource, s: SimState): Candidate[] {
  const demand: Record<string, number> = {}
  s.routes.forEach((r) => { demand[r.key] = routeDemand(source, s, r.key) })
  const out: Candidate[] = []
  for (const lane of s.lanes) {
    const account = accountOf(s, lane.vendor)
    if (!account) continue
    const c = { lane, account, m: laneMargin(s, lane), load: Number(lane.loadKg) || 0, demand: demand[lane.route] ?? 0 }
    if (lane.enabled && account.enabled && account.tranches.length && c.m.netPerKg > 0 && c.m.costPerKg > 0 && c.load > 0 && c.demand > 0) out.push(c)
  }
  return out
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/route-simulation/engine
git commit -m "$(cat <<'EOF'
feat(route-sim): port scope, margin comparison and capital budget

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: LP solver and optimal plan

**Files:**
- Create: `apps/frontend/src/features/route-simulation/engine/lp.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/optimize.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/lp.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/optimize.spec.ts`

**Interfaces:**
- Consumes: `planCandidates`, `trancheBudget` (Task 2), `laneOf` (Task 1)
- Produces: `solveLP(c: number[], A: number[][], b: number[]): { x: number[]; value: number }`; `optimizePlan(source, s, opts?): PlanRow[]`; `simPlan(source, s): PlanRow[]`

- [ ] **Step 1: Write the failing tests**

`engine/lp.spec.ts`:

```ts
import { solveLP } from './lp'

it('solves the textbook max 3x+5y, x<=4, 2y<=12, 3x+2y<=18', () => {
  const { x, value } = solveLP([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18])
  expect(x[0]).toBeCloseTo(2)
  expect(x[1]).toBeCloseTo(6)
  expect(value).toBeCloseTo(36)
})

it('returns zeros for an empty problem and for zero capacity', () => {
  expect(solveLP([], [], [])).toEqual({ x: [], value: 0 })
  expect(solveLP([1], [[1]], [0]).x).toEqual([0])
})

it('terminates on a degenerate problem (Bland rule)', () => {
  const { value } = solveLP([10, -57, -9, -24], [[0.5, -5.5, -2.5, 9], [0.5, -1.5, -0.5, 1], [1, 0, 0, 0]], [0, 0, 1])
  expect(value).toBeCloseTo(1)
})
```

`engine/optimize.spec.ts`:

```ts
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState, laneOf } from './state'
import { optimizePlan, simPlan } from './optimize'
import { routeDemand } from './margin'
import { trancheBudget } from './budget'

const src = fixtureSource()
const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('returns whole kg that respect load, tonnage and daily capital', () => {
  const plan = optimizePlan(src, s)
  expect(plan.length).toBeGreaterThan(0)
  const byRoute: Record<string, number> = {}
  const spend: Record<string, number> = {}
  for (const p of plan) {
    const lane = laneOf(s, p.lane)!
    expect(Number.isInteger(p.kg)).toBe(true)
    expect(p.kg).toBeLessThanOrEqual(lane.loadKg)
    byRoute[lane.route] = (byRoute[lane.route] ?? 0) + p.kg
    spend[lane.vendor] = (spend[lane.vendor] ?? 0) + p.kg * lane.costPerKg
  }
  for (const [key, kg] of Object.entries(byRoute)) expect(kg).toBeLessThanOrEqual(routeDemand(src, s, key) + 1e-6)
  for (const a of s.accounts) {
    const budget = a.tranches.reduce((x, t) => x + trancheBudget(t).perDay, 0)
    expect(spend[a.id] ?? 0).toBeLessThanOrEqual(budget + 1)
  }
})

it('gives nothing to an account with no capital', () => {
  const broke = { ...s, accounts: s.accounts.map((a) => (a.id === 'SILI' ? { ...a, tranches: a.tranches.map((t) => ({ ...t, amount: 0 })) } : a)) }
  expect(optimizePlan(src, broke).some((p) => laneOf(s, p.lane)!.vendor === 'SILI')).toBe(false)
})

it('uses the manual kg in Coba-coba when present, dropping lanes that no longer exist', () => {
  const lane = s.lanes[0].id
  const manual = { ...s, sim: { ...s.sim, kg: { [lane]: 7, 'gone~x~y': 3 } } }
  expect(simPlan(src, manual)).toEqual([{ lane, kg: 7 }])
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend && pnpm exec jest 'src/features/route-simulation/engine/(lp|optimize)'`
Expected: FAIL.

- [ ] **Step 3: Write `engine/lp.ts`** (copy of lines 428–467, only typed)

```ts
// Maximise c·x subject to A x <= b, x >= 0, b >= 0. Dense simplex tableau with Bland's rule so a
// degenerate pivot cannot cycle. Problem size here is lanes (~60) x (lanes + routes + accounts),
// well inside what a dense tableau handles per keystroke.
export function solveLP(c: number[], A: number[][], b: number[]): { x: number[]; value: number } {
  const n = c.length
  const m = A.length
  const width = n + m
  if (!n) return { x: [], value: 0 }
  const T = A.map((row, i) => {
    const r = new Array<number>(width + 1).fill(0)
    for (let j = 0; j < n; j++) r[j] = row[j]
    r[n + i] = 1
    r[width] = b[i]
    return r
  })
  const z = new Array<number>(width + 1).fill(0)
  for (let j = 0; j < n; j++) z[j] = -c[j]
  const basis = T.map((_, i) => n + i)
  const EPS = 1e-9
  for (let iter = 0; iter < 50000; iter++) {
    let enter = -1
    for (let j = 0; j < width; j++) if (z[j] < -EPS) { enter = j; break }
    if (enter < 0) break
    let leave = -1
    let best = Infinity
    for (let i = 0; i < m; i++) {
      if (T[i][enter] <= EPS) continue
      const q = T[i][width] / T[i][enter]
      if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && basis[i] < basis[leave])) { best = q; leave = i }
    }
    if (leave < 0) break
    const pivot = T[leave][enter]
    for (let j = 0; j <= width; j++) T[leave][j] /= pivot
    for (let i = 0; i < m; i++) {
      const f = T[i][enter]
      if (i === leave || Math.abs(f) < 1e-12) continue
      for (let j = 0; j <= width; j++) T[i][j] -= f * T[leave][j]
    }
    const f = z[enter]
    for (let j = 0; j <= width; j++) z[j] -= f * T[leave][j]
    basis[leave] = enter
  }
  const x = new Array<number>(n).fill(0)
  basis.forEach((v, i) => { if (v < n) x[v] = Math.max(0, T[i][width]) })
  return { x, value: z[width] }
}
```

- [ ] **Step 4: Write `engine/optimize.ts`** (port of lines 471–521)

```ts
import { solveLP } from './lp'
import { planCandidates, simOpts, trancheBudget } from './budget'
import { laneOf } from './state'
import { PlanRow, SimOpts, SimState, SimulationSource } from '../types'

// Variables: kg/day per lane. Constraints: lane load, route tonnage, account daily capital.
// Objective: largest daily margin. Floors to whole kg, then greedily refills the rounding slack
// from the highest margin/kg down.
export function optimizePlan(source: SimulationSource, s: SimState, opts?: SimOpts): PlanRow[] {
  const cands = planCandidates(source, s)
  if (!cands.length) return []
  const A: number[][] = []
  const b: number[] = []
  const row = (fn: (c: (typeof cands)[number], j: number) => number) => cands.map(fn)
  cands.forEach((c, i) => { A.push(row((_, j) => (i === j ? 1 : 0))); b.push(c.load) })
  for (const r of s.routes) {
    const first = cands.find((c) => c.lane.route === r.key)
    if (!first) continue
    A.push(row((c) => (c.lane.route === r.key ? 1 : 0)))
    b.push(first.demand)
  }
  const SCALE = 10000 // brings rupiah rows to the same magnitude as kg rows
  const budget: Record<string, number> = {}
  for (const a of s.accounts) {
    if (!cands.some((c) => c.account.id === a.id)) continue
    budget[a.id] = a.tranches.reduce((sum, t) => sum + trancheBudget(t, opts).perDay, 0)
    A.push(row((c) => (c.account.id === a.id ? c.m.costPerKg / SCALE : 0)))
    b.push(budget[a.id] / SCALE)
  }
  const { x } = solveLP(cands.map((c) => c.m.netPerKg), A, b)
  const kg = x.map((v) => Math.floor(v + 1e-6))
  const room: Record<string, number> = {}
  cands.forEach((c, i) => {
    if (!(c.lane.route in room)) room[c.lane.route] = c.demand
    room[c.lane.route] -= kg[i]
    budget[c.account.id] -= kg[i] * c.m.costPerKg
  })
  cands
    .map((_, i) => i)
    .sort((i, j) => cands[j].m.netPerKg - cands[i].m.netPerKg || i - j)
    .forEach((i) => {
      const c = cands[i]
      const add = Math.floor(Math.min(room[c.lane.route], c.load - kg[i], budget[c.account.id] / c.m.costPerKg) + 1e-6)
      if (add < 1) return
      kg[i] += add
      room[c.lane.route] -= add
      budget[c.account.id] -= add * c.m.costPerKg
    })
  const acctIdx = (id: string) => s.accounts.findIndex((a) => a.id === id)
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  return cands
    .map((c, i) => ({ lane: c.lane.id, kg: kg[i] }))
    .filter((p) => p.kg >= 1)
    .sort((p, q) => {
      const lp = laneOf(s, p.lane)!
      const lq = laneOf(s, q.lane)!
      return routeIdx(lp.route) - routeIdx(lq.route) || acctIdx(lp.vendor) - acctIdx(lq.vendor) || lp.id.localeCompare(lq.id)
    })
}

export function simPlan(source: SimulationSource, s: SimState): PlanRow[] {
  if (!s.sim.kg) return optimizePlan(source, s, simOpts(s))
  return Object.keys(s.sim.kg)
    .filter((id) => laneOf(s, id))
    .map((id) => ({ lane: id, kg: s.sim.kg![id] }))
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/frontend && pnpm exec jest 'src/features/route-simulation/engine/(lp|optimize)'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/route-simulation/engine
git commit -m "$(cat <<'EOF'
feat(route-sim): port the simplex solver and optimal distribution

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Plan evaluation

**Files:**
- Create: `apps/frontend/src/features/route-simulation/engine/evaluate.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/evaluate.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: `evaluatePlan(source, s, plan, opts?): Evaluation` with the types below; `Reason = 'single' | 'load' | 'modal' | 'idle' | 'none'`

- [ ] **Step 1: Write the failing test**

```ts
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { optimizePlan } from './optimize'
import { evaluatePlan } from './evaluate'

const src = fixtureSource()
const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('produces no violations for the optimal plan', () => {
  const res = evaluatePlan(src, s, optimizePlan(src, s))
  expect(res.violations).toEqual([])
  expect(res.totals.net).toBeCloseTo(res.totals.revenue - res.totals.cost + res.totals.cashback - res.totals.cof)
})

it('flags load, tonnage, and capital overruns on a manual plan', () => {
  const lane = s.lanes.find((l) => l.vendor === 'PELITA')!
  const res = evaluatePlan(src, s, [{ lane: lane.id, kg: 1_000_000 }])
  const types = res.violations.map((v) => v.type).sort()
  expect(types).toEqual(['load', 'modal', 'tonase'])
  const modal = res.violations.find((v) => v.type === 'modal')!
  expect(modal.type === 'modal' && modal.runoutDay).toBe(0)
})

it('spends the cheapest tranche first and parks the overflow on the last', () => {
  const esp = s.lanes.find((l) => l.vendor === 'ESP')!
  const res = evaluatePlan(src, s, [{ lane: esp.id, kg: 2000 }])
  const espTr = res.perTranche.filter((x) => x.account.id === 'ESP')
  expect(espTr.find((x) => x.tranche.id === 'ESP-1')!.spendDay).toBeGreaterThan(0)
})

it('explains every route', () => {
  const res = evaluatePlan(src, s, optimizePlan(src, s))
  expect(res.perRoute.every((r) => ['single', 'load', 'modal', 'idle', 'none'].includes(r.reason))).toBe(true)
})

it('rejects a row pointing at a disabled lane', () => {
  const lane = s.lanes[0]
  const off = { ...s, lanes: s.lanes.map((l) => (l.id === lane.id ? { ...l, enabled: false } : l)) }
  expect(evaluatePlan(src, off, [{ lane: lane.id, kg: 1 }]).violations).toEqual([{ type: 'invalid', row: 0 }])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine/evaluate`
Expected: FAIL.

- [ ] **Step 3: Write `engine/evaluate.ts`** (port of lines 527–615; logic unchanged)

```ts
import { accountOf, cycleDays, laneOf, routeOf } from './state'
import { laneMargin, routeDemand, trancheCofPerDay } from './margin'
import { planCandidates, trancheBudget, trancheOrder } from './budget'
import { Account, Lane, PlanRow, SimOpts, SimRoute, SimState, SimulationSource, Tranche } from '../types'

export type Reason = 'single' | 'load' | 'modal' | 'idle' | 'none'

export interface EvalRow {
  idx: number
  lane: Lane
  account: Account
  route: SimRoute
  kg: number
  netPerKg: number
  revenueDay: number
  costDay: number
  cashbackDay: number
  netDay: number
}

export type Violation =
  | { type: 'invalid'; row: number }
  | { type: 'modal'; account: Account; tranche: Tranche; runoutDay: number; over: number }
  | { type: 'load'; lane: Lane; over: number }
  | { type: 'tonase'; route: SimRoute; over: number }

export interface TrancheUse {
  account: Account
  tranche: Tranche
  cash: number
  window: number
  budgetDay: number
  spendDay: number
  locked: number
  idle: number
  cofDay: number
  runoutDay: number | null
  refillDay: number
}

export interface RouteResult {
  route: SimRoute
  demand: number
  served: number
  unmet: number
  rows: EvalRow[]
  reason: Reason
  revenue: number
  cost: number
  cashback: number
  net: number
}

export interface AccountResult {
  account: Account
  modal: number
  cash: number
  locked: number
  idle: number
  kg: number
  revenue: number
  cost: number
  gross: number
  cashback: number
  cof: number
  net: number
}

export type Totals = Omit<AccountResult, 'account'>

export interface Evaluation {
  days: number | null
  rows: EvalRow[]
  perRoute: RouteResult[]
  perTranche: TrancheUse[]
  perAccount: AccountResult[]
  totals: Totals
  violations: Violation[]
}

export function evaluatePlan(source: SimulationSource, s: SimState, plan: PlanRow[], opts?: SimOpts): Evaluation {
  const rows: EvalRow[] = []
  const violations: Violation[] = []
  const laneKg: Record<string, number> = {}
  const routeKg: Record<string, number> = {}

  plan.forEach((p, idx) => {
    const lane = laneOf(s, p.lane)
    const account = lane && accountOf(s, lane.vendor)
    const route = lane && routeOf(s, lane.route)
    if (!lane || !lane.enabled || !route || !account || !account.enabled || !account.tranches.length) {
      violations.push({ type: 'invalid', row: idx })
      return
    }
    const kg = Math.max(0, Number(p.kg) || 0)
    const m = laneMargin(s, lane)
    laneKg[lane.id] = (laneKg[lane.id] ?? 0) + kg
    routeKg[route.key] = (routeKg[route.key] ?? 0) + kg
    rows.push({
      idx, lane, account, route, kg, netPerKg: m.netPerKg,
      revenueDay: kg * m.revPerKg, costDay: kg * m.costPerKg, cashbackDay: kg * m.cashbackPerKg, netDay: kg * m.netPerKg,
    })
  })

  const active = s.accounts.filter((a) => a.enabled)
  const perTranche: TrancheUse[] = []
  for (const account of active) {
    let left = rows.filter((r) => r.account.id === account.id).reduce((a, r) => a + r.costDay, 0)
    const order = trancheOrder(account)
    const spend: Record<string, number> = {}
    for (const t of order) {
      const use = Math.min(left, trancheBudget(t, opts).perDay)
      spend[t.id] = use
      left -= use
    }
    if (left > 1 && order.length) spend[order[order.length - 1].id] += left
    for (const tranche of account.tranches) {
      const bud = trancheBudget(tranche, opts)
      const spendDay = spend[tranche.id] ?? 0
      const over = spendDay > bud.perDay + 1
      const locked = Math.min(bud.cash, spendDay * bud.window)
      const runoutDay = over ? Math.floor(bud.cash / spendDay) : null
      if (over) violations.push({ type: 'modal', account, tranche, runoutDay: runoutDay!, over: spendDay * bud.window - bud.cash })
      perTranche.push({
        account, tranche, cash: bud.cash, window: bud.window, budgetDay: bud.perDay, spendDay,
        locked, idle: bud.cash - locked, cofDay: trancheCofPerDay(tranche), runoutDay, refillDay: cycleDays(tranche),
      })
    }
  }

  for (const id of Object.keys(laneKg)) {
    const lane = laneOf(s, id)!
    const load = Number(lane.loadKg) || 0
    if (laneKg[id] > load + 0.5) violations.push({ type: 'load', lane, over: laneKg[id] - load })
  }

  const cands = planCandidates(source, s)
  const perRoute: RouteResult[] = s.routes.map((route) => {
    const mine = rows.filter((r) => r.route.key === route.key)
    const sum = (f: 'revenueDay' | 'costDay' | 'cashbackDay' | 'netDay') => mine.reduce((a, r) => a + r[f], 0)
    const demand = routeDemand(source, s, route.key)
    const served = routeKg[route.key] ?? 0
    if (served > demand + 0.5) violations.push({ type: 'tonase', route, over: served - demand })
    const options = cands
      .filter((c) => c.lane.route === route.key)
      .sort((a, b) => b.m.netPerKg - a.m.netPerKg || a.lane.id.localeCompare(b.lane.id))
    const used = new Set(mine.filter((r) => r.kg >= 1).map((r) => r.lane.id))
    const unmet = Math.max(0, demand - served)
    let reason: Reason
    if (!options.length) reason = 'none'
    else if (!used.size) reason = 'idle'
    else if (used.size === 1 && unmet < 1) reason = 'single'
    else reason = (laneKg[options[0].lane.id] ?? 0) >= Math.min(options[0].load, demand) - 1 ? 'load' : 'modal'
    return {
      route, demand, served, unmet, rows: mine, reason,
      revenue: sum('revenueDay'), cost: sum('costDay'), cashback: sum('cashbackDay'), net: sum('netDay'),
    }
  })

  const perAccount: AccountResult[] = active.map((account) => {
    const mine = rows.filter((r) => r.account.id === account.id)
    const sum = (f: 'kg' | 'revenueDay' | 'costDay' | 'cashbackDay') => mine.reduce((a, r) => a + r[f], 0)
    const tr = perTranche.filter((x) => x.account.id === account.id)
    const tsum = (f: 'cash' | 'locked' | 'idle' | 'cofDay') => tr.reduce((a, x) => a + x[f], 0)
    const revenue = sum('revenueDay')
    const cost = sum('costDay')
    const cashback = sum('cashbackDay')
    const cof = tsum('cofDay')
    return {
      account,
      modal: account.tranches.reduce((a, t) => a + (Number(t.amount) || 0), 0),
      cash: tsum('cash'), locked: tsum('locked'), idle: tsum('idle'), kg: sum('kg'),
      revenue, cost, gross: revenue - cost, cashback, cof, net: revenue - cost + cashback - cof,
    }
  })
  const keys = ['modal', 'cash', 'locked', 'idle', 'kg', 'revenue', 'cost', 'gross', 'cashback', 'cof', 'net'] as const
  const totals = Object.fromEntries(keys.map((k) => [k, perAccount.reduce((a, x) => a + x[k], 0)])) as Totals

  return { days: opts?.days ?? null, rows, perRoute, perTranche, perAccount, totals, violations }
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine/evaluate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/route-simulation/engine
git commit -m "$(cat <<'EOF'
feat(route-sim): port plan evaluation with capital, load and tonnage checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: History aggregation + parity with the prototype

**Files:**
- Create: `apps/frontend/src/features/route-simulation/engine/history.ts`
- Create: `apps/frontend/src/features/route-simulation/engine/index.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/history.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/engine/parity.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: `sumRow(rows): Sum`, `consolidateHistory(source, s, filter): Consolidated`, `historyDetailByPeriod(source, s, filter): PeriodDetail[]`, `actualDistribution(source, s): ActualRow[]`; `HistFilter = { periods: string[]; vendors: Set<string>; scope: Scope }`. `index.ts` re-exports every engine module.

- [ ] **Step 1: Write the failing history test**

```ts
import { fixtureSource } from './__fixtures__/source'
import { createState } from './state'
import { defaultScope } from './scope'
import { actualDistribution, consolidateHistory, historyDetailByPeriod } from './history'
import { UNBOOKED_LABEL } from './constants'

const src = fixtureSource()
src.history.push({
  cycle: '2026-07-1H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 2,
  weight: 500, revenue: 1, costAll: 0, costSmu: 0, laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,
})
const s = createState(src)
const all = new Set(['ESP', 'PELITA', 'PRIME', 'SILI', UNBOOKED_LABEL])

it('counts a route once in the grand total even when it sits in two groups', () => {
  const c = consolidateHistory(src, s, { periods: src.cycles, vendors: all, scope: defaultScope(src, s) })
  const subtotalSum = c.groups.reduce((a, g) => a + g.subtotal.weight, 0)
  expect(c.dupes).toBeGreaterThan(0)
  expect(c.grand.weight).toBeLessThan(subtotalSum)
  expect(c.grand.weight).toBe(src.history.reduce((a, h) => a + h.weight, 0))
})

it('filters unbooked weight through its own vendor label', () => {
  const booked = consolidateHistory(src, s, { periods: src.cycles, vendors: new Set(['ESP', 'PELITA', 'PRIME', 'SILI']), scope: defaultScope(src, s) })
  const withUnbooked = consolidateHistory(src, s, { periods: src.cycles, vendors: all, scope: defaultScope(src, s) })
  expect(withUnbooked.grand.weight - booked.grand.weight).toBe(500)
})

it('breaks history down per cycle and skips empty cycles', () => {
  const d = historyDetailByPeriod(src, s, { periods: ['2026-06-1H', '2030-01-1H'], vendors: all, scope: defaultScope(src, s) })
  expect(d.map((p) => p.cycle)).toEqual(['2026-06-1H'])
})

it('averages actual distribution per day over the history range, unbooked included', () => {
  const rows = actualDistribution(src, s)
  const unbooked = rows.find((r) => r.vendor === UNBOOKED_LABEL)!
  expect(unbooked.kgDay).toBeCloseTo(500 / 90)
})
```

- [ ] **Step 2: Write `engine/history.ts`** (port of lines 621–673)

```ts
import { UNBOOKED_LABEL } from './constants'
import { histDays, histPeriodsOf, routeKey, routeOf } from './state'
import { resolveScope } from './scope'
import { Scope, SimRoute, SimState, SimulationHistoryRow, SimulationSource } from '../types'

export interface Sum {
  weight: number
  revenue: number
  cost: number
  margin: number
}

export interface HistFilter {
  periods: string[]
  vendors: Set<string> // raw vendor names, plus UNBOOKED_LABEL for vendor === null
}

export const vendorLabel = (h: Pick<SimulationHistoryRow, 'vendor'>) => h.vendor ?? UNBOOKED_LABEL

// Historical PnL is all-in by definition — it reports what the period actually cost — so it reads
// costAll regardless of the scenario's cost basis, which only steers lane pricing.
export function sumRow(rows: { weight: number; revenue: number; cost?: number; costAll?: number }[]): Sum {
  const o = { weight: 0, revenue: 0, cost: 0, margin: 0 }
  for (const r of rows) {
    o.weight += r.weight
    o.revenue += r.revenue
    o.cost += r.cost ?? r.costAll ?? 0
  }
  o.margin = o.revenue - o.cost
  return o
}

function filtered(source: SimulationSource, filter: HistFilter, routes: SimRoute[]) {
  const periods = new Set(filter.periods)
  const keys = new Set(routes.map((r) => r.key))
  return source.history.filter((h) => periods.has(h.cycle) && filter.vendors.has(vendorLabel(h)) && keys.has(routeKey(h)))
}

export function consolidateHistory(source: SimulationSource, s: SimState, filter: HistFilter & { scope: Scope }) {
  const { sections, union, dupes } = resolveScope(source, s, filter.scope)
  const hist = filtered(source, filter, union)
  const byRoute: Record<string, SimulationHistoryRow[]> = {}
  for (const h of hist) (byRoute[routeKey(h)] ??= []).push(h)
  const groups = sections
    .map((sec) => {
      const rows = sec.routes.filter((r) => byRoute[r.key]).map((r) => ({ route: r, dupe: dupes.has(r.key), ...sumRow(byRoute[r.key]) }))
      return { id: sec.id, name: sec.name, kind: sec.kind, rows, subtotal: sumRow(rows) }
    })
    .filter((g) => g.rows.length)
  return { groups, grand: sumRow(hist), numPeriods: filter.periods.length, dupes: [...dupes].filter((k) => byRoute[k]).length }
}

export function historyDetailByPeriod(source: SimulationSource, s: SimState, filter: HistFilter & { scope: Scope }) {
  const { union } = resolveScope(source, s, filter.scope)
  const hist = filtered(source, filter, union)
  return filter.periods
    .map((cycle) => {
      const inCycle = hist.filter((h) => h.cycle === cycle)
      const rows = union
        .map((r) => ({ route: r, items: inCycle.filter((h) => routeKey(h) === r.key) }))
        .filter((x) => x.items.length)
        .map((x) => ({ route: x.route, ...sumRow(x.items) }))
      return { cycle, rows, subtotal: sumRow(rows) }
    })
    .filter((p) => p.rows.length)
}

export interface ActualRow extends Sum {
  vendor: string // raw vendor, or UNBOOKED_LABEL
  route: SimRoute
  airline: string
  kgDay: number
  costDay: number
  marginDay: number
  marginKg: number
}

export function actualDistribution(source: SimulationSource, s: SimState): ActualRow[] {
  const set = new Set(histPeriodsOf(s))
  const days = histDays(s)
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  const map: Record<string, { vendor: string; route: SimRoute; airline: string; weight: number; revenue: number; cost: number }> = {}
  for (const h of source.history) {
    const route = routeOf(s, routeKey(h))
    if (!set.has(h.cycle) || !route) continue
    const vendor = vendorLabel(h)
    const airline = h.airline ?? '—'
    const id = [vendor, route.key, airline].join('~')
    const o = (map[id] ??= { vendor, route, airline, weight: 0, revenue: 0, cost: 0 })
    o.weight += h.weight
    o.revenue += h.revenue
    o.cost += h.costAll
  }
  return Object.values(map)
    .map((o) => {
      const margin = o.revenue - o.cost
      return { ...o, margin, kgDay: o.weight / days, costDay: o.cost / days, marginDay: margin / days, marginKg: o.weight > 0 ? margin / o.weight : 0 }
    })
    .sort((a, b) => routeIdx(a.route.key) - routeIdx(b.route.key) || a.vendor.localeCompare(b.vendor) || a.airline.localeCompare(b.airline))
}
```

- [ ] **Step 3: Write `engine/index.ts`**

```ts
export * from './constants'
export * from './period'
export * from './state'
export * from './scope'
export * from './margin'
export * from './budget'
export * from './lp'
export * from './optimize'
export * from './evaluate'
export * from './history'
```

- [ ] **Step 4: Capture the prototype numbers for parity**

Open `simulasi-rekomendasi-rute-v3.backup-2026-10-03b.html` in a browser, open DevTools, and run in the console:

```js
const res = evaluatePlan(state, optimizePlan(state));
copy(JSON.stringify({
  plan: optimizePlan(state),
  net: Math.round(res.totals.net),
  revenue: Math.round(res.totals.revenue),
  cost: Math.round(res.totals.cost),
  reasons: res.perRoute.map(r => [r.route.key, r.reason]),
}, null, 2));
```

Save the result as `engine/__fixtures__/prototype-parity.ts` in the form `export const expected = <paste JSON> as const` (a `.ts` file rather than `.json`, because the ts-jest inline tsconfig in `apps/frontend/jest.config.ts` does not enable `resolveJsonModule`). The prototype's default state = the default history range `2026-06-1H..2026-08-2H`, the 4 accounts from `PROTOTYPE_ACCOUNTS`, no edits. Lane ids in the prototype are already `vendor~origin|dest~airline`, the same format as `laneId`.

- [ ] **Step 5: Write the parity test**

`engine/parity.spec.ts`:

```ts
/**
 * The port must produce exactly the prototype's recommendation for the prototype's own data. The
 * expected values were captured from the HTML in a browser (see plan 2, Task 5 Step 4); if this
 * fails, the port changed behaviour — fix the port, do not re-capture.
 */
import { expected } from './__fixtures__/prototype-parity'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { buildLanes, createState } from './state'
import { optimizePlan } from './optimize'
import { evaluatePlan } from './evaluate'

it('matches the prototype plan, totals and reasons on the seed data', () => {
  const src = fixtureSource()
  const s0 = { ...createState(src), histStart: '2026-06-1H', histEnd: '2026-08-2H', accounts: PROTOTYPE_ACCOUNTS }
  const s = { ...s0, lanes: buildLanes(src, s0) }
  const plan = optimizePlan(src, s)
  const res = evaluatePlan(src, s, plan)
  expect(plan).toEqual(expected.plan.map((p) => ({ ...p })))
  expect(Math.round(res.totals.net)).toBe(expected.net)
  expect(Math.round(res.totals.revenue)).toBe(expected.revenue)
  expect(Math.round(res.totals.cost)).toBe(expected.cost)
  expect(res.perRoute.map((r) => [r.route.key, r.reason])).toEqual(expected.reasons.map((x) => [...x]))
})
```

The prototype's routes don't include the `rateSpx` netting (pph/disc = 0 in the fixture), and the prototype's lane cost reads the same `cost` that the fixture copies into `laneCostSmu`. So the numbers have to match **exactly**.

- [ ] **Step 6: Run the whole engine suite**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/engine && pnpm exec tsc --noEmit`
Expected: every test PASSes, including parity; tsc is clean. If parity fails, compare `plan` per lane: the most common cause is a field-name mismatch in the port or a different sort order.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/route-simulation/engine
git commit -m "$(cat <<'EOF'
feat(route-sim): port history aggregation and pin parity with the prototype

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```
