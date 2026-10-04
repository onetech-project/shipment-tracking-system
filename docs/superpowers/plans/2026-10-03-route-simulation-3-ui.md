# Simulasi Rekomendasi Rute — Plan 3 of 3: Page & UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/route-simulation` page with the 9 prototype tabs (Setup, SMU Rute, Rate Card, Historical PnL, Rute & Slot, Perbandingan, Distribusi Aktual, Distribusi Optimal, Coba-coba). Data comes from `GET /route-simulation/source`, all computation runs in the engine (plan 2), and the full state can be saved and opened as a named scenario.

**Architecture:** One `useReducer` holds `SimState` (engine) plus `dirty`. Every prototype `ACTIONS.*` becomes a typed reducer action. Every action that touches lanes or the history range calls `buildLanes` + `cleanSim`, exactly as the prototype's `rebuildLanes()` does. Per-tab UI state (filters, scope, open rows) stays as `useState` in the page so it survives tab switches, the same pattern `pnl/page.tsx` uses. Tab components are dumb: they get `source`, `state`, `dispatch` and compute through engine functions inside `useMemo`.

**Tech Stack:** Next.js 14 App Router, React 18, @tanstack/react-query, Tailwind 3 + shadcn components (`Button`, `Input`, `Card`, `Dialog`, `Badge`), lucide-react, jspdf + jspdf-autotable (new), Jest + Testing Library.

**Depends on:** plan 1 (API), plan 2 (engine).

## Global Constraints

- UI copy is Indonesian, taken **verbatim** from the prototype (headings, tab labels, hints, tags). Generic button labels follow the repo (Save, Cancel, Delete stay English where the existing component already uses them).
- Every number is formatted with `id-ID`: currency via `fmt` (`@/features/pnl/utils/format`), compact via `fmtShort` (ported from the prototype, Task 2).
- Colors use theme tokens (`text-muted-foreground`, `border`, `bg-muted`, `bg-card`) so dark mode works. The prototype's `--pos/--neg/--esp` map to `text-emerald-700 dark:text-emerald-400`, `text-red-700 dark:text-red-400`, `text-amber-700 dark:text-amber-400`.
- The page and sidebar link are gated on `read.route_simulation`. The Save/Save as/Delete buttons are gated on `create.`/`update.`/`delete.route_simulation`.
- Unsaved changes: show a "Belum disimpan" badge, and `beforeunload` warns when `dirty`.
- Frontend tests: `cd apps/frontend && pnpm exec jest <pattern>`. Type gate: `pnpm exec tsc --noEmit`. `next lint` is **not** a gate (it already fails on pre-existing files).

---

## File Structure

All under `apps/frontend/src/` unless written otherwise.

| File | Responsibility |
|---|---|
| `features/route-simulation/hooks/useRouteSimulation.ts` | Query `source`, `scenarios`, `scenario(id)`; mutations create/update/delete |
| `features/route-simulation/state/reducer.ts` | `SimAction` + `simReducer` (every prototype `ACTIONS.*`) |
| `features/route-simulation/utils/format.ts` | `fmtShort`, `fmtPct`, `fmtNum`, `signedClass` |
| `features/route-simulation/components/ui.tsx` | Small pieces: `Signed`, `RouteChip`, `EspTag`, `Tag`, `Kpi`, `NumInput`, `ScopePicker`, `RouteFilterBar` |
| `features/route-simulation/components/ScenarioBar.tsx` | Scenario dropdown, Save/Save as/Delete, dirty badge |
| `features/route-simulation/components/tabs/SetupTab.tsx` | Tab 1 |
| `features/route-simulation/components/tabs/LanesTab.tsx` | Tab 2 + SMU/All-in cost basis toggle |
| `features/route-simulation/components/tabs/RateTab.tsx` | Tab 3 |
| `features/route-simulation/components/tabs/HistoryTab.tsx` | Tab 4 + PDF |
| `features/route-simulation/components/tabs/RoutesTab.tsx` | Tab 5 |
| `features/route-simulation/components/tabs/CompareTab.tsx` | Tab 6 |
| `features/route-simulation/components/tabs/ActualTab.tsx` | Tab 7 |
| `features/route-simulation/components/tabs/OptimalTab.tsx` | Tab 8 |
| `features/route-simulation/components/tabs/SimTab.tsx` | Tab 9 |
| `features/route-simulation/utils/historyPdf.ts` | PDF export (lazy-imports jspdf) |
| `features/route-simulation/components/RouteSimulationView.tsx` | Tab nav + reducer + scenario wiring |
| `app/(dashboard)/route-simulation/page.tsx` | Permission gate + `RouteSimulationView` |
| `components/layout/sidebar.tsx` | "Simulasi Rute" link |

---

### Task 1: Data hooks and reducer

**Files:**
- Create: `apps/frontend/src/features/route-simulation/hooks/useRouteSimulation.ts`
- Create: `apps/frontend/src/features/route-simulation/state/reducer.ts`
- Test: `apps/frontend/src/features/route-simulation/hooks/useRouteSimulation.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/state/reducer.spec.ts`

**Interfaces:**
- Consumes: `apiClient` from `@/shared/api/client`; everything in `@/features/route-simulation/engine` and `@/features/route-simulation/types`
- Produces:
  - `useSimulationSource(enabled: boolean)` → `UseQueryResult<SimulationSource>`, key `['route-simulation', 'source']`
  - `useScenarios(enabled: boolean)` → `UseQueryResult<ScenarioSummary[]>`, key `['route-simulation', 'scenarios']`
  - `useScenario(id: string | null)` → `UseQueryResult<ScenarioDetail>`, key `['route-simulation', 'scenarios', id]`
  - `useCreateScenario()`, `useUpdateScenario()`, `useDeleteScenario()`
  - `ReducerState = { sim: SimState; dirty: boolean; source: SimulationSource }`, `simReducer(state, action)`, `initReducer(source)`, `SimAction` (union below)

- [ ] **Step 1: Write the failing hook test** (same pattern as `useVendorGroups.spec.ts`)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  useCreateScenario,
  useDeleteScenario,
  useScenario,
  useScenarios,
  useSimulationSource,
  useUpdateScenario,
} from './useRouteSimulation'

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() }))
jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
}))

beforeEach(() => jest.clearAllMocks())
const lastQuery = () => (useQuery as jest.Mock).mock.calls.at(-1)[0]
const lastMutation = () => (useMutation as jest.Mock).mock.calls.at(-1)[0]

it('keys the source and scenarios under route-simulation', async () => {
  ;(useQuery as jest.Mock).mockReturnValue({})
  useSimulationSource(false)
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'source'])
  expect(lastQuery().enabled).toBe(false)
  await lastQuery().queryFn()
  expect(apiClient.get).toHaveBeenCalledWith('/route-simulation/source')
  useScenarios(true)
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'scenarios'])
})

it('only fetches a scenario once one is picked', () => {
  ;(useQuery as jest.Mock).mockReturnValue({})
  useScenario(null)
  expect(lastQuery().enabled).toBe(false)
  useScenario('s1')
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'scenarios', 's1'])
  expect(lastQuery().enabled).toBe(true)
})

it('invalidates the scenario list after every write', async () => {
  const invalidateQueries = jest.fn()
  ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
  ;(useMutation as jest.Mock).mockReturnValue({})
  useCreateScenario()
  await lastMutation().mutationFn({ name: 'A', payload: {} })
  expect(apiClient.post).toHaveBeenCalledWith('/route-simulation/scenarios', { name: 'A', payload: {} })
  lastMutation().onSuccess()
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['route-simulation', 'scenarios'] })
  useUpdateScenario()
  await lastMutation().mutationFn({ id: 's1', body: { revision: 2 } })
  expect(apiClient.patch).toHaveBeenCalledWith('/route-simulation/scenarios/s1', { revision: 2 })
  useDeleteScenario()
  await lastMutation().mutationFn('s1')
  expect(apiClient.delete).toHaveBeenCalledWith('/route-simulation/scenarios/s1')
})
```

- [ ] **Step 2: Write `hooks/useRouteSimulation.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { ScenarioDetail, ScenarioPayload, ScenarioSummary, SimulationSource } from '../types'

const KEY = ['route-simulation'] as const

export function useSimulationSource(enabled: boolean) {
  return useQuery<SimulationSource>({
    queryKey: [...KEY, 'source'],
    queryFn: () => apiClient.get('/route-simulation/source').then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useScenarios(enabled: boolean) {
  return useQuery<ScenarioSummary[]>({
    queryKey: [...KEY, 'scenarios'],
    queryFn: () => apiClient.get('/route-simulation/scenarios').then((r) => r.data),
    enabled,
    staleTime: 30 * 1000,
  })
}

export function useScenario(id: string | null) {
  return useQuery<ScenarioDetail>({
    queryKey: [...KEY, 'scenarios', id],
    queryFn: () => apiClient.get(`/route-simulation/scenarios/${id}`).then((r) => r.data),
    enabled: !!id,
    // A scenario is opened deliberately; refetching it behind the user's back would overwrite edits.
    staleTime: Infinity,
  })
}

export interface CreateScenarioBody {
  name: string
  description?: string | null
  payload: ScenarioPayload
}

export interface UpdateScenarioBody {
  revision: number
  name?: string
  description?: string | null
  payload?: ScenarioPayload
}

function useInvalidateList() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [...KEY, 'scenarios'] })
}

export function useCreateScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: (body: CreateScenarioBody) =>
      apiClient.post<ScenarioDetail>('/route-simulation/scenarios', body).then((r) => r.data),
    onSuccess,
  })
}

export function useUpdateScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScenarioBody }) =>
      apiClient.patch<ScenarioDetail>(`/route-simulation/scenarios/${id}`, body).then((r) => r.data),
    onSuccess,
  })
}

export function useDeleteScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/route-simulation/scenarios/${id}`).then((r) => r.data),
    onSuccess,
  })
}
```

- [ ] **Step 3: Write the failing reducer test**

`state/reducer.spec.ts`:

```ts
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../engine/__fixtures__/source'
import { initReducer, simReducer, ReducerState } from './reducer'

const src = fixtureSource()
const base = (): ReducerState => {
  const s = initReducer(src)
  return { ...s, sim: { ...s.sim, accounts: PROTOTYPE_ACCOUNTS } }
}

it('starts clean and marks dirty on any edit', () => {
  const s0 = initReducer(src)
  expect(s0.dirty).toBe(false)
  const s1 = simReducer(s0, { type: 'rateSet', key: 'Jabo|Aceh', value: 1 })
  expect(s1.dirty).toBe(true)
  expect(s1.sim.routes.find((r) => r.key === 'Jabo|Aceh')!.rateSpx).toBe(1)
})

it('refuses a history range whose start is after its end', () => {
  const s = simReducer(base(), { type: 'setPeriod', field: 'histStart', value: '2026-08-2H' })
  const bad = simReducer(s, { type: 'setPeriod', field: 'histEnd', value: '2026-06-1H' })
  expect(bad.sim.histEnd).toBe(s.sim.histEnd)
  expect(bad.error).toMatch(/Histori mulai/)
})

it('rebuilds lanes when the cost basis or a lane edit changes', () => {
  const s = base()
  const id = s.sim.lanes[0].id
  const edited = simReducer(s, { type: 'laneSet', id, field: 'costPerKg', value: 1 })
  expect(edited.sim.lanes.find((l) => l.id === id)!.costPerKg).toBe(1)
  const reset = simReducer(edited, { type: 'laneReset', id })
  expect(reset.sim.lanes.find((l) => l.id === id)!.costPerKg).toBe(s.sim.lanes[0].costPerKg)
  const basis = simReducer(s, { type: 'setCostBasis', value: 'all' })
  expect(basis.sim.costBasis).toBe('all')
})

it('treats typing the data value back as clearing the edit', () => {
  const s = base()
  const lane = s.sim.lanes[0]
  const out = simReducer(s, { type: 'laneSet', id: lane.id, field: 'loadKg', value: lane.db.loadKg })
  expect(out.sim.laneEdits[lane.id]).toBeUndefined()
})

it('adds and removes accounts and tranches, cleaning Coba-coba cash', () => {
  let s = base()
  s = simReducer(s, { type: 'simCash', trancheId: 'PELITA-1', value: 5 })
  s = simReducer(s, { type: 'trDel', trancheId: 'PELITA-1' })
  expect(s.sim.sim.cash['PELITA-1']).toBeUndefined()
  s = simReducer(s, { type: 'acctDel', id: 'PELITA' })
  expect(s.sim.accounts.some((a) => a.id === 'PELITA')).toBe(false)
  s = simReducer(s, { type: 'acctAdd', vendor: 'PELITA', trancheId: 'PELITA-new' })
  expect(s.sim.accounts.find((a) => a.id === 'PELITA')!.tranches[0].id).toBe('PELITA-new')
})

it('adds a custom route and rejects a duplicate', () => {
  const s = simReducer(base(), { type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 40000, overrideTon: 100 } })
  expect(s.sim.routes.at(-1)).toMatchObject({ key: 'Jabo|Manado', custom: true, overrideTon: 100 })
  const dup = simReducer(s, { type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 1, overrideTon: 1 } })
  expect(dup.error).toMatch(/sudah ada/)
})

it('seeds manual kg from the recommendation on the first edit and reverts with simAuto', () => {
  let s = base()
  const lane = s.sim.lanes[0].id
  s = simReducer(s, { type: 'simKg', id: lane, value: 9 })
  expect(s.sim.sim.kg![lane]).toBe(9)
  expect(Object.keys(s.sim.sim.kg!).length).toBeGreaterThan(1)
  s = simReducer(s, { type: 'simAuto' })
  expect(s.sim.sim.kg).toBeNull()
})

it('loads a scenario clean and marks saved clean', () => {
  const s = simReducer(base(), { type: 'rateSet', key: 'Jabo|Aceh', value: 1 })
  const loaded = simReducer(s, { type: 'load', sim: initReducer(src).sim })
  expect(loaded.dirty).toBe(false)
  expect(simReducer(s, { type: 'markSaved' }).dirty).toBe(false)
})
```

- [ ] **Step 4: Write `state/reducer.ts`**

