# Simulasi Rekomendasi Rute — Plan 1 of 3: Backend API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide every piece of data the `simulasi-rekomendasi-rute-v3` prototype hard-codes in its `DataSource` object through one read endpoint, and add CRUD for named simulation scenarios so accounts, capital, and edits can be saved and shared.

**Architecture:** A new `route-simulation` NestJS module. `GET /route-simulation/source` runs three raw SQL queries (routes + SPX rate, vendors, TO-level history per cycle × route × vendor × airline) and calls `RouteGroupsService.findAll()`, so the page needs one call and one permission. Scenarios live in one `route_simulation_scenarios` table with a `jsonb` payload. The backend stores the payload but does not interpret it, because its shape belongs to the frontend engine (plan 2). Optimistic concurrency uses an integer `revision` column.

**Tech Stack:** NestJS 10, TypeORM 0.3, raw SQL over Postgres (`v_pnl_to` materialized view, `air_shipments_data`, `air_shipments_smu`), class-validator, Jest.

**Prototype:** `simulasi-rekomendasi-rute-v3.backup-2026-10-03b.html` (repo root).
**Next plans:** `2026-10-03-route-simulation-2-engine.md` (port of the TypeScript engine), `2026-10-03-route-simulation-3-ui.md` (page and 9 tabs).

## Endpoint mapping (prototype `DataSource` → API)

| Prototype field | Existing endpoint | Usable as-is? | Decision |
|---|---|---|---|
| `cycles` | `GET /pnl/cycles?basis=` | Yes (DESC, `read.pnl`) | Derived from `history` in `/route-simulation/source`, so the cycles always match the data |
| `routes` (+ `seed.rateSpx`) | `GET /pnl/routes`, `GET /route-groups/available-routes` | **No**: neither returns `rate_spx`/`pph_2`/`disc_15` | New query, the DC-pair master `air_shipments_data` FULL JOIN `v_pnl_to` |
| `routeGroups` | `GET /route-groups` | Yes, but gated by `read.route_group` | Embedded through `RouteGroupsService.findAll()` (already exported) |
| `vendors` | `GET /vendor-groups/available-vendors` | Yes, but gated by `read.vendor_group` | Same query, re-run in this module (same pattern as `PnlService.getRoutes`) |
| `history` (AWB aggregates) | `GET /pnl/awb-drilldown` | **No**: paginated per AWB (thousands of rows), no cycle grain, no lane cost split | New query: TO-level aggregate per `cycle × origin × dest × vendor × airline` (~81 rows locally, 22 ms) |
| — | `GET /pnl/analytics/journey` | **No**: one period only, drops AWBs whose cost is null, so route tonnage comes out too low | Not used |
| — | `GET /pnl/breakdown/cost-by-vendor` | **No**: no route dimension | Not used |
| Setup state (accounts, capital, COF, edits) | — | Does not exist | New `route_simulation_scenarios` table + CRUD |

## Global Constraints

