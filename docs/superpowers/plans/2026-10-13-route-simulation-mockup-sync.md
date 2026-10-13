# Simulasi Rekomendasi Rute — Mockup Sync (2026-10-12 mockup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/route-simulation` in line with the 2026-10-12 mockup `simulasi-rekomendasi-rute-esp.html`: lane cost split into SG Outgoing / SG Incoming / RA / SMU from real data, cost-basis toggle removed, simulation start + horizon on tab 8, an "ESP vs vendor lain" comparison per route on tab 8, free-text account creation (tab 1 and tab 9), "Run estimasi" from tab 9, history-range picker removed, cost read-only on tab 9. Old saved scenarios are deleted.

**Architecture:** The backend `GET /route-simulation/source` history rows stop carrying SMU-vs-all lane cost and instead carry the four lane-cost components of `v_pnl_to.cost_to`, which add back up to it. The frontend engine prices each lane per component, the total being their sum; the cost-basis concept disappears. `SimState` gains `simStart` + `horizonPeriods`, persisted in a new payload `version: 2`; the history range stays in state (default: last 6 cycles) but is no longer user-editable nor persisted. The reducer's one-shot `error` becomes `flash` so it can also carry confirmations ("Akun X ditambahkan…", "Estimasi dijalankan…").

**Tech Stack:** NestJS + TypeORM raw SQL (backend), Next.js 14 / React 18 / Tailwind + shadcn `Button`, Jest + ts-jest + Testing Library (both apps).

**Depends on:** branch `feature/route-simulation` as merged in `f311982` (plans `2026-10-03-route-simulation-{1,2,3}`).

## Global Constraints

- Work on branch `feature/route-simulation`. Commit after every task with `feat(route-sim): …` / `fix(route-sim): …` / `chore(route-sim): …`, ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- UI copy is Indonesian, taken **verbatim** from `simulasi-rekomendasi-rute-esp.html` (repo root), except the deliberate corrections listed here — each because the mockup copy would be false in the real app:
  - Tab 2 first hint: the mockup says cost comes from "cost SMU … dipecah ke SG Outgoing, SG Incoming, RA, dan SMU" (its split is a fixed 40/25/20/15 fake). Real data has each component, so the hint says so (exact text in Task 3).
  - Tab 2 first hint also says the range comes from "rentang histori tab 1"; tab 1 no longer has the picker, so it says "rentang histori di kepala halaman" (the page header shows it).
  - Tab 2 tag "cost belum ada di basis ini" becomes "cost belum ada di data" — there is no basis anymore.
  - Tab 9 page hint: the mockup still lists "cost" as editable there; it no longer is, so "cost, " is dropped (Task 3).
  - Tab 8 verdict when only one side has a workable lane: the mockup crashes (ESP-only) or prints "unggul Rp 0/kg" (partner-only). Use the copy in Task 5.
  - Tab 8 band "Load/hari (N vendor)": the mockup counts lanes but says "vendor"; count distinct vendors so the label is true (Task 5).
- Every new tinted background has a dark-mode variant (precedent: `f72a959`).
- Scenario payload is `version: 2`. Version 1 payloads are not loadable and are deleted by migration (Task 2) — the feature is not live.
- Test commands (from memory note `limit-jest-workers`):
  - Frontend: `cd apps/frontend && pnpm test -- <path>` — no extra flags.
  - Backend, single module dir: `cd apps/backend && pnpm test -- --runInBand <path>`.
  - Backend, more than one dir: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand <path1> <path2>`.

---

### Task 1: Backend — lane cost split into four components

**Files:**
- Modify: `apps/backend/src/modules/route-simulation/route-simulation.types.ts:34-42`
- Modify: `apps/backend/src/modules/route-simulation/route-simulation-source.service.ts:112-162`
- Test: `apps/backend/src/modules/route-simulation/route-simulation-source.service.spec.ts`
- Test: `apps/backend/src/modules/route-simulation/route-simulation-source.integration.spec.ts`

**Interfaces:**
- Produces: `SimulationHistoryRow` fields `costAll, laneWeight, laneCostSgOut, laneCostSgIn, laneCostRa, laneCostSmu` (all `number`). Fields `costSmu, laneWeightAll, laneCostAll, laneWeightSmu` are removed. Task 3 mirrors this in the frontend.

Background: `v_pnl_to` (latest definition in `apps/backend/src/database/migrations/20260914000001-pnl-date-basis-shipment-date.ts`) has AWB-grain `cost_smu_awb`, `cost_ra_awb`, `cost_sg_out_awb` (prorate with `* weight_share`), TO-grain `cost_sg_in_to` (nullable), and `cost_to = (smu+ra+sg_out)*weight_share + COALESCE(sg_in, 0)`. `cost_to` is NULL whenever any AWB component is NULL, so filtering `cost_to IS NOT NULL` guarantees the three AWB components are present, and `COALESCE(cost_sg_in_to, 0)` matches how `cost_to` treats SG In. Hence the four sums add up exactly to the old `lane_cost_all`.

- [ ] **Step 1: Update the unit spec to the new row shape (failing)**

In `route-simulation-source.service.spec.ts`, replace the test `'keeps unbooked history rows with a null vendor and derives ascending cycles'` and the test `'prorates AWB-grain SMU cost by weight_share and excludes estimated cost from lane cost'` with:

```ts
  it('keeps unbooked history rows with a null vendor and derives ascending cycles', async () => {
    arrange([], [], [
      { cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awb_count: 36,
        weight: '6428', revenue: '198000000', cost_all: '120000000',
        lane_weight: '0', lane_cost_sg_out: '0', lane_cost_sg_in: '0', lane_cost_ra: '0', lane_cost_smu: '0' },
      { cycle: '2026-05-1H', origin: 'Jabo', dest: 'Aceh', vendor: 'PRIME', airline: 'Garuda Air CGK', awb_count: 8,
        weight: '1889', revenue: '58000000', cost_all: '41700000',
        lane_weight: '1889', lane_cost_sg_out: '1200000', lane_cost_sg_in: '1000000', lane_cost_ra: '1000000', lane_cost_smu: '38500000' },
    ])
    const src = await service.getSource()
    expect(src.cycles).toEqual(['2026-05-1H', '2026-05-2H'])
    expect(src.history[0]).toEqual({
      cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 36,
      weight: 6428, revenue: 198000000, costAll: 120000000,
      laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0,
    })
    expect(src.history[1]).toMatchObject({
      vendor: 'PRIME', laneWeight: 1889, laneCostSgOut: 1200000, laneCostSgIn: 1000000, laneCostRa: 1000000, laneCostSmu: 38500000,
    })
  })