```ts
import {
  buildLanes,
  createState,
  emptyTranche,
  histPeriodsOf,
  laneOf,
  optimizePlan,
  routeKey,
  simOpts,
  trancheOf,
} from '../engine'
import { CostBasis, LaneEdit, SimRoute, SimState, SimulationSource, Slot, Tranche } from '../types'

export interface ReducerState {
  source: SimulationSource
  sim: SimState
  dirty: boolean
  error: string | null // one-shot message for the flash toast; cleared by the next action
}

type TrancheField = 'label' | 'amount' | 'cofType' | 'cofValue' | 'cofUnit' | 'cycleDays'

export type SimAction =
  | { type: 'load'; sim: SimState }
  | { type: 'markSaved' }
  | { type: 'setPeriod'; field: 'histStart' | 'histEnd'; value: string }
  | { type: 'setCostBasis'; value: CostBasis }
  | { type: 'acctAdd'; vendor: string; trancheId: string }
  | { type: 'acctSet'; id: string; field: 'enabled' | 'isEsp'; value: boolean }
  | { type: 'acctDel'; id: string }
  | { type: 'trAdd'; accountId: string; trancheId: string }
  | { type: 'trSet'; trancheId: string; field: TrancheField; value: string | number }
  | { type: 'trDel'; trancheId: string }
  | { type: 'laneSet'; id: string; field: 'costPerKg' | 'loadKg'; value: number | null }
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
  return { source, sim: sim ?? createState(source), dirty: false, error: null }
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

function apply(source: SimulationSource, sim: SimState, a: SimAction): SimState | string {
  switch (a.type) {
    case 'setPeriod': {
      const next = { ...sim, [a.field]: a.value }
      if (!histPeriodsOf(next).length) return 'Histori mulai harus sebelum atau sama dengan histori akhir'
      return rebuild(source, next)
    }
    case 'setCostBasis':
      return rebuild(source, { ...sim, costBasis: a.value })
    case 'acctAdd':
      if (sim.accounts.some((x) => x.id === a.vendor)) return sim
      return {
        ...sim,
        accounts: [...sim.accounts, { id: a.vendor, name: a.vendor, isEsp: a.vendor === 'ESP', enabled: true, tranches: [emptyTranche(a.trancheId, 'Modal 1')] }],
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
      return setLaneEdit(source, sim, a.id, { costPerKg: null, loadKg: null })
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
  if (action.type === 'load') return { ...state, sim: action.sim, dirty: false, error: null }
  if (action.type === 'markSaved') return { ...state, dirty: false, error: null }
  const out = apply(state.source, state.sim, action)
  if (typeof out === 'string') return { ...state, error: out }
  return { ...state, sim: out, dirty: out !== state.sim || state.dirty, error: null }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation/hooks src/features/route-simulation/state`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/route-simulation/hooks apps/frontend/src/features/route-simulation/state
git commit -m "$(cat <<'EOF'
feat(route-sim): add data hooks and the simulation reducer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared UI pieces, page shell, tab navigation, sidebar

**Files:**
- Create: `apps/frontend/src/features/route-simulation/utils/format.ts`
- Create: `apps/frontend/src/features/route-simulation/components/ui.tsx`
- Create: `apps/frontend/src/features/route-simulation/components/RouteSimulationView.tsx`
- Create: `apps/frontend/src/app/(dashboard)/route-simulation/page.tsx`
- Modify: `apps/frontend/src/components/layout/sidebar.tsx` (after the Vendor Group link; add `Calculator` to the lucide import)
- Test: `apps/frontend/src/features/route-simulation/utils/format.spec.ts`
- Test: `apps/frontend/src/features/route-simulation/components/RouteSimulationView.spec.tsx`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `fmtShort(n)`, `fmtPct(ratio)`, `fmtNum(n)`, `fmtIdr(n)`, `toneClass(n)`
  - Components: `Signed({ value })`, `RouteChip({ route })`, `EspTag({ account })`, `Tag({ tone?: 'esp'|'best'|'warn'|'plain', children })`, `Kpi({ label, value, tone? })`, `NumInput({ value, onCommit, step?, min?, className?, edited?, ariaLabel, disabled? })` (commits on blur/Enter, like the prototype's `change` event), `RouteFilterBar({ source, value, onChange })`, `ScopePicker({ source, sim, scope, onChange })`
  - `TabProps = { source: SimulationSource; sim: SimState; dispatch: React.Dispatch<SimAction> }`
  - `TAB_IDS = ['setup','smu','rate','history','routes','compare','actual','distribute','sim'] as const`

- [ ] **Step 1: Write the failing format test**

```ts
import { fmtIdr, fmtPct, fmtShort } from './format'

it('formats like the prototype', () => {
  expect(fmtShort(1_200_000_000)).toBe('1,2 M')
  expect(fmtShort(800_000)).toBe('800.000')
  expect(fmtShort(15_500_000)).toBe('15,5 jt')
  expect(fmtPct(0.1234)).toBe('12,3%')
  expect(fmtIdr(-1500)).toBe('-Rp 1.500')
})
```

- [ ] **Step 2: Write `utils/format.ts`**

```ts
// Ported from the prototype (lines 697–705) so every tab reads the same as the HTML it replaces.
export const fmtNum = (n: number) => Math.round(Number(n) || 0).toLocaleString('id-ID')
export const fmtIdr = (n: number) => (n < 0 ? '-' : '') + 'Rp ' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('id-ID')
export const fmtPct = (ratio: number) => (ratio * 100).toFixed(1).replace('.', ',') + '%'
export function fmtShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
  if (a >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'
  return fmtNum(n)
}
export const toneClass = (n: number) => (n < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')
```

- [ ] **Step 3: Write `components/ui.tsx`**

```tsx
'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Account, Scope, SimRoute, SimState, SimulationSource } from '../types'
import { NO_GROUP, groupNames, groupsOfRoute, routeKey, routeLabel } from '../engine'
import { SimAction } from '../state/reducer'
import { fmtIdr, toneClass } from '../utils/format'

export interface TabProps {
  source: SimulationSource
  sim: SimState
  dispatch: React.Dispatch<SimAction>
}

export const TAB_IDS = ['setup', 'smu', 'rate', 'history', 'routes', 'compare', 'actual', 'distribute', 'sim'] as const
export type TabId = (typeof TAB_IDS)[number]

export const Signed = ({ value }: { value: number }) => <span className={toneClass(value)}>{fmtIdr(value)}</span>

export const RouteChip = ({ route }: { route: Pick<SimRoute, 'originLabel' | 'dest'> }) => (
  <span className="whitespace-nowrap font-mono font-semibold">{routeLabel(route)}</span>
)

const TAG_TONES = {
  plain: 'border-border text-foreground',
  esp: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400',
  best: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
  warn: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
}

export const Tag = ({ tone = 'plain', children }: { tone?: keyof typeof TAG_TONES; children: React.ReactNode }) => (
  <span className={cn('inline-block whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold', TAG_TONES[tone])}>{children}</span>
)

export const EspTag = ({ account }: { account?: Account }) => (account?.isEsp ? <> <Tag tone="esp">ESP</Tag></> : null)

export const Kpi = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: number }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={cn('text-base font-semibold tabular-nums [overflow-wrap:anywhere]', tone != null && toneClass(tone))}>{value}</div>
  </div>
)

export const Hint = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn('text-xs text-muted-foreground', className)}>{children}</p>
)

// Commits on blur or Enter, never per keystroke: each commit can re-run the LP, and the prototype
// used the `change` event for the same reason. Local text state lets the user clear the field.
export function NumInput({
  value, onCommit, step = 1, min = 0, className, edited, ariaLabel, disabled, placeholder,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  step?: number
  min?: number
  className?: string
  edited?: boolean
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const next = text.trim() === '' ? null : Number(text)
    if (next !== null && Number.isNaN(next)) return setText(value == null ? '' : String(value))
    if (next !== value) onCommit(next)
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      step={step}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'h-8 rounded border border-input bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        edited && 'border-amber-500',
        className,
      )}
    />
  )
}

export interface RouteFilter {
  group: string // 'all' | group id | NO_GROUP.id
  q: string
}

export function visibleRoutes(source: SimulationSource, sim: SimState, f: RouteFilter): SimRoute[] {
  const q = f.q.trim().toLowerCase()
  const inGroup = (r: SimRoute) =>
    f.group === 'all' ||
    (f.group === NO_GROUP.id ? !groupsOfRoute(source, r.key).length : groupsOfRoute(source, r.key).some((g) => g.id === f.group))
  return sim.routes.filter((r) => inGroup(r) && (!q || routeLabel(r).toLowerCase().includes(q)))
}

export function RouteFilterBar({ source, value, onChange }: { source: SimulationSource; value: RouteFilter; onChange: (f: RouteFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Grup rute"
        className="h-8 rounded border border-input bg-background px-2 text-sm"
        value={value.group}
        onChange={(e) => onChange({ ...value, group: e.target.value })}
      >
        <option value="all">Semua grup rute</option>
        {source.routeGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        <option value={NO_GROUP.id}>{NO_GROUP.name}</option>
      </select>
      <input
        type="search"
        aria-label="Cari rute"
        placeholder="Cari rute"
        className="h-8 rounded border border-input bg-background px-2 text-sm"
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
      />
    </div>
  )
}

export function ScopePicker({ source, sim, scope, onChange }: { source: SimulationSource; sim: SimState; scope: Scope; onChange: (s: Scope) => void }) {
  const toggle = (kind: 'groups' | 'routes', id: string, on: boolean) => {
    const next = new Set(scope[kind])
    if (on) next.add(id)
    else next.delete(id)
    onChange({ ...scope, [kind]: next })
  }
  const nG = source.routeGroups.filter((g) => scope.groups.has(g.id)).length
  const nR = sim.routes.filter((r) => scope.routes.has(r.key)).length
  return (
    <details className="w-full">
      <summary className="inline-block cursor-pointer rounded border border-input px-2.5 py-1 text-sm">
        Grup rute: {nG} dari {source.routeGroups.length} · Rute satu-satu: {nR} dari {sim.routes.length}
      </summary>
      <div className="mt-3 grid gap-5 border-t pt-3 md:grid-cols-3">
        <fieldset>
          <legend className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Grup rute</legend>
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded border px-2 py-0.5 text-sm" onClick={() => onChange({ ...scope, groups: new Set(source.routeGroups.map((g) => g.id)) })}>Semua grup</button>
            <button type="button" className="rounded border px-2 py-0.5 text-sm" onClick={() => onChange({ ...scope, groups: new Set() })}>Kosongkan</button>
          </div>
          {source.routeGroups.length ? source.routeGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={scope.groups.has(g.id)} onChange={(e) => toggle('groups', g.id, e.target.checked)} />
              {g.name} <span className="text-xs text-muted-foreground">{sim.routes.filter((r) => g.routes.some((x) => routeKey(x) === r.key)).length} rute</span>
            </label>
          )) : <Hint>Belum ada grup rute.</Hint>}
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Rute satu-satu</legend>
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded border px-2 py-0.5 text-sm" onClick={() => onChange({ ...scope, routes: new Set(sim.routes.map((r) => r.key)) })}>Semua rute</button>
            <button type="button" className="rounded border px-2 py-0.5 text-sm" onClick={() => onChange({ ...scope, routes: new Set() })}>Kosongkan</button>
          </div>
          <div className="grid gap-x-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
            {sim.routes.map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={scope.routes.has(r.key)} onChange={(e) => toggle('routes', r.key, e.target.checked)} />
                <RouteChip route={r} /> <span className="text-xs text-muted-foreground">{groupNames(source, r.key)}</span>
              </label>
            ))}
          </div>
          <Hint className="mt-2">Rute yang sudah tampil lewat grup yang dicentang tidak diulang di bagian Rute pilihan.</Hint>
        </fieldset>
      </div>
    </details>
  )
}

// Shared table styles, matching the prototype's .grid-t.
export const TH = 'whitespace-nowrap border-b bg-muted px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
export const THN = cn(TH, 'text-right')
export const TD = 'border-b px-2.5 py-1.5 align-middle'
export const TDN = cn(TD, 'whitespace-nowrap text-right tabular-nums')
export const ROW_BAND = 'bg-muted font-semibold [&>td]:border-t'
export const ROW_GROUP = 'bg-border font-bold'
export const ROW_SUBTOTAL = 'bg-muted/50 font-semibold'
export const ROW_GRAND = 'bg-foreground font-semibold text-background [&_span]:!text-background'
```

- [ ] **Step 4: Write `RouteSimulationView.tsx` (shell; tabs filled in by Tasks 3–6)**

```tsx
'use client'

import React, { useEffect, useReducer, useState } from 'react'
import { cn } from '@/lib/utils'
import { SimulationSource } from '../types'
import { initReducer, simReducer } from '../state/reducer'
import { histDays, periodShort } from '../engine'
import { TAB_IDS, TabId } from './ui'
import { ScenarioBar } from './ScenarioBar'
import { SetupTab } from './tabs/SetupTab'
import { LanesTab } from './tabs/LanesTab'
import { RateTab } from './tabs/RateTab'
import { HistoryTab } from './tabs/HistoryTab'
import { RoutesTab } from './tabs/RoutesTab'
import { CompareTab } from './tabs/CompareTab'
import { ActualTab } from './tabs/ActualTab'
import { OptimalTab } from './tabs/OptimalTab'
import { SimTab } from './tabs/SimTab'

const TAB_LABELS: Record<TabId, string> = {
  setup: '1 · Setup Histori & Akun',
  smu: '2 · SMU Rute',
  rate: '3 · Rate Card SPX',
  history: '4 · Historical PnL',
  routes: '5 · Rute & Slot Time',
  compare: '6 · Perbandingan per Rute',
  actual: '7 · Distribusi Aktual',
  distribute: '8 · Distribusi Optimal',
  sim: '9 · Coba-coba',
}

export function RouteSimulationView({ source }: { source: SimulationSource }) {
  const [state, dispatch] = useReducer(simReducer, source, (s) => initReducer(s))
  const [tab, setTab] = useState<TabId>('setup')
  const [flash, setFlash] = useState<string | null>(null)
  const { sim } = state

  useEffect(() => {
    if (!state.error) return
    setFlash(state.error)
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [state.error])

  useEffect(() => {
    if (!state.dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.dirty])

  const props = { source, sim, dispatch }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulasi Rekomendasi Rute</h1>
          <p className="text-sm text-muted-foreground">Distribusi modal vendor ke rute dan airlines, dihitung per hari.</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          Histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)}
          <br />Rata-rata tonase dari {histDays(sim)} hari histori
        </p>
      </div>
      <ScenarioBar state={state} dispatch={dispatch} onFlash={setFlash} />
      <nav aria-label="Tab simulasi" className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b bg-background">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => { setTab(id); window.scrollTo(0, 0) }}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium',
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>
      <section className="space-y-4">
        {tab === 'setup' && <SetupTab {...props} />}
        {tab === 'smu' && <LanesTab {...props} />}
        {tab === 'rate' && <RateTab {...props} />}
        {tab === 'history' && <HistoryTab {...props} />}
        {tab === 'routes' && <RoutesTab {...props} />}
        {tab === 'compare' && <CompareTab {...props} />}
        {tab === 'actual' && <ActualTab {...props} />}
        {tab === 'distribute' && <OptimalTab {...props} onOpenSim={() => setTab('sim')} />}
        {tab === 'sim' && <SimTab {...props} />}
      </section>
      {flash && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-40 max-w-sm rounded-md bg-foreground px-3.5 py-2.5 text-sm text-background">
          {flash}
        </div>
      )}
    </div>
  )
}
```

So the shell compiles before Tasks 3–6, create each tab file with a temporary stub. **All of these stubs get replaced in Tasks 3–6, and none may survive the final commit (Task 7 Step 4 checks this):**

```tsx
// apps/frontend/src/features/route-simulation/components/tabs/<Name>Tab.tsx — temporary
import { TabProps } from '../ui'
export function SetupTab(_: TabProps) { return null }
```

(The same goes for `LanesTab`, `RateTab`, `HistoryTab`, `RoutesTab`, `CompareTab`, `ActualTab`, `SimTab`; `OptimalTab` takes `TabProps & { onOpenSim: () => void }`.) `ScenarioBar` gets the same stub: `export function ScenarioBar(_: { state: ReducerState; dispatch: React.Dispatch<SimAction>; onFlash: (m: string) => void }) { return null }`.

- [ ] **Step 5: Write the page**

`app/(dashboard)/route-simulation/page.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useSimulationSource } from '@/features/route-simulation/hooks/useRouteSimulation'
import { RouteSimulationView } from '@/features/route-simulation/components/RouteSimulationView'

export default function RouteSimulationPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const canRead = !loading && !!user && hasPermission('read.route_simulation')
  const { data: source, isLoading, isError } = useSimulationSource(canRead)

  useEffect(() => {
    if (!loading && user && !hasPermission('read.route_simulation')) router.replace('/dashboard')
  }, [loading, user, hasPermission, router])

  if (!canRead) return null
  if (isLoading) return <p className="text-muted-foreground">Loading...</p>
  if (isError || !source) return <p className="text-red-700">Gagal memuat data simulasi. Muat ulang halaman.</p>
  if (!source.cycles.length) return <p className="text-muted-foreground">Belum ada data PnL untuk disimulasikan.</p>
  return <RouteSimulationView source={source} />
}
```

- [ ] **Step 6: Add the sidebar link**

In `apps/frontend/src/components/layout/sidebar.tsx`, add `Calculator,` to the `lucide-react` import, then right after the `read.vendor_group` block:

```tsx
            {hasPermission('read.route_simulation') && (
              <NavLink
                href="/route-simulation"
                icon={<Calculator size={16} />}
                label="Simulasi Rute"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
```

- [ ] **Step 7: Write the shell test**

`components/RouteSimulationView.spec.tsx`:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../engine/__fixtures__/source'
import { RouteSimulationView } from './RouteSimulationView'

jest.mock('./ScenarioBar', () => ({ ScenarioBar: () => null }))

it('opens on Setup and switches tabs', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByRole('button', { name: '1 · Setup Histori & Akun' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: '8 · Distribusi Optimal' }))
  expect(screen.getByRole('button', { name: '8 · Distribusi Optimal' })).toHaveAttribute('aria-current', 'page')
})