- Lane cost/kg is computed only from TOs whose cost is **known and not estimated** (`NOT is_cost_estimated AND cost_* IS NOT NULL`), sent as separate `laneCost*`/`laneWeight*` fields. The `cost*` totals (`COALESCE(SUM(...))`) stay as they are so tab 4 reconciles with `/pnl/summary`.
- SMU cost is AWB-grain: always `cost_smu_awb * weight_share` per TO, never `SUM(cost_smu_awb)`.
- Revenue is always net: `SUM(revenue_total) - SUM(revenue_discount)` (see the NET REVENUE note in `pnl.service.ts`).
- Vendor and airline are sent raw (`NULLIF(x, '')` only, no `BTRIM`/lowercasing). A TO with no booking is sent with `vendor: null` and **must not be dropped**, because it still counts toward route tonnage.
- The four new permissions are `read.route_simulation`, `create.route_simulation`, `update.route_simulation`, `delete.route_simulation` (they match `chk_permissions_name_format`). They are seeded automatically at boot by `PermissionsService.seedPermissions`.
- The scenario payload is `jsonb` and is only validated as an object of at most 90 KB (Nest/Express's default JSON body limit is 100 KB, so this cap keeps the 413 coming from the service with a clear message, not from the body parser). Do not add per-field DTOs: its shape is owned by `ScenarioPayload` in plan 2.
- Backend tests: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`.
- Type gate: `cd apps/backend && pnpm exec tsc --noEmit`; after touching `packages/shared`, also run it in `apps/frontend`.
- Error copy is English (matching the vendor-groups module); doc comments are English.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/backend/src/database/migrations/20261003000001-route-simulation-scenarios.ts` | DDL for the scenario table |
| `apps/backend/src/modules/route-simulation/entities/route-simulation-scenario.entity.ts` | TypeORM mapping |
| `apps/backend/src/modules/route-simulation/route-simulation.types.ts` | Response types for `source` and the scenario summary |
| `apps/backend/src/modules/route-simulation/route-simulation-source.service.ts` | The three SQL queries + embedded route groups |
| `apps/backend/src/modules/route-simulation/route-simulation-source.service.spec.ts` | Unit tests over a mocked `DataSource` |
| `apps/backend/src/modules/route-simulation/route-simulation-source.integration.spec.ts` | Real SQL against Postgres + reconciliation with `getSummary` |
| `apps/backend/src/modules/route-simulation/dto/save-scenario.dto.ts` | Create/update DTOs |
| `apps/backend/src/modules/route-simulation/dto/save-scenario.dto.spec.ts` | Pins the decorators |
| `apps/backend/src/modules/route-simulation/route-simulation-scenarios.service.ts` | CRUD + revision check + unique name |
| `apps/backend/src/modules/route-simulation/route-simulation-scenarios.service.spec.ts` | Unit tests |
| `apps/backend/src/modules/route-simulation/route-simulation.controller.ts` | 6 routes, `@Authorize` per method |
| `apps/backend/src/modules/route-simulation/route-simulation.controller.spec.ts` | Delegation + permission metadata |
| `apps/backend/src/modules/route-simulation/route-simulation.module.ts` | Wiring, imports `RouteGroupsModule` |

**Modified**

| File | Change |
|---|---|
| `packages/shared/src/auth/index.ts` (after `DELETE_VENDOR_GROUP`) | 4 new `Permission` members |
| `apps/backend/src/app.module.ts` | Import + register `RouteSimulationModule` |

---

### Task 1: Permissions, migration, entity

**Files:**
- Modify: `packages/shared/src/auth/index.ts`
- Create: `apps/backend/src/database/migrations/20261003000001-route-simulation-scenarios.ts`
- Create: `apps/backend/src/modules/route-simulation/entities/route-simulation-scenario.entity.ts`
- Test: `apps/backend/src/modules/permissions/permissions.service.spec.ts` (existing, unchanged; it already counts `Object.values(Permission)`)

**Interfaces:**
- Produces: `Permission.READ_ROUTE_SIMULATION | CREATE_ROUTE_SIMULATION | UPDATE_ROUTE_SIMULATION | DELETE_ROUTE_SIMULATION`; `RouteSimulationScenarioEntity { id: string; name: string; description: string | null; payload: Record<string, unknown>; revision: number; updatedBy: string | null; createdAt: Date; updatedAt: Date }`

- [ ] **Step 1: Add the permissions**

In `packages/shared/src/auth/index.ts`, right after `DELETE_VENDOR_GROUP = 'delete.vendor_group',`:

```ts

  // Route Simulation (Simulasi Rekomendasi Rute). Read gates the menu, the source endpoint and the
  // scenario list; the write verbs gate saving, renaming and deleting named scenarios. Kept apart
  // from read.pnl because the page exposes capital, COF and vendor accounts that PnL readers need
  // not see.
  READ_ROUTE_SIMULATION = 'read.route_simulation',
  CREATE_ROUTE_SIMULATION = 'create.route_simulation',
  UPDATE_ROUTE_SIMULATION = 'update.route_simulation',
  DELETE_ROUTE_SIMULATION = 'delete.route_simulation',
```

- [ ] **Step 2: Run the permission spec**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest permissions.service --runInBand`
Expected: PASS (it seeds `Object.values(Permission)`, so the 4 new members are covered automatically).

- [ ] **Step 3: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Named scenarios for the Route Simulation page. The payload is the frontend engine's
// ScenarioPayload (accounts, capital tranches, lane/route edits, Coba-coba settings) stored as
// jsonb: the backend never reads inside it, so its shape can evolve with the engine alone. The
// payload carries its own `version` for that purpose.
//
// `revision` is an optimistic-concurrency counter. Two planners editing the same scenario would
// otherwise silently overwrite each other's capital figures; PATCH must quote the revision it
// loaded and gets a 409 when someone saved in between.
export class RouteSimulationScenarios20261003000001 implements MigrationInterface {
  name = 'RouteSimulationScenarios20261003000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_simulation_scenarios (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        payload     JSONB        NOT NULL,
        revision    INTEGER      NOT NULL DEFAULT 1,
        updated_by  UUID,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_route_simulation_scenarios"      PRIMARY KEY (id),
        CONSTRAINT "uq_route_simulation_scenarios_name" UNIQUE (name),
        CONSTRAINT "fk_route_simulation_scenarios_user"
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS route_simulation_scenarios`)
  }
}
```

- [ ] **Step 4: Write the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('route_simulation_scenarios')
export class RouteSimulationScenarioEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 100, unique: true })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  // Opaque to the backend — see the migration header.
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({ type: 'int', default: 1 })
  revision: number

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 5: Run the migration and roll it back once**

Run:
```bash
cd apps/backend && pnpm migration:run && pnpm migration:revert && pnpm migration:run
psql postgres://postgres:postgres@localhost:5432/app -c "\d route_simulation_scenarios"
```
Expected: the table has columns `id, name, description, payload, revision, updated_by, created_at, updated_at`, a `uq_route_simulation_scenarios_name` constraint and an FK to `users`.

- [ ] **Step 6: Typecheck both apps**

Run: `cd apps/backend && pnpm exec tsc --noEmit && cd ../frontend && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/auth/index.ts apps/backend/src/database/migrations/20261003000001-route-simulation-scenarios.ts apps/backend/src/modules/route-simulation/entities
git commit -m "$(cat <<'EOF'
feat(route-sim): add route simulation permissions and scenario table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Source endpoint service (routes, vendors, history, groups)

**Files:**
- Create: `apps/backend/src/modules/route-simulation/route-simulation.types.ts`
- Create: `apps/backend/src/modules/route-simulation/route-simulation-source.service.ts`
- Test: `apps/backend/src/modules/route-simulation/route-simulation-source.service.spec.ts`
- Test: `apps/backend/src/modules/route-simulation/route-simulation-source.integration.spec.ts`

**Interfaces:**
- Consumes: `resolveBasis`, `BASIS_COLS`, `DateBasis` from `../pnl/pnl-filter.util`; `originLabel` from `../../common/utils/origin-labels.util`; `RouteGroupsService.findAll(): Promise<RouteGroup[]>` from `../route-groups/route-groups.service`
- Produces: `RouteSimulationSourceService.getSource(basis?: string): Promise<SimulationSource>` with the types below (plan 2 copies these types to the frontend verbatim)

- [ ] **Step 1: Write the types**

`route-simulation.types.ts`:

```ts
import { DateBasis } from '../pnl/pnl-filter.util'
import { RouteGroup } from '../route-groups/route-groups.service'

export interface SimulationRoute {
  origin: string // raw station, e.g. 'Jabo'
  originLabel: string // display, e.g. 'CGK'
  dest: string
  // From the DC-pair master's extra_fields. Null when the master has no row for a pair that TOs
  // nevertheless carry (FULL JOIN), or the cell is blank. The engine's default rate per kg is
  // rateSpx - pph2 - disc15, the same net figure v_pnl_to bills.
  rateSpx: number | null
  pph2: number | null
  disc15: number | null
  hasData: boolean // the pair appears in v_pnl_to
}

export interface SimulationVendor {
  vendor: string // raw, byte-identical to v_pnl_to.vendor
  inMaster: boolean // present in air_shipments_smu
  hasData: boolean // present in v_pnl_to
}

// One cycle × route × vendor × airline cell, TO grain. vendor/airline null = TOs with no booking;
// they carry real weight and revenue and must count toward route tonnage.
export interface SimulationHistoryRow {
  cycle: string // YYYY-MM-1H | YYYY-MM-2H on the requested basis
  origin: string
  dest: string
  vendor: string | null
  airline: string | null
  awbCount: number
  weight: number // SUM(gross_weight)
  revenue: number // net of revenue_discount
  costAll: number // COALESCE(SUM(cost_to)), reconciles with /pnl/summary
  costSmu: number // COALESCE(SUM(cost_smu_awb * weight_share))
  // Lane-cost inputs: only TOs whose cost is known AND booked (not the route fallback). cost/kg of
  // a lane = laneCost / laneWeight. Kept apart from the totals above so an estimated or missing
  // cost can never masquerade as a cheap lane.
  laneWeightAll: number
  laneCostAll: number
  laneWeightSmu: number
  laneCostSmu: number
}

export interface SimulationSource {
  basis: DateBasis
  cycles: string[] // ascending, every cycle that has at least one history row
  routes: SimulationRoute[]
  routeGroups: RouteGroup[]
  vendors: SimulationVendor[]
  history: SimulationHistoryRow[]
}

export interface ScenarioSummary {
  id: string
  name: string
  description: string | null
  revision: number
  updatedAt: string // ISO
  updatedBy: string | null // username, null when the user was deleted
}

export interface ScenarioDetail extends ScenarioSummary {
  payload: Record<string, unknown>
}
```

- [ ] **Step 2: Write the failing unit test**

`route-simulation-source.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteGroupsService } from '../route-groups/route-groups.service'

describe('RouteSimulationSourceService', () => {
  let service: RouteSimulationSourceService
  let dataSource: { query: jest.Mock }
  let routeGroups: { findAll: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    routeGroups = { findAll: jest.fn().mockResolvedValue([{ id: 'g1', name: 'Sumatera', description: null, routes: [] }]) }
    const module = await Test.createTestingModule({
      providers: [
        RouteSimulationSourceService,
        { provide: DataSource, useValue: dataSource },
        { provide: RouteGroupsService, useValue: routeGroups },
      ],
    }).compile()
    service = module.get(RouteSimulationSourceService)
  })

  // Order of dataSource.query calls inside getSource: routes, vendors, history.
  const arrange = (routes: unknown[], vendors: unknown[], history: unknown[]) => {
    dataSource.query
      .mockResolvedValueOnce(routes)
      .mockResolvedValueOnce(vendors)
      .mockResolvedValueOnce(history)
  }

  it('maps routes with numeric rates, the origin label and the hasData flag', async () => {
    arrange(
      [{ origin: 'Jabo', dest: 'Aceh', rate_spx: '32000', pph_2: '640', disc_15: '480', has_data: true },
       { origin: 'Medan', dest: 'Batam', rate_spx: null, pph_2: null, disc_15: null, has_data: false }],
      [], [],
    )
    const src = await service.getSource()
    expect(src.routes).toEqual([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', rateSpx: 32000, pph2: 640, disc15: 480, hasData: true },
      { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', rateSpx: null, pph2: null, disc15: null, hasData: false },
    ])
  })

  it('keeps unbooked history rows with a null vendor and derives ascending cycles', async () => {
    arrange([], [], [
      { cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awb_count: 36,
        weight: '6428', revenue: '198000000', cost_all: '120000000', cost_smu: '110000000',
        lane_weight_all: '0', lane_cost_all: '0', lane_weight_smu: '0', lane_cost_smu: '0' },
      { cycle: '2026-05-1H', origin: 'Jabo', dest: 'Aceh', vendor: 'PRIME', airline: 'Garuda Air CGK', awb_count: 8,
        weight: '1889', revenue: '58000000', cost_all: '41700000', cost_smu: '38500000',
        lane_weight_all: '1889', lane_cost_all: '41700000', lane_weight_smu: '1889', lane_cost_smu: '38500000' },
    ])
    const src = await service.getSource()
    expect(src.cycles).toEqual(['2026-05-1H', '2026-05-2H'])
    expect(src.history[0]).toEqual({
      cycle: '2026-05-2H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 36,
      weight: 6428, revenue: 198000000, costAll: 120000000, costSmu: 110000000,
      laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,
    })
    expect(src.history[1].vendor).toBe('PRIME')
  })

  it('maps vendors and embeds route groups', async () => {
    arrange([], [{ vendor: 'ESP', in_master: true, has_data: true }], [])
    const src = await service.getSource()
    expect(src.vendors).toEqual([{ vendor: 'ESP', inMaster: true, hasData: true }])
    expect(src.routeGroups).toHaveLength(1)
    expect(routeGroups.findAll).toHaveBeenCalled()
  })

  it('groups history on the cycle column of the requested basis, defaulting to date', async () => {
    arrange([], [], [])
    const def = await service.getSource()
    expect(def.basis).toBe('date')
    expect(dataSource.query.mock.calls[2][0]).toContain('cycle_date')

    arrange([], [], [])
    const atd = await service.getSource('atd_origin')
    expect(atd.basis).toBe('atd_origin')
    expect(dataSource.query.mock.calls[5][0]).toContain('cycle_atd')
  })

  it('prorates AWB-grain SMU cost by weight_share and excludes estimated cost from lane cost', async () => {
    arrange([], [], [])
    await service.getSource()
    const sql: string = dataSource.query.mock.calls[2][0]
    expect(sql).toContain('cost_smu_awb * weight_share')
    expect(sql).toContain('NOT is_cost_estimated')
    expect(sql).not.toMatch(/SUM\(cost_smu_awb\)/)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/backend && pnpm exec jest route-simulation-source.service --runInBand`