```

```ts
  it('splits known, booked lane cost into the four cost_to components, prorated by weight_share', async () => {
    arrange([], [], [])
    await service.getSource()
    const sql: string = dataSource.query.mock.calls[2][0]
    expect(sql).toContain('cost_sg_out_awb * weight_share')
    expect(sql).toContain('COALESCE(cost_sg_in_to, 0)')
    expect(sql).toContain('cost_ra_awb * weight_share')
    expect(sql).toContain('cost_smu_awb * weight_share')
    expect(sql).toContain('NOT is_cost_estimated AND cost_to IS NOT NULL')
    expect(sql).not.toMatch(/SUM\(cost_(smu|ra|sg_out)_awb\)/)
    expect(sql).not.toContain('lane_weight_smu')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && pnpm test -- --runInBand src/modules/route-simulation/route-simulation-source.service`
Expected: FAIL — the mapped row still has `costSmu`/`laneWeightSmu` and the SQL lacks `cost_sg_out_awb * weight_share`.

- [ ] **Step 3: Change the type**

In `route-simulation.types.ts` replace lines 34–42 (from `costAll:` through `laneCostSmu: number`) with:

```ts
  costAll: number // COALESCE(SUM(cost_to)), reconciles with /pnl/summary
  // Lane-cost inputs: only TOs whose cost is known AND booked (not the route fallback). A lane's
  // cost/kg per component = laneCostX / laneWeight. Kept apart from costAll so an estimated or
  // missing cost can never masquerade as a cheap lane. The four components add up to cost_to.
  laneWeight: number
  laneCostSgOut: number
  laneCostSgIn: number
  laneCostRa: number
  laneCostSmu: number
```

- [ ] **Step 4: Change the query and mapping**

In `route-simulation-source.service.ts` replace everything from the comment above `getHistory` to the end of the file (lines 112–163: the comment, the method, and the class's closing brace) with:

```ts
  // TO grain, not AWB grain: every v_pnl_to column used here is either TO-level or prorated by
  // weight_share, so a TO-level SUM reconciles exactly with /pnl/summary (verified on dev: weight,
  // net revenue and cost_to all match to the rupiah). The lane_* columns are the subset whose cost
  // is known and booked — a fallback-costed TO is priced off the most expensive SMU row of its
  // route, which says nothing about what its vendor x airline actually costs. They are split into
  // the four parts of cost_to (SG Outgoing, SG Incoming, RA, SMU) so the planner can edit each one;
  // SG In is COALESCEd exactly as cost_to does, so the four add back up to cost_to.
  private async getHistory(cycleCol: string): Promise<SimulationHistoryRow[]> {
    const lane = 'NOT is_cost_estimated AND cost_to IS NOT NULL'
    const rows = await this.dataSource.query(`
      SELECT
        ${cycleCol}                                                            AS cycle,
        origin_station                                                         AS origin,
        dest_station                                                           AS dest,
        NULLIF(vendor, '')                                                     AS vendor,
        NULLIF(airline, '')                                                    AS airline,
        COUNT(DISTINCT awb)::int                                               AS awb_count,
        COALESCE(SUM(gross_weight), 0)                                         AS weight,
        COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)   AS revenue,
        COALESCE(SUM(cost_to), 0)                                              AS cost_all,
        COALESCE(SUM(gross_weight) FILTER (WHERE ${lane}), 0)                  AS lane_weight,
        COALESCE(SUM(cost_sg_out_awb * weight_share) FILTER (WHERE ${lane}), 0) AS lane_cost_sg_out,
        COALESCE(SUM(COALESCE(cost_sg_in_to, 0)) FILTER (WHERE ${lane}), 0)    AS lane_cost_sg_in,
        COALESCE(SUM(cost_ra_awb * weight_share) FILTER (WHERE ${lane}), 0)    AS lane_cost_ra,
        COALESCE(SUM(cost_smu_awb * weight_share) FILTER (WHERE ${lane}), 0)   AS lane_cost_smu
      FROM v_pnl_to
      WHERE ${cycleCol} IS NOT NULL
        AND origin_station IS NOT NULL
        AND dest_station IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY 1, 2, 3, 4 NULLS LAST, 5 NULLS LAST
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      cycle: r.cycle as string,
      origin: r.origin as string,
      dest: r.dest as string,
      vendor: (r.vendor as string | null) ?? null,
      airline: (r.airline as string | null) ?? null,
      awbCount: toNum(r.awb_count),
      weight: toNum(r.weight),
      revenue: toNum(r.revenue),
      costAll: toNum(r.cost_all),
      laneWeight: toNum(r.lane_weight),
      laneCostSgOut: toNum(r.lane_cost_sg_out),
      laneCostSgIn: toNum(r.lane_cost_sg_in),
      laneCostRa: toNum(r.lane_cost_ra),
      laneCostSmu: toNum(r.lane_cost_smu),
    }))
  }
}
```

(The final `}` closes the class. Check the file ends with exactly one class-closing brace.)

- [ ] **Step 5: Update the integration spec**

In `route-simulation-source.integration.spec.ts`:
- In `'returns routes with rates, vendors and history from the dev data'`, change `h.laneWeightSmu > 0` to `h.laneWeight > 0`.
- Replace the body of `'never reports lane weight above total weight'` with:

```ts
    const src = await service.getSource()
    for (const h of src.history) {
      expect(h.laneWeight).toBeLessThanOrEqual(h.weight + 1e-6)
    }
```

- Add this test before the closing `})` of the `describe`:

```ts
  it('splits lane cost into four components that add back up to cost_to', async () => {
    const src = await service.getSource()
    const [{ total }] = await dataSource.query(`
      SELECT COALESCE(SUM(cost_to) FILTER (WHERE NOT is_cost_estimated AND cost_to IS NOT NULL), 0) AS total
      FROM v_pnl_to
      WHERE cycle_date IS NOT NULL AND origin_station IS NOT NULL AND dest_station IS NOT NULL
    `)
    const parts = src.history.reduce((s, h) => s + h.laneCostSgOut + h.laneCostSgIn + h.laneCostRa + h.laneCostSmu, 0)
    expect(parts).toBeCloseTo(Number(total), -2)
  })
```

- [ ] **Step 6: Run the module's tests**

Run: `cd apps/backend && pnpm test -- --runInBand src/modules/route-simulation`
Expected: PASS. The integration spec runs against local Postgres if `pg_isready` reaches it, otherwise it prints `SKIPPED` — both are acceptable here; Task 7 runs it against the dev DB.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/route-simulation
git commit -m "feat(route-sim): serve lane cost as SG Out, SG In, RA and SMU components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — delete pre-v2 scenarios

**Files:**
- Create: `apps/backend/src/database/migrations/20261013000001-route-simulation-clear-v1-scenarios.ts`
- Test: `apps/backend/src/database/migrations/20261013000001-route-simulation-clear-v1-scenarios.spec.ts`

**Interfaces:**
- Consumes: table `route_simulation_scenarios` (migration `20261003000001`).
- Produces: nothing in code. After it runs, only `payload.version = 2` rows remain.

`data-source.ts` loads `./migrations/!(*.spec)*{.ts,.js}`, so the spec beside it is not picked up as a migration.

- [ ] **Step 1: Write the failing spec**

```ts
import { QueryRunner } from 'typeorm'
import { RouteSimulationClearV1Scenarios20261013000001 } from './20261013000001-route-simulation-clear-v1-scenarios'

// Recording runner, as in the 20260922000001 spec: the policy is the SQL, so the SQL is asserted.
const capture = async (dir: 'up' | 'down'): Promise<string[]> => {
  const queries: string[] = []
  const runner = {
    query: async (sql: string) => {
      queries.push(sql)
      return []
    },
  } as unknown as QueryRunner
  const migration = new RouteSimulationClearV1Scenarios20261013000001()
  await (dir === 'up' ? migration.up(runner) : migration.down(runner))
  return queries
}

describe('RouteSimulationClearV1Scenarios migration', () => {
  // The v2 engine cannot read a v1 payload (cost basis, no simulation range). The page is not live,
  // so the rows are dropped rather than migrated.
  it('deletes every scenario that is not payload version 2', async () => {
    const [sql, ...rest] = await capture('up')
    expect(rest).toEqual([])
    expect(sql).toMatch(/DELETE FROM route_simulation_scenarios/i)
    expect(sql).toMatch(/payload->>'version'\)\s+IS DISTINCT FROM\s+'2'/i)
  })

  it('cannot restore deleted rows, so down does nothing', async () => {
    expect(await capture('down')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && pnpm test -- --runInBand src/database/migrations/20261013000001`
Expected: FAIL — `Cannot find module './20261013000001-route-simulation-clear-v1-scenarios'`.

- [ ] **Step 3: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Scenario payload v2 drops the SMU/all-in cost basis, stores lane cost per component (SG Out,
// SG In, RA, SMU) and adds the simulation start + horizon. The frontend refuses any other version,
// and Route Simulation is not live yet, so older rows are deleted instead of converted.
export class RouteSimulationClearV1Scenarios20261013000001 implements MigrationInterface {
  name = 'RouteSimulationClearV1Scenarios20261013000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM route_simulation_scenarios
      WHERE (payload->>'version') IS DISTINCT FROM '2'
    `)
  }

  // Deleted payloads cannot be recreated.
  public async down(): Promise<void> {}
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/backend && pnpm test -- --runInBand src/database/migrations/20261013000001`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20261013000001-route-simulation-clear-v1-scenarios.ts apps/backend/src/database/migrations/20261013000001-route-simulation-clear-v1-scenarios.spec.ts
git commit -m "chore(route-sim): delete scenarios saved before payload version 2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frontend — per-component lane cost, cost basis removed

**Files:**
- Modify: `apps/frontend/src/features/route-simulation/types.ts`
- Modify: `apps/frontend/src/features/route-simulation/engine/constants.ts`
- Modify: `apps/frontend/src/features/route-simulation/engine/state.ts`
- Modify: `apps/frontend/src/features/route-simulation/engine/history.ts:20-21` (comment only)
- Modify: `apps/frontend/src/features/route-simulation/state/reducer.ts`
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/LanesTab.tsx` (full rewrite)
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/SimTab.tsx` (cost cell + page hint)
- Modify: `apps/frontend/src/features/route-simulation/engine/__fixtures__/source.ts`
- Test: `engine/state.spec.ts`, `engine/history.spec.ts`, `engine/margin.spec.ts`, `state/reducer.spec.ts`, `components/tabs/LanesTab.spec.tsx`, `components/tabs/SimTab.spec.tsx`, `components/ScenarioBar.spec.tsx` (all under `apps/frontend/src/features/route-simulation/`)

**Interfaces:**
- Consumes: Task 1's `SimulationHistoryRow` shape.
- Produces (later tasks rely on these):
  - `types.ts`: `type CostField = 'costSgOut' | 'costSgIn' | 'costRa' | 'costSmu'`, `type LaneCosts = Record<CostField, number>`, `LaneEdit extends Partial<LaneCosts> { loadKg?; enabled? }`, `Lane extends LaneCosts` with `costPerKg` (= sum), `db: LaneCosts & { costPerKg; loadKg }`, `edited: Record<CostField | 'costPerKg' | 'loadKg', boolean>`. `CostBasis` and `SimState.costBasis` / `ScenarioPayload.costBasis` no longer exist.
  - `engine/constants.ts`: `COST_FIELDS: CostField[]`, `COST_LABELS: Record<CostField, string>`.
  - `engine/state.ts`: `sumCosts(c: LaneCosts): number`.
  - Reducer: `laneSet.field: CostField | 'loadKg'`; action `setCostBasis` removed.

- [ ] **Step 1: Update the fixtures and history-row literals**

In `engine/__fixtures__/source.ts`, replace the comment above `fixtureSource()` (the one that starts `// Rows match the prototype's buildHistory() 1:1`) with:

```ts
// Rows match the prototype's buildHistory() 1:1 (weight, revenue, cost). The prototype has a single
// cost/kg, so it goes entirely into the SMU lane-cost component with the other three at zero: each
// lane's total cost/kg then reproduces the prototype's exactly. rateSpx carries the prototype's rate
// with pph2 = disc15 = 0, so the engine's net default rate equals the prototype's rate.
```

and replace the two lines

```ts
          costAll: cost, costSmu: cost,
          laneWeightAll: weight, laneCostAll: cost, laneWeightSmu: weight, laneCostSmu: cost,
```

with

```ts
          costAll: cost,
          laneWeight: weight, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: cost,
```

Then update the literal rows in two specs:

```bash
cd apps/frontend/src/features/route-simulation
sed -i 's/costAll: 0, costSmu: 0, laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,/costAll: 0, laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0,/' engine/history.spec.ts engine/margin.spec.ts
grep -n "laneWeight" engine/history.spec.ts engine/margin.spec.ts
```

Expected grep output: one line in each file containing `laneWeight: 0, laneCostSgOut: 0`.

- [ ] **Step 2: Write the failing engine tests**

In `engine/state.spec.ts`:

(a) In `'defaults the history range to the last six cycles and SMU cost'`, rename it to `'defaults the history range to the last six cycles'` and delete the line `expect(s.costBasis).toBe('smu')`.

(b) Replace `'computes cost/kg on the chosen basis and load as the best cycle per day'` with:

```ts
  it('prices a lane per cost component, totals them, and takes load as the best cycle per day', () => {
    const src = fixtureSource()
    src.history.forEach((h) => {
      if (h.vendor === 'SILI' && h.dest === 'Aceh') {
        h.laneCostSgOut = h.laneWeight * 1000
        h.laneCostSgIn = h.laneWeight * 200
        h.laneCostRa = h.laneWeight * 300
      }
    })
    const lane = createState(src).lanes.find((l) => l.id === laneId('SILI', 'Jabo|Aceh', 'Garuda Air CGK'))!
    expect([lane.costSgOut, lane.costSgIn, lane.costRa]).toEqual([1000, 200, 300])
    expect(lane.costSmu).toBeGreaterThan(0)
    expect(lane.costPerKg).toBe(1000 + 200 + 300 + lane.costSmu)
    expect(lane.db.costPerKg).toBe(lane.costPerKg)
    const inRange = src.history.filter((h) => h.vendor === 'SILI' && h.dest === 'Aceh' && h.airline === 'Garuda Air CGK' && h.cycle >= '2026-06')
    expect(lane.loadKg).toBe(Math.round(Math.max(...inRange.map((h) => h.weight)) / 15))
  })
```

(c) In `'marks a lane with no known cost so the optimizer can skip it'`, replace the `forEach` body line with:

```ts
      if (h.vendor === 'PRIME' && h.dest === 'Aceh') Object.assign(h, { laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0 })
```

(d) Replace `'applies user edits over the data and remembers which fields were edited'` with:

```ts
  it('applies a component edit over the data, re-totals, and remembers which fields were edited', () => {
    const src = fixtureSource()
    const s0 = createState(src)
    const base = s0.lanes[0]
    const s = { ...s0, laneEdits: { [base.id]: { costRa: 7, enabled: false as const } } }
    const lane = buildLanes(src, s).find((l) => l.id === base.id)!
    expect(lane.costRa).toBe(7)
    expect(lane.costPerKg).toBe(base.costPerKg - base.costRa + 7)
    expect(lane.enabled).toBe(false)
    expect(lane.edited).toEqual({ costSgOut: false, costSgIn: false, costRa: true, costSmu: false, costPerKg: true, loadKg: false })
    expect(lane.db.costRa).toBe(base.costRa)
  })
```

(e) In `'restores every user edit, including custom and removed routes'`, delete the line `costBasis: 'all' as const,` and the line `expect(back.costBasis).toBe('all')`.

(f) In `'tolerates a payload missing every optional key and still returns a usable state'`, delete the line `expect(s.costBasis).toBe('smu')`.

In `state/reducer.spec.ts`, replace `'rebuilds lanes when the cost basis or a lane edit changes'` with:

```ts
it('re-totals a lane when one cost component is edited, and reset restores the data', () => {
  const s = base()
  const lane = s.sim.lanes[0]
  const edited = simReducer(s, { type: 'laneSet', id: lane.id, field: 'costRa', value: lane.costRa + 500 })
  const after = edited.sim.lanes.find((l) => l.id === lane.id)!
  expect(after.costRa).toBe(lane.costRa + 500)
  expect(after.costPerKg).toBe(lane.costPerKg + 500)
  const reset = simReducer(edited, { type: 'laneReset', id: lane.id })
  expect(reset.sim.laneEdits[lane.id]).toBeUndefined()
  expect(reset.sim.lanes.find((l) => l.id === lane.id)!.costPerKg).toBe(lane.costPerKg)
})
```

In `components/ScenarioBar.spec.tsx` change `payload: { version: 1, costBasis: 'smu' }` to `payload: { version: 1, laneEdits: {} }` (Task 4 bumps the version).

- [ ] **Step 3: Write the failing tab tests**

In `components/tabs/LanesTab.spec.tsx`, replace `'toggles the cost basis between SMU and all-in'` and `"describes vendor/airline lists as all-history, …"` with:

```ts
it('edits one cost component and shows a column for each part plus the total', () => {
  const dispatch = jest.fn()
  const sim = createState(src)
  const lane = sim.lanes[0]
  render(<LanesTab source={src} sim={sim} dispatch={dispatch} />)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
  expect(headers).toEqual(expect.arrayContaining(['Cost SG Outgoing', 'Cost SG Incoming', 'Cost RA', 'Cost SMU', 'Total Cost / kg']))
  const ra = screen.getAllByLabelText(`Cost RA per kg ${lane.vendor} ${lane.airline}`)[0]
  fireEvent.change(ra, { target: { value: '900' } })
  fireEvent.blur(ra)
  expect(dispatch).toHaveBeenCalledWith({ type: 'laneSet', id: lane.id, field: 'costRa', value: 900 })
})

it('describes the lane list as all-history and the total as the sum of four components', () => {
  render(<LanesTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getByText(/diambil dari seluruh histori AWB/)).toBeInTheDocument()
  expect(screen.getByText(/Total Cost = Cost SG Outgoing \+ Cost SG Incoming \+ Cost RA \+ Cost SMU \(otomatis\)/)).toBeInTheDocument()
  expect(screen.getByText(/kg per hari tertinggi dalam satu periode pada rentang histori/)).toBeInTheDocument()
})
```

In `components/tabs/SimTab.spec.tsx` append:

```ts
it('shows lane cost read-only with its component breakdown', () => {
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  expect(screen.queryAllByLabelText(/^Cost per kg /)).toHaveLength(0)
  expect(screen.getAllByTitle(/^Rincian: SG Out Rp 0 \+ SG In Rp 0 \+ RA Rp 0 \+ SMU Rp [\d.]+$/).length).toBeGreaterThan(0)
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation`
Expected: FAIL — type errors (`laneWeight` not in `SimulationHistoryRow`, `costRa` not on `Lane`) and the new assertions.

- [ ] **Step 5: Types**

In `types.ts`, replace the `SimulationHistoryRow` interface with:

```ts
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
  laneWeight: number
  laneCostSgOut: number
  laneCostSgIn: number
  laneCostRa: number
  laneCostSmu: number
}
```

Replace `export type CostBasis = 'smu' | 'all'` with:

```ts
// The four parts of v_pnl_to.cost_to, per kg. A lane's cost/kg is their sum.
export type CostField = 'costSgOut' | 'costSgIn' | 'costRa' | 'costSmu'
export type LaneCosts = Record<CostField, number>
```

Replace the `LaneEdit` and `Lane` interfaces with:

```ts
export interface LaneEdit extends Partial<LaneCosts> {
  loadKg?: number
  enabled?: false
}

export interface Lane extends LaneCosts {
  id: string // vendor~origin|dest~airline
  route: string
  vendor: string
  airline: string
  costPerKg: number // costSgOut + costSgIn + costRa + costSmu
  loadKg: number
  enabled: boolean
  hasData: boolean // has lane weight in the history range
  costKnown: boolean // some booked, non-estimated weight exists, or a cost component was edited
  actualKgDay: number
  db: LaneCosts & { costPerKg: number; loadKg: number }
  edited: Record<CostField | 'costPerKg' | 'loadKg', boolean> // costPerKg = any component edited
}
```

Delete the `costBasis: CostBasis` line from both `SimState` and `ScenarioPayload`.

- [ ] **Step 6: Constants**

Append to `engine/constants.ts`:

```ts
import type { CostField } from '../types'

// v_pnl_to adds cost_to up in this order; tab 2 shows the columns in it.
export const COST_FIELDS: CostField[] = ['costSgOut', 'costSgIn', 'costRa', 'costSmu']
export const COST_LABELS: Record<CostField, string> = { costSgOut: 'SG Outgoing', costSgIn: 'SG Incoming', costRa: 'RA', costSmu: 'SMU' }
```

Move the `import type` line to the top of the file (above `export const ESP_CASHBACK`).

- [ ] **Step 7: Engine state**

In `engine/state.ts`:

Change the imports at the top to:

```ts
import { COST_FIELDS, DAYS_PER_PERIOD } from './constants'
import { periodsBetween } from './period'
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
```

Add after `cycleDays`:

```ts
export const sumCosts = (c: LaneCosts) => COST_FIELDS.reduce((s, f) => s + (Number(c[f]) || 0), 0)
```

In `createState`, delete the line `costBasis: 'smu',`.

Replace everything from `interface LaneAcc {` through the end of `buildLanes` with:

```ts
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
```

In `toPayload`, delete the line `costBasis: s.costBasis,`. In `fromPayload`, delete `const costBasis = p.costBasis ?? 'smu'` and the `costBasis,` line inside the `SimState` literal.

In `engine/history.ts`, replace the comment

```ts
// Historical PnL is all-in by definition — it reports what the period actually cost — so it reads
// costAll regardless of the scenario's cost basis, which only steers lane pricing.
```

with

```ts
// Historical PnL is all-in by definition — it reports what the period actually cost — so it reads
// costAll, never the lane-cost components that price lanes.
```

- [ ] **Step 8: Reducer**

In `state/reducer.ts`:
- Change the types import to `import { CostField, LaneEdit, SimRoute, SimState, SimulationSource, Slot, Tranche } from '../types'`.
- Delete the action line `| { type: 'setCostBasis'; value: CostBasis }` and the `case 'setCostBasis':` (two lines).
- Change the `laneSet` action to `| { type: 'laneSet'; id: string; field: CostField | 'loadKg'; value: number | null }`.
- Change the `laneReset` case body to:

```ts
      return setLaneEdit(source, sim, a.id, { costSgOut: null, costSgIn: null, costRa: null, costSmu: null, loadKg: null })
```

- [ ] **Step 9: Tab 2 — LanesTab**

Replace the whole of `components/tabs/LanesTab.tsx` with:

```tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { COST_FIELDS, COST_LABELS, accountOf, groupNames, laneMargin, routeDemand } from '../../engine'
import { Lane } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import {
  EspTag, Hint, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, visibleRoutes,
} from '../ui'

const COLS = 11
const SUB = 'text-xs text-muted-foreground'

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
          {!l.costKnown && <> <Tag tone="warn">cost belum ada di data</Tag></>}
        </td>
        <td className={TD}>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={l.enabled} aria-label={`Ikut simulasi ${l.vendor} ${l.airline}`} onChange={(e) => dispatch({ type: 'laneToggle', id: l.id, enabled: e.target.checked })} /> Ikut
          </label>
        </td>
        {COST_FIELDS.map((f) => (
          <td key={f} className={TDN}>
            <NumInput ariaLabel={`Cost ${COST_LABELS[f]} per kg ${l.vendor} ${l.airline}`} className="w-24" step={100} edited={l.edited[f]} value={l[f]} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: f, value: v })} />
            <div className={SUB}>data {fmtIdr(l.db[f])}</div>
          </td>
        ))}
        <td className={TDN}>
          {fmtIdr(l.costPerKg)}
          <div className={SUB}>data {fmtIdr(l.db.costPerKg)}</div>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-24" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} />
          <div className={SUB}>data {fmtNum(l.db.loadKg)} kg</div>
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
          <Hint>Patokan rute. Daftar vendor dan airlines di tiap rute diambil dari seluruh histori AWB (vendor, airlines, berat, cost), jadi tidak perlu ditambah manual; cost/kg, load, dan tag &quot;tidak ada data&quot; memakai rentang histori di kepala halaman. Cost/kg tiap komponen dari data = total cost komponen itu (SG Outgoing, SG Incoming, RA, SMU) dibagi total berat, hanya dari AWB yang sudah dibooking dan cost-nya bukan estimasi. Data AWB tidak memuat kapasitas maskapai, jadi load awal = kg per hari tertinggi dalam satu periode pada rentang histori.</Hint>
          <Hint>Tiap komponen cost dan load boleh diubah untuk mencoba; nilai yang diubah bergaris oranye dan bisa dikembalikan ke data. Total Cost = Cost SG Outgoing + Cost SG Incoming + Cost RA + Cost SMU (otomatis). Hapus centang Ikut bila suatu airlines tidak boleh dipakai. Margin/kg = Rate SPX - Total Cost, ditambah cashback 2% untuk akun ESP.</Hint>
        </div>
        <RouteFilterBar source={source} value={filter} onChange={setFilter} />
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Vendor / Airlines</th><th className={TH}>Ikut simulasi</th>
              {COST_FIELDS.map((f) => <th key={f} className={THN}>Cost {COST_LABELS[f]}</th>)}
              <th className={THN}>Total Cost / kg</th><th className={THN}>Load / hari (kg)</th><th className={THN}>Aktual / hari (kg)</th><th className={THN}>Margin / kg</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {routes.length ? routes.map((r) => {
              const lanes = sim.lanes.filter((l) => l.route === r.key)
              const vendors = [...new Set(lanes.map((l) => l.vendor))]
              return (
                <React.Fragment key={r.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={COLS} className={TD}>
                      <RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rate SPX {fmtIdr(r.rateSpx)}/kg · Tonase {fmtNum(routeDemand(source, sim, r.key))} kg/hari · {vendors.length} vendor, {lanes.length} airlines</span>
                    </td>
                  </tr>
                  {vendors.length ? vendors.map((v) => {
                    const account = accountOf(sim, v)
                    const mine = lanes.filter((l) => l.vendor === v)
                    return (
                      <React.Fragment key={v}>
                        <tr className="font-semibold">
                          <td colSpan={COLS} className={`${TD} pl-7`}>
                            {account?.name ?? v}<EspTag account={account} /> <span className="text-xs font-normal text-muted-foreground">{mine.length} airlines</span>
                            {!account && <> <Tag tone="warn">belum ada akun di tab 1, tidak ikut dihitung</Tag></>}
                            {account && !account.enabled && <> <Tag>akun tidak ikut simulasi</Tag></>}
                          </td>
                        </tr>
                        {mine.map(laneRow)}
                      </React.Fragment>
                    )
                  }) : <tr><td colSpan={COLS} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </React.Fragment>
              )
            }) : <tr><td colSpan={COLS} className={TD}><Hint>Tidak ada rute pada filter ini.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 10: Tab 9 — cost read-only**

In `components/tabs/SimTab.tsx`, replace the cost cell

```tsx
                        <td className={TDN}><NumInput ariaLabel={`Cost per kg ${l.vendor} ${l.airline}`} className="w-24" step={100} edited={l.edited.costPerKg} value={l.costPerKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'costPerKg', value: v })} /></td>
```

with

```tsx
                        <td className={TDN} title={`Rincian: SG Out ${fmtIdr(l.costSgOut)} + SG In ${fmtIdr(l.costSgIn)} + RA ${fmtIdr(l.costRa)} + SMU ${fmtIdr(l.costSmu)}`}>
                          {fmtIdr(l.costPerKg)}{l.edited.costPerKg && <span className="text-xs text-muted-foreground"> (edited)</span>}
                          <div className="text-xs text-muted-foreground">data {fmtIdr(l.db.costPerKg)}</div>
                        </td>
```

and in the page hint change `Rate, tonase, cost, load, siklus bayar, dan COF yang diubah di sini` to `Rate, tonase, load, siklus bayar, dan COF yang diubah di sini`.

- [ ] **Step 11: Run the feature's tests**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation`
Expected: PASS, including `engine/parity.spec.ts` unchanged (the SMU-only fixture keeps every lane's total cost/kg identical to before).

- [ ] **Step 12: Type-check**

Run: `cd apps/frontend && pnpm type-check`
Expected: exit 0. If anything still mentions `costBasis`, `CostBasis` or `laneWeightSmu`, `grep -rn "costBasis\|CostBasis\|laneWeightSmu\|laneCostAll" src/features/route-simulation` must come back empty — fix any hit.

- [ ] **Step 13: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "feat(route-sim): price lanes per cost component and drop the cost basis toggle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend — simulation start + horizon, payload v2, reducer flash

**Files:**
- Modify: `apps/frontend/src/features/route-simulation/engine/constants.ts`
- Modify: `apps/frontend/src/features/route-simulation/engine/period.ts`
- Modify: `apps/frontend/src/features/route-simulation/engine/state.ts`
- Modify: `apps/frontend/src/features/route-simulation/types.ts`
- Modify: `apps/frontend/src/features/route-simulation/state/reducer.ts`
- Modify: `apps/frontend/src/features/route-simulation/components/RouteSimulationView.tsx`
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/OptimalTab.tsx` (full rewrite)
- Test: `engine/period.spec.ts`, `engine/state.spec.ts`, `state/reducer.spec.ts`, `components/RouteSimulationView.spec.tsx`, `components/tabs/OptimalTab.spec.tsx`, `components/ScenarioBar.spec.tsx`

**Interfaces:**
- Consumes: Task 3 types.
- Produces:
  - `period.ts`: `periodsForward(start: string, count: number): string[]`.
  - `constants.ts`: `DEFAULT_HORIZON_PERIODS = 12`, `MAX_HORIZON_PERIODS = 72`.
  - `state.ts`: `clampHorizon(v: unknown): number`, `horizonDays(s: Pick<SimState, 'horizonPeriods'>): number`, `simStartOptions(source: Pick<SimulationSource, 'cycles'>): string[]`.
  - `SimState.simStart: string`, `SimState.horizonPeriods: number`; `ScenarioPayload` is `version: 2` with `simStart`, `horizonPeriods` and **without** `histStart`/`histEnd`.
  - Reducer: `ReducerState.flash: string | null` (replaces `error`); action `{ type: 'setSimRange'; simStart: string; horizonPeriods: number }`; `apply` may return `{ sim, flash }` for a confirmation.

Why the history range leaves the payload: Task 6 removes its picker, so a stored range could only ever freeze an old default the planner can no longer see or change. `fromPayload` always rebuilds it as the last six cycles.

- [ ] **Step 1: Write the failing engine tests**

Append to the `describe('period helpers', …)` block in `engine/period.spec.ts` (add `periodsForward` to its import):

```ts
  it('lists periods forward from a start, crossing the year', () => {
    expect(periodsForward('2026-11-2H', 4)).toEqual(['2026-11-2H', '2026-12-1H', '2026-12-2H', '2027-01-1H'])
    expect(periodsForward('nope', 3)).toEqual([])
  })
```

In `engine/state.spec.ts`, add `clampHorizon, horizonDays, simStartOptions` to the import from `./state`, then:

(a) In `describe('createState')` add:

```ts
  it('starts the simulation right after the last cycle, 12 periods long', () => {
    const s = createState(src)
    expect(s.simStart).toBe('2026-09-1H')
    expect(s.horizonPeriods).toBe(12)
    expect(horizonDays(s)).toBe(180)
    expect(simStartOptions(src)).toHaveLength(12)
    expect(simStartOptions(src)[0]).toBe('2026-09-1H')
    expect(simStartOptions({ cycles: [] })).toEqual([])
  })

  it('clamps the horizon to 1..72 periods, defaulting an empty value to 12', () => {
    expect(clampHorizon(500)).toBe(72)
    expect(clampHorizon(-3)).toBe(1)
    expect(clampHorizon(null)).toBe(12)
    expect(clampHorizon('4')).toBe(4)
  })
```

(b) In `'restores every user edit, including custom and removed routes'`, add to the `edited` literal `simStart: '2026-10-2H', horizonPeriods: 6, histStart: '2026-03-1H',` and add after the existing expectations:

```ts
    expect(back.simStart).toBe('2026-10-2H')
    expect(back.horizonPeriods).toBe(6)
    expect(back.histStart).toBe(s0.histStart) // the history range is not a scenario setting
```

(c) In `'tolerates a payload missing every optional key …'`, change `fromPayload(src, { version: 1 } as never)` to `fromPayload(src, { version: 2 } as never)` and add:

```ts
    expect(s.simStart).toBe(defaults.simStart)
    expect(s.horizonPeriods).toBe(12)
```

(d) Replace the `isScenarioPayload` test with:

```ts
  it('is true only for an object carrying version 2', () => {
    expect(isScenarioPayload({ version: 2 })).toBe(true)
    expect(isScenarioPayload({ version: 1 })).toBe(false)
    expect(isScenarioPayload({})).toBe(false)
    expect(isScenarioPayload(null)).toBe(false)
    expect(isScenarioPayload(undefined)).toBe(false)
    expect(isScenarioPayload('version 2')).toBe(false)
    expect(isScenarioPayload([])).toBe(false)
  })
```

- [ ] **Step 2: Write the failing reducer, view, scenario-bar and tab-8 tests**

In `state/reducer.spec.ts`, replace every `.error` with `.flash` (`sed -i 's/\.error)/.flash)/' state/reducer.spec.ts`), then append:

```ts
it('applies the simulation range with a confirmation and clamps the horizon', () => {
  const s = simReducer(base(), { type: 'setSimRange', simStart: '2026-10-1H', horizonPeriods: 500 })
  expect(s.sim.simStart).toBe('2026-10-1H')
  expect(s.sim.horizonPeriods).toBe(72)
  expect(s.dirty).toBe(true)
  expect(s.flash).toBe('Estimasi dijalankan: mulai Okt 2026 H1, 72 periode')
})

it('confirms a re-run of the same range without marking the state dirty', () => {
  const s = simReducer(base(), { type: 'setSimRange', simStart: '2026-09-1H', horizonPeriods: 12 })
  expect(s.dirty).toBe(false)
  expect(s.flash).toBe('Estimasi dijalankan: mulai Sep 2026 H1, 12 periode')
})
```

In `components/RouteSimulationView.spec.tsx`, replace the header test with:

```ts
it('shows the history range and the simulation range in the header', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByText(/Histori Jun 2026 H1 s.d. Agu 2026 H2/)).toBeInTheDocument()
  expect(screen.getByText(/Simulasi mulai Sep 2026 H1, horizon 12 periode/)).toBeInTheDocument()
})
```

In `components/ScenarioBar.spec.tsx` change `payload: { version: 1, laneEdits: {} }` to `payload: { version: 2, simStart: '2026-09-1H', horizonPeriods: 12 }`.

In `components/tabs/OptimalTab.spec.tsx`:
- add `evaluatePlan, optimizePlan` to the import from `'../../engine'` and `import { fmtIdr } from '../../utils/format'`;
- change `/Net margin \/ 30 hari/` to `/Net margin \/ 12 periode/`;
- append:

```ts
it('applies a new start and horizon only when Run is pressed', () => {
  const dispatch = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={dispatch} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Sep 2026 H1 s.d. Feb 2027 H2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run ulang' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Simulasi mulai'), { target: { value: '2026-10-1H' } })
  const horizon = screen.getByLabelText('Horizon simulasi (periode)')
  fireEvent.change(horizon, { target: { value: '4' } })
  fireEvent.blur(horizon)
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByText('belum diterapkan')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Run perubahan' }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'setSimRange', simStart: '2026-10-1H', horizonPeriods: 4 })
})

it('scales the totals to the horizon, 15 days per period', () => {
  const two = { ...sim, horizonPeriods: 2 }
  render(<OptimalTab source={src} sim={two} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  const net = evaluatePlan(src, two, optimizePlan(src, two)).totals.net
  expect(screen.getByText('Net margin / 2 periode').nextSibling).toHaveTextContent(fmtIdr(net * 30))
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation`
Expected: FAIL — `periodsForward`/`clampHorizon` not exported, `simStart` undefined, `flash` undefined, header and tab-8 text missing.

- [ ] **Step 4: Constants and period helper**

Append to `engine/constants.ts`:

```ts
export const DEFAULT_HORIZON_PERIODS = 12
export const MAX_HORIZON_PERIODS = 72
```

Append to `engine/period.ts`:

```ts
export function periodsForward(start: string, count: number): string[] {
  const out: string[] = []
  const s = periodParts(start)
  if (!s) return out
  let [y, m, h] = [s.year, s.month, s.half]
  for (let i = 0; i < count; i++) {
    out.push(periodKey(y, m, h))
    ;[y, m, h] = nextPeriod(y, m, h)
  }
  return out
}
```

- [ ] **Step 5: Types**

In `types.ts`, add to `SimState` after `histEnd: string`:

```ts
  simStart: string // first half-month period of the estimate (tab 8)
  horizonPeriods: number // 1..72 half-month periods; scales tab 8's totals
```

Replace the `ScenarioPayload` interface with:

```ts
// What is saved to route_simulation_scenarios.payload. Routes are stored as overrides keyed by
// route key so a scenario survives the master gaining or losing routes. The history range is not
// stored: it is always the last six cycles of the data the scenario is opened against.
export interface ScenarioPayload {
  version: 2
  simStart: string
  horizonPeriods: number
  accounts: Account[]
  routeEdits: Record<string, { rateSpx?: number; overrideTon?: number | null; slots?: Slot[] }>
  customRoutes: SimRoute[]
  removedRoutes: string[]
  laneEdits: Record<string, LaneEdit>
  sim: SimSettings
}
```

- [ ] **Step 6: Engine state**

In `engine/state.ts`:

Change the first two import lines to:

```ts
import { COST_FIELDS, DAYS_PER_PERIOD, DEFAULT_HORIZON_PERIODS, MAX_HORIZON_PERIODS } from './constants'
import { nextPeriod, periodKey, periodParts, periodsBetween, periodsForward } from './period'
```

Add after `sumCosts`:

```ts
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
```

In `createState`, replace

```ts
  const cycles = source.cycles
  const s: SimState = {
    histStart: cycles[Math.max(0, cycles.length - 6)] ?? '',
    histEnd: cycles[cycles.length - 1] ?? '',
```

with

```ts
  const s: SimState = {
    ...defaultHistRange(source),
    simStart: simStartOptions(source)[0] ?? '',
    horizonPeriods: DEFAULT_HORIZON_PERIODS,
```

In `toPayload`, replace

```ts
    version: 1,
    histStart: s.histStart,
    histEnd: s.histEnd,
```

with

```ts
    version: 2,
    simStart: s.simStart,
    horizonPeriods: s.horizonPeriods,
```

Change `isScenarioPayload`'s comparison to `(x as { version?: unknown }).version === 2`.

In `fromPayload`, delete the lines `const cycles = source.cycles`, `const histStart = …` and `const histEnd = …`, and in the `SimState` literal replace `histStart,` / `histEnd,` with:

```ts
    ...defaultHistRange(source),
    simStart: p.simStart ?? simStartOptions(source)[0] ?? '',
    horizonPeriods: clampHorizon(p.horizonPeriods),
```

- [ ] **Step 7: Reducer**

In `state/reducer.ts`:

Add `clampHorizon` and `periodShort` to the existing `import { … } from '../engine'` list (both are re-exported by `engine/index.ts`).

Replace the `ReducerState` interface with:

```ts
export interface ReducerState {
  source: SimulationSource
  sim: SimState
  dirty: boolean
  flash: string | null // one-shot toast (a refusal or a confirmation); cleared by the next action
}

// A refusal is a bare message; a confirmation carries the new state with it.
type Outcome = SimState | string | { sim: SimState; flash: string }
```

Add the action `| { type: 'setSimRange'; simStart: string; horizonPeriods: number }` after `markSaved`.

Change `initReducer` to return `{ source, sim: sim ?? createState(source), dirty: false, flash: null }`.

Change `function apply(source: SimulationSource, sim: SimState, a: SimAction): SimState | string {` to `function apply(source: SimulationSource, sim: SimState, a: SimAction): Outcome {` and add this case first in the `switch`:

```ts
    case 'setSimRange': {
      const horizonPeriods = clampHorizon(a.horizonPeriods)
      const flash = `Estimasi dijalankan: mulai ${periodShort(a.simStart)}, ${horizonPeriods} periode`
      if (a.simStart === sim.simStart && horizonPeriods === sim.horizonPeriods) return { sim, flash }
      return { sim: { ...sim, simStart: a.simStart, horizonPeriods }, flash }
    }
```

Replace `simReducer` with:

```ts
export function simReducer(state: ReducerState, action: SimAction): ReducerState {
  if (action.type === 'load') return { ...state, sim: action.sim, dirty: false, flash: null }
  if (action.type === 'markSaved') return { ...state, dirty: false, flash: null }
  const out = apply(state.source, state.sim, action)
  if (typeof out === 'string') return { ...state, flash: out }
  const [sim, flash] = 'flash' in out ? [out.sim, out.flash] : [out, null]
  return { ...state, sim, dirty: sim !== state.sim || state.dirty, flash }
}
```

- [ ] **Step 8: Page shell**

In `components/RouteSimulationView.tsx`:
- change the engine import to `import { periodShort } from '../engine'`;
- replace the `state.error` effect with two effects — the toast now times out whatever set it, so ScenarioBar's own `onFlash` messages also disappear (before, only reducer messages did):

```tsx
  // Keyed on the whole state, not state.flash: pressing Run twice yields the same message twice,
  // and the second toast must still show. flash is cleared by every other action, so a non-null
  // flash here always belongs to the dispatch that produced this state.
  useEffect(() => {
    if (state.flash) setFlash(state.flash)
  }, [state])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash])
```

- replace the header paragraph content with:

```tsx
          Histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)}
          <br />Simulasi mulai {periodShort(sim.simStart)}, horizon {sim.horizonPeriods} periode
```

- [ ] **Step 9: Tab 8 — OptimalTab**

Replace the whole of `components/tabs/OptimalTab.tsx` with:

```tsx
'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { clampHorizon, evaluatePlan, groupNames, horizonDays, optimizePlan, periodShort, periodsForward, simStartOptions } from '../../engine'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { ReasonTag, TotalsBar } from '../Reason'
import { EspTag, Hint, NumInput, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, ROW_SUBTOTAL } from '../ui'

const LABEL = 'mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground'

// Start and horizon are drafted here and reach the scenario only on Run, as in the prototype. The
// plan is per day, so they scale the totals below and label the estimate.
function PeriodCard({ source, sim, dispatch }: TabProps) {
  const H = sim.horizonPeriods
  const range = periodsForward(sim.simStart, H)
  const rangeLabel = range.length ? `${periodShort(range[0])} s.d. ${periodShort(range[range.length - 1])}` : '-'
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [draftHorizon, setDraftHorizon] = useState<number | null>(null)
  const start = draftStart ?? sim.simStart
  const horizon = draftHorizon ?? H
  const dirty = start !== sim.simStart || horizon !== H
  const options = simStartOptions(source)
  // A scenario saved against older data may start before today's options; keep it selectable.
  const choices = !sim.simStart || options.includes(sim.simStart) ? options : [sim.simStart, ...options]
  const run = () => {
    dispatch({ type: 'setSimRange', simStart: start, horizonPeriods: horizon })
    setDraftStart(null)
    setDraftHorizon(null)
  }
  return (
    <div className="rounded-md border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">Periode estimasi</h3>
      <Hint className="mb-3">
        Pilih simulasi mulai dan jumlah periode, lalu tekan <b>Run</b> untuk menghitung hasil di bawah. 1 periode = setengah bulan (H1 tanggal 1 sampai 15, H2 tanggal 16 sampai akhir bulan). Rentang estimasi yang sedang ditampilkan: <b>{rangeLabel}</b> ({H} periode).
      </Hint>
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
        <label className="block">
          <span className={LABEL}>Simulasi mulai</span>
          <select aria-label="Simulasi mulai" className="h-8 w-full rounded border border-input bg-background px-2 text-sm" disabled={!choices.length} value={start} onChange={(e) => setDraftStart(e.target.value)}>
            {choices.map((c) => <option key={c} value={c}>{periodShort(c)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Horizon simulasi (periode)</span>
          <NumInput ariaLabel="Horizon simulasi (periode)" className="w-full" min={1} value={horizon} onCommit={(v) => setDraftHorizon(clampHorizon(v))} />
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run}>{dirty ? 'Run perubahan' : 'Run ulang'}</Button>
          {dirty && <Tag tone="esp">belum diterapkan</Tag>}
        </div>
      </div>
    </div>
  )
}

export function OptimalTab({ source, sim, dispatch, onOpenSim }: TabProps & { onOpenSim: () => void }) {
  const res = useMemo(() => evaluatePlan(source, sim, optimizePlan(source, sim)), [source, sim])
  const D = horizonDays(sim)
  const span = `${sim.horizonPeriods} periode`
  const count = (r: string) => res.perRoute.filter((x) => x.reason === r).length
  const short = res.perRoute.filter((x) => x.unmet >= 1 && x.served >= 1).length
  // createState seeds every account with one tranche of amount 0, so a brand-new scenario has no
  // capital anywhere: every route is 'idle' not because it is a bad trade, but because there is
  // nothing to allocate yet. Distinguish that case so the copy points at tab 1 instead of blaming
  // the route.
  const noCapital = res.totals.cash < 1
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
      <PeriodCard source={source} sim={sim} dispatch={dispatch} />
      {noCapital && (
        <div className="rounded-md border bg-card p-3">
          <Hint>Belum ada modal. Isi nominal modal tiap akun di tab 1 · Setup Histori & Akun untuk melihat rekomendasi.</Hint>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-card p-3 text-sm">
        <span><b>{count('single')}</b> rute cukup 1 vendor 1 airlines</span>
        <span><b>{count('load')}</b> rute lane terbaiknya penuh, sisanya ke lane berikutnya</span>
        <span><b>{count('modal')}</b> rute terbatas modal vendor</span>
        <span><b>{count('idle')}</b> rute tidak dijalankan</span>
        <span><b>{short}</b> rute tonasenya belum terlayani penuh</span>
      </div>
      <TotalsBar totals={res.totals} days={D} label={span} />
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th><th className={THN}>Margin / {span}</th></tr></thead>
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
                    <td className={TDN}>{fmtNum(r.kg)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td><td className={TDN}><Signed value={r.netDay} /></td><td className={TDN}><Signed value={r.netDay * D} /></td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>{pr.reason === 'none' ? 'Belum ada airlines yang layak di rute ini. Cek centang Ikut dan cost di tab 2, serta tonase di tab 5.' : noCapital ? 'Belum ada modal untuk dialokasikan. Isi modal di tab 1.' : 'Modal vendor di rute ini lebih menguntungkan dipakai di rute lain.'}</Hint></td></tr>
                )}
              </React.Fragment>
            )) : <tr><td colSpan={6} className={TD}><Hint>Belum ada rute. Tambah rute di tab 5.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <h3 className="px-4 pb-2 pt-3 text-sm font-semibold">Pemakaian modal</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Nominal</th><th className={THN}>Terkunci</th><th className={THN}>Terpakai</th><th className={THN}>Siklus bayar</th><th className={THN}>COF / {span}</th><th className={THN}>Net akun / {span}</th></tr></thead>
          <tbody>
            {res.perAccount.length ? res.perAccount.map((pa) => (
              <React.Fragment key={pa.account.id}>
                {res.perTranche.filter((x) => x.account.id === pa.account.id).map((x) => (
                  <tr key={x.tranche.id}>
                    <td className={`${TD} whitespace-nowrap`}>{x.account.name}<EspTag account={x.account} /></td><td className={`${TD} whitespace-nowrap`}>{x.tranche.label}</td>
                    <td className={TDN}>{fmtIdr(x.cash)}</td><td className={TDN}>{fmtIdr(x.locked)}</td>
                    <td className={TDN}>{x.cash < 1 ? <Hint>Belum ada modal</Hint> : x.locked < 1 ? <Tag tone="warn">Menganggur</Tag> : fmtPct(x.locked / x.cash)}</td>
                    <td className={TDN}>{x.refillDay} hari</td><td className={TDN}>{fmtIdr(x.cofDay * D)}</td><td className={TD} />
                  </tr>
                ))}
                <tr className={ROW_SUBTOTAL}>
                  <td colSpan={2} className={TD}>Total {pa.account.name}</td><td className={TDN}>{fmtIdr(pa.modal)}</td><td className={TDN}>{fmtIdr(pa.locked)}</td><td colSpan={2} className={TD} />
                  <td className={TDN}>{fmtIdr(pa.cof * D)}</td><td className={TDN}><Signed value={pa.net * D} /></td>
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

`Kpi` (used by `TotalsBar`) renders the label `<div>` immediately followed by the value `<div>`, which is what the `nextSibling` assertion in Step 2 relies on.

- [ ] **Step 10: Run the feature's tests and type-check**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation && pnpm type-check`
Expected: all PASS, type-check exit 0.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "feat(route-sim): add simulation start and horizon to tab 8, save them in payload v2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend — ESP vs vendor lain on tab 8

**Files:**
- Modify: `apps/frontend/src/features/route-simulation/engine/margin.ts`
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/OptimalTab.tsx`
- Test: `engine/margin.spec.ts`, `components/tabs/OptimalTab.spec.tsx`

**Interfaces:**
- Consumes: `laneMargin`, `accountOf` (existing), Task 4's `OptimalTab`.
- Produces: `interface LaneEconomics { lane: Lane; account: Account; m: LaneMargin }`, `interface EspVsPartner { esp: LaneEconomics | null; partners: LaneEconomics[]; bestPartner: LaneEconomics | null; winner: 'esp' | 'partner' | 'tie' | null; gap: number }`, `espVsPartner(s: Pick<SimState, 'lanes' | 'routes' | 'accounts'>, routeKey: string): EspVsPartner` — all exported from `engine/margin.ts` (and thus `../../engine`).

- [ ] **Step 1: Write the failing engine tests**

Append to `engine/margin.spec.ts` (add `espVsPartner` to the `./margin` import and `import { buildLanes, laneId } from './state'` — merge with the existing `./state` import):

```ts
describe('espVsPartner', () => {
  // Jabo|Aceh: rate 21.500; lanes SILI Garuda, PRIME Garuda, ESP Citilink. The fixture's cost is all
  // in SMU, so a costSmu edit sets a lane's whole cost/kg. ESP adds 2% cashback = 430/kg.
  const ACEH = 'Jabo|Aceh'
  const SILI = laneId('SILI', ACEH, 'Garuda Air CGK')
  const PRIME = laneId('PRIME', ACEH, 'Garuda Air CGK')
  const ESP = laneId('ESP', ACEH, 'Citilink CGK')
  const priced = (costs: Record<string, number>, patch: Partial<typeof base> = {}) => {
    const s0 = { ...base, ...patch, laneEdits: Object.fromEntries(Object.entries(costs).map(([id, c]) => [id, { costSmu: c }])) }
    return { ...s0, lanes: buildLanes(src, s0) }
  }

  it('lets the best partner win when it beats ESP even after cashback', () => {
    const c = espVsPartner(priced({ [SILI]: 19000, [PRIME]: 19900, [ESP]: 19500 }), ACEH)
    expect(c.esp!.m.netPerKg).toBeCloseTo(2430)
    expect(c.partners.map((x) => x.account.id)).toEqual(['SILI', 'PRIME'])
    expect(c.bestPartner!.m.netPerKg).toBe(2500)
    expect(c.gap).toBeCloseTo(-70)
    expect(c.winner).toBe('partner')
  })

  it('calls it a tie within half a rupiah per kg, and an ESP win beyond', () => {
    expect(espVsPartner(priced({ [SILI]: 19000, [ESP]: 19430 }), ACEH).winner).toBe('tie')
    expect(espVsPartner(priced({ [SILI]: 19000, [ESP]: 19400 }), ACEH).winner).toBe('esp')
  })

  it('ignores disabled lanes, lanes losing money, and accounts without capital', () => {
    const c = espVsPartner(priced({ [SILI]: 30000, [PRIME]: 19900, [ESP]: 19500 }, {
      accounts: base.accounts.map((a) => (a.id === 'ESP' ? { ...a, tranches: [] } : a)),
    }), ACEH)
    expect(c.esp).toBeNull()
    expect(c.partners.map((x) => x.account.id)).toEqual(['PRIME'])
    expect(c.winner).toBe('partner')
    expect(c.gap).toBe(0)
  })

  it('has no winner when nobody has a workable lane', () => {
    const s0 = { ...base, laneEdits: { [SILI]: { enabled: false as const }, [PRIME]: { enabled: false as const }, [ESP]: { enabled: false as const } } }
    const c = espVsPartner({ ...s0, lanes: buildLanes(src, s0) }, ACEH)
    expect(c).toMatchObject({ esp: null, partners: [], bestPartner: null, winner: null, gap: 0 })
  })
})
```

- [ ] **Step 2: Write the failing tab tests**

Append to `components/tabs/OptimalTab.spec.tsx`:

```ts
it('compares the best ESP lane with each partner vendor on every route', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText('Perbandingan ESP vs vendor lain').length).toBeGreaterThan(0)
  expect(screen.getAllByText('ESP sendiri').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Vendor lain').length).toBeGreaterThan(0)
})

it('says when ESP has no workable lane on a route', () => {
  // Jabo|Ambon has only SILI and PRIME lanes.
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText('ESP belum punya lane layak di rute ini (cek centang Ikut dan cost di tab 2).').length).toBeGreaterThan(0)
})

it('shows the daily load the active lanes offer next to the route tonnage', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText(/Load\/hari \(\d+ vendor\) [\d.]+ kg/).length).toBe(sim.routes.length)
  expect(screen.getAllByText(/^(cukup|kurang [\d.]+ kg|belum ada load)$/).length).toBe(sim.routes.length)
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation/engine/margin src/features/route-simulation/components/tabs/OptimalTab`
Expected: FAIL — `espVsPartner` is not exported; comparison text absent.

- [ ] **Step 4: Engine**

Append to `engine/margin.ts`:

```ts
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
```

- [ ] **Step 5: Tab 8 rows**

In `components/tabs/OptimalTab.tsx`:

Change the engine import to:

```ts
import {
  EspVsPartner, LaneEconomics, clampHorizon, espVsPartner, evaluatePlan, groupNames, horizonDays, optimizePlan, periodShort, periodsForward, simStartOptions,
} from '../../engine'
```

Add below `const LABEL = …`:

```tsx
const SUB = 'text-xs text-muted-foreground'
const CMP_HEAD = 'bg-indigo-50 dark:bg-indigo-950/40'
const CMP_ROW = 'bg-muted/40'

function Verdict({ c }: { c: EspVsPartner }) {
  // One-sided cases: the prototype read bestPartner.account.name here and crashed (ESP only) or
  // printed "unggul Rp 0/kg" (partner only). Name the side that has no lane instead.
  if (c.winner === 'esp' && !c.bestPartner) return <Tag tone="best">Pakai ESP sendiri: vendor lain belum punya lane layak</Tag>
  if (c.winner === 'partner' && !c.esp) return <Tag tone="warn">Pakai {c.bestPartner!.account.name}: ESP belum punya lane layak</Tag>
  if (c.winner === 'esp') return <Tag tone="best">Pakai ESP sendiri unggul {fmtIdr(c.gap)}/kg vs {c.bestPartner!.account.name}</Tag>
  if (c.winner === 'partner') return <Tag tone="warn">Pakai {c.bestPartner!.account.name} unggul {fmtIdr(-c.gap)}/kg vs ESP</Tag>
  if (c.winner === 'tie') return <Tag>ESP dan vendor lain seimbang</Tag>
  return <span className={SUB}>Belum cukup data untuk membandingkan</span>
}

function CompareRow({ x }: { x: LaneEconomics }) {
  return (
    <tr className={CMP_ROW}>
      <td className={`${TD} pl-7`}>{x.account.isEsp ? <Tag tone="esp">ESP sendiri</Tag> : <Tag>Vendor lain</Tag>} {x.account.name}<EspTag account={x.account} /></td>
      <td className={TD}>{x.lane.airline}</td>
      <td className={TDN}>{fmtIdr(x.m.revPerKg)}<div className={SUB}>rate SPX</div></td>
      <td className={TDN}>{fmtIdr(x.m.costPerKg)}<div className={SUB}>cost/kg</div></td>
      <td className={TDN}>{x.account.isEsp ? <>{fmtIdr(x.m.cashbackPerKg)}<div className={SUB}>cashback 2%</div></> : <span className="text-muted-foreground">-</span>}</td>
      <td className={TDN}><Signed value={x.m.netPerKg} /><div className={SUB}>margin/kg</div></td>
    </tr>
  )
}

function LoadTag({ total, demand }: { total: number; demand: number }) {
  if (total < 1) return <Tag tone="warn">belum ada load</Tag>
  if (demand - total > 0) return <Tag tone="warn">kurang {fmtNum(demand - total)} kg</Tag>
  return <Tag tone="best">cukup</Tag>
}
```

Add a third hint after the "Cara hitung" hint in the page header:

```tsx
          <Hint>Di tiap rute juga ditampilkan <b>Perbandingan ESP vs vendor lain</b>: lane terbaik milik ESP sendiri (termasuk cashback 2%) dibandingkan dengan lane terbaik tiap vendor lain, supaya kelihatan di rute mana ESP lebih untung pakai modal sendiri atau menitip ke vendor lain.</Hint>
```

Replace the body map `res.perRoute.map((pr) => ( <React.Fragment key={pr.route.key}> … </React.Fragment> ))` with:

```tsx
            {res.perRoute.length ? res.perRoute.map((pr) => {
              const active = sim.lanes.filter((l) => l.route === pr.route.key && l.enabled)
              const totalLoad = active.reduce((s, l) => s + (Number(l.loadKg) || 0), 0)
              const vendorCount = new Set(active.map((l) => l.vendor)).size
              const cmp = espVsPartner(sim, pr.route.key)
              return (
                <React.Fragment key={pr.route.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={6} className={TD}>
                      <RouteChip route={pr.route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, pr.route.key)} · Tonase {fmtNum(pr.demand)} kg/hari · Load/hari ({vendorCount} vendor) {fmtNum(totalLoad)} kg</span> <LoadTag total={totalLoad} demand={pr.demand} /> <span className="text-xs font-normal text-muted-foreground">· Terlayani {fmtNum(pr.served)} kg · Margin rute {fmtIdr(pr.net)}/hari</span> <ReasonTag pr={pr} />
                    </td>
                  </tr>
                  {pr.rows.length ? pr.rows.map((r) => (
                    <tr key={r.lane.id}>
                      <td className={`${TD} pl-7`}>{r.account.name}<EspTag account={r.account} /></td><td className={TD}>{r.lane.airline}</td>
                      <td className={TDN}>{fmtNum(r.kg)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td><td className={TDN}><Signed value={r.netDay} /></td><td className={TDN}><Signed value={r.netDay * D} /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>{pr.reason === 'none' ? 'Belum ada airlines yang layak di rute ini. Cek centang Ikut dan cost di tab 2, serta tonase di tab 5.' : noCapital ? 'Belum ada modal untuk dialokasikan. Isi modal di tab 1.' : 'Modal vendor di rute ini lebih menguntungkan dipakai di rute lain.'}</Hint></td></tr>
                  )}
                  {(cmp.esp || cmp.partners.length > 0) && (
                    <>
                      <tr className={CMP_HEAD}>
                        <td colSpan={6} className={`${TD} pl-7`}>
                          <b>Perbandingan ESP vs vendor lain</b> · <Verdict c={cmp} />
                          <div className={SUB}>Lane terbaik tiap vendor, dasar: margin/kg = Rate SPX - Total Cost (+ cashback 2% jika ESP). Tidak memperhitungkan batas modal/load — murni ekonomi lane.</div>
                        </td>
                      </tr>
                      {cmp.esp ? <CompareRow x={cmp.esp} /> : <tr className={CMP_ROW}><td colSpan={6} className={`${TD} pl-7`}><Hint>ESP belum punya lane layak di rute ini (cek centang Ikut dan cost di tab 2).</Hint></td></tr>}
                      {cmp.partners.length ? cmp.partners.map((x) => <CompareRow key={x.lane.id} x={x} />) : <tr className={CMP_ROW}><td colSpan={6} className={`${TD} pl-7`}><Hint>Vendor lain belum punya lane layak di rute ini.</Hint></td></tr>}
                    </>
                  )}
                </React.Fragment>
              )
            }) : <tr><td colSpan={6} className={TD}><Hint>Belum ada rute. Tambah rute di tab 5.</Hint></td></tr>}
```

(The band splits the hint span in two around `<LoadTag>` because a tag inside the same span would read "kg" + tag + "· Terlayani" with no space control; the visible text order is the mockup's.)

- [ ] **Step 6: Run the tests**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation && pnpm type-check`
Expected: PASS, type-check exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "feat(route-sim): compare ESP's best lane with partner vendors on tab 8

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — free-text accounts, history picker removed, Run from Coba-coba

**Files:**
- Create: `apps/frontend/src/features/route-simulation/utils/id.ts`
- Create: `apps/frontend/src/features/route-simulation/components/AddAccountForm.tsx`
- Modify: `apps/frontend/src/features/route-simulation/state/reducer.ts`
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/SetupTab.tsx`
- Modify: `apps/frontend/src/features/route-simulation/components/tabs/SimTab.tsx`
- Modify: `apps/frontend/src/features/route-simulation/components/RouteSimulationView.tsx`
- Test: `state/reducer.spec.ts`, `components/tabs/SetupTab.spec.tsx`, `components/tabs/SimTab.spec.tsx`, `components/RouteSimulationView.spec.tsx`

**Interfaces:**
- Consumes: Task 4's reducer `flash` and `Outcome`.
- Produces: `newId(prefix: string): string` in `utils/id.ts`; `AddAccountForm(props: TabProps)`; `SimTab` gains required prop `onRun: () => void`; reducer action `setPeriod` removed.

- [ ] **Step 1: Write the failing reducer tests**

In `state/reducer.spec.ts`, delete the test `'refuses a history range whose start is after its end'` and append:

```ts
it('adds an account under any trimmed name, flags ESP case-insensitively, and confirms', () => {
  let s = simReducer(base(), { type: 'acctDel', id: 'ESP' })
  s = simReducer(s, { type: 'acctAdd', vendor: ' esp ', trancheId: 't1' })
  expect(s.sim.accounts.at(-1)).toMatchObject({ id: 'esp', name: 'esp', isEsp: true })
  expect(s.flash).toBe('Akun esp ditambahkan. Isi modal, COF, dan siklus bayar sesuai kebutuhan.')
  s = simReducer(s, { type: 'acctAdd', vendor: 'Garuda Cargo', trancheId: 't2' })
  expect(s.sim.accounts.at(-1)).toMatchObject({ id: 'Garuda Cargo', isEsp: false })
})

it('refuses an empty or duplicate account name', () => {
  const empty = simReducer(base(), { type: 'acctAdd', vendor: '   ', trancheId: 't' })
  expect(empty.flash).toBe('Nama vendor tidak boleh kosong')
  expect(empty.sim.accounts).toHaveLength(4)
  const dup = simReducer(base(), { type: 'acctAdd', vendor: 'SILI', trancheId: 't' })
  expect(dup.flash).toBe('Akun SILI sudah ada')
})
```

- [ ] **Step 2: Write the failing component tests**

In `components/tabs/SetupTab.spec.tsx`, replace `'offers only vendors that are not accounts yet'` and `'explains that history also feeds lane cost/load (tab 2) and that the horizon lives in tab 9'` with:

```ts
it('suggests vendors that are not accounts yet but accepts any name', () => {
  const dispatch = jest.fn()
  const { container } = render(<SetupTab source={src} sim={createState(src)} dispatch={dispatch} />)
  expect(Array.from(container.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toEqual(['AURI'])
  const input = screen.getByLabelText('Nama vendor untuk akun baru')
  fireEvent.change(input, { target: { value: '  Garuda Cargo  ' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Akun' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'Garuda Cargo' }))
  expect(input).toHaveValue('')
})

it('has no history range picker', () => {
  render(<SetupTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.queryByText('Rentang histori')).not.toBeInTheDocument()
  expect(screen.queryByText('Histori mulai')).not.toBeInTheDocument()
})
```

In `components/tabs/SimTab.spec.tsx`, give every existing render the new prop:

```bash
cd apps/frontend/src/features/route-simulation
sed -i 's|dispatch={\([^}]*\)} />|dispatch={\1} onRun={jest.fn()} />|' components/tabs/SimTab.spec.tsx
grep -c "onRun={jest.fn()}" components/tabs/SimTab.spec.tsx
```

Expected grep count: 8 (one per existing render — seven original tests plus Task 3's read-only cost test). Then append:

```ts
it('adds a vendor account from Coba-coba', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} onRun={jest.fn()} />)
  expect(screen.getByText('Tambah vendor')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nama vendor untuk akun baru'), { target: { value: 'AURI' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Akun' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'AURI' }))
})

it('runs the estimate', () => {
  const onRun = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} onRun={onRun} />)
  fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
  expect(onRun).toHaveBeenCalled()
})
```

In `components/RouteSimulationView.spec.tsx` append:

```ts
it('runs the estimate from Coba-coba by jumping to tab 8', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  fireEvent.click(screen.getByRole('button', { name: '9 · Coba-coba' }))
  fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
  expect(screen.getByRole('button', { name: '8 · Distribusi Optimal' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('status')).toHaveTextContent('Estimasi dihitung ulang dengan vendor saat ini (12 periode mulai Sep 2026 H1)')
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation`
Expected: FAIL — no flash on acctAdd, no datalist, no `Run estimasi →`.

- [ ] **Step 4: Id helper**

Create `utils/id.ts`:

```ts
let seq = 0

// Client-side ids for new accounts and tranches: unique within the page, stable once saved.
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`
```

- [ ] **Step 5: Reducer**

In `state/reducer.ts`:
- remove `histPeriodsOf` from the engine import;
- delete the action line `| { type: 'setPeriod'; field: 'histStart' | 'histEnd'; value: string }` and the whole `case 'setPeriod': { … }` block;
- replace the `case 'acctAdd':` block with:

```ts
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
```

- [ ] **Step 6: AddAccountForm**

Create `components/AddAccountForm.tsx`:

```tsx
'use client'

import React, { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { newId } from '../utils/id'
import { TabProps } from './ui'

// Any name may become an account; vendors seen in the data that are not accounts yet are offered
// as suggestions. Used by tab 1 and tab 9. The reducer refuses an empty or duplicate name.
export function AddAccountForm({ source, sim, dispatch }: TabProps) {
  const listId = useId()
  const [text, setText] = useState('')
  const unused = source.vendors.filter((v) => !sim.accounts.some((a) => a.id === v.vendor))
  const add = () => {
    const name = text.trim()
    dispatch({ type: 'acctAdd', vendor: name, trancheId: newId(name || 'akun') })
    if (name && !sim.accounts.some((a) => a.id === name)) setText('')
  }
  return (
    <div className="flex gap-2">
      <input
        aria-label="Nama vendor untuk akun baru"
        list={listId}
        placeholder="Pilih atau ketik vendor"
        autoComplete="off"
        className="h-8 rounded border border-input bg-background px-2 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add() }}
      />
      <datalist id={listId}>{unused.map((v) => <option key={v.vendor} value={v.vendor} />)}</datalist>
      <Button size="sm" onClick={add}>+ Tambah Akun</Button>
    </div>
  )
}
```

- [ ] **Step 7: Tab 1 — SetupTab**

In `components/tabs/SetupTab.tsx`:
- change `import React, { useState } from 'react'` to `import React from 'react'`;
- change the engine import to `import { DAYS_PER_MONTH, cycleDays, trancheBudget, trancheCofPerDay } from '../../engine'`;
- add `import { newId } from '../../utils/id'` and `import { AddAccountForm } from '../AddAccountForm'`;
- delete the module-level `let seq = 0` and `const newId = …` lines;
- replace the whole `SetupTab` function with:

```tsx
export function SetupTab({ source, sim, dispatch }: TabProps) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Akun & Modal</h2>
          <Hint>Satu akun bisa punya banyak modal, masing-masing dengan COF dan siklus bayar sendiri. Siklus bayar = berapa hari sampai uang yang dipakai kembali. Modal yang boleh dipakai per hari = modal dibagi siklus bayar. Cashback akun ESP tetap 2% dari revenue.</Hint>
        </div>
        <AddAccountForm source={source} sim={sim} dispatch={dispatch} />
      </div>
      {sim.accounts.length
        ? sim.accounts.map((a) => <AccountCard key={a.id} account={a} dispatch={dispatch} />)
        : <div className="rounded-md border bg-card p-4"><Hint>Belum ada akun. Tambah akun untuk mulai simulasi.</Hint></div>}
    </>
  )
}
```

- [ ] **Step 8: Tab 9 — SimTab**

In `components/tabs/SimTab.tsx`:
- add `import { AddAccountForm } from '../AddAccountForm'`;
- change the signature to `export function SimTab({ source, sim, dispatch, onRun }: TabProps & { onRun: () => void }) {`;
- right after the heading block (`<div><h2 …>Coba-coba</h2><Hint>…</Hint></div>`) insert:

```tsx
      <div className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Tambah vendor</h3>
            <Hint>Tambah akun vendor langsung dari sini — vendor akan langsung muncul di tab 1 dan ikut dihitung di simulasi. Isi modal dan COF-nya setelah ditambahkan.</Hint>
          </div>
          <AddAccountForm source={source} sim={sim} dispatch={dispatch} />
        </div>
      </div>
```

- right after the money card (the `rounded-md border bg-card` block that ends with the hint "Duit sisa hanya dipakai di tab ini …") insert:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4">
        <Hint>Setelah mengubah field vendor di atas (duit sisa, siklus bayar, COF) atau menambah vendor baru, klik <b>Run</b> untuk melihat hasil estimasi di tab 8.</Hint>
        <Button size="sm" onClick={onRun}>Run estimasi →</Button>
      </div>
```

- [ ] **Step 9: Page shell**

In `components/RouteSimulationView.tsx` replace `{tab === 'sim' && <SimTab {...props} />}` with:

```tsx
        {tab === 'sim' && (
          <SimTab
            {...props}
            onRun={() => {
              setTab('distribute')
              setFlash(`Estimasi dihitung ulang dengan vendor saat ini (${sim.horizonPeriods} periode mulai ${periodShort(sim.simStart)})`)
              window.scrollTo(0, 0)
            }}
          />
        )}
```

- [ ] **Step 10: Run the tests and type-check**

Run: `cd apps/frontend && pnpm test -- src/features/route-simulation && pnpm type-check`
Expected: PASS, type-check exit 0. `grep -rn "setPeriod\|Rentang histori" src/features/route-simulation` must be empty.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/features/route-simulation
git commit -m "feat(route-sim): add accounts by any name from tab 1 or 9, run the estimate from Coba-coba

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Frontend suite, types, lint**

Run: `cd apps/frontend && pnpm test && pnpm type-check && pnpm lint`
Expected: all suites pass; type-check and lint exit 0.

- [ ] **Step 2: Backend suites touched**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand src/modules/route-simulation src/database/migrations/20261013000001`
Expected: PASS. If local Postgres is up, the integration spec must run (not print `SKIPPED`) and pass, including `'splits lane cost into four components that add back up to cost_to'`.

- [ ] **Step 3: Backend type-check**

Run: `cd apps/backend && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Apply the migration on the dev database**

Run: `cd apps/backend && pnpm migration:run`
Expected: `RouteSimulationClearV1Scenarios20261013000001` reported as executed.

- [ ] **Step 5: Manual check in the running app**

Start backend and frontend as usual, open `/route-simulation`, and confirm:
- Header: "Histori … s.d. …" and "Simulasi mulai …, horizon 12 periode".
- Tab 1: no "Rentang histori" card; typing a new name + "+ Tambah Akun" adds a card and shows the toast; empty name shows "Nama vendor tidak boleh kosong".
- Tab 2: four cost columns + Total Cost; editing Cost RA turns that cell orange, changes Total and Margin; "Kembali ke data" clears it; no Basis cost radios.
- Tab 8: "Periode estimasi" card; change horizon → "belum diterapkan" + "Run perubahan"; Run → totals labelled "/ N periode" and a toast; each route shows "Load/hari (N vendor) … kg" with a tag and the "Perbandingan ESP vs vendor lain" block.
- Tab 9: cost is plain text with a "Rincian:" tooltip; "Tambah vendor" works; "Run estimasi →" jumps to tab 8 with the toast.
- Save a scenario, reload, open it: simulation start and horizon are restored.
- Dark mode: tab 8 comparison rows stay readable.

- [ ] **Step 6: Commit any fixes**

If a check needed a fix, commit it with a `fix(route-sim): …` message ending with the Co-Authored-By line. Otherwise nothing to commit.