it('shows the history range in the header', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByText(/Histori Jun 2026 H1 s.d. Agu 2026 H2/)).toBeInTheDocument()
  expect(screen.getByText(/Rata-rata tonase dari 90 hari histori/)).toBeInTheDocument()
})
```

- [ ] **Step 8: Run tests + typecheck**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation && pnpm exec tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/route-simulation apps/frontend/src/app/\(dashboard\)/route-simulation apps/frontend/src/components/layout/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(route-sim): add the simulation page shell, tabs and menu entry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tabs 1–3 (Setup, SMU Rute, Rate Card) + scenario bar

**Files:**
- Replace stub: `components/tabs/SetupTab.tsx`, `components/tabs/LanesTab.tsx`, `components/tabs/RateTab.tsx`, `components/ScenarioBar.tsx`
- Test: `components/tabs/SetupTab.spec.tsx`, `components/tabs/LanesTab.spec.tsx`, `components/ScenarioBar.spec.tsx`

**Interfaces:**
- Consumes: Tasks 1–2; `trancheBudget`, `trancheCofPerDay`, `laneMargin`, `routeDemand`, `accountOf`, `groupNames`, `periodShort`, `toPayloadWithSource`, `fromPayload` from the engine; `useScenarios/useScenario/useCreateScenario/useUpdateScenario/useDeleteScenario`
- Produces: the components above. `ScenarioBar` props: `{ state: ReducerState; dispatch; onFlash(msg) }`

UI reference: prototype `renderSetup` (lines 841–864) + `accountCard` (804–839), `renderLanes` (917–963), `renderRate` (987–1004). Keep the structure and copy the same, swap `data-change` for `NumInput onCommit` / `onChange`, and swap `confirm()` for `window.confirm` with the same text.

- [ ] **Step 1: Write the failing SetupTab test**

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { SetupTab } from './SetupTab'

const src = fixtureSource()

it('edits a tranche amount through the reducer on blur', () => {
  const dispatch = jest.fn()
  render(<SetupTab source={src} sim={createState(src)} dispatch={dispatch} />)
  const input = screen.getAllByLabelText('Nominal modal')[0]
  fireEvent.change(input, { target: { value: '5000000' } })
  fireEvent.blur(input)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'trSet', field: 'amount', value: 5000000 }))
})

it('offers only vendors that are not accounts yet', () => {
  const sim = createState(src)
  render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  const options = Array.from((screen.getByLabelText('Vendor untuk akun baru') as HTMLSelectElement).options).map((o) => o.value)
  expect(options).toEqual(['AURI'])
})

it('shows the daily allowance hint per tranche', () => {
  const sim = createState(src)
  sim.accounts[0].tranches[0].amount = 3_000_000
  render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getAllByText(/boleh dipakai Rp 100\.000 \/ hari/)[0]).toBeInTheDocument()
})
```

- [ ] **Step 2: Write `SetupTab.tsx`**

```tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DAYS_PER_MONTH, cycleDays, histDays, periodShort, trancheBudget, trancheCofPerDay } from '../../engine'
import { Account } from '../../types'
import { fmtIdr, fmtShort } from '../../utils/format'
import { Hint, NumInput, Tag, TabProps, TD, TDN, TH, THN, ROW_SUBTOTAL } from '../ui'

let seq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

function AccountCard({ account: a, dispatch }: { account: Account } & Pick<TabProps, 'dispatch'>) {
  const totalModal = a.tranches.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const totalCof = a.tranches.reduce((s, t) => s + trancheCofPerDay(t) * DAYS_PER_MONTH, 0)
  const set = (trancheId: string, field: 'label' | 'amount' | 'cofType' | 'cofValue' | 'cofUnit' | 'cycleDays', value: string | number) =>
    dispatch({ type: 'trSet', trancheId, field, value })
  return (
    <div className="rounded-md border bg-card" style={a.enabled ? undefined : { opacity: 0.6 }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{a.name}</h3>
        {a.isEsp && <Tag tone="esp">ESP · cashback 2% (tetap)</Tag>}
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={a.enabled} onChange={(e) => dispatch({ type: 'acctSet', id: a.id, field: 'enabled', value: e.target.checked })} /> Ikut simulasi
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={a.isEsp} onChange={(e) => dispatch({ type: 'acctSet', id: a.id, field: 'isEsp', value: e.target.checked })} /> Akun ESP
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{a.tranches.length} modal, total {fmtIdr(totalModal)}</span>
        <Button
          variant="outline"
          size="sm"
          className="text-red-700"
          onClick={() => {
            if (window.confirm(`Hapus akun ${a.name}? Airlines miliknya di tab 2 tetap tampil dari data AWB tetapi tidak ikut dihitung.`)) dispatch({ type: 'acctDel', id: a.id })
          }}
        >
          Hapus Akun
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Label modal</th><th className={THN}>Modal (Rp)</th><th className={TH}>Tipe COF</th><th className={THN}>Nilai COF</th>
              <th className={TH}>Satuan COF</th><th className={THN}>Siklus bayar (hari)</th><th className={THN}>COF / 30 hari</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {a.tranches.length ? a.tranches.map((t) => (
              <tr key={t.id}>
                <td className={TD}>
                  <input aria-label="Label modal" className="h-8 w-40 rounded border border-input bg-background px-2 text-sm" defaultValue={t.label} onBlur={(e) => set(t.id, 'label', e.target.value)} />
                </td>
                <td className={TDN}>
                  <NumInput ariaLabel="Nominal modal" className="w-36" step={1_000_000} value={t.amount} onCommit={(v) => set(t.id, 'amount', v ?? 0)} />
                  <div className="text-xs text-muted-foreground">Rp {fmtShort(t.amount)}</div>
                </td>
                <td className={TD}>
                  <select aria-label="Tipe COF" className="h-8 rounded border border-input bg-background px-2 text-sm" value={t.cofType} onChange={(e) => set(t.id, 'cofType', e.target.value)}>
                    <option value="percent">Persen (%)</option><option value="nominal">Nominal (Rp)</option>
                  </select>
                </td>
                <td className={TDN}><NumInput ariaLabel="Nilai COF" className="w-24" step={0.01} value={t.cofValue} onCommit={(v) => set(t.id, 'cofValue', v ?? 0)} /></td>
                <td className={TD}>
                  <select aria-label="Satuan COF" className="h-8 rounded border border-input bg-background px-2 text-sm" value={t.cofUnit} onChange={(e) => set(t.id, 'cofUnit', e.target.value)}>
                    <option value="month">per bulan</option><option value="day">per hari</option>
                  </select>
                </td>
                <td className={TDN}>
                  <NumInput ariaLabel="Siklus bayar dalam hari" className="w-16" min={1} value={cycleDays(t)} onCommit={(v) => set(t.id, 'cycleDays', v ?? 1)} />
                  <div className="text-xs text-muted-foreground">boleh dipakai {fmtIdr(trancheBudget(t).perDay)} / hari</div>
                </td>
                <td className={TDN}>{fmtIdr(trancheCofPerDay(t) * DAYS_PER_MONTH)}</td>
                <td className={TDN}>
                  <Button variant="outline" size="sm" className="text-red-700" onClick={() => {
                    if (window.confirm(`Hapus modal "${t.label}" dari akun ${a.name}?`)) dispatch({ type: 'trDel', trancheId: t.id })
                  }}>Hapus</Button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className={TD}><Hint>Belum ada modal. Akun tanpa modal tidak mendapat alokasi.</Hint></td></tr>
            )}
            <tr className={ROW_SUBTOTAL}>
              <td className={TD}>Total {a.name}</td><td className={TDN}>{fmtIdr(totalModal)}</td><td colSpan={4} className={TD} /><td className={TDN}>{fmtIdr(totalCof)}</td><td className={TD} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'trAdd', accountId: a.id, trancheId: newId(a.id) })}>+ Tambah Modal</Button>
      </div>
    </div>
  )
}

export function SetupTab({ source, sim, dispatch }: TabProps) {
  const unused = source.vendors.filter((v) => !sim.accounts.some((a) => a.id === v.vendor))
  const [pick, setPick] = useState(unused[0]?.vendor ?? '')
  const vendor = unused.some((v) => v.vendor === pick) ? pick : unused[0]?.vendor ?? ''
  return (
    <>
      <div className="rounded-md border bg-card p-4">
        <h2 className="text-base font-semibold">Rentang histori</h2>
        <Hint className="mb-3">
          Histori dipakai untuk rata-rata tonase rute per hari (tab 5) dan distribusi aktual (tab 7). Rentang sekarang {histDays(sim)} hari. Simulasi tidak memakai tanggal mulai atau horizon: semua dihitung per hari, dan modal berputar mengikuti siklus bayarnya.
        </Hint>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['histStart', 'histEnd'] as const).map((field) => (
            <label key={field} className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{field === 'histStart' ? 'Histori mulai' : 'Histori akhir'}</span>
              <select className="h-8 w-full rounded border border-input bg-background px-2 text-sm" value={sim[field]} onChange={(e) => dispatch({ type: 'setPeriod', field, value: e.target.value })}>
                {source.cycles.map((c) => <option key={c} value={c}>{periodShort(c)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Akun & Modal</h2>
          <Hint>Satu akun bisa punya banyak modal, masing-masing dengan COF dan siklus bayar sendiri. Siklus bayar = berapa hari sampai uang yang dipakai kembali. Modal yang boleh dipakai per hari = modal dibagi siklus bayar. Cashback akun ESP tetap 2% dari revenue.</Hint>
        </div>
        <div className="flex gap-2">
          <select aria-label="Vendor untuk akun baru" className="h-8 rounded border border-input bg-background px-2 text-sm" disabled={!unused.length} value={vendor} onChange={(e) => setPick(e.target.value)}>
            {unused.length ? unused.map((v) => <option key={v.vendor} value={v.vendor}>{v.vendor}</option>) : <option>Semua vendor sudah jadi akun</option>}
          </select>
          <Button size="sm" disabled={!unused.length} onClick={() => dispatch({ type: 'acctAdd', vendor, trancheId: newId(vendor) })}>+ Tambah Akun</Button>
        </div>
      </div>
      {sim.accounts.length
        ? sim.accounts.map((a) => <AccountCard key={a.id} account={a} dispatch={dispatch} />)
        : <div className="rounded-md border bg-card p-4"><Hint>Belum ada akun. Tambah akun untuk mulai simulasi.</Hint></div>}
    </>
  )
}
```