Expected: FAIL, `Cannot find module './route-simulation-source.service'`.

- [ ] **Step 4: Write the service**

`route-simulation-source.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { BASIS_COLS, resolveBasis } from '../pnl/pnl-filter.util'
import { originLabel } from '../../common/utils/origin-labels.util'
import { RouteGroupsService } from '../route-groups/route-groups.service'
import {
  SimulationHistoryRow,
  SimulationRoute,
  SimulationSource,
  SimulationVendor,
} from './route-simulation.types'

const toNum = (v: unknown): number => Number(v ?? 0)
const toNumOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

@Injectable()
export class RouteSimulationSourceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly routeGroups: RouteGroupsService,
  ) {}

  // Everything the simulation page reads, in one round trip. All cycles are returned rather than a
  // window: the payload is tiny (one row per cycle x route x vendor x airline — 81 rows on the dev
  // database) and the page re-folds it client-side whenever the user moves the history range.
  async getSource(basis?: string): Promise<SimulationSource> {
    const resolved = resolveBasis(basis)
    const [routes, vendors, history, routeGroups] = await Promise.all([
      this.getRoutes(),
      this.getVendors(),
      this.getHistory(BASIS_COLS[resolved].cycle),
      this.routeGroups.findAll(),
    ])
    const cycles = [...new Set(history.map((h) => h.cycle))].sort()
    return { basis: resolved, cycles, routes, routeGroups, vendors, history }
  }

  // DC-pair master FULL JOIN the pairs TOs carry. FULL rather than LEFT (unlike
  // RouteGroupsService.getAvailableRoutes) so a pair that flew but fell out of the master is
  // still simulated — with a null rate the user has to fill in, which beats a missing route.
  // One master row per pair: the one that has a rate wins, then the newest — the same tie-break
  // v_pnl_to's station_map uses, so the rate shown here is the rate revenue was billed at.
  private async getRoutes(): Promise<SimulationRoute[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT ON (origin, dest) origin, dest, rate_spx, pph_2, disc_15
        FROM (
          SELECT
            NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
            NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest,
            pnl_parse_numeric(extra_fields->>'rate_spx')            AS rate_spx,
            pnl_parse_numeric(extra_fields->>'pph_2')               AS pph_2,
            pnl_parse_numeric(extra_fields->>'disc_15')             AS disc_15,
            updated_at, id
          FROM air_shipments_data
          WHERE service = 'Air'
        ) m
        WHERE origin IS NOT NULL AND dest IS NOT NULL
        ORDER BY origin, dest, (rate_spx IS NOT NULL) DESC, updated_at DESC NULLS LAST, id DESC
      ),
      used AS (
        SELECT DISTINCT origin_station AS origin, dest_station AS dest
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      )
      SELECT
        COALESCE(m.origin, u.origin) AS origin,
        COALESCE(m.dest,   u.dest)   AS dest,
        m.rate_spx, m.pph_2, m.disc_15,
        (u.origin IS NOT NULL)       AS has_data
      FROM master m
      FULL OUTER JOIN used u ON u.origin = m.origin AND u.dest = m.dest
      ORDER BY 1, 2
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      origin: r.origin as string,
      originLabel: originLabel(r.origin as string),
      dest: r.dest as string,
      rateSpx: toNumOrNull(r.rate_spx),
      pph2: toNumOrNull(r.pph_2),
      disc15: toNumOrNull(r.disc_15),
      hasData: r.has_data === true || r.has_data === 't',
    }))
  }

  // Same union as VendorGroupsService.getAvailableVendors, re-run here because that endpoint is
  // gated on read.vendor_group and this page must not require it (see PnlService.getRoutes for the
  // same trade-off). Names are raw: only NULL and '' are excluded.
  private async getVendors(): Promise<SimulationVendor[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> ''
      ),
      used AS (
        SELECT DISTINCT vendor FROM v_pnl_to WHERE vendor IS NOT NULL AND vendor <> ''
      )
      SELECT v.vendor,
             (v.vendor IN (SELECT vendor FROM master)) AS in_master,
             (v.vendor IN (SELECT vendor FROM used))   AS has_data
      FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
      ORDER BY v.vendor
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      vendor: r.vendor as string,
      inMaster: r.in_master === true || r.in_master === 't',
      hasData: r.has_data === true || r.has_data === 't',
    }))
  }

  // TO grain, not AWB grain: every v_pnl_to column used here is either TO-level or prorated by
  // weight_share, so a TO-level SUM reconciles exactly with /pnl/summary (verified on dev: weight,
  // net revenue and cost_to all match to the rupiah). The four lane_* columns are the subset whose
  // cost is known and booked — a fallback-costed TO is priced off the most expensive SMU row of its
  // route, which says nothing about what its vendor x airline actually costs.
  private async getHistory(cycleCol: string): Promise<SimulationHistoryRow[]> {
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
        COALESCE(SUM(cost_smu_awb * weight_share), 0)                          AS cost_smu,
        COALESCE(SUM(gross_weight) FILTER (WHERE NOT is_cost_estimated AND cost_to IS NOT NULL), 0)
                                                                               AS lane_weight_all,
        COALESCE(SUM(cost_to) FILTER (WHERE NOT is_cost_estimated AND cost_to IS NOT NULL), 0)
                                                                               AS lane_cost_all,
        COALESCE(SUM(gross_weight) FILTER (WHERE NOT is_cost_estimated AND cost_smu_awb IS NOT NULL), 0)
                                                                               AS lane_weight_smu,
        COALESCE(SUM(cost_smu_awb * weight_share)
                 FILTER (WHERE NOT is_cost_estimated AND cost_smu_awb IS NOT NULL), 0)
                                                                               AS lane_cost_smu
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
      costSmu: toNum(r.cost_smu),
      laneWeightAll: toNum(r.lane_weight_all),
      laneCostAll: toNum(r.lane_cost_all),
      laneWeightSmu: toNum(r.lane_weight_smu),
      laneCostSmu: toNum(r.lane_cost_smu),
    }))
  }
}
```