- [ ] **Step 3: Write the failing LanesTab test**

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { LanesTab } from './LanesTab'

const src = fixtureSource()

it('toggles the cost basis between SMU and all-in', () => {
  const dispatch = jest.fn()
  render(<LanesTab source={src} sim={createState(src)} dispatch={dispatch} />)
  fireEvent.click(screen.getByRole('radio', { name: /All-in/ }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'setCostBasis', value: 'all' })
})

it('warns on a lane whose vendor has no account', () => {
  const sim = createState(src)
  sim.accounts = sim.accounts.filter((a) => a.id !== 'PELITA')
  render(<LanesTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getAllByText('belum ada akun di tab 1, tidak ikut dihitung').length).toBeGreaterThan(0)
})

it('shows the data value under each editable cost', () => {
  render(<LanesTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getAllByText(/^data Rp /).length).toBeGreaterThan(0)
})
```

- [ ] **Step 4: Write `LanesTab.tsx`** (port of `renderLanes` + the cost basis toggle)

```tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { accountOf, groupNames, laneMargin, routeDemand } from '../../engine'
import { Lane } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import {
  EspTag, Hint, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, visibleRoutes,
} from '../ui'

export function LanesTab({ source, sim, dispatch }: TabProps) {
  const [filter, setFilter] = useState<RouteFilter>({ group: 'all', q: '' })
  const routes = visibleRoutes(source, sim, filter)

  const laneRow = (l: Lane) => {
    const account = accountOf(sim, l.vendor)
    return (
      <tr key={l.id} style={l.enabled ? undefined : { opacity: 0.55 }}>
        <td className={`${TD} whitespace-nowrap pl-[46px]`}>
          {l.airline}
          {!l.hasData && <> <Tag>tidak ada data di rentang histori</Tag></>}
          {!l.costKnown && <> <Tag tone="warn">cost belum ada di basis ini</Tag></>}
        </td>
        <td className={TD}>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={l.enabled} aria-label={`Ikut simulasi ${l.vendor} ${l.airline}`} onChange={(e) => dispatch({ type: 'laneToggle', id: l.id, enabled: e.target.checked })} /> Ikut
          </label>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Cost per kg ${l.vendor} ${l.airline}`} className="w-28" step={100} edited={l.edited.costPerKg} value={l.costPerKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'costPerKg', value: v })} />
          <div className="text-xs text-muted-foreground">data {fmtIdr(l.db.costPerKg)}</div>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-24" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} />
          <div className="text-xs text-muted-foreground">data {fmtNum(l.db.loadKg)} kg</div>
        </td>
        <td className={TDN}>{fmtNum(l.actualKgDay)}</td>
        <td className={TDN}>{account ? <Signed value={laneMargin(sim, l).netPerKg} /> : <span className="text-muted-foreground">-</span>}</td>
        <td className={TDN}>
          {(l.edited.costPerKg || l.edited.loadKg) && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'laneReset', id: l.id })}>Kembali ke data</Button>}
        </td>
      </tr>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-4xl">
          <h2 className="text-base font-semibold">SMU Rute</h2>
          <Hint>Patokan rute. Daftar vendor dan airlines di tiap rute diambil dari data AWB (vendor, airlines, berat, cost) pada rentang histori tab 1, jadi tidak perlu ditambah manual. Cost/kg dari data = total cost dibagi total berat, hanya dari AWB yang sudah dibooking dan cost-nya bukan estimasi. Data AWB tidak memuat kapasitas maskapai, jadi load awal = kg per hari tertinggi yang pernah tercapai dalam satu periode.</Hint>
          <Hint>Cost dan load boleh diubah untuk mencoba; nilai yang diubah bergaris oranye dan bisa dikembalikan ke data. Hapus centang Ikut bila suatu airlines tidak boleh dipakai. Margin/kg = Rate SPX - cost maskapai, ditambah cashback 2% untuk akun ESP.</Hint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <fieldset className="flex items-center gap-3 text-sm">
            <legend className="sr-only">Basis cost</legend>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Basis cost</span>
            <label className="inline-flex items-center gap-1"><input type="radio" name="cost-basis" checked={sim.costBasis === 'smu'} onChange={() => dispatch({ type: 'setCostBasis', value: 'smu' })} /> SMU saja</label>
            <label className="inline-flex items-center gap-1"><input type="radio" name="cost-basis" checked={sim.costBasis === 'all'} onChange={() => dispatch({ type: 'setCostBasis', value: 'all' })} /> All-in (SMU + RA + SG)</label>
          </fieldset>
          <RouteFilterBar source={source} value={filter} onChange={setFilter} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr><th className={TH}>Vendor / Airlines</th><th className={TH}>Ikut simulasi</th><th className={THN}>Cost / kg</th><th className={THN}>Load / hari (kg)</th><th className={THN}>Aktual / hari (kg)</th><th className={THN}>Margin / kg</th><th className={TH} /></tr>
          </thead>
          <tbody>
            {routes.length ? routes.map((r) => {
              const lanes = sim.lanes.filter((l) => l.route === r.key)
              const vendors = [...new Set(lanes.map((l) => l.vendor))]
              return (
                <React.Fragment key={r.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={7} className={TD}>
                      <RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rate SPX {fmtIdr(r.rateSpx)}/kg · Tonase {fmtNum(routeDemand(source, sim, r.key))} kg/hari · {vendors.length} vendor, {lanes.length} airlines</span>
                    </td>
                  </tr>
                  {vendors.length ? vendors.map((v) => {
                    const account = accountOf(sim, v)
                    const mine = lanes.filter((l) => l.vendor === v)
                    return (
                      <React.Fragment key={v}>
                        <tr className="font-semibold">
                          <td colSpan={7} className={`${TD} pl-7`}>
                            {account?.name ?? v}<EspTag account={account} /> <span className="text-xs font-normal text-muted-foreground">{mine.length} airlines</span>
                            {!account && <> <Tag tone="warn">belum ada akun di tab 1, tidak ikut dihitung</Tag></>}
                            {account && !account.enabled && <> <Tag>akun tidak ikut simulasi</Tag></>}
                          </td>
                        </tr>
                        {mine.map(laneRow)}
                      </React.Fragment>
                    )
                  }) : <tr><td colSpan={7} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </React.Fragment>
              )
            }) : <tr><td colSpan={7} className={TD}><Hint>Tidak ada rute pada filter ini.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Write `RateTab.tsx`**

```tsx
'use client'

import React from 'react'
import { groupNames, routeLabel } from '../../engine'
import { Hint, NumInput, RouteChip, TabProps, TD, TDN, TH, THN } from '../ui'

export function RateTab({ source, sim, dispatch }: TabProps) {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Rate Card SPX</h2>
        <Hint>Rate per kg yang dibayar SPX, sudah dipotong PPh 2% dan diskon 1,5% dari master rute. Dipakai sebagai revenue per kg di tab 2, 6, 8, dan 9.</Hint>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Rute</th><th className={TH}>Grup rute</th><th className={THN}>Rate SPX (Rp/kg)</th></tr></thead>
          <tbody>
            {sim.routes.map((r) => {
              const master = source.routes.find((x) => x.origin === r.origin && x.dest === r.dest)
              return (
                <tr key={r.key}>
                  <td className={TD}><RouteChip route={r} /></td>
                  <td className={`${TD} text-xs text-muted-foreground`}>{groupNames(source, r.key)}</td>
                  <td className={TDN}>
                    <NumInput ariaLabel={`Rate SPX ${routeLabel(r)}`} className="w-32" step={100} value={r.rateSpx} onCommit={(v) => dispatch({ type: 'rateSet', key: r.key, value: v ?? 0 })} />
                    {master?.rateSpx == null && !r.custom && <div className="text-xs text-red-700">rate belum ada di master rute</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Write the failing ScenarioBar test**

```tsx
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../engine/__fixtures__/source'
import { initReducer } from '../state/reducer'
import { ScenarioBar } from './ScenarioBar'
import * as hooks from '../hooks/useRouteSimulation'

jest.mock('../hooks/useRouteSimulation')
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))

const create = jest.fn()
const update = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  ;(hooks.useScenarios as jest.Mock).mockReturnValue({ data: [{ id: 's1', name: 'Baseline', description: null, revision: 2, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'faris' }] })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: undefined })
  ;(hooks.useCreateScenario as jest.Mock).mockReturnValue({ mutateAsync: create.mockResolvedValue({ id: 's2', revision: 1, name: 'Baru' }), isPending: false })
  ;(hooks.useUpdateScenario as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false })
  ;(hooks.useDeleteScenario as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
})

it('saves a new scenario with the full payload and marks the state clean', async () => {
  const dispatch = jest.fn()
  jest.spyOn(window, 'prompt').mockReturnValue('Baru')
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={dispatch} onFlash={jest.fn()} />)
  expect(screen.getByText('Belum disimpan')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sebagai…' }))
  await waitFor(() => expect(create).toHaveBeenCalled())
  expect(create.mock.calls[0][0]).toMatchObject({ name: 'Baru', payload: { version: 1, costBasis: 'smu' } })
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'markSaved' }))
})

it('reports a stale save instead of overwriting', async () => {
  const onFlash = jest.fn()
  jest.spyOn(window, 'confirm').mockReturnValue(true) // switching away from a dirty state asks first
  update.mockRejectedValueOnce({ response: { status: 409, data: { message: 'stale' } } })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: null } })
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={jest.fn()} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith(expect.stringMatching(/disimpan orang lain/)))
})
```

- [ ] **Step 7: Write `ScenarioBar.tsx`**

```tsx
'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { fromPayload, toPayloadWithSource } from '../engine'
import { ReducerState, SimAction } from '../state/reducer'
import {
  useCreateScenario, useDeleteScenario, useScenario, useScenarios, useUpdateScenario,
} from '../hooks/useRouteSimulation'
import { Tag } from './ui'

type ApiError = { response?: { status?: number; data?: { message?: string | string[] } } }
const messageOf = (err: unknown) => {
  const m = (err as ApiError)?.response?.data?.message
  return Array.isArray(m) ? m.join(', ') : m ?? 'Gagal menyimpan skenario'
}

export function ScenarioBar({ state, dispatch, onFlash }: { state: ReducerState; dispatch: React.Dispatch<SimAction>; onFlash: (msg: string) => void }) {
  const { hasPermission } = usePermissions()
  const [openId, setOpenId] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const list = useScenarios(true)
  const detail = useScenario(openId)
  const create = useCreateScenario()
  const update = useUpdateScenario()
  const remove = useDeleteScenario()

  // Opening a scenario replaces the working state once, when its payload arrives.
  useEffect(() => {
    const d = detail.data
    if (!d || d.id !== openId) return
    setRevision(d.revision)
    if (d.payload) dispatch({ type: 'load', sim: fromPayload(state.source, d.payload) })
    // openId is a dep because a cached detail can already be present when the user picks it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, detail.data?.id, detail.data?.revision])

  const current = list.data?.find((s) => s.id === openId)
  const payload = () => toPayloadWithSource(state.source, state.sim)

  const pick = (id: string) => {
    if (state.dirty && !window.confirm('Perubahan yang belum disimpan akan hilang. Lanjut?')) return
    setOpenId(id || null)
    setRevision(null)
  }

  const saveAs = async () => {
    const name = window.prompt('Nama skenario', current ? `${current.name} (salinan)` : '')?.trim()
    if (!name) return
    try {
      const saved = await create.mutateAsync({ name, payload: payload() })
      setOpenId(saved.id)
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash(`Skenario "${name}" disimpan`)
    } catch (err) {
      onFlash(messageOf(err))
    }
  }

  const save = async () => {
    if (!openId || revision == null) return saveAs()
    try {
      const saved = await update.mutateAsync({ id: openId, body: { revision, payload: payload() } })
      setRevision(saved.revision)
      dispatch({ type: 'markSaved' })
      onFlash('Skenario disimpan')
    } catch (err) {
      if ((err as ApiError)?.response?.status === 409) {
        onFlash('Skenario ini sudah disimpan orang lain setelah kamu membukanya. Buka ulang skenario, atau simpan sebagai skenario baru.')
      } else onFlash(messageOf(err))
    }
  }

  const del = async () => {
    if (!current || !window.confirm(`Hapus skenario "${current.name}"?`)) return
    await remove.mutateAsync(current.id)
    setOpenId(null)
    setRevision(null)
    onFlash('Skenario dihapus')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Skenario</span>
        <select aria-label="Skenario" className="h-8 min-w-48 rounded border border-input bg-background px-2 text-sm" value={openId ?? ''} onChange={(e) => pick(e.target.value)}>
          <option value="">Baru (belum disimpan)</option>
          {list.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {current && <span className="text-xs text-muted-foreground">diubah {new Date(current.updatedAt).toLocaleString('id-ID')}{current.updatedBy ? ` oleh ${current.updatedBy}` : ''}</span>}
      {state.dirty && <Tag tone="warn">Belum disimpan</Tag>}
      <div className="ml-auto flex gap-2">
        {openId && hasPermission('update.route_simulation') && (
          <Button size="sm" onClick={save} disabled={update.isPending || !state.dirty}>Simpan</Button>
        )}
        {hasPermission('create.route_simulation') && (
          <Button size="sm" variant="outline" onClick={saveAs} disabled={create.isPending}>Simpan sebagai…</Button>
        )}
        {openId && hasPermission('delete.route_simulation') && (
          <Button size="sm" variant="outline" className="text-red-700" onClick={del} disabled={remove.isPending}>Hapus</Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation && pnpm exec tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "$(cat <<'EOF'
feat(route-sim): build setup, lanes and rate card tabs with scenario saving

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tabs 4–5 (Historical PnL + PDF, Rute & Slot Time)

**Files:**
- Replace stub: `components/tabs/HistoryTab.tsx`, `components/tabs/RoutesTab.tsx`
- Create: `utils/historyPdf.ts`
- Modify: `apps/frontend/package.json` (add `jspdf`, `jspdf-autotable`)
- Test: `components/tabs/HistoryTab.spec.tsx`, `components/tabs/RoutesTab.spec.tsx`

**Interfaces:**
- Consumes: `consolidateHistory`, `historyDetailByPeriod`, `defaultScope`, `UNBOOKED_LABEL`, `vendorLabel`, `routeHistTon`, `hasOverride`, `periodShort`, `DAYS_PER_PERIOD`
- Produces: `exportHistoryPdf(args: { consolidated; detail; periods: string[]; vendors: string[] }): Promise<void>`; `unitVal(x, weight, n, unit)`

UI reference: prototype `renderHistory` (1099–1146), `exportHistoryPDF` (1148–1212), `renderRoutes` + `slotEditor` (1010–1060).

- [ ] **Step 1: Install the PDF dependencies**

Run: `cd apps/frontend && pnpm add jspdf@^3.0.4 jspdf-autotable@^5.0.8`
Expected: both land in `dependencies`. jspdf-autotable 5 uses the function API `autoTable(doc, opts)`, not `doc.autoTable(...)` (the prototype used v3).

- [ ] **Step 2: Write the failing HistoryTab test**

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { HistoryTab } from './HistoryTab'

jest.mock('../../utils/historyPdf', () => ({ exportHistoryPdf: jest.fn(() => Promise.resolve()) }))
import { exportHistoryPdf } from '../../utils/historyPdf'

const src = fixtureSource()

it('renders group subtotals and one grand total', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getByText('Subtotal Sumatera')).toBeInTheDocument()
  expect(screen.getAllByText('Grand Total')).toHaveLength(1)
})

it('asks for a vendor when every vendor is unticked', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  for (const cb of screen.getAllByRole('checkbox', { name: /^(ESP|PELITA|PRIME|SILI)$/ })) fireEvent.click(cb)
  expect(screen.getByText('Pilih minimal satu vendor.')).toBeInTheDocument()
})

it('exports the same filter it shows', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
  expect(exportHistoryPdf).toHaveBeenCalledWith(expect.objectContaining({ periods: src.cycles }))
})
```

- [ ] **Step 3: Write `utils/historyPdf.ts`** (port of `exportHistoryPDF`, lazy import)

```ts
import { DAYS_PER_PERIOD, periodShort } from '../engine'
import type { consolidateHistory, historyDetailByPeriod, Sum } from '../engine'
import { fmtIdr, fmtNum, fmtPct } from './format'

export type Unit = 'total' | 'per_kg' | 'per_day' | 'per_period'
export const unitVal = (x: number, weight: number, n: number, u: Unit) =>
  u === 'per_kg' ? (weight > 0 ? x / weight : 0) : u === 'per_day' ? x / (n * DAYS_PER_PERIOD) : u === 'per_period' ? x / n : x

const COLS = ['Rute', 'Tonase (kg)', 'Revenue', 'Rev/kg', 'Cost', 'Cost/kg', 'Margin', 'Margin/kg', 'Margin/hari', 'Margin/periode', 'Margin %']

const line = (label: string, o: Sum, np: number) => [
  label, fmtNum(o.weight), fmtIdr(o.revenue), fmtIdr(unitVal(o.revenue, o.weight, np, 'per_kg')), fmtIdr(o.cost),
  fmtIdr(unitVal(o.cost, o.weight, np, 'per_kg')), fmtIdr(o.margin), fmtIdr(unitVal(o.margin, o.weight, np, 'per_kg')),
  fmtIdr(unitVal(o.margin, o.weight, np, 'per_day')), fmtIdr(unitVal(o.margin, o.weight, np, 'per_period')),
  fmtPct(o.revenue > 0 ? o.margin / o.revenue : 0),
]

// jspdf is ~350 KB; imported on click so the page itself never pays for it.
export async function exportHistoryPdf(args: {
  consolidated: ReturnType<typeof consolidateHistory>
  detail: ReturnType<typeof historyDetailByPeriod>
  periods: string[]
  vendors: string[]
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { consolidated: c, detail, periods, vendors } = args
  const n = c.numPeriods
  const pdfRoute = (r: { originLabel: string; dest: string }) => `${r.originLabel} - ${r.dest}`
  const bold = (cells: string[]) => cells.map((content) => ({ content, styles: { fontStyle: 'bold' as const, fillColor: [241, 245, 249] as [number, number, number] } }))
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const heading = (title: string) => {
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
    doc.text(title, 30, 36)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
    doc.text(`Periode: ${periodShort(periods[0])} s.d. ${periodShort(periods[n - 1])} (${n} periode, ${n * DAYS_PER_PERIOD} hari)`, 30, 50)
    doc.text(`Vendor digabung: ${[...vendors].sort().join(', ')}    Bagian: ${c.groups.map((g) => g.name).join(', ')}`, 30, 61, { maxWidth: pageW - 60 })
    doc.setTextColor(0)
  }
  const rightAlign = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { halign: 'right' as const }]))
  const style = {
    startY: 72, margin: { left: 30, right: 30 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' as const },
    headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    footStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    showFoot: 'lastPage' as const,
  }

  heading('Historical PnL: Consolidate per Rute')
  const body1: unknown[][] = []
  for (const g of c.groups) {
    body1.push([{ content: g.name, colSpan: COLS.length, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }])
    g.rows.forEach((r) => body1.push(line(pdfRoute(r.route) + (r.dupe ? ' *' : ''), r, n)))
    body1.push(bold(line('Subtotal ' + g.name, g.subtotal, n)))
  }
  autoTable(doc, { ...style, head: [COLS], body: body1 as never, foot: [line('Grand Total', c.grand, n)], columnStyles: rightAlign(1, COLS.length - 1) })
  if (c.dupes) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    doc.setFontSize(7); doc.setTextColor(100)
    doc.text('* rute tampil di lebih dari satu grup; grand total menghitungnya satu kali', 30, finalY + 12)
    doc.setTextColor(0)
  }

  doc.addPage()
  heading('Historical PnL: Detail per Periode')
  const body2: unknown[][] = []
  for (const p of detail) {
    p.rows.forEach((r) => body2.push([periodShort(p.cycle), ...line(pdfRoute(r.route), r, 1)]))
    body2.push(bold(['Subtotal', ...line(periodShort(p.cycle), p.subtotal, 1)]))
  }
  autoTable(doc, { ...style, head: [['Periode', ...COLS]], body: body2 as never, foot: [['Grand Total', ...line('', c.grand, n)]], columnStyles: rightAlign(2, COLS.length) })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120)
    doc.text(`Halaman ${i} dari ${pages}`, pageW - 30, pageH - 14, { align: 'right' })
    doc.text(`Dibuat ${new Date().toLocaleString('id-ID')}`, 30, pageH - 14)
  }
  doc.save(`historical-pnl_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}
```

- [ ] **Step 4: Write `HistoryTab.tsx`** (port of `renderHistory`; the vendor list now includes "Tanpa booking")

```tsx
'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DAYS_PER_PERIOD, Sum, UNBOOKED_LABEL, consolidateHistory, defaultScope, historyDetailByPeriod, periodShort, vendorLabel } from '../../engine'
import { Scope } from '../../types'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { exportHistoryPdf, Unit, unitVal } from '../../utils/historyPdf'
import { Hint, RouteChip, ScopePicker, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, ROW_GRAND, ROW_SUBTOTAL } from '../ui'

const UNITS: [Unit, string][] = [['total', 'Total'], ['per_kg', 'Per kg'], ['per_day', 'Per hari'], ['per_period', 'Per periode']]

export function HistoryTab({ source, sim }: TabProps) {
  const allVendors = useMemo(() => [...new Set(source.history.map(vendorLabel))].sort((a, b) => (a === UNBOOKED_LABEL ? 1 : b === UNBOOKED_LABEL ? -1 : a.localeCompare(b))), [source])
  const [start, setStart] = useState(source.cycles[0])
  const [end, setEnd] = useState(source.cycles[source.cycles.length - 1])
  const [vendors, setVendors] = useState(() => new Set(allVendors))
  const [units, setUnits] = useState(() => new Set<Unit>(['total', 'per_kg']))
  const [scope, setScope] = useState<Scope>(() => defaultScope(source, sim))

  let i = source.cycles.indexOf(start)
  let j = source.cycles.indexOf(end)
  if (i > j) [i, j] = [j, i]
  const filter = { periods: source.cycles.slice(i, j + 1), vendors, scope }
  const c = useMemo(() => consolidateHistory(source, sim, filter), [source, sim, start, end, vendors, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = c.numPeriods
  const shown = UNITS.filter(([u]) => units.has(u))
  const span = 3 + shown.length * 3

  const toggle = <T,>(set: Set<T>, v: T, on: boolean, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (on) next.add(v)
    else next.delete(v)
    apply(next)
  }
  const cells = (o: Sum) => (
    <>
      <td className={TDN}>{fmtNum(o.weight)}</td>
      {shown.map(([u]) => <td key={'r' + u} className={TDN}>{fmtIdr(unitVal(o.revenue, o.weight, n, u))}</td>)}
      {shown.map(([u]) => <td key={'c' + u} className={TDN}>{fmtIdr(unitVal(o.cost, o.weight, n, u))}</td>)}
      {shown.map(([u]) => <td key={'m' + u} className={TDN}><Signed value={unitVal(o.margin, o.weight, n, u)} /></td>)}
      <td className={TDN}>{fmtPct(o.revenue > 0 ? o.margin / o.revenue : 0)}</td>
    </>
  )

  let empty: string | null = null
  if (!scope.groups.size && !scope.routes.size) empty = 'Pilih minimal satu grup rute atau rute.'
  else if (!vendors.size) empty = 'Pilih minimal satu vendor.'
  else if (!shown.length) empty = 'Pilih minimal satu satuan.'
  else if (!c.groups.length) empty = 'Tidak ada data pada filter ini.'

  const pdf = () => {
    if (!c.groups.length) return
    exportHistoryPdf({ consolidated: c, detail: historyDetailByPeriod(source, sim, filter), periods: filter.periods, vendors: [...vendors] })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Historical PnL</h2>
          <Hint>Consolidate per rute: gabungan vendor yang dicentang selama {n} periode ({n * DAYS_PER_PERIOD} hari). Pilih per grup rute, per rute satu-satu, atau keduanya; tiap grup punya subtotal. Cost di tab ini selalu all-in (SMU + RA + SG). Detail per periode ada di PDF.</Hint>
        </div>
        <Button size="sm" onClick={pdf}>Download PDF</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Periode</span>
          <select aria-label="Periode mulai" className="h-8 rounded border border-input bg-background px-2" value={start} onChange={(e) => setStart(e.target.value)}>
            {source.cycles.map((x) => <option key={x} value={x}>{periodShort(x)}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">s.d.</span>
          <select aria-label="Periode akhir" className="h-8 rounded border border-input bg-background px-2" value={end} onChange={(e) => setEnd(e.target.value)}>
            {source.cycles.map((x) => <option key={x} value={x}>{periodShort(x)}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendor</span>
          {allVendors.map((v) => (
            <label key={v} className="inline-flex items-center gap-1">
              <input type="checkbox" aria-label={v} checked={vendors.has(v)} onChange={(e) => toggle(vendors, v, e.target.checked, setVendors)} /> {v}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Satuan</span>
          {UNITS.map(([u, label]) => (
            <label key={u} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={units.has(u)} onChange={(e) => toggle(units, u, e.target.checked, setUnits)} /> {label}
            </label>
          ))}
        </div>
        <ScopePicker source={source} sim={sim} scope={scope} onChange={setScope} />
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th rowSpan={2} className={`${TH} sticky left-0 z-[1]`}>Rute</th><th rowSpan={2} className={THN}>Tonase (kg)</th>
              {shown.length > 0 && ['Revenue', 'Cost', 'Margin'].map((h) => <th key={h} colSpan={shown.length} className={`${TH} border-l text-center`}>{h}</th>)}
              <th rowSpan={2} className={THN}>Margin %</th>
            </tr>
            <tr>{[0, 1, 2].flatMap((k) => shown.map(([u, label]) => <th key={k + u} className={THN}>{label}</th>))}</tr>
          </thead>
          <tbody>
            {empty ? <tr><td colSpan={span} className={TD}><Hint>{empty}</Hint></td></tr> : (
              <>
                {c.groups.map((g) => (
                  <React.Fragment key={g.id}>
                    <tr className={ROW_BAND}><td colSpan={span} className={TD}>{g.name} <span className="text-xs font-normal text-muted-foreground">{g.kind === 'group' ? 'Grup rute' : 'Dipilih satu-satu'} · {g.rows.length} rute</span></td></tr>
                    {g.rows.map((r) => (
                      <tr key={r.route.key}><td className={`${TD} sticky left-0 bg-card pl-7`}><RouteChip route={r.route} />{r.dupe && <> <Tag>juga di grup lain</Tag></>}</td>{cells(r)}</tr>
                    ))}
                    <tr className={ROW_SUBTOTAL}><td className={TD}>Subtotal {g.name}</td>{cells(g.subtotal)}</tr>
                  </React.Fragment>
                ))}
                <tr className={ROW_GRAND}><td className={TD}>Grand Total</td>{cells(c.grand)}</tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <Hint>Margin % dihitung terhadap revenue.{c.dupes ? ` ${c.dupes} rute tampil di lebih dari satu grup. Grand total menghitung tiap rute satu kali, jadi tidak sama dengan jumlah subtotal.` : ''}</Hint>
    </>
  )
}
```

- [ ] **Step 5: Write `RoutesTab.tsx` and its test** (port of `renderRoutes` + `slotEditor`)

The test:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { RoutesTab } from './RoutesTab'

const src = fixtureSource()

it('flags a slot that ends before it starts', () => {
  const sim = createState(src)
  sim.routes[0].slots = [{ start: '18:00', end: '06:00' }]
  render(<RoutesTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getByText('Jam selesai sebelum jam mulai')).toBeInTheDocument()
})

it('requires origin code, origin and destination to add a route', () => {
  const dispatch = jest.fn()
  render(<RoutesTab source={src} sim={createState(src)} dispatch={dispatch} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Rute' }))
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByText('Kode asal, kota asal, dan tujuan wajib diisi')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Kode asal'), { target: { value: 'cgk' } })
  fireEvent.change(screen.getByLabelText('Kota asal'), { target: { value: 'Jabo' } })
  fireEvent.change(screen.getByLabelText('Tujuan'), { target: { value: 'Manado' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Rute' }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 0, overrideTon: 0 } })
})
```

The component:

```tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { groupNames, hasOverride, routeHistTon, routeLabel } from '../../engine'
import { SimRoute } from '../../types'
import { fmtNum } from '../../utils/format'
import { Hint, NumInput, RouteChip, Tag, TabProps, TD, TDN, TH, THN } from '../ui'

export function SlotEditor({ route: r, dispatch }: { route: SimRoute } & Pick<TabProps, 'dispatch'>) {
  return (
    <div className="flex flex-wrap items-center">
      {r.slots.length ? r.slots.map((sl, i) => {
        const bad = !!sl.start && !!sl.end && sl.end < sl.start
        const cls = `h-8 rounded border bg-background px-2 text-sm ${bad ? 'border-red-600' : 'border-input'}`
        return (
          <span key={i} className="mb-1 mr-2 inline-flex items-center gap-1">
            <input type="time" aria-label={`Jam mulai slot ${i + 1}`} className={cls} value={sl.start} onChange={(e) => dispatch({ type: 'slotSet', key: r.key, index: i, field: 'start', value: e.target.value })} />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <input type="time" aria-label={`Jam selesai slot ${i + 1}`} className={cls} value={sl.end} onChange={(e) => dispatch({ type: 'slotSet', key: r.key, index: i, field: 'end', value: e.target.value })} />
            <Button variant="outline" size="sm" className="text-red-700" aria-label={`Hapus rentang slot ${i + 1}`} onClick={() => dispatch({ type: 'slotDel', key: r.key, index: i })}>Hapus</Button>
            {bad && <Tag tone="warn">Jam selesai sebelum jam mulai</Tag>}
          </span>
        )
      }) : <span className="mr-2 text-xs text-muted-foreground">Belum ada slot.</span>}
      <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'slotAdd', key: r.key })}>+ Rentang</Button>
    </div>
  )
}

export function RoutesTab({ source, sim, dispatch }: TabProps) {
  const [form, setForm] = useState({ label: '', origin: '', dest: '', rate: '', ton: '' })
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    const originLabel = form.label.trim().toUpperCase()
    const origin = form.origin.trim()
    const dest = form.dest.trim()
    if (!originLabel || !origin || !dest) return setError('Kode asal, kota asal, dan tujuan wajib diisi')
    setError(null)
    dispatch({ type: 'routeAdd', route: { origin, originLabel, dest, rateSpx: Number(form.rate) || 0, overrideTon: Number(form.ton) || 0 } })
    setForm({ label: '', origin: '', dest: '', rate: '', ton: '' })
  }
  const field = (key: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input aria-label={label} className="h-8 w-full rounded border border-input bg-background px-2 text-sm" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </label>
  )
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Rute & Slot Time</h2>
        <Hint>Tonase per hari adalah kebutuhan angkut rute dan menjadi batas alokasi di tab 6, 8, dan 9. Nilai awal dari rata-rata histori per hari (termasuk AWB yang belum dibooking vendor), bisa diganti. Slot time boleh lebih dari satu rentang.</Hint>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Rute</th><th className={THN}>Tonase / hari (kg)</th><th className={TH}>Slot time</th><th className={TH} /></tr></thead>
          <tbody>
            {sim.routes.length ? sim.routes.map((r) => {
              const hist = Math.round(routeHistTon(source, sim, r.key))
              const over = hasOverride(r)
              return (
                <tr key={r.key}>
                  <td className={TD}><RouteChip route={r} /><div className="text-xs text-muted-foreground">{groupNames(source, r.key)}</div></td>
                  <td className={TDN}>
                    <NumInput ariaLabel={`Tonase per hari ${routeLabel(r)}`} className="w-28" step={10} edited={over} value={over ? r.overrideTon : hist} onCommit={(v) => dispatch({ type: 'tonSet', key: r.key, value: v ?? 0 })} />
                    <div className="text-xs text-muted-foreground">Histori {fmtNum(hist)} kg/hari {over && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'tonReset', key: r.key })}>Reset ke histori</Button>}</div>
                  </td>
                  <td className={TD}><SlotEditor route={r} dispatch={dispatch} /></td>
                  <td className={TDN}>
                    <Button variant="outline" size="sm" className="text-red-700" onClick={() => {
                      if (window.confirm(`Hapus rute ${routeLabel(r)}? Vendor, airlines, dan isian coba-coba di rute ini ikut hilang dari simulasi.`)) dispatch({ type: 'routeDel', key: r.key })
                    }}>Hapus Rute</Button>
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={4} className={TD}><Hint>Belum ada rute.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Tambah rute</h3>
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
          {field('label', 'Kode asal', { placeholder: 'CGK', maxLength: 12 })}
          {field('origin', 'Kota asal', { placeholder: 'Jabo', maxLength: 60 })}
          {field('dest', 'Tujuan', { placeholder: 'Manado', maxLength: 60 })}
          {field('rate', 'Rate SPX (Rp/kg)', { type: 'number', min: 0, step: 100 })}
          {field('ton', 'Tonase / hari (kg)', { type: 'number', min: 0, step: 10 })}
          <Button size="sm" onClick={add}>+ Tambah Rute</Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    </>
  )
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation && pnpm exec tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/package.json pnpm-lock.yaml apps/frontend/src/features/route-simulation
git commit -m "$(cat <<'EOF'
feat(route-sim): build historical PnL with PDF export and routes tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`pnpm-lock.yaml` is at the repo root; run `git add` from the root: `git add ../../pnpm-lock.yaml` if you're inside `apps/frontend`.)

---

### Task 5: Tabs 6–8 (Perbandingan, Distribusi Aktual, Distribusi Optimal)

**Files:**
- Replace stub: `components/tabs/CompareTab.tsx`, `components/tabs/ActualTab.tsx`, `components/tabs/OptimalTab.tsx`
- Create: `components/Reason.tsx` (shared by tabs 8 and 9)
- Test: `components/tabs/OptimalTab.spec.tsx`, `components/tabs/CompareTab.spec.tsx`

**Interfaces:**
- Consumes: `compareRoutes`, `resolveScope`, `defaultScope`, `actualDistribution`, `sumRow`, `evaluatePlan`, `optimizePlan`, `DAYS_PER_MONTH`, `UNBOOKED_LABEL`, `accountOf`
- Produces: `ReasonTag({ pr: RouteResult })`, `TotalsBar({ totals, days, label })`; `OptimalTab` props `TabProps & { onOpenSim(): void }`

UI reference: `renderCompare` (1223–1267), `renderActual` (1272–1298), `totalsBar` + `REASON` + `reasonTag` + `renderOptimal` (1304–1376).

- [ ] **Step 1: Write the failing tests**

`OptimalTab.spec.tsx`:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { OptimalTab } from './OptimalTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('summarises why each route runs the way it does', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/rute cukup 1 vendor 1 airlines/)).toBeInTheDocument()
  expect(screen.getByText('Pemakaian modal')).toBeInTheDocument()
  expect(screen.getByText(/Net margin \/ 30 hari/)).toBeInTheDocument()
})

it('flags capital that no lane can use', () => {
  // AURI has never flown, so it owns no lane: its money can only sit idle.
  const auri = { id: 'AURI', name: 'AURI', isEsp: false, enabled: true, tranches: [{ id: 'AURI-1', label: 'Modal AURI', amount: 1e9, cofType: 'percent' as const, cofValue: 1, cofUnit: 'month' as const, cycleDays: 30 }] }
  render(<OptimalTab source={src} sim={{ ...sim, accounts: [...sim.accounts, auri] }} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Modal AURI').closest('tr')).toHaveTextContent('Menganggur')
})

it('jumps to Coba-coba', () => {
  const onOpenSim = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={onOpenSim} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka Coba-coba' }))
  expect(onOpenSim).toHaveBeenCalled()
})
```

`CompareTab.spec.tsx`:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { CompareTab } from './CompareTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('marks exactly one optimal lane per route with lanes', () => {
  render(<CompareTab source={src} sim={sim} dispatch={jest.fn()} />)
  // Routes in two groups render twice, so count per unique route key.
  expect(screen.getAllByText('Optimal').length).toBeGreaterThanOrEqual(sim.routes.length)
})

it('drops a vendor from every route when unticked', () => {
  render(<CompareTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.queryAllByText(/^PELITA\b/, { selector: 'td' }).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('checkbox', { name: 'PELITA' }))
  expect(screen.queryAllByText(/^PELITA\b/, { selector: 'td' })).toHaveLength(0)
})
```

- [ ] **Step 2: Write `components/Reason.tsx`**

```tsx
import React from 'react'
import { Evaluation, RouteResult } from '../engine'
import { fmtIdr, fmtNum } from '../utils/format'
import { Kpi, Tag } from './ui'

const REASON: Record<RouteResult['reason'], ['plain' | 'best' | 'warn', string]> = {
  single: ['best', '1 vendor 1 airlines cukup'],
  load: ['plain', 'Lane terbaik penuh'],
  modal: ['warn', 'Modal vendor terbatas'],
  idle: ['warn', 'Tidak dijalankan'],
  none: ['plain', 'Belum ada lane yang layak'],
}

export function ReasonTag({ pr }: { pr: RouteResult }) {
  const [tone, label] = REASON[pr.reason]
  const split = pr.reason === 'load' && pr.rows.filter((r) => r.kg >= 1).length > 1
  return (
    <>
      <Tag tone={tone}>{split ? 'Dipecah: lane terbaik penuh' : label}</Tag>
      {pr.unmet >= 1 && pr.served >= 1 && <> <Tag tone="warn">Kurang {fmtNum(pr.unmet)} kg/hari</Tag></>}
    </>
  )
}

export function TotalsBar({ totals: t, days, label }: { totals: Evaluation['totals']; days: number; label: string }) {
  return (
    <div className="grid gap-4 rounded-md border bg-card p-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      <Kpi label={`Revenue / ${label}`} value={fmtIdr(t.revenue * days)} />
      <Kpi label={`Cost / ${label}`} value={fmtIdr(t.cost * days)} />
      <Kpi label={`Gross margin / ${label}`} value={fmtIdr(t.gross * days)} />
      <Kpi label={`COF / ${label}`} value={fmtIdr(-t.cof * days)} tone={-1} />
      <Kpi label={`Cashback ESP 2% / ${label}`} value={fmtIdr(t.cashback * days)} />
      <Kpi label={`Net margin / ${label}`} value={fmtIdr(t.net * days)} tone={t.net} />
    </div>
  )
}
```

- [ ] **Step 3: Write `OptimalTab.tsx`** (port of `renderOptimal`)

```tsx
'use client'

import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { DAYS_PER_MONTH, evaluatePlan, groupNames, optimizePlan } from '../../engine'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { ReasonTag, TotalsBar } from '../Reason'
import { EspTag, Hint, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, ROW_SUBTOTAL } from '../ui'

export function OptimalTab({ source, sim, onOpenSim }: TabProps & { onOpenSim: () => void }) {
  const res = useMemo(() => evaluatePlan(source, sim, optimizePlan(source, sim)), [source, sim])
  const M = DAYS_PER_MONTH
  const count = (r: string) => res.perRoute.filter((x) => x.reason === r).length
  const short = res.perRoute.filter((x) => x.unmet >= 1 && x.served >= 1).length
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-4xl">
          <h2 className="text-base font-semibold">Distribusi Optimal</h2>
          <Hint>Tiap rute: sebaiknya dijalankan vendor apa, naik airlines apa, dan berapa kg per hari, kalau modal dipakai terus-menerus. Faktor: tab 1 (modal, COF, siklus bayar), tab 2 (vendor dan airlines, cost, load), tab 3 (rate SPX), tab 5 (tonase rute).</Hint>
          <Hint>Cara hitung: dicari pembagian dengan margin harian terbesar (program linear, hasilnya eksak) dalam tiga batas: tonase rute per hari, load tiap airlines per hari, dan modal per hari = modal dibagi siklus bayar. Satu rute hanya dipecah bila lane terbaiknya penuh atau modal vendornya tidak cukup.</Hint>
        </div>
        <Button size="sm" onClick={onOpenSim}>Buka Coba-coba</Button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-card p-3 text-sm">
        <span><b>{count('single')}</b> rute cukup 1 vendor 1 airlines</span>
        <span><b>{count('load')}</b> rute lane terbaiknya penuh, sisanya ke lane berikutnya</span>
        <span><b>{count('modal')}</b> rute terbatas modal vendor</span>
        <span><b>{count('idle')}</b> rute tidak dijalankan</span>
        <span><b>{short}</b> rute tonasenya belum terlayani penuh</span>
      </div>
      <TotalsBar totals={res.totals} days={M} label="30 hari" />
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th><th className={THN}>Margin / 30 hari</th></tr></thead>
          <tbody>
            {res.perRoute.length ? res.perRoute.map((pr) => (
              <React.Fragment key={pr.route.key}>
                <tr className={ROW_BAND}>
                  <td colSpan={6} className={TD}>
                    <RouteChip route={pr.route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, pr.route.key)} · Tonase {fmtNum(pr.demand)} kg/hari · Terlayani {fmtNum(pr.served)} kg · Margin rute {fmtIdr(pr.net)}/hari</span> <ReasonTag pr={pr} />
                  </td>
                </tr>
                {pr.rows.length ? pr.rows.map((r) => (
                  <tr key={r.lane.id}>
                    <td className={`${TD} pl-7`}>{r.account.name}<EspTag account={r.account} /></td><td className={TD}>{r.lane.airline}</td>
                    <td className={TDN}>{fmtNum(r.kg)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td><td className={TDN}><Signed value={r.netDay} /></td><td className={TDN}><Signed value={r.netDay * M} /></td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>{pr.reason === 'none' ? 'Belum ada airlines yang layak di rute ini. Cek centang Ikut dan cost di tab 2, serta tonase di tab 5.' : 'Modal vendor di rute ini lebih menguntungkan dipakai di rute lain.'}</Hint></td></tr>
                )}
              </React.Fragment>
            )) : <tr><td colSpan={6} className={TD}><Hint>Belum ada rute. Tambah rute di tab 5.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <h3 className="px-4 pb-2 pt-3 text-sm font-semibold">Pemakaian modal</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Nominal</th><th className={THN}>Terkunci</th><th className={THN}>Terpakai</th><th className={THN}>Siklus bayar</th><th className={THN}>COF / 30 hari</th><th className={THN}>Net akun / 30 hari</th></tr></thead>
          <tbody>
            {res.perAccount.length ? res.perAccount.map((pa) => (
              <React.Fragment key={pa.account.id}>
                {res.perTranche.filter((x) => x.account.id === pa.account.id).map((x) => (
                  <tr key={x.tranche.id}>
                    <td className={`${TD} whitespace-nowrap`}>{x.account.name}<EspTag account={x.account} /></td><td className={`${TD} whitespace-nowrap`}>{x.tranche.label}</td>
                    <td className={TDN}>{fmtIdr(x.cash)}</td><td className={TDN}>{fmtIdr(x.locked)}</td>
                    <td className={TDN}>{x.locked < 1 ? <Tag tone="warn">Menganggur</Tag> : fmtPct(x.locked / x.cash)}</td>
                    <td className={TDN}>{x.refillDay} hari</td><td className={TDN}>{fmtIdr(x.cofDay * M)}</td><td className={TD} />
                  </tr>
                ))}
                <tr className={ROW_SUBTOTAL}>
                  <td colSpan={2} className={TD}>Total {pa.account.name}</td><td className={TDN}>{fmtIdr(pa.modal)}</td><td className={TDN}>{fmtIdr(pa.locked)}</td><td colSpan={2} className={TD} />
                  <td className={TDN}>{fmtIdr(pa.cof * M)}</td><td className={TDN}><Signed value={pa.net * M} /></td>
                </tr>
              </React.Fragment>
            )) : <tr><td colSpan={8} className={TD}><Hint>Tidak ada akun aktif.</Hint></td></tr>}
          </tbody>
        </table>
        <Hint className="px-4 py-2">Terkunci = belanja per hari × siklus bayar, yaitu uang yang sedang menunggu dibayar. Net akun = margin dari rute yang dijalankan, ditambah cashback untuk akun ESP, dikurangi COF semua modalnya.</Hint>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Write `CompareTab.tsx`** (port of `renderCompare`)

```tsx
'use client'

import React, { useMemo, useState } from 'react'
import { compareRoutes, defaultScope, groupNames, resolveScope, routeLabel } from '../../engine'
import { Scope } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import { EspTag, Hint, RouteChip, ScopePicker, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, ROW_GROUP } from '../ui'

export function CompareTab({ source, sim }: TabProps) {
  const enabled = sim.accounts.filter((a) => a.enabled)
  const [vendors, setVendors] = useState(() => new Set(enabled.map((a) => a.id)))
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>(() => defaultScope(source, sim))
  const { sections } = resolveScope(source, sim, scope)
  const byKey = useMemo(
    () => Object.fromEntries(compareRoutes(source, { ...sim, lanes: sim.lanes.filter((l) => vendors.has(l.vendor)) }).map((x) => [x.route.key, x])),
    [source, sim, vendors],
  )
  const needle = q.trim().toLowerCase()
  const empty = !scope.groups.size && !scope.routes.size ? 'Pilih minimal satu grup rute atau rute.' : 'Tidak ada rute pada filter ini.'
  const body = sections.flatMap((sec) => {
    const routes = sec.routes.filter((r) => !needle || routeLabel(r).toLowerCase().includes(needle))
    if (!routes.length) return []
    return [
      <tr key={sec.id} className={ROW_GROUP}><td colSpan={6} className={TD}>{sec.name} <span className="text-xs font-normal text-muted-foreground">{sec.kind === 'group' ? 'Grup rute' : 'Dipilih satu-satu'} · {routes.length} rute</span></td></tr>,
      ...routes.map((r) => {
        const x = byKey[r.key]
        return (
          <React.Fragment key={sec.id + r.key}>
            <tr className={ROW_BAND}><td colSpan={6} className={TD}><RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rata-rata tonase {fmtNum(x.demand)} kg/hari · Rate SPX {fmtIdr(r.rateSpx)}/kg</span></td></tr>
            {x.vendors.length ? x.vendors.map((v) => (
              <React.Fragment key={v.account.id}>
                <tr className="font-semibold"><td colSpan={6} className={`${TD} pl-7`}>{v.account.name}<EspTag account={v.account} /> <span className="text-xs font-normal text-muted-foreground">{v.lanes.length} airlines · margin terbaik {fmtIdr(v.bestKg)}/kg</span></td></tr>
                {v.lanes.map((l) => (
                  <tr key={l.lane.id}>
                    <td className={`${TD} pl-[46px]`}>{l.lane.airline}</td>
                    <td className={TDN}>{fmtIdr(l.costKg)}</td><td className={TDN}>{fmtIdr(l.costDay)}</td>
                    <td className={TDN}><Signed value={l.marginKg} /></td><td className={TDN}><Signed value={l.marginDay} /></td>
                    <td className={TDN}>{l.isBest ? <Tag tone="best">Optimal</Tag> : <><span className="text-red-700 dark:text-red-400">{fmtIdr(l.deltaDay)}</span> <span className="text-xs text-muted-foreground">{fmtIdr(l.deltaKg)}/kg</span></>}</td>
                  </tr>
                ))}
              </React.Fragment>
            )) : <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk vendor terpilih di rute ini.</Hint></td></tr>}
          </React.Fragment>
        )
      }),
    ]
  })
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Perbandingan per Rute</h2>
        <Hint>Patokan rute. Di bawah tiap rute ada vendor, dan di bawah tiap vendor ada airlines yang bisa dipakainya, masing-masing dengan detailnya sendiri. Pilih per grup rute, per rute satu-satu, atau keduanya; rute yang ada di dua grup tampil di tiap grupnya.</Hint>
        <Hint>Margin/kg = Rate SPX - cost maskapai, ditambah cashback 2% untuk akun ESP. Cost dan margin per hari = nilai per kg × rata-rata tonase rute per hari. Selisih dari optimal = selisih margin/kg × rata-rata tonase rute per hari.</Hint>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendor</span>
          {enabled.length ? enabled.map((a) => (
            <label key={a.id} className="inline-flex items-center gap-1">
              <input type="checkbox" aria-label={a.name} checked={vendors.has(a.id)} onChange={(e) => {
                const next = new Set(vendors)
                if (e.target.checked) next.add(a.id)
                else next.delete(a.id)
                setVendors(next)
              }} /> {a.name}
            </label>
          )) : <Hint>Tidak ada akun aktif</Hint>}
        </div>
        <input type="search" aria-label="Cari rute" placeholder="Cari rute" className="h-8 rounded border border-input bg-background px-2" value={q} onChange={(e) => setQ(e.target.value)} />
        <ScopePicker source={source} sim={sim} scope={scope} onChange={setScope} />
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor / Airlines</th><th className={THN}>Cost / kg</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / kg</th><th className={THN}>Margin / hari</th><th className={THN}>Selisih dari optimal / hari</th></tr></thead>
          <tbody>{body.length ? body : <tr><td colSpan={6} className={TD}><Hint>{empty}</Hint></td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Write `ActualTab.tsx`** (port of `renderActual`; vendor "Tanpa booking" gets a tag)

```tsx
'use client'

import React, { useMemo } from 'react'
import { UNBOOKED_LABEL, accountOf, actualDistribution, groupNames, histDays, periodShort, sumRow } from '../../engine'
import { fmtIdr, fmtNum } from '../../utils/format'
import { EspTag, Hint, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND } from '../ui'

export function ActualTab({ source, sim }: TabProps) {
  const actual = useMemo(() => actualDistribution(source, sim), [source, sim])
  const days = histDays(sim)
  const body = sim.routes.flatMap((route) => {
    const rows = actual.filter((r) => r.route.key === route.key)
    if (!rows.length) return []
    const t = sumRow(rows)
    return [
      <tr key={route.key} className={ROW_BAND}><td colSpan={6} className={TD}><RouteChip route={route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, route.key)} · {rows.length} pilihan · {fmtNum(t.weight / days)} kg/hari · margin {fmtIdr(t.margin / days)}/hari</span></td></tr>,
      ...rows.map((r) => (
        <tr key={route.key + r.vendor + r.airline}>
          <td className={`${TD} pl-7`}>{r.vendor === UNBOOKED_LABEL ? <Tag>{UNBOOKED_LABEL}</Tag> : <>{r.vendor}<EspTag account={accountOf(sim, r.vendor)} /></>}</td>
          <td className={TD}>{r.airline}</td>
          <td className={TDN}>{fmtNum(r.kgDay)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td>
          <td className={TDN}><Signed value={r.marginDay} /></td><td className={TDN}><Signed value={r.marginKg} /></td>
        </tr>
      )),
    ]
  })
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Distribusi Aktual</h2>
        <Hint>Tiap rute dijalankan vendor mana dan naik airlines apa, dirata-rata per hari dari histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)} ({days} hari). Cost all-in (SMU + RA + SG). Baris &quot;{UNBOOKED_LABEL}&quot; = AWB yang belum punya booking vendor. Bandingkan dengan tab 8 untuk melihat yang paling optimal.</Hint>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th><th className={THN}>Margin / kg</th></tr></thead>
          <tbody>{body.length ? body : <tr><td colSpan={6} className={TD}><Hint>Tidak ada data aktual pada rentang histori.</Hint></td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation && pnpm exec tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "$(cat <<'EOF'
feat(route-sim): build comparison, actual and optimal distribution tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tab 9 Coba-coba

**Files:**
- Replace stub: `components/tabs/SimTab.tsx`
- Test: `components/tabs/SimTab.spec.tsx`

**Interfaces:**
- Consumes: `simOpts`, `optimizePlan`, `simPlan`, `evaluatePlan`, `actualDistribution`, `sumRow`, `routeHistTon`, `hasOverride`, `cycleDays`, `laneMargin`, `accountOf`, `routeOf`, `routeLabel`, `histDays`, `groupNames`; `SlotEditor` from `RoutesTab`; `ReasonTag`
- Produces: `SimTab`, `violationText(v, sim): string`

UI reference: `violationText`…`renderSim` (1381–1583).

- [ ] **Step 1: Write the failing test**

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { SimTab } from './SimTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('starts from the recommendation and offers no revert', () => {
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getByText(/Ini rekomendasi/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pakai rekomendasi' })).toBeDisabled()
})

it('opens a route and edits kg per day', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  const kg = screen.getAllByLabelText(/^Kg per hari /)[0]
  fireEvent.change(kg, { target: { value: '5' } })
  fireEvent.blur(kg)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'simKg', value: 5 }))
})

it('warns when a manual plan breaks a limit', () => {
  const lane = sim.lanes.find((l) => l.vendor === 'PELITA')!
  const manual = { ...sim, sim: { ...sim.sim, kg: { [lane.id]: 1_000_000 } } }
  render(<SimTab source={src} sim={manual} dispatch={jest.fn()} />)
  expect(screen.getByText('Peringatan')).toBeInTheDocument()
  expect(screen.getByText(/melanggar batas/)).toBeInTheDocument()
})

it('sets the horizon in days, blank meaning run on', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} />)
  const days = screen.getByLabelText('Untuk berapa hari ke depan')
  fireEvent.change(days, { target: { value: '' } })
  fireEvent.blur(days)
  expect(dispatch).toHaveBeenCalledWith({ type: 'simDays', value: null })
})
```

- [ ] **Step 2: Write `SimTab.tsx`** (port of `moneyPanel`, `answerStrip`, `routeMenuItem`, `renderSim`)

```tsx
'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DAYS_PER_MONTH, RouteResult, TrancheUse, Violation, accountOf, actualDistribution, cycleDays, evaluatePlan,
  groupNames, hasOverride, histDays, laneMargin, optimizePlan, routeHistTon, routeLabel, routeOf, simOpts, simPlan, sumRow,
} from '../../engine'
import { SimState } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import { ReasonTag } from '../Reason'
import { EspTag, Hint, Kpi, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, visibleRoutes } from '../ui'
import { SlotEditor } from './RoutesTab'

const runoutText = (day: number) => (day < 1 ? 'tidak cukup untuk sehari' : `habis hari ke-${day}`)

export function violationText(v: Violation, sim: SimState): string {
  if (v.type === 'modal') return `Modal ${v.account.name} (${v.tranche.label}) ${runoutText(v.runoutDay)}, uang baru balik hari ke-${cycleDays(v.tranche)}. Kurang ${fmtIdr(v.over)}`
  if (v.type === 'load') return `Load ${v.lane.airline} milik ${v.lane.vendor} di rute ${routeLabel(routeOf(sim, v.lane.route)!)} terlampaui ${fmtNum(v.over)} kg/hari`
  if (v.type === 'tonase') return `Tonase rute ${routeLabel(v.route)} terlampaui ${fmtNum(v.over)} kg/hari`
  return 'Ada isian yang menunjuk akun nonaktif atau akun tanpa modal'
}

function MoneyStatus({ x, days }: { x: TrancheUse; days: number | null }) {
  if (x.cash < 1) return <Hint>Tidak ada duit</Hint>
  if (x.runoutDay != null) return <><Tag tone="warn">{x.runoutDay < 1 ? 'Tidak cukup untuk sehari' : `Habis hari ke-${x.runoutDay}`}</Tag> <span className="text-xs text-muted-foreground">uang balik hari ke-{x.refillDay}</span></>
  if (x.spendDay < 1) return <Tag tone="warn">Menganggur</Tag>
  if (days && days < x.refillDay) return <><span className="text-emerald-700 dark:text-emerald-400">Cukup untuk {days} hari</span> <span className="text-xs text-muted-foreground">sisa {fmtIdr(x.idle)}</span></>
  return <span className="text-emerald-700 dark:text-emerald-400">Aman, berputar tiap {x.refillDay} hari</span>
}

export function SimTab({ source, sim, dispatch }: TabProps) {
  const [filter, setFilter] = useState<RouteFilter>({ group: 'all', q: '' })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const opts = simOpts(sim)
  const days = opts.days
  const manual = !!sim.sim.kg
  const { rec, plan, res, recRes, actual } = useMemo(() => {
    const rec = optimizePlan(source, sim, opts)
    const plan = simPlan(source, sim)
    const res = evaluatePlan(source, sim, plan, opts)
    return { rec, plan, res, recRes: manual ? evaluatePlan(source, sim, rec, opts) : res, actual: actualDistribution(source, sim) }
  }, [source, sim]) // eslint-disable-line react-hooks/exhaustive-deps
  const kgOf = Object.fromEntries(plan.map((p) => [p.lane, p.kg]))
  const recKg = Object.fromEntries(rec.map((p) => [p.lane, p.kg]))
  const visible = new Set(visibleRoutes(source, sim, filter).map((r) => r.key))
  const t = res.totals
  const span = days ?? DAYS_PER_MONTH
  const run = res.perRoute.filter((x) => x.served >= 1)
  const skipped = res.perRoute.filter((x) => x.reason === 'idle')
  const diff = t.net - recRes.totals.net

  const toggleOpen = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
  }

  const routeItem = (pr: RouteResult) => {
    const route = pr.route
    const key = route.key
    const isOpen = open.has(key)
    const who = pr.rows.filter((r) => r.kg >= 1).map((r) => `${r.account.name} · ${r.lane.airline} ${fmtNum(r.kg)} kg`).join(', ')
    const hist = Math.round(routeHistTon(source, sim, key))
    const over = hasOverride(route)
    const act = sumRow(actual.filter((r) => r.route.key === key))
    const lanes = sim.lanes
      .filter((l) => l.route === key)
      .map((lane) => ({ lane, account: accountOf(sim, lane.vendor), m: laneMargin(sim, lane) }))
      .sort((a, b) => sim.accounts.indexOf(a.account!) - sim.accounts.indexOf(b.account!) || b.m.netPerKg - a.m.netPerKg)
    return (
      <div key={key} className="border-t first:border-t-0">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => toggleOpen(key)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-muted aria-expanded:bg-muted"
        >
          <span><span aria-hidden className={`inline-block w-4 text-muted-foreground ${isOpen ? 'rotate-90' : ''}`}>›</span> <RouteChip route={route} /></span>
          <span className="text-xs text-muted-foreground">{who || 'Belum ada yang menjalankan'}</span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">Terisi {fmtNum(pr.served)} dari {fmtNum(pr.demand)} kg/hari</span>
            <span><Signed value={pr.net} /> <span className="text-xs text-muted-foreground">/ hari</span></span>
            <ReasonTag pr={pr} />
          </span>
        </button>
        {isOpen && (
          <div className="space-y-3 px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Rate SPX (Rp/kg)</span>
                <NumInput ariaLabel={`Rate SPX ${routeLabel(route)}`} className="w-full" step={100} value={route.rateSpx} onCommit={(v) => dispatch({ type: 'rateSet', key, value: v ?? 0 })} />
              </label>
              <div>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tonase / hari (kg)</span>
                  <NumInput ariaLabel={`Tonase per hari ${routeLabel(route)}`} className="w-full" step={10} edited={over} value={over ? route.overrideTon : hist} onCommit={(v) => dispatch({ type: 'tonSet', key, value: v ?? 0 })} />
                </label>
                <div className="text-xs text-muted-foreground">Histori {fmtNum(hist)} kg/hari {over && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'tonReset', key })}>Reset ke histori</Button>}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Histori aktual</div>
                <div>{act.weight ? `${fmtNum(act.weight / histDays(sim))} kg/hari · margin ${fmtIdr(act.margin / act.weight)}/kg` : <span className="text-xs text-muted-foreground">Belum ada histori</span>}</div>
                <div className="text-xs text-muted-foreground">{groupNames(source, key)}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Slot time</div>
                <SlotEditor route={route} dispatch={dispatch} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Cost / kg</th><th className={THN}>Load / hari</th><th className={THN}>Margin / kg</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th></tr></thead>
                <tbody>
                  {lanes.length ? lanes.map((x, i) => {
                    const l = x.lane
                    const usable = l.enabled && !!x.account?.enabled && x.account.tranches.length > 0
                    const kg = kgOf[l.id] ?? 0
                    const r = recKg[l.id] ?? 0
                    const first = i === 0 || lanes[i - 1].lane.vendor !== l.vendor
                    return (
                      <tr key={l.id}>
                        <td className={`${TD} whitespace-nowrap`}>{first && <>{x.account?.name ?? l.vendor}<EspTag account={x.account} /></>}</td>
                        <td className={`${TD} whitespace-nowrap`}>{l.airline}</td>
                        <td className={TDN}><NumInput ariaLabel={`Cost per kg ${l.vendor} ${l.airline}`} className="w-24" step={100} edited={l.edited.costPerKg} value={l.costPerKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'costPerKg', value: v })} /></td>
                        <td className={TDN}><NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-20" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} /></td>
                        <td className={TDN}><Signed value={x.m.netPerKg} /></td>
                        <td className={TDN}>
                          <NumInput ariaLabel={`Kg per hari ${l.vendor} ${l.airline}`} className="w-20" disabled={!usable} value={kg} onCommit={(v) => dispatch({ type: 'simKg', id: l.id, value: v ?? 0 })} />
                          {!usable ? <div className="text-xs text-muted-foreground">{l.enabled ? 'akun nonaktif' : 'tidak ikut simulasi'}</div>
                            : manual ? (kg !== r && <div className="text-xs text-muted-foreground">saran {fmtNum(r)}</div>)
                            : r > 0 && <div><Tag tone="best">Disarankan</Tag></div>}
                        </td>
                        <td className={TDN}>{fmtIdr(kg * x.m.costPerKg)}</td>
                        <td className={TDN}><Signed value={kg * x.m.netPerKg} /></td>
                      </tr>
                    )
                  }) : <tr><td colSpan={8} className={TD}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const changedCash = Object.keys(sim.sim.cash).length > 0
  const warnings = res.violations
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Coba-coba</h2>
        <Hint>Satu menu untuk mencoba. Di atas: hal yang bukan per rute, yaitu duit sisa tiap modal, siklus bayar, COF, dan jangka hari. Di bawah: tiap rute dengan rate, tonase, slot, serta vendor dan airlines-nya. Rate, tonase, cost, load, siklus bayar, dan COF yang diubah di sini adalah data yang sama dengan tab 1, 2, 3, dan 5.</Hint>
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Untuk berapa hari ke depan</span>
            <NumInput ariaLabel="Untuk berapa hari ke depan" className="w-28" min={1} placeholder="terus" value={days} onCommit={(v) => dispatch({ type: 'simDays', value: v })} />
            <Hint>Kosongkan bila jalan terus</Hint>
          </label>
          <Kpi label="Total duit sisa" value={fmtIdr(res.totals.cash)} />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!changedCash} onClick={() => dispatch({ type: 'simCashReset' })}>Samakan dengan modal tab 1</Button>
            <Button size="sm" disabled={!manual} onClick={() => dispatch({ type: 'simAuto' })}>Pakai rekomendasi</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Duit sisa (Rp)</th><th className={THN}>Siklus bayar (hari)</th><th className={THN}>COF</th><th className={THN}>Boleh dipakai / hari</th><th className={THN}>Dipakai / hari</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {res.perTranche.length ? res.perTranche.map((x, i) => {
                const first = i === 0 || res.perTranche[i - 1].account.id !== x.account.id
                const tr = x.tranche
                return (
                  <tr key={tr.id}>
                    <td className={`${TD} whitespace-nowrap`}>{first && <>{x.account.name}<EspTag account={x.account} /></>}</td>
                    <td className={`${TD} whitespace-nowrap`}>{tr.label}</td>
                    <td className={TDN}>
                      <NumInput ariaLabel={`Duit sisa ${tr.label}`} className="w-36" step={1_000_000} value={x.cash} onCommit={(v) => dispatch({ type: 'simCash', trancheId: tr.id, value: v })} />
                      <div className="text-xs text-muted-foreground">{x.cash === Number(tr.amount) ? 'sama dengan modal' : `modal ${fmtIdr(tr.amount)}`}</div>
                    </td>
                    <td className={TDN}><NumInput ariaLabel={`Siklus bayar ${tr.label} dalam hari`} className="w-16" min={1} value={cycleDays(tr)} onCommit={(v) => dispatch({ type: 'trSet', trancheId: tr.id, field: 'cycleDays', value: v ?? 1 })} /></td>
                    <td className={`${TDN} whitespace-nowrap`}>
                      <NumInput ariaLabel={`Nilai COF ${tr.label}`} className="w-20" step={0.01} value={tr.cofValue} onCommit={(v) => dispatch({ type: 'trSet', trancheId: tr.id, field: 'cofValue', value: v ?? 0 })} />{' '}
                      <span className="text-xs text-muted-foreground">{tr.cofType === 'percent' ? '%' : 'Rp'}{tr.cofUnit === 'day' ? ' / hari' : ' / bulan'}</span>
                    </td>
                    <td className={TDN}>{fmtIdr(x.budgetDay)}</td>
                    <td className={TDN}>{fmtIdr(x.spendDay)}</td>
                    <td className={TD}><MoneyStatus x={x} days={days} /></td>
                  </tr>
                )
              }) : <tr><td colSpan={8} className={TD}><Hint>Tidak ada akun aktif. Aktifkan akun di tab 1.</Hint></td></tr>}
            </tbody>
          </table>
        </div>
        <Hint className="px-4 py-2">Duit sisa hanya dipakai di tab ini dan tidak mengubah modal di tab 1. Boleh dipakai per hari = duit sisa dibagi jangka hari, atau dibagi siklus bayar bila jangkanya lebih panjang dari siklus. Siklus bayar dan COF di sini sama dengan tab 1.</Hint>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{days ? `Duit ${fmtIdr(t.cash)} untuk ${days} hari ke depan` : `Duit ${fmtIdr(t.cash)}, dipakai terus-menerus`}</div>
          <div className="text-base font-semibold">Jalankan {run.length} dari {res.perRoute.length} rute, net {fmtIdr(t.net * span)} dalam {span} hari</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {manual
              ? (warnings.length
                ? <span className="text-red-700 dark:text-red-400">Isian manual ini melanggar batas, jadi angka di bawah tidak bisa dicapai. Lihat peringatan.</span>
                : <>Ini isian manual. Selisih dari rekomendasi: <span className={diff < 0 ? 'text-red-700' : 'text-emerald-700'}>{fmtIdr(diff)}</span> per hari.</>)
              : 'Ini rekomendasi: pembagian dengan margin harian terbesar untuk duit dan jangka di atas. Ubah kg per hari di rute mana pun untuk mencoba sendiri.'}
            {skipped.length > 0 && ` Tidak dijalankan: ${skipped.map((x) => routeLabel(x.route)).join(', ')}.`}
          </p>
        </div>
        <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <Kpi label="Duit dipakai" value={fmtIdr(t.locked)} />
          <Kpi label="Duit menganggur" value={fmtIdr(t.idle)} />
          <Kpi label="Margin / hari" value={fmtIdr(t.gross + t.cashback)} />
          <Kpi label="COF / hari" value={fmtIdr(-t.cof)} tone={-1} />
          <Kpi label="Net / hari" value={fmtIdr(t.net)} tone={t.net} />
          <Kpi label={`Net / ${span} hari`} value={fmtIdr(t.net * span)} tone={t.net} />
        </div>
        {warnings.length > 0 && (
          <div className="px-4 pb-4">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Peringatan</div>
            <ul className="list-disc pl-5 text-red-700 dark:text-red-400">{warnings.map((v, i) => <li key={i}>{violationText(v, sim)}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Per rute <span className="text-xs font-normal text-muted-foreground">klik rute untuk melihat dan mengubah detailnya</span></h3>
          <div className="flex flex-wrap gap-2">
            <RouteFilterBar source={source} value={filter} onChange={setFilter} />
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set(visible))}>Buka semua</Button>
            <Button variant="outline" size="sm" disabled={!open.size} onClick={() => setOpen(new Set())}>Tutup semua</Button>
          </div>
        </div>
        {res.perRoute.filter((pr) => visible.has(pr.route.key)).map(routeItem)}
        {!res.perRoute.some((pr) => visible.has(pr.route.key)) && <Hint className="p-4">Tidak ada rute pada filter ini.</Hint>}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run tests + typecheck**

Run: `cd apps/frontend && pnpm exec jest src/features/route-simulation && pnpm exec tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "$(cat <<'EOF'
feat(route-sim): build the Coba-coba sandbox tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End-to-end verification and cleanup

**Files:**
- Delete (once the user confirms): `simulasi-rekomendasi-rute-v3.backup-2026-10-03b.html` is **not deleted**; it stays as the reference until the user decides. Don't touch it.

- [ ] **Step 1: Run every suite**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand
cd ../frontend && pnpm test && pnpm exec tsc --noEmit
```
Expected: every suite PASSes in both apps.

- [ ] **Step 2: Manual verification in the browser**

Run `pnpm dev`, log in as superadmin, open `/route-simulation`, and check:
1. The "Simulasi Rute" menu appears in the sidebar.
2. Tab 1: the default history range = the last 6 cycles; add 1 billion in capital to ESP and the "boleh dipakai / hari" hint updates.
3. Tab 2: switch Basis cost SMU ↔ All-in and cost/kg goes up under All-in.
4. Tab 4: Grand Total weight = the total weight for the same range on the PnL Estimated page; Download PDF produces 2 pages.
5. Tab 8: with capital filled in, there's a recommendation, and the "Pemakaian modal" table appears.
6. Tab 9: change one kg value; "Pakai rekomendasi" becomes active and the difference from the recommendation shows up.
7. "Simpan sebagai…" → name "Uji", reload the page, pick "Uji" from the dropdown, and every edit comes back.
8. Open "Uji" in two tabs, save in tab A, then save in tab B, and tab B shows the "disimpan orang lain" message.
9. Log in as a user without `read.route_simulation`: the menu is hidden and `/route-simulation` redirects to `/dashboard`.

- [ ] **Step 3: Write down the results**

If any step fails, fix it in the matching task, then repeat Steps 1–2. Don't claim it's done without all 9 checks above.

- [ ] **Step 4: Make sure there are no stubs left**

Run: `rg -n "return null \}" apps/frontend/src/features/route-simulation/components`
Expected: no hits from the Task 2 stubs (`export function XTab(_: TabProps) { return null }`).