- [ ] **Step 5: Run the unit test**

Run: `cd apps/backend && pnpm exec jest route-simulation-source.service --runInBand`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the integration test (real SQL)**

`route-simulation-source.integration.spec.ts`, following the skip/fail-loud harness from `pnl-analytics.integration.spec.ts`:

```ts
/**
 * Real-database check for /route-simulation/source. The unit spec only proves which SQL text is
 * sent; this proves Postgres accepts it and, more importantly, that the history rows reconcile
 * with /pnl/summary for every cycle — the simulation's tonnage and the PnL page must never tell
 * two different stories about the same period.
 *
 * Run with: cd apps/backend && pnpm exec jest route-simulation-source.integration --runInBand
 */
import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource } from 'typeorm'
import { PnlService } from '../pnl/pnl.service'
import { RouteGroupsService } from '../route-groups/route-groups.service'
import { RouteSimulationSourceService } from './route-simulation-source.service'

const DATABASE_URL_EXPLICIT = !!process.env.DATABASE_URL
const CONNECTION_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/app'

function isDbReachable(url: string): boolean {
  try {
    const u = new URL(url)
    execSync(`pg_isready -h ${u.hostname} -p ${u.port || '5432'} -U ${u.username || 'postgres'}`, {
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

const DB_AVAILABLE = isDbReachable(CONNECTION_URL)

describe('RouteSimulationSourceService (integration)', () => {
  if (!DB_AVAILABLE) {
    if (DATABASE_URL_EXPLICIT) {
      it('FAILS LOUDLY — DATABASE_URL is set but Postgres is unreachable', () => {
        throw new Error(`DATABASE_URL=${CONNECTION_URL} is set, but pg_isready could not reach it.`)
      })
      return
    }
    // eslint-disable-next-line no-console
    console.warn(`\nSKIPPED route-simulation-source.integration.spec.ts — Postgres unreachable at ${CONNECTION_URL}\n`)
    it.skip('SKIPPED — database unreachable', () => {})
    return
  }

  let dataSource: DataSource
  let service: RouteSimulationSourceService
  let pnl: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: CONNECTION_URL, synchronize: false, logging: false })
    await dataSource.initialize()
    // RouteGroupsService's repository is unused by findAll (raw SQL), so a stub is enough.
    const groups = new RouteGroupsService(dataSource, {} as never)
    service = new RouteSimulationSourceService(dataSource, groups)
    pnl = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('returns routes with rates, vendors and history from the dev data', async () => {
    const src = await service.getSource()
    expect(src.cycles.length).toBeGreaterThan(0)
    expect(src.routes.some((r) => r.hasData && r.rateSpx != null)).toBe(true)
    expect(src.history.some((h) => h.vendor === null)).toBe(true) // unbooked TOs are kept
    expect(src.history.some((h) => h.vendor !== null && h.laneWeightSmu > 0)).toBe(true)
  })

  it('reconciles weight-independent totals with /pnl/summary per cycle', async () => {
    const src = await service.getSource()
    for (const cycle of src.cycles) {
      const rows = src.history.filter((h) => h.cycle === cycle)
      const summary = await pnl.getSummary(cycle)
      const revenue = rows.reduce((s, h) => s + h.revenue, 0)
      const cost = rows.reduce((s, h) => s + h.costAll, 0)
      // getSummary has no station filter; any TO with a null station is excluded here, so allow
      // only that gap. On dev it is zero.
      expect(revenue).toBeCloseTo(summary.totalRevenue, -2)
      expect(cost).toBeCloseTo(summary.totalCost, -2)
    }
  })

  it('never reports lane weight above total weight', async () => {
    const src = await service.getSource()
    for (const h of src.history) {
      expect(h.laneWeightAll).toBeLessThanOrEqual(h.weight + 1e-6)
      expect(h.laneWeightSmu).toBeLessThanOrEqual(h.weight + 1e-6)
    }
  })
})
```

- [ ] **Step 7: Run the integration test**

Run: `cd apps/backend && pnpm exec jest route-simulation-source.integration --runInBand`
Expected: PASS (3 tests). If it fails on reconciliation, check `SELECT COUNT(*) FROM v_pnl_to WHERE cycle_date IS NOT NULL AND (origin_station IS NULL OR dest_station IS NULL)`: it must be 0 (0 on 2026-10-03). If it isn't, the gap is TOs with no station and the assertion needs to subtract them.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/route-simulation/route-simulation.types.ts apps/backend/src/modules/route-simulation/route-simulation-source.*
git commit -m "$(cat <<'EOF'
feat(route-sim): serve routes, vendors and lane history for the simulation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Scenario CRUD service + DTOs

**Files:**
- Create: `apps/backend/src/modules/route-simulation/dto/save-scenario.dto.ts`
- Create: `apps/backend/src/modules/route-simulation/dto/save-scenario.dto.spec.ts`
- Create: `apps/backend/src/modules/route-simulation/route-simulation-scenarios.service.ts`
- Test: `apps/backend/src/modules/route-simulation/route-simulation-scenarios.service.spec.ts`

**Interfaces:**
- Consumes: `RouteSimulationScenarioEntity` (Task 1), `ScenarioSummary`/`ScenarioDetail` (Task 2)
- Produces: `RouteSimulationScenariosService.findAll(): Promise<ScenarioSummary[]>`, `.findOne(id): Promise<ScenarioDetail>`, `.create(dto: CreateScenarioDto, userId: string): Promise<ScenarioDetail>`, `.update(id, dto: UpdateScenarioDto, userId): Promise<ScenarioDetail>`, `.remove(id): Promise<void>`; `CreateScenarioDto { name; description?; payload }`, `UpdateScenarioDto { revision; name?; description?; payload? }`

- [ ] **Step 1: Write the failing DTO test**

```ts
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateScenarioDto, UpdateScenarioDto } from './save-scenario.dto'

const errorsOf = <T extends object>(cls: new () => T, payload: unknown) =>
  validateSync(plainToInstance(cls, payload) as object).map((e) => e.property)

it('accepts a named scenario with an object payload', () => {
  expect(errorsOf(CreateScenarioDto, { name: 'Baseline Okt', payload: { version: 1 } })).toEqual([])
})

it('rejects a blank name and a non-object payload', () => {
  expect(errorsOf(CreateScenarioDto, { name: '', payload: [] })).toEqual(['name', 'payload'])
})

it('requires the revision on update so a stale save can be refused', () => {
  expect(errorsOf(UpdateScenarioDto, { name: 'x' })).toEqual(['revision'])
  expect(errorsOf(UpdateScenarioDto, { revision: 3 })).toEqual([])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && pnpm exec jest save-scenario.dto --runInBand`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the DTOs**

```ts
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator'

// The payload is the frontend engine's ScenarioPayload; it is validated only as an object here
// (and for size in the service). Per-field decorators would duplicate a shape the backend never
// reads and would turn every engine change into a two-app deploy.
export class CreateScenarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string | null

  @IsObject()
  payload: Record<string, unknown>
}

export class UpdateScenarioDto {
  // The revision the client loaded. A mismatch means someone saved in between → 409.
  @IsInt()
  @Min(1)
  revision: number

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  // null clears, absent leaves unchanged.
  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>
}
```

- [ ] **Step 4: Run the DTO test**

Run: `cd apps/backend && pnpm exec jest save-scenario.dto --runInBand`
Expected: PASS.

- [ ] **Step 5: Write the failing service test**

```ts
import { ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'

const row = (over: Partial<RouteSimulationScenarioEntity> = {}): RouteSimulationScenarioEntity => ({
  id: 's1', name: 'Baseline', description: null, payload: { version: 1 }, revision: 2,
  updatedBy: 'u1', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
  ...over,
})

describe('RouteSimulationScenariosService', () => {
  let service: RouteSimulationScenariosService
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; delete: jest.Mock }
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => row({ ...v, id: 's-new', revision: 1 })),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: 1 })),
    }
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        RouteSimulationScenariosService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(RouteSimulationScenarioEntity), useValue: repo },
      ],
    }).compile()
    service = module.get(RouteSimulationScenariosService)
  })

  it('lists summaries without payloads, newest first, with the editor username', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 's1', name: 'Baseline', description: null, revision: 2, updated_at: new Date('2026-10-02T00:00:00Z'), username: 'faris' },
    ])
    await expect(service.findAll()).resolves.toEqual([
      { id: 's1', name: 'Baseline', description: null, revision: 2, updatedAt: '2026-10-02T00:00:00.000Z', updatedBy: 'faris' },
    ])
    expect(dataSource.query.mock.calls[0][0]).not.toContain('payload')
  })

  it('throws 404 for a missing scenario', async () => {
    dataSource.query.mockResolvedValueOnce([])
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('creates with a trimmed name and the acting user', async () => {
    repo.findOne.mockResolvedValueOnce(null)
    dataSource.query.mockResolvedValueOnce([{ ...row({ id: 's-new', name: 'Okt', revision: 1 }), updated_at: new Date(), username: 'faris' }])
    await service.create({ name: '  Okt  ', payload: { version: 1 } }, 'u1')
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Okt', updatedBy: 'u1', revision: 1 }))
  })

  it('refuses a duplicate name with 409', async () => {
    repo.findOne.mockResolvedValueOnce(row())
    await expect(service.create({ name: 'Baseline', payload: {} }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses a payload over 90 KB with 413', async () => {
    const payload = { blob: 'x'.repeat(91 * 1024) }
    await expect(service.create({ name: 'Big', payload }, 'u1')).rejects.toBeInstanceOf(PayloadTooLargeException)
  })

  it('updates only when the revision matches, bumping it by one', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 2 })) // existence
    dataSource.query
      .mockResolvedValueOnce([{ id: 's1' }]) // the guarded UPDATE ... RETURNING
      .mockResolvedValueOnce([{ ...row({ revision: 3 }), updated_at: new Date(), username: 'faris' }])
    const out = await service.update('s1', { revision: 2, payload: { version: 1, x: 1 } }, 'u1')
    expect(out.revision).toBe(3)
    const [sql, params] = dataSource.query.mock.calls[0]
    expect(sql).toContain('revision = revision + 1')
    expect(sql).toContain('WHERE id = $1 AND revision = $2')
    expect(params.slice(0, 2)).toEqual(['s1', 2])
  })

  it('returns 409 when someone saved in between', async () => {
    repo.findOne.mockResolvedValueOnce(row({ revision: 3 }))
    dataSource.query.mockResolvedValueOnce([]) // UPDATE matched no row
    await expect(service.update('s1', { revision: 2, name: 'x' }, 'u1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('deletes and 404s when nothing was removed', async () => {
    await service.remove('s1')
    expect(repo.delete).toHaveBeenCalledWith({ id: 's1' })
    repo.delete.mockResolvedValueOnce({ affected: 0 })
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/backend && pnpm exec jest route-simulation-scenarios.service --runInBand`
Expected: FAIL, module not found.

- [ ] **Step 7: Write the service**

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'
import { CreateScenarioDto, UpdateScenarioDto } from './dto/save-scenario.dto'
import { ScenarioDetail, ScenarioSummary } from './route-simulation.types'

const UNIQUE_VIOLATION = '23505'
const NAME_UNIQUE_CONSTRAINT = 'uq_route_simulation_scenarios_name'
// A full scenario (dozens of accounts, every lane edited) serialises to a few tens of KB. Kept under
// the 100 KB default JSON body limit of main.ts so an oversized save gets this clear 413 rather
// than the body parser's generic one.
const MAX_PAYLOAD_BYTES = 90 * 1024

const SELECT_COLUMNS = `
  s.id, s.name, s.description, s.revision, s.updated_at, u.username
`

@Injectable()
export class RouteSimulationScenariosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RouteSimulationScenarioEntity)
    private readonly repo: Repository<RouteSimulationScenarioEntity>,
  ) {}

  // Summaries only: the list feeds a dropdown, and payloads are fetched one at a time on open.
  async findAll(): Promise<ScenarioSummary[]> {
    const rows = await this.dataSource.query(`
      SELECT ${SELECT_COLUMNS}
      FROM route_simulation_scenarios s
      LEFT JOIN users u ON u.id = s.updated_by
      ORDER BY s.updated_at DESC, s.name
    `)
    return (rows as Record<string, unknown>[]).map((r) => this.toSummary(r))
  }

  async findOne(id: string): Promise<ScenarioDetail> {
    const rows = await this.dataSource.query(
      `
      SELECT ${SELECT_COLUMNS}, s.payload
      FROM route_simulation_scenarios s
      LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.id = $1
      `,
      [id],
    )
    if (!rows.length) throw new NotFoundException(`Scenario ${id} not found`)
    return { ...this.toSummary(rows[0]), payload: rows[0].payload as Record<string, unknown> }
  }

  async create(dto: CreateScenarioDto, userId: string): Promise<ScenarioDetail> {
    this.assertPayloadSize(dto.payload)
    const name = dto.name.trim()
    await this.assertNameFree(name)
    try {
      const saved = await this.repo.save(
        this.repo.create({
          name,
          description: this.normalizeDescription(dto.description),
          payload: dto.payload,
          revision: 1,
          updatedBy: userId,
        }),
      )
      return this.findOne(saved.id)
    } catch (err) {
      this.throwIfNameUniqueViolation(err, name)
      throw err
    }
  }

  // The revision check is inside the UPDATE's WHERE, so check-and-write is one atomic statement:
  // two saves racing on the same revision cannot both succeed.
  async update(id: string, dto: UpdateScenarioDto, userId: string): Promise<ScenarioDetail> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException(`Scenario ${id} not found`)
    if (dto.payload) this.assertPayloadSize(dto.payload)

    const name = dto.name?.trim()
    if (name && name !== existing.name) await this.assertNameFree(name, id)

    const sets: string[] = ['revision = revision + 1', 'updated_at = now()', 'updated_by = $3']
    const params: unknown[] = [id, dto.revision, userId]
    const bind = (v: unknown) => {
      params.push(v)
      return `$${params.length}`
    }
    if (name) sets.push(`name = ${bind(name)}`)
    if (dto.description !== undefined) {
      sets.push(`description = ${bind(this.normalizeDescription(dto.description))}`)
    }
    if (dto.payload) sets.push(`payload = ${bind(JSON.stringify(dto.payload))}::jsonb`)

    let updated: unknown[]
    try {
      updated = await this.dataSource.query(
        `UPDATE route_simulation_scenarios SET ${sets.join(', ')}
         WHERE id = $1 AND revision = $2
         RETURNING id`,
        params,
      )
    } catch (err) {
      this.throwIfNameUniqueViolation(err, name ?? existing.name)
      throw err
    }
    if (!updated.length) {
      throw new ConflictException(
        'This scenario was saved by someone else after you opened it. Reload it before saving.',
      )
    }
    return this.findOne(id)
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id })
    if (!res.affected) throw new NotFoundException(`Scenario ${id} not found`)
  }

  private toSummary(r: Record<string, unknown>): ScenarioSummary {
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      revision: Number(r.revision),
      updatedAt: new Date(r.updated_at as string | Date).toISOString(),
      updatedBy: (r.username as string | null) ?? null,
    }
  }

  private assertPayloadSize(payload: Record<string, unknown>): void {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('Scenario payload exceeds 90 KB')
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.findOne({ where: { name } })
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(`A scenario named "${name}" already exists`)
    }
  }

  private normalizeDescription(description?: string | null): string | null {
    if (description == null) return null
    const trimmed = description.trim()
    return trimmed === '' ? null : trimmed
  }

  private throwIfNameUniqueViolation(err: unknown, name: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NAME_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`A scenario named "${name}" already exists`)
    }
  }
}
```

- [ ] **Step 8: Run the service test**

Run: `cd apps/backend && pnpm exec jest route-simulation-scenarios.service --runInBand`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/route-simulation/dto apps/backend/src/modules/route-simulation/route-simulation-scenarios.*
git commit -m "$(cat <<'EOF'
feat(route-sim): add named scenario CRUD with optimistic revision check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Controller, module, and wiring

**Files:**
- Create: `apps/backend/src/modules/route-simulation/route-simulation.controller.ts`
- Create: `apps/backend/src/modules/route-simulation/route-simulation.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/route-simulation/route-simulation.controller.spec.ts`

**Interfaces:**
- Consumes: both services from Tasks 2–3; `CurrentUser`/`AuthenticatedUser` from `../../common/decorators/current-user.decorator`
- Produces (HTTP, prefix `/api`):
  - `GET /route-simulation/source?basis=` → `SimulationSource` (`read.route_simulation`)
  - `GET /route-simulation/scenarios` → `ScenarioSummary[]` (`read.route_simulation`)
  - `GET /route-simulation/scenarios/:id` → `ScenarioDetail` (`read.route_simulation`)
  - `POST /route-simulation/scenarios` → `ScenarioDetail` (`create.route_simulation`)
  - `PATCH /route-simulation/scenarios/:id` → `ScenarioDetail`, 409 on a stale revision (`update.route_simulation`)
  - `DELETE /route-simulation/scenarios/:id` → 204 (`delete.route_simulation`)

- [ ] **Step 1: Write the failing controller test**

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { RouteSimulationController } from './route-simulation.controller'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('RouteSimulationController', () => {
  let controller: RouteSimulationController
  const source = { getSource: jest.fn().mockResolvedValue({}) }
  const scenarios = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(undefined),
  }
  const user = { id: 'u1', username: 'faris', organizationId: null, isSuperAdmin: false, roles: [], permissions: [] }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      controllers: [RouteSimulationController],
      providers: [
        { provide: RouteSimulationSourceService, useValue: source },
        { provide: RouteSimulationScenariosService, useValue: scenarios },
      ],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(RouteSimulationController)
  })

  it('passes the basis to the source service', async () => {
    await controller.getSource('atd_origin')
    expect(source.getSource).toHaveBeenCalledWith('atd_origin')
  })

  it('passes the acting user id to create and update', async () => {
    await controller.create({ name: 'A', payload: {} }, user)
    expect(scenarios.create).toHaveBeenCalledWith({ name: 'A', payload: {} }, 'u1')
    await controller.update('s1', { revision: 1 }, user)
    expect(scenarios.update).toHaveBeenCalledWith('s1', { revision: 1 }, 'u1')
  })

  it('delegates list, get and remove', async () => {
    await controller.findAll()
    await controller.findOne('s1')
    await controller.remove('s1')
    expect(scenarios.findAll).toHaveBeenCalled()
    expect(scenarios.findOne).toHaveBeenCalledWith('s1')
    expect(scenarios.remove).toHaveBeenCalledWith('s1')
  })

  it.each([
    ['getSource', Permission.READ_ROUTE_SIMULATION],
    ['findAll', Permission.READ_ROUTE_SIMULATION],
    ['findOne', Permission.READ_ROUTE_SIMULATION],
    ['create', Permission.CREATE_ROUTE_SIMULATION],
    ['update', Permission.UPDATE_ROUTE_SIMULATION],
    ['remove', Permission.DELETE_ROUTE_SIMULATION],
  ])('gates %s on its own permission', (method, permission) => {
    const proto = RouteSimulationController.prototype as unknown as Record<string, object>
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toBe(permission)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && pnpm exec jest route-simulation.controller --runInBand`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the controller**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { CreateScenarioDto, UpdateScenarioDto } from './dto/save-scenario.dto'

@ApiTags('Route Simulation')
@Controller('route-simulation')
@UseGuards(JwtAuthGuard)
export class RouteSimulationController {
  constructor(
    private readonly source: RouteSimulationSourceService,
    private readonly scenarios: RouteSimulationScenariosService,
  ) {}

  @Get('source')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  getSource(@Query('basis') basis?: string) {
    return this.source.getSource(basis)
  }

  @Get('scenarios')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  findAll() {
    return this.scenarios.findAll()
  }

  @Get('scenarios/:id')
  @Authorize(Permission.READ_ROUTE_SIMULATION)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.scenarios.findOne(id)
  }

  @Post('scenarios')
  @Authorize(Permission.CREATE_ROUTE_SIMULATION)
  create(@Body() dto: CreateScenarioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.scenarios.create(dto, user.id)
  }

  @Patch('scenarios/:id')
  @Authorize(Permission.UPDATE_ROUTE_SIMULATION)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScenarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scenarios.update(id, dto, user.id)
  }

  @Delete('scenarios/:id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_ROUTE_SIMULATION)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.scenarios.remove(id)
  }
}
```

- [ ] **Step 4: Write the module and register it**

`route-simulation.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouteGroupsModule } from '../route-groups/route-groups.module'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'
import { RouteSimulationSourceService } from './route-simulation-source.service'
import { RouteSimulationScenariosService } from './route-simulation-scenarios.service'
import { RouteSimulationController } from './route-simulation.controller'

@Module({
  imports: [TypeOrmModule.forFeature([RouteSimulationScenarioEntity]), RouteGroupsModule],
  providers: [RouteSimulationSourceService, RouteSimulationScenariosService],
  controllers: [RouteSimulationController],
})
export class RouteSimulationModule {}
```

In `apps/backend/src/app.module.ts`, add the import next to `VendorGroupsModule`:

```ts
import { RouteSimulationModule } from './modules/route-simulation/route-simulation.module'
```

and add `RouteSimulationModule,` to `imports` right after `VendorGroupsModule,`.

- [ ] **Step 5: Run the module's tests and the typecheck**

Run:
```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest src/modules/route-simulation src/common/swagger --runInBand && pnpm exec tsc --noEmit
```
Expected: every suite PASSes; tsc reports no errors.

- [ ] **Step 6: Smoke-test against the dev server**

Run (with the backend running via `pnpm dev:backend`, logged in as superadmin; get a token the way you usually do, e.g. through `POST /api/auth/login`):
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/route-simulation/source" | jq '{basis, cycles, routes: (.routes|length), vendors: [.vendors[].vendor], history: (.history|length)}'
```
Expected: `basis: "date"`, `cycles: ["2026-05-1H","2026-05-2H"]`, ~31 routes, vendors `BEMAC, ESP, PRIME, SILI, SRA`, ~81 history rows.

- [ ] **Step 7: Run the full backend suite once**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
Expected: every suite PASSes.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/route-simulation apps/backend/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(route-sim): expose route simulation source and scenario endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```
