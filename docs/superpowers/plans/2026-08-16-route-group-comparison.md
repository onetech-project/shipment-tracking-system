# Route Group & PnL Group Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin group origin→destination routes into named Route Groups, then compare revenue and cost across selected groups per date in a new PnL tab, with each cost cell expanding into SMU / RA / SG Out / SG In.

**Architecture:** Two new tables (`route_groups`, `route_group_routes`) store the groups; many-to-many falls out of the join table so a route can belong to any number of groups. A new NestJS module `route-groups` serves CRUD. The PnL comparison is one extra method on the existing `PnlService`, aggregating `v_pnl_to` joined to `route_group_routes` — the join is what makes overlapping groups work, since a TO on a shared route produces one result row per group. All arithmetic (including footers) lives in the backend, matching the module's existing convention; the frontend only renders.

**Tech Stack:** NestJS + TypeORM + raw SQL against PostgreSQL; Next.js App Router + React + TanStack Query + Tailwind/shadcn; Jest for both sides, React Testing Library on the frontend.

**Reference spec:** `docs/superpowers/specs/2026-08-16-route-group-comparison-design.md`

## Global Constraints

- Branch is `feature/route-group-comparison`. Do not merge to `development` or `main`.
- All numbers rendered in the UI must come from the backend. No arithmetic in React components.
- Divide-by-zero yields `null`, never `NaN` or `Infinity`.
- Dates cross the wire as `YYYY-MM-DD` strings produced by `TO_CHAR(...)`, never as bare `::DATE` — the `pg` driver turns a `DATE` column into a JS `Date` object which cannot be matched against the calendar date list.
- Cost component sums MUST carry `FILTER (WHERE v.cost_to IS NOT NULL)`. `cost_to` is NULL whenever a rate lookup failed; without the filter the four detail rows exceed the cell they expand from.
- Permission names must match `^(read|create|update|delete)\.[a-z][a-z0-9_]*$` — enforced by a DB check constraint.
- Backend tests: `cd apps/backend && pnpm test -- <pattern>`. Frontend tests: `cd apps/frontend && pnpm test -- <pattern>`.
- Running the **full** backend suite needs both a heap bump and serial execution: `cd apps/backend && NODE_OPTIONS=--max-old-space-size=4096 pnpm test -- --runInBand`. Single-file runs do not need this.
- Empty cell renders `—`, a real zero renders `0`. Never blank.
- Commit after every task. Conventional commit prefixes (`feat:`, `test:`, `refactor:`).

---

## File Structure

**Backend — create**

| File | Responsibility |
| --- | --- |
| `apps/backend/src/database/migrations/20260816000002-route-groups.ts` | The two tables + index |
| `apps/backend/src/common/utils/origin-labels.util.ts` | `ORIGIN_LABELS` + `originLabel()`, shared by the PnL and route-groups modules |
| `apps/backend/src/modules/route-groups/entities/route-group.entity.ts` | `route_groups` row |
| `apps/backend/src/modules/route-groups/entities/route-group-route.entity.ts` | `route_group_routes` row |
| `apps/backend/src/modules/route-groups/dto/create-route-group.dto.ts` | Create payload + validation |
| `apps/backend/src/modules/route-groups/dto/update-route-group.dto.ts` | Update payload |
| `apps/backend/src/modules/route-groups/route-groups.service.ts` | CRUD + `getAvailableRoutes()` |
| `apps/backend/src/modules/route-groups/route-groups.controller.ts` | HTTP surface + permissions |
| `apps/backend/src/modules/route-groups/route-groups.module.ts` | Wiring |
| `apps/backend/src/modules/route-groups/route-groups.service.spec.ts` | Service tests |
| `apps/backend/src/modules/route-groups/route-groups.controller.spec.ts` | Controller wiring tests |

**Backend — modify**

| File | Change |
| --- | --- |
| `packages/shared/src/auth/index.ts` | 4 new `Permission` enum members |
| `apps/backend/src/app.module.ts` | Register `RouteGroupsModule` |
| `apps/backend/src/modules/pnl/pnl.service.ts` | Import `ORIGIN_LABELS` from common; add comparison types + `getGroupComparison()` |
| `apps/backend/src/modules/pnl/pnl.controller.ts` | `GET breakdown/group-comparison` |
| `apps/backend/src/modules/pnl/pnl.service.spec.ts` | `getGroupComparison` tests |
| `apps/backend/src/modules/pnl/pnl.controller.spec.ts` | Endpoint wiring test |

**Frontend — create**

| File | Responsibility |
| --- | --- |
| `apps/frontend/src/features/route-groups/types.ts` | `RouteGroup`, `RouteGroupRoute`, `AvailableRoute`, payloads |
| `apps/frontend/src/features/route-groups/hooks/useRouteGroups.ts` | Queries + mutations |
| `apps/frontend/src/features/route-groups/components/RoutePicker.tsx` | Controlled checkbox picker grouped by origin |
| `apps/frontend/src/features/route-groups/components/RoutePicker.spec.tsx` | Picker tests |
| `apps/frontend/src/features/route-groups/components/RouteGroupForm.tsx` | Name + description + picker form |
| `apps/frontend/src/features/route-groups/components/DeleteRouteGroupDialog.tsx` | Delete confirmation |
| `apps/frontend/src/app/(dashboard)/route-groups/page.tsx` | List page + modals |
| `apps/frontend/src/features/pnl/utils/groupComparison.ts` | Pure projection + overlap detection |
| `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts` | Projection tests |
| `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx` | The comparison table renderer |
| `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx` | Renderer tests |
| `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx` | Tab container: select, states, overlap note |
| `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.spec.tsx` | Container tests |

**Frontend — modify**

| File | Change |
| --- | --- |
| `apps/frontend/src/components/layout/sidebar.tsx` | Route Group nav item |
| `apps/frontend/src/features/pnl/hooks/usePnl.ts` | Comparison types + `usePnlGroupComparison` |
| `apps/frontend/src/app/(dashboard)/pnl/page.tsx` | `'groups'` view |

---

## Task 1: Database schema and permissions

**Files:**
- Create: `apps/backend/src/database/migrations/20260816000002-route-groups.ts`
- Modify: `packages/shared/src/auth/index.ts:84-86`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `route_groups(id, name, description, created_at, updated_at)` and `route_group_routes(route_group_id, origin_station, dest_station)`; enum members `Permission.READ_ROUTE_GROUP`, `CREATE_ROUTE_GROUP`, `UPDATE_ROUTE_GROUP`, `DELETE_ROUTE_GROUP` with values `read.route_group`, `create.route_group`, `update.route_group`, `delete.route_group`.

- [ ] **Step 1: Write the migration**

Create `apps/backend/src/database/migrations/20260816000002-route-groups.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Named groups of origin→destination station pairs, used by the PnL group-comparison tab.
// The station pair is stored as text rather than a foreign key on purpose: no table has a
// station pair as its primary key. air_shipments_data is Google-Sheet-synced — its rows are
// DC pairs (55 Air rows collapse to 31 station pairs) and every row is rewritten on each sync,
// so its ids are not stable. The resolved station pair is the stable key, and it is exactly the
// key v_pnl_to aggregates on.
export class RouteGroups20260816000002 implements MigrationInterface {
  name = 'RouteGroups20260816000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_groups (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_route_groups"   PRIMARY KEY (id),
        CONSTRAINT "uq_route_groups_name" UNIQUE (name)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_group_routes (
        route_group_id UUID         NOT NULL,
        origin_station VARCHAR(100) NOT NULL,
        dest_station   VARCHAR(100) NOT NULL,
        CONSTRAINT "pk_route_group_routes"
          PRIMARY KEY (route_group_id, origin_station, dest_station),
        CONSTRAINT "fk_route_group_routes_group"
          FOREIGN KEY (route_group_id) REFERENCES route_groups(id) ON DELETE CASCADE
      )
    `)

    // Serves the join direction used by the comparison query: v_pnl_to → route_group_routes.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_route_group_routes_station
        ON route_group_routes (origin_station, dest_station)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS route_group_routes`)
    await queryRunner.query(`DROP TABLE IF EXISTS route_groups`)
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:run
```

Expected: output ends with `Migration RouteGroups20260816000002 has been executed successfully.`

- [ ] **Step 3: Verify the schema landed**

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app -c "\d route_group_routes"
```

Expected: three columns, primary key `pk_route_group_routes` on all three, foreign key to `route_groups(id)` with `ON DELETE CASCADE`, and index `idx_route_group_routes_station`.

- [ ] **Step 4: Verify the down migration is reversible**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:revert && pnpm migration:run
```

Expected: revert reports `RouteGroups20260816000002 has been reverted successfully`, then the re-run reports it executed successfully again.

- [ ] **Step 5: Add the permissions**

In `packages/shared/src/auth/index.ts`, after the `READ_BARHAL` / `CREATE_BARHAL` block (currently lines 83-85) and before the closing `}`:

```ts
  // Route Group — named sets of origin→destination station pairs used by the PnL
  // group-comparison tab. Reads gate both the menu and the group multi-select in PnL,
  // so roles that use PnL need read.route_group as well.
  READ_ROUTE_GROUP = 'read.route_group',
  CREATE_ROUTE_GROUP = 'create.route_group',
  UPDATE_ROUTE_GROUP = 'update.route_group',
  DELETE_ROUTE_GROUP = 'delete.route_group',
```

There is no seed migration: the permissions module seeds the `permissions` table from this enum on `onApplicationBootstrap`.

- [ ] **Step 6: Verify the shared package still type-checks**

```bash
cd /home/faris/code/esp/esp-dashboard/packages/shared && pnpm type-check
```

Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/database/migrations/20260816000002-route-groups.ts packages/shared/src/auth/index.ts
git commit -m "feat(route-group): add route_groups schema and permissions"
```

---

## Task 2: Shared origin-label helper

**Files:**
- Create: `apps/backend/src/common/utils/origin-labels.util.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:198-202`
- Test: `apps/backend/src/common/utils/origin-labels.util.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ORIGIN_LABELS: Record<string, string>` and `originLabel(origin: string): string` exported from `apps/backend/src/common/utils/origin-labels.util.ts`. Task 3 and Task 5 both import `originLabel`.

This is a pure move. `ORIGIN_LABELS` currently lives inside `pnl.service.ts` where the route-groups module cannot reach it without importing the PnL module. `common/utils` is the right home — the repo already places cross-cutting helpers there (`slug.util.ts`), and the frontend never needs this map because the backend always sends a finished `originLabel`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/utils/origin-labels.util.spec.ts`:

```ts
import { originLabel, ORIGIN_LABELS } from './origin-labels.util'

describe('originLabel', () => {
  it('maps the known raw station values to airport codes', () => {
    expect(originLabel('Jabo')).toBe('CGK')
    expect(originLabel('Surabaya')).toBe('SUB')
  })

  // A newly opened station should be visible rather than silently blank.
  it('falls back to the raw value for an unmapped origin', () => {
    expect(originLabel('Medan')).toBe('Medan')
  })

  it('exposes the map itself for callers that need to enumerate it', () => {
    expect(ORIGIN_LABELS).toEqual({ Jabo: 'CGK', Surabaya: 'SUB' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && pnpm test -- origin-labels.util.spec
```

Expected: FAIL — `Cannot find module './origin-labels.util'`.

- [ ] **Step 3: Write the helper**

Create `apps/backend/src/common/utils/origin-labels.util.ts`:

```ts
/**
 * Display labels for raw v_pnl_to origin_station values. Lives in common/ rather than inside the
 * PnL module because the route-groups module needs the same mapping for its route picker, and
 * neither module should have to import the other for a two-entry constant.
 *
 * The spreadsheet these reports mirror labels origins by airport code. Unknown origins fall back
 * to their raw value so a newly opened station is visible rather than silently blank.
 */
export const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Surabaya: 'SUB',
}

export function originLabel(origin: string): string {
  return ORIGIN_LABELS[origin] ?? origin
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && pnpm test -- origin-labels.util.spec
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Point pnl.service.ts at the helper**

In `apps/backend/src/modules/pnl/pnl.service.ts`, delete this block (currently lines 198-202):

```ts
// The spreadsheet this report mirrors labels origins by airport code. Unknown origins fall back
// to their raw value so a newly opened station is visible rather than silently blank.
const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Surabaya: 'SUB',
}
```

Add to the imports at the top of the file:

```ts
import { originLabel } from '../../common/utils/origin-labels.util'
```

Then in `getStations()`, replace:

```ts
      originLabel: ORIGIN_LABELS[r.origin_station] ?? r.origin_station,
```

with:

```ts
      originLabel: originLabel(r.origin_station),
```

- [ ] **Step 6: Verify the PnL suite still passes**

```bash
cd apps/backend && pnpm test -- pnl.service.spec
```

Expected: PASS, no failures. This is a refactor — no behaviour changed.

- [ ] **Step 7: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/common/utils/origin-labels.util.ts apps/backend/src/common/utils/origin-labels.util.spec.ts apps/backend/src/modules/pnl/pnl.service.ts
git commit -m "refactor(pnl): move ORIGIN_LABELS to common/utils"
```

---

## Task 3: Route-groups service — available routes

**Files:**
- Create: `apps/backend/src/modules/route-groups/entities/route-group.entity.ts`
- Create: `apps/backend/src/modules/route-groups/entities/route-group-route.entity.ts`
- Create: `apps/backend/src/modules/route-groups/route-groups.service.ts`
- Test: `apps/backend/src/modules/route-groups/route-groups.service.spec.ts`

**Interfaces:**
- Consumes: `originLabel()` from Task 2; the tables from Task 1.
- Produces:
  - `RouteGroupEntity` (`@Entity('route_groups')`, fields `id`, `name`, `description`, `createdAt`, `updatedAt`)
  - `RouteGroupRouteEntity` (`@Entity('route_group_routes')`, fields `routeGroupId`, `originStation`, `destStation`)
  - `interface RouteGroupRoute { origin: string; originLabel: string; dest: string }`
  - `interface AvailableRoute extends RouteGroupRoute { hasData: boolean }`
  - `RouteGroupsService.getAvailableRoutes(): Promise<AvailableRoute[]>`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/route-groups/route-groups.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

describe('RouteGroupsService', () => {
  let service: RouteGroupsService
  let dataSource: { query: jest.Mock }
  let groupRepo: { findOne: jest.Mock }
  let routeRepo: Record<string, jest.Mock>

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    groupRepo = { findOne: jest.fn() }
    routeRepo = {}
    const module = await Test.createTestingModule({
      providers: [
        RouteGroupsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(RouteGroupEntity), useValue: groupRepo },
        { provide: getRepositoryToken(RouteGroupRouteEntity), useValue: routeRepo },
      ],
    }).compile()
    service = module.get(RouteGroupsService)
  })

  describe('getAvailableRoutes', () => {
    it('returns master station pairs with display labels and a data flag', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
        { origin: 'Surabaya', dest: 'Pontianak', has_data: true },
        { origin: 'Medan', dest: 'Batam', has_data: false },
      ])

      const result = await service.getAvailableRoutes()

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('air_shipments_data'),
      )
      expect(result).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', hasData: true },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak', hasData: true },
        // An origin with no entry in ORIGIN_LABELS keeps its raw value rather than going blank.
        { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', hasData: false },
      ])
    })

    it('returns an empty list when the master has no Air rows', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.getAvailableRoutes()).resolves.toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && pnpm test -- route-groups.service.spec
```

Expected: FAIL — `Cannot find module './route-groups.service'`.

- [ ] **Step 3: Write the entities**

Create `apps/backend/src/modules/route-groups/entities/route-group.entity.ts`:

```ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('route_groups')
export class RouteGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 100, unique: true })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

Create `apps/backend/src/modules/route-groups/entities/route-group-route.entity.ts`:

```ts
import { Entity, Column, PrimaryColumn } from 'typeorm'

// Composite primary key across all three columns: a route may appear in many groups, and a group
// may hold many routes, but the same route twice in one group is meaningless.
@Entity('route_group_routes')
export class RouteGroupRouteEntity {
  @PrimaryColumn({ name: 'route_group_id', type: 'uuid' })
  routeGroupId: string

  @PrimaryColumn({ name: 'origin_station', length: 100 })
  originStation: string

  @PrimaryColumn({ name: 'dest_station', length: 100 })
  destStation: string
}
```

- [ ] **Step 4: Write the service with `getAvailableRoutes` only**

Create `apps/backend/src/modules/route-groups/route-groups.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { originLabel } from '../../common/utils/origin-labels.util'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

export interface RouteGroupRoute {
  origin: string // raw station value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

export interface AvailableRoute extends RouteGroupRoute {
  hasData: boolean // the pair appears in v_pnl_to; false means a group holding it renders empty
}

export interface RouteGroup {
  id: string
  name: string
  description: string | null
  routes: RouteGroupRoute[]
}

@Injectable()
export class RouteGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RouteGroupEntity)
    private readonly groupRepo: Repository<RouteGroupEntity>,
    @InjectRepository(RouteGroupRouteEntity)
    private readonly routeRepo: Repository<RouteGroupRouteEntity>,
  ) {}

  // Selectable routes come from the DC-pair master rather than from v_pnl_to, so a route can be
  // put into a group before its first shipment ever lands. Measured on the current database the
  // master yields 31 station pairs and covers all 18 that carry shipments, so nothing with data
  // is unselectable. hasData marks the remainder, which would render as an all-em-dash column.
  async getAvailableRoutes(): Promise<AvailableRoute[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT
          NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
          NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest
        FROM air_shipments_data
        WHERE service = 'Air'
      ),
      used AS (
        SELECT DISTINCT origin_station AS origin, dest_station AS dest
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      )
      SELECT m.origin, m.dest, (u.origin IS NOT NULL) AS has_data
      FROM master m
      LEFT JOIN used u ON u.origin = m.origin AND u.dest = m.dest
      WHERE m.origin IS NOT NULL AND m.dest IS NOT NULL
      ORDER BY 1, 2
    `)

    return (rows as { origin: string; dest: string; has_data: boolean }[]).map((r) => ({
      origin: r.origin,
      originLabel: originLabel(r.origin),
      dest: r.dest,
      hasData: r.has_data,
    }))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && pnpm test -- route-groups.service.spec
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Sanity-check the SQL against the real database**

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app -c "
WITH master AS (
  SELECT DISTINCT
    NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
    NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest
  FROM air_shipments_data WHERE service = 'Air'
),
used AS (
  SELECT DISTINCT origin_station AS origin, dest_station AS dest
  FROM v_pnl_to WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
)
SELECT count(*) AS total, count(*) FILTER (WHERE u.origin IS NOT NULL) AS with_data
FROM master m LEFT JOIN used u ON u.origin = m.origin AND u.dest = m.dest
WHERE m.origin IS NOT NULL AND m.dest IS NOT NULL;"
```

Expected: `total = 31`, `with_data = 18`.

- [ ] **Step 7: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/route-groups/
git commit -m "feat(route-group): add entities and available-routes lookup"
```

---

## Task 4: Route-groups service — CRUD

**Files:**
- Modify: `apps/backend/src/modules/route-groups/route-groups.service.ts`
- Create: `apps/backend/src/modules/route-groups/dto/create-route-group.dto.ts`
- Create: `apps/backend/src/modules/route-groups/dto/update-route-group.dto.ts`
- Test: `apps/backend/src/modules/route-groups/route-groups.service.spec.ts` (append)

**Interfaces:**
- Consumes: `AvailableRoute`, `RouteGroup`, `RouteGroupRoute` and the entities from Task 3.
- Produces:
  - `class RouteGroupRouteDto { origin: string; dest: string }`
  - `class CreateRouteGroupDto { name: string; description?: string; routes: RouteGroupRouteDto[] }`
  - `class UpdateRouteGroupDto` — same shape, all optional
  - `RouteGroupsService.findAll(): Promise<RouteGroup[]>`
  - `RouteGroupsService.create(dto: CreateRouteGroupDto): Promise<RouteGroup>`
  - `RouteGroupsService.update(id: string, dto: UpdateRouteGroupDto): Promise<RouteGroup>`
  - `RouteGroupsService.remove(id: string): Promise<void>`

- [ ] **Step 1: Write the DTOs**

Create `apps/backend/src/modules/route-groups/dto/create-route-group.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class RouteGroupRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  origin: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dest: string
}

export class CreateRouteGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string

  // A group with no routes would produce a permanently empty column in the comparison table.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteGroupRouteDto)
  routes: RouteGroupRouteDto[]
}
```

Create `apps/backend/src/modules/route-groups/dto/update-route-group.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { RouteGroupRouteDto } from './create-route-group.dto'

export class UpdateRouteGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteGroupRouteDto)
  routes?: RouteGroupRouteDto[]
}
```

- [ ] **Step 2: Write the failing tests**

Append to the `describe('RouteGroupsService', ...)` block in `route-groups.service.spec.ts`, after the existing `describe('getAvailableRoutes', ...)`:

```ts
  describe('findAll', () => {
    it('returns each group with its routes, labelled', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'g1', name: 'Kalimantan', description: null, origin: 'Jabo', dest: 'Balikpapan' },
        { id: 'g1', name: 'Kalimantan', description: null, origin: 'Surabaya', dest: 'Pontianak' },
        { id: 'g2', name: 'Sumatera', description: 'pulau', origin: 'Jabo', dest: 'Batam' },
      ])

      const result = await service.findAll()

      expect(result).toEqual([
        {
          id: 'g1',
          name: 'Kalimantan',
          description: null,
          routes: [
            { origin: 'Jabo', originLabel: 'CGK', dest: 'Balikpapan' },
            { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
          ],
        },
        {
          id: 'g2',
          name: 'Sumatera',
          description: 'pulau',
          routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Batam' }],
        },
      ])
    })

    it('returns an empty array when there are no groups', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.findAll()).resolves.toEqual([])
    })
  })

  describe('create', () => {
    // A route the master does not know about can never produce numbers, so it is rejected at the
    // door rather than silently stored.
    it('rejects a route that is not in the master list', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
      ])

      await expect(
        service.create({ name: 'Bad', routes: [{ origin: 'Jabo', dest: 'Nowhere' }] }),
      ).rejects.toThrow('Unknown route: Jabo → Nowhere')
    })

    it('rejects a duplicate name with a conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Aceh', has_data: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce({ id: 'existing', name: 'Kalimantan' })

      await expect(
        service.create({ name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Aceh' }] }),
      ).rejects.toThrow('A route group named "Kalimantan" already exists')
    })
  })

  describe('update', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Route group not found',
      )
    })
  })

  describe('remove', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.remove('missing')).rejects.toThrow('Route group not found')
    })
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/backend && pnpm test -- route-groups.service.spec
```

Expected: FAIL — `service.findAll is not a function` and similar for `create`, `update`, `remove`.

- [ ] **Step 4: Implement CRUD**

Add these imports at the top of `route-groups.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CreateRouteGroupDto } from './dto/create-route-group.dto'
import { UpdateRouteGroupDto } from './dto/update-route-group.dto'
```

(The existing `import { Injectable } from '@nestjs/common'` line is replaced by the first one above.)

Add these methods to `RouteGroupsService`:

```ts
  // One query rather than a TypeORM relation load: the row count is tiny and a flat join keeps
  // route ordering under this method's control.
  async findAll(): Promise<RouteGroup[]> {
    const rows = await this.dataSource.query(`
      SELECT g.id, g.name, g.description, r.origin_station AS origin, r.dest_station AS dest
      FROM route_groups g
      LEFT JOIN route_group_routes r ON r.route_group_id = g.id
      ORDER BY g.name, r.origin_station, r.dest_station
    `)

    const byId = new Map<string, RouteGroup>()
    for (const row of rows as Record<string, string | null>[]) {
      const id = row.id as string
      let group = byId.get(id)
      if (!group) {
        group = { id, name: row.name as string, description: row.description, routes: [] }
        byId.set(id, group)
      }
      // LEFT JOIN yields a single all-null route for a group whose routes were removed.
      if (row.origin && row.dest) {
        group.routes.push({
          origin: row.origin,
          originLabel: originLabel(row.origin),
          dest: row.dest,
        })
      }
    }
    return [...byId.values()]
  }

  async create(dto: CreateRouteGroupDto): Promise<RouteGroup> {
    await this.assertRoutesExist(dto.routes)
    await this.assertNameFree(dto.name)

    const group = await this.groupRepo.save(
      this.groupRepo.create({ name: dto.name, description: dto.description ?? null }),
    )
    await this.replaceRoutes(group.id, dto.routes)
    return this.findOneOrThrow(group.id)
  }

  async update(id: string, dto: UpdateRouteGroupDto): Promise<RouteGroup> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Route group not found')

    if (dto.routes) await this.assertRoutesExist(dto.routes)
    if (dto.name && dto.name !== existing.name) await this.assertNameFree(dto.name)

    await this.groupRepo.update(id, {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
    })
    if (dto.routes) await this.replaceRoutes(id, dto.routes)
    return this.findOneOrThrow(id)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Route group not found')
    // route_group_routes rows go with it via ON DELETE CASCADE.
    await this.groupRepo.delete(id)
  }

  private async findOneOrThrow(id: string): Promise<RouteGroup> {
    const group = (await this.findAll()).find((g) => g.id === id)
    if (!group) throw new NotFoundException('Route group not found')
    return group
  }

  private async assertNameFree(name: string): Promise<void> {
    const clash = await this.groupRepo.findOne({ where: { name } })
    if (clash) throw new ConflictException(`A route group named "${name}" already exists`)
  }

  // Rejects a route the DC-pair master has never heard of: it could never produce a number, so
  // storing it would only create a column of em-dashes nobody can explain.
  private async assertRoutesExist(routes: { origin: string; dest: string }[]): Promise<void> {
    const available = await this.getAvailableRoutes()
    const known = new Set(available.map((r) => `${r.origin}|${r.dest}`))
    for (const route of routes) {
      if (!known.has(`${route.origin}|${route.dest}`)) {
        throw new ConflictException(`Unknown route: ${route.origin} → ${route.dest}`)
      }
    }
  }

  private async replaceRoutes(
    groupId: string,
    routes: { origin: string; dest: string }[],
  ): Promise<void> {
    await this.routeRepo.delete({ routeGroupId: groupId })
    await this.routeRepo.insert(
      routes.map((r) => ({
        routeGroupId: groupId,
        originStation: r.origin,
        destStation: r.dest,
      })),
    )
  }
```

- [ ] **Step 5: Extend the spec mocks**

The new methods call repository methods the Task 3 mock does not have yet. In `route-groups.service.spec.ts`, replace the two declarations:

```ts
  let groupRepo: { findOne: jest.Mock }
  let routeRepo: Record<string, jest.Mock>
```

with:

```ts
  let groupRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let routeRepo: { delete: jest.Mock; insert: jest.Mock }
```

and replace their two assignments inside `beforeEach`:

```ts
    groupRepo = { findOne: jest.fn() }
    routeRepo = {}
```

with:

```ts
    groupRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    routeRepo = { delete: jest.fn(), insert: jest.fn() }
```

The provider list needs no change — it already passes both mocks by reference.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/backend && pnpm test -- route-groups.service.spec
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/route-groups/
git commit -m "feat(route-group): add CRUD to the route-groups service"
```

---

## Task 5: Route-groups controller and module

**Files:**
- Create: `apps/backend/src/modules/route-groups/route-groups.controller.ts`
- Create: `apps/backend/src/modules/route-groups/route-groups.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/modules/route-groups/route-groups.controller.spec.ts`

**Interfaces:**
- Consumes: `RouteGroupsService` methods from Tasks 3-4; the permissions from Task 1.
- Produces: HTTP endpoints `GET /route-groups`, `GET /route-groups/available-routes`, `POST /route-groups`, `PATCH /route-groups/:id`, `DELETE /route-groups/:id`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/route-groups/route-groups.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { RouteGroupsController } from './route-groups.controller'
import { RouteGroupsService } from './route-groups.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('RouteGroupsController', () => {
  let controller: RouteGroupsController
  let service: {
    findAll: jest.Mock
    getAvailableRoutes: jest.Mock
    create: jest.Mock
    update: jest.Mock
    remove: jest.Mock
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      getAvailableRoutes: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'g1' }),
      update: jest.fn().mockResolvedValue({ id: 'g1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    const module = await Test.createTestingModule({
      controllers: [RouteGroupsController],
      providers: [{ provide: RouteGroupsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(RouteGroupsController)
  })

  it('lists groups', async () => {
    await controller.findAll()
    expect(service.findAll).toHaveBeenCalled()
  })

  it('lists available routes', async () => {
    await controller.getAvailableRoutes()
    expect(service.getAvailableRoutes).toHaveBeenCalled()
  })

  it('passes the create payload straight through', async () => {
    const dto = { name: 'Kalimantan', routes: [{ origin: 'Jabo', dest: 'Balikpapan' }] }
    await controller.create(dto)
    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('passes the id and payload to update', async () => {
    await controller.update('g1', { name: 'Baru' })
    expect(service.update).toHaveBeenCalledWith('g1', { name: 'Baru' })
  })

  it('passes the id to remove', async () => {
    await controller.remove('g1')
    expect(service.remove).toHaveBeenCalledWith('g1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && pnpm test -- route-groups.controller.spec
```

Expected: FAIL — `Cannot find module './route-groups.controller'`.

- [ ] **Step 3: Write the controller**

Create `apps/backend/src/modules/route-groups/route-groups.controller.ts`:

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
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { RouteGroupsService } from './route-groups.service'
import { CreateRouteGroupDto } from './dto/create-route-group.dto'
import { UpdateRouteGroupDto } from './dto/update-route-group.dto'

@ApiTags('Route Groups')
@Controller('route-groups')
@UseGuards(JwtAuthGuard)
export class RouteGroupsController {
  constructor(private readonly service: RouteGroupsService) {}

  @Get()
  @Authorize(Permission.READ_ROUTE_GROUP)
  findAll() {
    return this.service.findAll()
  }

  // Declared before ':id' would be, and is a distinct literal path, so no route shadowing.
  @Get('available-routes')
  @Authorize(Permission.READ_ROUTE_GROUP)
  getAvailableRoutes() {
    return this.service.getAvailableRoutes()
  }

  @Post()
  @Authorize(Permission.CREATE_ROUTE_GROUP)
  create(@Body() dto: CreateRouteGroupDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_ROUTE_GROUP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteGroupDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_ROUTE_GROUP)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

Note: the spec calls `controller.update('g1', ...)` with a non-UUID string, which is fine — `ParseUUIDPipe` runs in the HTTP pipeline, not on a direct method call.

- [ ] **Step 4: Write the module**

Create `apps/backend/src/modules/route-groups/route-groups.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'
import { RouteGroupsService } from './route-groups.service'
import { RouteGroupsController } from './route-groups.controller'

@Module({
  imports: [TypeOrmModule.forFeature([RouteGroupEntity, RouteGroupRouteEntity])],
  providers: [RouteGroupsService],
  controllers: [RouteGroupsController],
  exports: [RouteGroupsService],
})
export class RouteGroupsModule {}
```

- [ ] **Step 5: Register the module**

In `apps/backend/src/app.module.ts`, add the import alongside the other module imports:

```ts
import { RouteGroupsModule } from './modules/route-groups/route-groups.module'
```

and add `RouteGroupsModule,` to the `imports` array, next to the other feature modules (near `PnlModule`).

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/backend && pnpm test -- route-groups
```

Expected: PASS — 8 service tests plus 5 controller tests.

- [ ] **Step 7: Verify the app boots with the new module**

```bash
cd apps/backend && pnpm build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/route-groups/ apps/backend/src/app.module.ts
git commit -m "feat(route-group): expose route-groups CRUD over HTTP"
```

---

## Task 6: PnL group-comparison aggregation

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts` (append)
- Test: `apps/backend/src/modules/pnl/pnl.controller.spec.ts` (append)

**Interfaces:**
- Consumes: `buildFilter`, `calendarDatesForFilter` from `pnl-filter.util`; the `route_group_routes` table from Task 1.
- Produces, all exported from `pnl.service.ts`:
  - `interface PnlGroupComparisonColumn { id: string; name: string; routeCount: number }`
  - `interface PnlGroupComparisonCell { revenue: number; cost: number; costSmu: number; costRa: number; costSgOut: number; costSgIn: number; incompleteTos: number }`
  - `interface PnlGroupComparisonRow { date: string; cells: (PnlGroupComparisonCell | null)[] }`
  - `interface PnlGroupComparisonFooter { totalRevenue: number; totalCost: number; totalCostSmu: number; totalCostRa: number; totalCostSgOut: number; totalCostSgIn: number; avgRevenuePerDay: number; avgCostPerDay: number; incompleteTos: number }`
  - `interface PnlGroupComparison { columns: PnlGroupComparisonColumn[]; rows: PnlGroupComparisonRow[]; footer: PnlGroupComparisonFooter[]; periodDays: number }`
  - `PnlService.getGroupComparison(groupIds: string[], cyclePeriod?, startDate?, endDate?, basis?): Promise<PnlGroupComparison>`
  - Endpoint `GET /pnl/breakdown/group-comparison?groupIds=&cycle=&start=&end=&basis=`

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, inside the top-level `describe('PnlService', ...)`:

```ts
  describe('getGroupComparison', () => {
    // The column query resolves group names; the fact query returns one row per (date, group).
    function mockQueries(
      columns: { id: string; name: string; route_count: string }[],
      facts: Record<string, string>[],
    ) {
      dataSource.query.mockResolvedValueOnce(columns).mockResolvedValueOnce(facts)
    }

    const fact = (over: Partial<Record<string, string>>) => ({
      d: '2026-05-01',
      gid: 'g1',
      revenue: '0',
      cost: '0',
      cost_smu: '0',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: '0',
      ...over,
    })

    it('returns nothing and touches no database when no groups are selected', async () => {
      const result = await service.getGroupComparison([], '2026-05-1H')

      expect(dataSource.query).not.toHaveBeenCalled()
      expect(result).toEqual({ columns: [], rows: [], footer: [], periodDays: 15 })
    })

    it('aligns cells with columns and leaves untouched pairs null', async () => {
      mockQueries(
        [
          { id: 'g1', name: 'Kalimantan', route_count: '3' },
          { id: 'g2', name: 'Sumatera', route_count: '2' },
        ],
        [fact({ d: '2026-05-01', gid: 'g2', revenue: '500', cost: '400' })],
      )

      const result = await service.getGroupComparison(['g1', 'g2'], '2026-05-1H')

      expect(result.columns).toEqual([
        { id: 'g1', name: 'Kalimantan', routeCount: 3 },
        { id: 'g2', name: 'Sumatera', routeCount: 2 },
      ])
      const firstRow = result.rows[0]
      expect(firstRow.date).toBe('2026-05-01')
      expect(firstRow.cells[0]).toBeNull()
      expect(firstRow.cells[1]).toEqual({
        revenue: 500,
        cost: 400,
        costSmu: 0,
        costRa: 0,
        costSgOut: 0,
        costSgIn: 0,
        incompleteTos: 0,
      })
    })

    it('returns a calendar-complete set of rows for a 1H cycle', async () => {
      mockQueries([{ id: 'g1', name: 'A', route_count: '1' }], [])

      const result = await service.getGroupComparison(['g1'], '2026-05-1H')

      expect(result.rows).toHaveLength(15)
      expect(result.rows[0].date).toBe('2026-05-01')
      expect(result.rows[14].date).toBe('2026-05-15')
      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
      expect(result.periodDays).toBe(15)
    })

    // The regression guard for the FILTER (WHERE cost_to IS NOT NULL) clauses. Measured over the
    // whole view the four components sum to SUM(cost_to) with a residual of exactly 0; if the
    // filters are ever dropped the components would exceed the cell that expands into them.
    it('keeps the four cost components summing to the cell cost', async () => {
      mockQueries(
        [{ id: 'g1', name: 'A', route_count: '1' }],
        [
          fact({
            cost: '14970000',
            cost_smu: '12400000',
            cost_ra: '850000',
            cost_sg_out: '1100000',
            cost_sg_in: '620000',
          }),
        ],
      )

      const cell = (await service.getGroupComparison(['g1'], '2026-05-1H')).rows[0].cells[0]!

      expect(cell.costSmu + cell.costRa + cell.costSgOut + cell.costSgIn).toBe(cell.cost)
    })

    it('emits the FILTER clause that makes the components reconcile', async () => {
      mockQueries([{ id: 'g1', name: 'A', route_count: '1' }], [])

      await service.getGroupComparison(['g1'], '2026-05-1H')

      const factSql = dataSource.query.mock.calls[1][0] as string
      expect(factSql).toContain('FILTER (WHERE v.cost_to IS NOT NULL)')
      expect(factSql).toContain('JOIN route_group_routes r')
    })

    // Overlap is the whole point of the join: a TO on a route in two groups lands in both columns
    // and the columns deliberately do not sum to a period total.
    it('counts a shared route in every group that holds it', async () => {
      mockQueries(
        [
          { id: 'g1', name: 'A', route_count: '1' },
          { id: 'g2', name: 'B', route_count: '1' },
        ],
        [
          fact({ gid: 'g1', revenue: '1000', cost: '800' }),
          fact({ gid: 'g2', revenue: '1000', cost: '800' }),
        ],
      )

      const row = (await service.getGroupComparison(['g1', 'g2'], '2026-05-1H')).rows[0]

      expect(row.cells[0]!.revenue).toBe(1000)
      expect(row.cells[1]!.revenue).toBe(1000)
    })

    it('totals the footer and divides averages by the calendar period', async () => {
      mockQueries(
        [{ id: 'g1', name: 'A', route_count: '1' }],
        [
          fact({
            d: '2026-05-01',
            revenue: '1500',
            cost: '900',
            cost_smu: '600',
            cost_ra: '100',
            cost_sg_out: '150',
            cost_sg_in: '50',
            incomplete_tos: '2',
          }),
          fact({
            d: '2026-05-02',
            revenue: '1500',
            cost: '900',
            cost_smu: '600',
            cost_ra: '100',
            cost_sg_out: '150',
            cost_sg_in: '50',
            incomplete_tos: '3',
          }),
        ],
      )

      const footer = (await service.getGroupComparison(['g1'], '2026-05-1H')).footer[0]

      expect(footer).toEqual({
        totalRevenue: 3000,
        totalCost: 1800,
        totalCostSmu: 1200,
        totalCostRa: 200,
        totalCostSgOut: 300,
        totalCostSgIn: 100,
        avgRevenuePerDay: 200, // 3000 / 15 calendar days, not / 2 days with data
        avgCostPerDay: 120,
        incompleteTos: 5,
      })
    })

    it('drops fact rows for dates outside the period rather than throwing', async () => {
      mockQueries(
        [{ id: 'g1', name: 'A', route_count: '1' }],
        [fact({ d: '2026-06-01', revenue: '999' })],
      )

      const result = await service.getGroupComparison(['g1'], '2026-05-1H')

      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
      expect(result.footer[0].totalRevenue).toBe(0)
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && pnpm test -- pnl.service.spec -t getGroupComparison
```

Expected: FAIL — `service.getGroupComparison is not a function`.

- [ ] **Step 3: Add the types**

In `apps/backend/src/modules/pnl/pnl.service.ts`, after the `PnlDailyMatrix` interface (currently ends around line 195):

```ts
export interface PnlGroupComparisonColumn {
  id: string
  name: string
  routeCount: number
}

export interface PnlGroupComparisonCell {
  revenue: number
  cost: number
  // The four components are prorated to TO level and, thanks to the FILTER clauses in the query,
  // always sum exactly to `cost`. Anything else means the filters were dropped.
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number // TOs with no computable cost; `cost` here is understated
}

export interface PnlGroupComparisonRow {
  date: string // YYYY-MM-DD
  cells: (PnlGroupComparisonCell | null)[] // index-aligned with columns; null = no shipment at all
}

export interface PnlGroupComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  avgRevenuePerDay: number
  avgCostPerDay: number
  incompleteTos: number
}

export interface PnlGroupComparison {
  columns: PnlGroupComparisonColumn[]
  rows: PnlGroupComparisonRow[]
  footer: PnlGroupComparisonFooter[] // index-aligned with columns
  periodDays: number
}
```

- [ ] **Step 4: Implement `getGroupComparison`**

Add to `PnlService`, after `getDailyMatrix`:

```ts
  // Revenue and cost per calendar day for each selected route group, behind the "Group Comparison"
  // tab. Columns are the groups the user picked, in the order they picked them.
  //
  // The join to route_group_routes is what makes overlapping groups work: a TO on a route that
  // belongs to three groups produces three joined rows and lands in all three columns. That is
  // deliberate — each column is an independent question, and the columns are not a partition of
  // the period, so they do not sum to a period total.
  async getGroupComparison(
    groupIds: string[],
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlGroupComparison> {
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)
    const periodDays = Math.max(1, dates.length)

    if (groupIds.length === 0) {
      return { columns: [], rows: [], footer: [], periodDays }
    }

    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')

    const columnRows = await this.dataSource.query(
      `
      SELECT g.id, g.name, COUNT(r.route_group_id)::int AS route_count
      FROM route_groups g
      LEFT JOIN route_group_routes r ON r.route_group_id = g.id
      WHERE g.id = ANY($1::uuid[])
      GROUP BY g.id, g.name
      `,
      [groupIds],
    )

    // Ordered by the caller's selection, not by name: the table columns should appear in the order
    // the user ticked the groups.
    const byId = new Map(
      (columnRows as Record<string, string>[]).map((r) => [
        r.id,
        { id: r.id, name: r.name, routeCount: Number(r.route_count) },
      ]),
    )
    const columns: PnlGroupComparisonColumn[] = groupIds
      .map((id) => byId.get(id))
      .filter((c): c is PnlGroupComparisonColumn => c !== undefined)

    const factRows = await this.dataSource.query(
      `
      SELECT
        TO_CHAR(v.${dateCol}::DATE, 'YYYY-MM-DD')                    AS d,
        r.route_group_id                                             AS gid,
        COALESCE(SUM(v.revenue_total), 0)                            AS revenue,
        COALESCE(SUM(v.cost_to), 0)                                  AS cost,
        COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
                 FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_smu,
        COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
                 FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_ra,
        COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
                 FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_out,
        COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))
                 FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_in,
        COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int               AS incomplete_tos
      FROM v_pnl_to v
      JOIN route_group_routes r
        ON r.origin_station = v.origin_station
       AND r.dest_station   = v.dest_station
      WHERE ${where}
        AND v.${dateCol} IS NOT NULL
        AND r.route_group_id = ANY($${params.length + 1}::uuid[])
      GROUP BY 1, 2
      `,
      [...params, groupIds],
    )

    const columnIndex = new Map(columns.map((c, i) => [c.id, i]))

    const rows: PnlGroupComparisonRow[] = dates.map((date) => ({
      date,
      cells: columns.map(() => null),
    }))
    const rowIndex = new Map(rows.map((r, i) => [r.date, i]))

    for (const factRow of factRows as Record<string, string>[]) {
      const ci = columnIndex.get(factRow.gid)
      const ri = rowIndex.get(factRow.d)
      if (ci === undefined || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(factRow.revenue),
        cost: Number(factRow.cost),
        costSmu: Number(factRow.cost_smu),
        costRa: Number(factRow.cost_ra),
        costSgOut: Number(factRow.cost_sg_out),
        costSgIn: Number(factRow.cost_sg_in),
        incompleteTos: Number(factRow.incomplete_tos),
      }
    }

    const footer: PnlGroupComparisonFooter[] = columns.map((_, ci) => {
      let totalRevenue = 0
      let totalCost = 0
      let totalCostSmu = 0
      let totalCostRa = 0
      let totalCostSgOut = 0
      let totalCostSgIn = 0
      let incompleteTos = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        totalRevenue += cell.revenue
        totalCost += cell.cost
        totalCostSmu += cell.costSmu
        totalCostRa += cell.costRa
        totalCostSgOut += cell.costSgOut
        totalCostSgIn += cell.costSgIn
        incompleteTos += cell.incompleteTos
      }
      return {
        totalRevenue,
        totalCost,
        totalCostSmu,
        totalCostRa,
        totalCostSgOut,
        totalCostSgIn,
        // Divided by calendar days, not by days that happened to have shipments.
        avgRevenuePerDay: totalRevenue / periodDays,
        avgCostPerDay: totalCost / periodDays,
        incompleteTos,
      }
    })

    return { columns, rows, footer, periodDays }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/backend && pnpm test -- pnl.service.spec -t getGroupComparison
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Add the endpoint**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, after the `breakdown/daily-matrix` handler and before the closing brace:

```ts
  @Get('breakdown/group-comparison')
  getGroupComparison(
    @Query('groupIds') groupIds?: string,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    const ids = (groupIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    return this.pnlService.getGroupComparison(ids, cycle, start, end, basis)
  }
```

- [ ] **Step 7: Write the controller wiring test**

In `apps/backend/src/modules/pnl/pnl.controller.spec.ts`, first add the new method to the existing module-level `mockService` object (currently lines 7-14), after `getDailyMatrix: jest.fn(),`:

```ts
  getGroupComparison: jest.fn(),
```

Then append inside the existing top-level `describe('PnlController', ...)`:

```ts
  describe('getGroupComparison', () => {
    it('splits groupIds into an array and forwards the period', async () => {
      mockService.getGroupComparison.mockResolvedValueOnce({})

      await controller.getGroupComparison('g1,g2', '2026-05-1H', undefined, undefined, 'atd_origin')

      expect(mockService.getGroupComparison).toHaveBeenCalledWith(
        ['g1', 'g2'],
        '2026-05-1H',
        undefined,
        undefined,
        'atd_origin',
      )
    })

    it('trims whitespace and drops empty ids', async () => {
      mockService.getGroupComparison.mockResolvedValueOnce({})

      await controller.getGroupComparison(' g1 , ,g2 ', '2026-05-1H')

      expect(mockService.getGroupComparison).toHaveBeenCalledWith(
        ['g1', 'g2'],
        '2026-05-1H',
        undefined,
        undefined,
        undefined,
      )
    })

    it('sends an empty array when groupIds is absent', async () => {
      mockService.getGroupComparison.mockResolvedValueOnce({})

      await controller.getGroupComparison(undefined, '2026-05-1H')

      expect(mockService.getGroupComparison).toHaveBeenCalledWith(
        [],
        '2026-05-1H',
        undefined,
        undefined,
        undefined,
      )
    })
  })
```

- [ ] **Step 8: Run the whole PnL suite**

```bash
cd apps/backend && pnpm test -- pnl
```

Expected: PASS — all existing PnL tests plus the 10 new ones.

- [ ] **Step 9: Verify the real query against the database**

Insert a throwaway group, run the aggregation, confirm the residual is zero, then roll back:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app <<'SQL'
BEGIN;
INSERT INTO route_groups (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'tmp-verify');
INSERT INTO route_group_routes (route_group_id, origin_station, dest_station)
SELECT '11111111-1111-1111-1111-111111111111', origin_station, dest_station
FROM (SELECT DISTINCT origin_station, dest_station FROM v_pnl_to
      WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL) s;

SELECT
  ROUND(SUM(cost)) AS total_cost,
  ROUND(SUM(cost_smu + cost_ra + cost_sg_out + cost_sg_in)) AS components,
  ROUND(SUM(cost) - SUM(cost_smu + cost_ra + cost_sg_out + cost_sg_in)) AS residual
FROM (
  SELECT
    COALESCE(SUM(v.cost_to), 0)                                                             AS cost,
    COALESCE(SUM(v.cost_smu_awb    * v.weight_share) FILTER (WHERE v.cost_to IS NOT NULL), 0) AS cost_smu,
    COALESCE(SUM(v.cost_ra_awb     * v.weight_share) FILTER (WHERE v.cost_to IS NOT NULL), 0) AS cost_ra,
    COALESCE(SUM(v.cost_sg_out_awb * v.weight_share) FILTER (WHERE v.cost_to IS NOT NULL), 0) AS cost_sg_out,
    COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))       FILTER (WHERE v.cost_to IS NOT NULL), 0) AS cost_sg_in
  FROM v_pnl_to v
  JOIN route_group_routes r
    ON r.origin_station = v.origin_station AND r.dest_station = v.dest_station
  WHERE v.cycle_ata = '2026-05-1H' AND v.date_ata IS NOT NULL
    AND r.route_group_id = '11111111-1111-1111-1111-111111111111'
  GROUP BY TO_CHAR(v.date_ata::DATE, 'YYYY-MM-DD'), r.route_group_id
) x;
ROLLBACK;
SQL
```

Expected: `residual = 0`.

- [ ] **Step 10: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/pnl/
git commit -m "feat(pnl): add group comparison aggregation and endpoint"
```

---

## Task 7: Frontend data layer

**Files:**
- Create: `apps/frontend/src/features/route-groups/types.ts`
- Create: `apps/frontend/src/features/route-groups/hooks/useRouteGroups.ts`
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts`

**Interfaces:**
- Consumes: the endpoints from Tasks 5-6.
- Produces:
  - From `features/route-groups/types.ts`: `RouteGroupRoute`, `AvailableRoute`, `RouteGroup`, `RouteGroupPayload`
  - From `features/route-groups/hooks/useRouteGroups.ts`: `useRouteGroups()`, `useAvailableRoutes()`, `useCreateRouteGroup()`, `useUpdateRouteGroup()`, `useDeleteRouteGroup()`
  - From `features/pnl/hooks/usePnl.ts`: `PnlGroupComparisonColumn`, `PnlGroupComparisonCell`, `PnlGroupComparisonRow`, `PnlGroupComparisonFooter`, `PnlGroupComparison`, `usePnlGroupComparison(filter, groupIds)`

- [ ] **Step 1: Write the types**

Create `apps/frontend/src/features/route-groups/types.ts`:

```ts
export interface RouteGroupRoute {
  origin: string // raw station value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

export interface AvailableRoute extends RouteGroupRoute {
  hasData: boolean // false = no shipment has ever flown this pair, so it renders as an empty column
}

export interface RouteGroup {
  id: string
  name: string
  description: string | null
  routes: RouteGroupRoute[]
}

// The write shape: the API only needs the raw pair, not the display label.
export interface RouteGroupPayload {
  name: string
  description?: string
  routes: { origin: string; dest: string }[]
}
```

- [ ] **Step 2: Write the hooks**

Create `apps/frontend/src/features/route-groups/hooks/useRouteGroups.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { AvailableRoute, RouteGroup, RouteGroupPayload } from '../types'

export function useRouteGroups() {
  return useQuery<RouteGroup[]>({
    queryKey: ['route-groups'],
    queryFn: () => apiClient.get('/route-groups').then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

// The master route list barely changes, so it is cached far longer than the groups themselves.
export function useAvailableRoutes() {
  return useQuery<AvailableRoute[]>({
    queryKey: ['route-groups', 'available-routes'],
    queryFn: () => apiClient.get('/route-groups/available-routes').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RouteGroupPayload) =>
      apiClient.post<RouteGroup>('/route-groups', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}

export function useUpdateRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RouteGroupPayload }) =>
      apiClient.patch<RouteGroup>(`/route-groups/${id}`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}

export function useDeleteRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/route-groups/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}
```

- [ ] **Step 3: Add the PnL comparison types and hook**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, after the `PnlDailyMatrix` interface (currently ends around line 187):

```ts
export interface PnlGroupComparisonColumn {
  id: string
  name: string
  routeCount: number
}

export interface PnlGroupComparisonCell {
  revenue: number
  cost: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
}

export interface PnlGroupComparisonRow {
  date: string
  cells: (PnlGroupComparisonCell | null)[]
}

export interface PnlGroupComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  avgRevenuePerDay: number
  avgCostPerDay: number
  incompleteTos: number
}

export interface PnlGroupComparison {
  columns: PnlGroupComparisonColumn[]
  rows: PnlGroupComparisonRow[]
  footer: PnlGroupComparisonFooter[]
  periodDays: number
}
```

and at the end of the file:

```ts
// Disabled until at least one group is selected, so an untouched tab makes no request at all.
// groupIds is part of the query key, so re-picking groups refetches without a manual invalidate.
export function usePnlGroupComparison(filter: PnlFilter | undefined, groupIds: string[]) {
  return useQuery<PnlGroupComparison>({
    queryKey: ['pnl', 'group-comparison', filter, groupIds],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/group-comparison', {
          params: { ...filterToParams(filter!), groupIds: groupIds.join(',') },
        })
        .then((r) => r.data),
    enabled: !!filter && groupIds.length > 0,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 4: Verify the frontend type-checks**

```bash
cd apps/frontend && pnpm type-check
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/route-groups/ apps/frontend/src/features/pnl/hooks/usePnl.ts
git commit -m "feat(route-group): add frontend types and data hooks"
```

---

## Task 8: Route picker component

**Files:**
- Create: `apps/frontend/src/features/route-groups/components/RoutePicker.tsx`
- Test: `apps/frontend/src/features/route-groups/components/RoutePicker.spec.tsx`

**Interfaces:**
- Consumes: `AvailableRoute` from Task 7.
- Produces: `RoutePicker` with props `{ routes: AvailableRoute[]; value: { origin: string; dest: string }[]; onChange: (next: { origin: string; dest: string }[]) => void }`. Fully controlled — it never fetches.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/route-groups/components/RoutePicker.spec.tsx`:

```tsx
/**
 * Unit tests for RoutePicker. The route list is passed in rather than fetched, so these tests
 * isolate the picker from the data layer.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RoutePicker } from './RoutePicker'
import { AvailableRoute } from '../types'

const routes: AvailableRoute[] = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', hasData: true },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Batam', hasData: true },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak', hasData: true },
  { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', hasData: false },
]

it('groups the routes under their origin label', () => {
  render(<RoutePicker routes={routes} value={[]} onChange={jest.fn()} />)

  expect(screen.getByText('CGK')).toBeInTheDocument()
  expect(screen.getByText('SUB')).toBeInTheDocument()
  expect(screen.getByText('Medan')).toBeInTheDocument()
})

it('checks the routes already in value', () => {
  render(
    <RoutePicker routes={routes} value={[{ origin: 'Jabo', dest: 'Batam' }]} onChange={jest.fn()} />,
  )

  expect(screen.getByLabelText('CGK → Aceh')).not.toBeChecked()
  expect(screen.getByLabelText('CGK → Batam')).toBeChecked()
})

it('adds a route on tick', () => {
  const onChange = jest.fn()
  render(<RoutePicker routes={routes} value={[]} onChange={onChange} />)

  fireEvent.click(screen.getByLabelText('SUB → Pontianak'))

  expect(onChange).toHaveBeenCalledWith([{ origin: 'Surabaya', dest: 'Pontianak' }])
})

it('removes a route on untick', () => {
  const onChange = jest.fn()
  render(
    <RoutePicker
      routes={routes}
      value={[
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Jabo', dest: 'Batam' },
      ]}
      onChange={onChange}
    />,
  )

  fireEvent.click(screen.getByLabelText('CGK → Aceh'))

  expect(onChange).toHaveBeenCalledWith([{ origin: 'Jabo', dest: 'Batam' }])
})

// Selecting one of these is legitimate, but it will render as an all-em-dash column, so the
// picker says so rather than letting the admin find out in the comparison table.
it('marks a route that has never carried a shipment', () => {
  render(<RoutePicker routes={routes} value={[]} onChange={jest.fn()} />)

  expect(screen.getByTitle('Belum ada shipment di rute ini')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm test -- RoutePicker.spec
```

Expected: FAIL — `Cannot find module './RoutePicker'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/route-groups/components/RoutePicker.tsx`:

```tsx
'use client'

import { AvailableRoute } from '../types'

interface RoutePickerProps {
  routes: AvailableRoute[]
  value: { origin: string; dest: string }[]
  onChange: (next: { origin: string; dest: string }[]) => void
}

const key = (r: { origin: string; dest: string }) => `${r.origin}|${r.dest}`

// Consecutive routes sharing an origin label become one section, mirroring how the PnL matrix
// header groups its columns.
function groupByOrigin(routes: AvailableRoute[]): { label: string; routes: AvailableRoute[] }[] {
  const groups: { label: string; routes: AvailableRoute[] }[] = []
  for (const route of routes) {
    const last = groups[groups.length - 1]
    if (last && last.label === route.originLabel) last.routes.push(route)
    else groups.push({ label: route.originLabel, routes: [route] })
  }
  return groups
}

export function RoutePicker({ routes, value, onChange }: RoutePickerProps) {
  const selected = new Set(value.map(key))

  const toggle = (route: AvailableRoute) => {
    const k = key(route)
    onChange(
      selected.has(k)
        ? value.filter((v) => key(v) !== k)
        : [...value, { origin: route.origin, dest: route.dest }],
    )
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
      {groupByOrigin(routes).map((group) => (
        <div key={group.label}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {group.routes.map((route) => {
              const label = `${route.originLabel} → ${route.dest}`
              return (
                <label key={key(route)} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={selected.has(key(route))}
                    onChange={() => toggle(route)}
                  />
                  <span>{route.dest}</span>
                  {!route.hasData && (
                    <span
                      title="Belum ada shipment di rute ini"
                      className="text-xs text-amber-600"
                    >
                      •
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {routes.length === 0 && (
        <p className="text-sm text-muted-foreground">No routes available.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/frontend && pnpm test -- RoutePicker.spec
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/route-groups/components/
git commit -m "feat(route-group): add the route picker"
```

---

## Task 9: Route Group page and menu

**Files:**
- Create: `apps/frontend/src/features/route-groups/components/RouteGroupForm.tsx`
- Create: `apps/frontend/src/features/route-groups/components/DeleteRouteGroupDialog.tsx`
- Create: `apps/frontend/src/app/(dashboard)/route-groups/page.tsx`
- Modify: `apps/frontend/src/components/layout/sidebar.tsx:9-23, 137-146`

**Interfaces:**
- Consumes: `RoutePicker` from Task 8; the hooks and types from Task 7.
- Produces: the page at `/route-groups`; `RouteGroupForm` with props `{ initial?: RouteGroup; routes: AvailableRoute[]; onSubmit: (payload: RouteGroupPayload) => Promise<void>; onCancel: () => void }`; `DeleteRouteGroupDialog` with props `{ group: RouteGroup; onConfirm: () => Promise<void>; onClose: () => void }`.

- [ ] **Step 1: Write the form**

Create `apps/frontend/src/features/route-groups/components/RouteGroupForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { AvailableRoute, RouteGroup, RouteGroupPayload } from '../types'
import { RoutePicker } from './RoutePicker'

interface RouteGroupFormProps {
  initial?: RouteGroup
  routes: AvailableRoute[]
  onSubmit: (payload: RouteGroupPayload) => Promise<void>
  onCancel: () => void
}

export function RouteGroupForm({ initial, routes, onSubmit, onCancel }: RouteGroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<{ origin: string; dest: string }[]>(
    initial?.routes.map((r) => ({ origin: r.origin, dest: r.dest })) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    // Mirrors the ArrayMinSize(1) on the DTO: a group with no routes is a permanently empty column.
    if (selected.length === 0) {
      setError('Pick at least one route')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        routes: selected,
      })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <FormField label="Name" htmlFor="rg-name" required>
        <Input id="rg-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>
      <FormField label="Description" htmlFor="rg-description">
        <Input
          id="rg-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField label={`Routes (${selected.length} selected)`} htmlFor="rg-routes" required>
        <div id="rg-routes">
          <RoutePicker routes={routes} value={selected} onChange={setSelected} />
        </div>
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Write the delete dialog**

Create `apps/frontend/src/features/route-groups/components/DeleteRouteGroupDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RouteGroup } from '../types'

interface DeleteRouteGroupDialogProps {
  group: RouteGroup
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function DeleteRouteGroupDialog({ group, onConfirm, onClose }: DeleteRouteGroupDialogProps) {
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{group.name}”?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The {group.routes.length} route(s) in this group stay untouched — only the grouping is
          removed. Any PnL comparison currently showing this group will drop its column.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Write the page**

Create `apps/frontend/src/app/(dashboard)/route-groups/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { RouteGroupForm } from '@/features/route-groups/components/RouteGroupForm'
import { DeleteRouteGroupDialog } from '@/features/route-groups/components/DeleteRouteGroupDialog'
import {
  useAvailableRoutes,
  useCreateRouteGroup,
  useDeleteRouteGroup,
  useRouteGroups,
  useUpdateRouteGroup,
} from '@/features/route-groups/hooks/useRouteGroups'
import { RouteGroup, RouteGroupPayload } from '@/features/route-groups/types'

type Modal = { type: 'create' } | { type: 'edit'; group: RouteGroup } | { type: 'delete'; group: RouteGroup } | null

export default function RouteGroupsPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [modal, setModal] = useState<Modal>(null)

  const { data: groups, isLoading } = useRouteGroups()
  const { data: routes } = useAvailableRoutes()
  const createGroup = useCreateRouteGroup()
  const updateGroup = useUpdateRouteGroup()
  const deleteGroup = useDeleteRouteGroup()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.route_group')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  const handleCreate = async (payload: RouteGroupPayload) => {
    await createGroup.mutateAsync(payload)
    setModal(null)
  }

  const handleEdit = async (group: RouteGroup, payload: RouteGroupPayload) => {
    await updateGroup.mutateAsync({ id: group.id, payload })
    setModal(null)
  }

  if (loading || isLoading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Route Group"
        action={
          hasPermission('create.route_group') ? (
            <Button onClick={() => setModal({ type: 'create' })}>+ New Group</Button>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Routes</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((group, idx) => (
              <tr key={group.id} className={`border-t hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
                <td className="px-4 py-3 font-medium">{group.name}</td>
                <td className="px-4 py-3">{group.description ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {group.routes.map((r) => `${r.originLabel} → ${r.dest}`).join(', ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {hasPermission('update.route_group') && (
                      <Button size="sm" variant="outline" onClick={() => setModal({ type: 'edit', group })}>
                        Edit
                      </Button>
                    )}
                    {hasPermission('delete.route_group') && (
                      <Button size="sm" variant="destructive" onClick={() => setModal({ type: 'delete', group })}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(groups ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No route groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Route Group</DialogTitle></DialogHeader>
            <RouteGroupForm routes={routes ?? []} onSubmit={handleCreate} onCancel={() => setModal(null)} />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Route Group</DialogTitle></DialogHeader>
            <RouteGroupForm
              initial={modal.group}
              routes={routes ?? []}
              onSubmit={(payload) => handleEdit(modal.group, payload)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'delete' && (
        <DeleteRouteGroupDialog
          group={modal.group}
          onConfirm={() => deleteGroup.mutateAsync(modal.group.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
```

The permission redirect mirrors the one at the bottom of `apps/frontend/src/app/(dashboard)/pnl/page.tsx`: the sidebar already hides the link, and this guards a user who types the URL directly.

- [ ] **Step 4: Add the sidebar entry**

In `apps/frontend/src/components/layout/sidebar.tsx`, add `Route` to the `lucide-react` import block (lines 9-23), then insert after the Barhal `NavLink` (which currently closes at line 145):

```tsx
            {hasPermission('read.route_group') && (
              <NavLink
                href="/route-groups"
                icon={<Route size={16} />}
                label="Route Group"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
```

- [ ] **Step 5: Verify the frontend type-checks and lints**

```bash
cd apps/frontend && pnpm type-check && pnpm lint
```

Expected: type-check silent, lint reports no errors.

- [ ] **Step 6: Grant yourself the permissions and check the page by hand**

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app -c "
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE p.name LIKE '%.route_group'
ON CONFLICT DO NOTHING;"
```

Then run `pnpm dev` from the repo root, open `http://localhost:3000/route-groups`, and confirm: the menu item appears under Air Shipments, "+ New Group" opens the modal, the picker lists routes under CGK / SUB / Medan headings, saving a group with two routes lands it in the table, Edit reopens with those routes ticked, and Delete removes it.

Note: the backend seeds the four permission rows on boot, so start the backend before running the SQL above.

- [ ] **Step 7: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/route-groups/ "apps/frontend/src/app/(dashboard)/route-groups/" apps/frontend/src/components/layout/sidebar.tsx
git commit -m "feat(route-group): add the Route Group page and menu entry"
```

---

## Task 10: Comparison table projection

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/groupComparison.ts`
- Test: `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`

**Interfaces:**
- Consumes: `PnlGroupComparison`, `PnlGroupComparisonColumn` from Task 7; `RouteGroup` from Task 7.
- Produces:
  - `type CostComponentKey = 'costSmu' | 'costRa' | 'costSgOut' | 'costSgIn'`
  - `const COST_COMPONENTS: { key: CostComponentKey; label: string }[]`
  - `interface ComparisonRowModel { date: string; revenue: (number | null)[]; cost: (number | null)[]; incompleteTos: number[]; components: Record<CostComponentKey, (number | null)[]> }`
  - `interface ComparisonFooterRowModel { label: string; revenue: (number | null)[]; cost: (number | null)[]; components: Record<CostComponentKey, (number | null)[]> | null; incompleteTos: number[] | null }`
  - `interface ComparisonTableModel { columns: PnlGroupComparisonColumn[]; rows: ComparisonRowModel[]; footerRows: ComparisonFooterRowModel[] }`
  - `toComparisonTable(data: PnlGroupComparison): ComparisonTableModel`
  - `overlappingRoutes(groups: RouteGroup[]): { route: string; groupNames: string[] }[]`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`:

```ts
import { toComparisonTable, overlappingRoutes, COST_COMPONENTS } from './groupComparison'
import { PnlGroupComparison, PnlGroupComparisonCell } from '../hooks/usePnl'
import { RouteGroup } from '@/features/route-groups/types'

const cell = (over: Partial<PnlGroupComparisonCell> = {}): PnlGroupComparisonCell => ({
  revenue: 0,
  cost: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  ...over,
})

const data: PnlGroupComparison = {
  columns: [
    { id: 'g1', name: 'Kalimantan', routeCount: 3 },
    { id: 'g2', name: 'Sumatera', routeCount: 2 },
  ],
  rows: [
    {
      date: '2026-05-01',
      cells: [
        cell({ revenue: 1000, cost: 800, costSmu: 500, costRa: 100, costSgOut: 150, costSgIn: 50, incompleteTos: 2 }),
        null,
      ],
    },
  ],
  footer: [
    {
      totalRevenue: 1000,
      totalCost: 800,
      totalCostSmu: 500,
      totalCostRa: 100,
      totalCostSgOut: 150,
      totalCostSgIn: 50,
      avgRevenuePerDay: 66.6,
      avgCostPerDay: 53.3,
      incompleteTos: 2,
    },
    {
      totalRevenue: 0,
      totalCost: 0,
      totalCostSmu: 0,
      totalCostRa: 0,
      totalCostSgOut: 0,
      totalCostSgIn: 0,
      avgRevenuePerDay: 0,
      avgCostPerDay: 0,
      incompleteTos: 0,
    },
  ],
  periodDays: 15,
}

describe('COST_COMPONENTS', () => {
  it('lists the four components in the order finance reads them', () => {
    expect(COST_COMPONENTS.map((c) => c.key)).toEqual([
      'costSmu',
      'costRa',
      'costSgOut',
      'costSgIn',
    ])
    expect(COST_COMPONENTS.map((c) => c.label)).toEqual(['SMU', 'RA', 'SG Out', 'SG In'])
  })
})

describe('toComparisonTable', () => {
  it('splits each row into revenue, cost and component tracks aligned with columns', () => {
    const model = toComparisonTable(data)

    expect(model.columns).toEqual(data.columns)
    expect(model.rows[0].date).toBe('2026-05-01')
    expect(model.rows[0].revenue).toEqual([1000, null])
    expect(model.rows[0].cost).toEqual([800, null])
    expect(model.rows[0].components.costSmu).toEqual([500, null])
    expect(model.rows[0].components.costSgIn).toEqual([50, null])
  })

  // An absent cell must stay distinguishable from a real zero all the way to the renderer.
  it('keeps a missing cell as null rather than collapsing it to zero', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].revenue[1]).toBeNull()
    expect(model.rows[0].components.costRa[1]).toBeNull()
  })

  it('reports incomplete TOs per column as a number, defaulting to zero', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].incompleteTos).toEqual([2, 0])
  })

  it('builds a Total footer row that expands and an Avg / Day row that does not', () => {
    const model = toComparisonTable(data)

    expect(model.footerRows.map((r) => r.label)).toEqual(['Total', 'Avg / Day'])
    expect(model.footerRows[0].revenue).toEqual([1000, 0])
    expect(model.footerRows[0].components!.costSmu).toEqual([500, 0])
    expect(model.footerRows[0].incompleteTos).toEqual([2, 0])
    // Averages have no component breakdown — an average of a component is not a cost.
    expect(model.footerRows[1].components).toBeNull()
    expect(model.footerRows[1].revenue).toEqual([66.6, 0])
  })
})

describe('overlappingRoutes', () => {
  const group = (id: string, name: string, dests: string[]): RouteGroup => ({
    id,
    name,
    description: null,
    routes: dests.map((dest) => ({ origin: 'Jabo', originLabel: 'CGK', dest })),
  })

  it('returns nothing when the groups are disjoint', () => {
    expect(overlappingRoutes([group('a', 'A', ['Aceh']), group('b', 'B', ['Batam'])])).toEqual([])
  })

  it('names the groups that share a route', () => {
    const result = overlappingRoutes([
      group('a', 'A', ['Aceh', 'Batam']),
      group('b', 'B', ['Batam']),
    ])

    expect(result).toEqual([{ route: 'CGK → Batam', groupNames: ['A', 'B'] }])
  })

  it('handles a route shared by three groups', () => {
    const result = overlappingRoutes([
      group('a', 'A', ['Batam']),
      group('b', 'B', ['Batam']),
      group('c', 'C', ['Batam']),
    ])

    expect(result).toEqual([{ route: 'CGK → Batam', groupNames: ['A', 'B', 'C'] }])
  })

  it('returns nothing for a single group', () => {
    expect(overlappingRoutes([group('a', 'A', ['Aceh', 'Batam'])])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm test -- groupComparison.spec
```

Expected: FAIL — `Cannot find module './groupComparison'`.

- [ ] **Step 3: Write the projection**

Create `apps/frontend/src/features/pnl/utils/groupComparison.ts`:

```ts
import { RouteGroup } from '@/features/route-groups/types'
import { PnlGroupComparison, PnlGroupComparisonColumn } from '../hooks/usePnl'

export type CostComponentKey = 'costSmu' | 'costRa' | 'costSgOut' | 'costSgIn'

// Order and labels are fixed here so the expanded rows read the same everywhere. These four sum
// exactly to the cost cell above them — the backend's FILTER clauses guarantee it.
export const COST_COMPONENTS: { key: CostComponentKey; label: string }[] = [
  { key: 'costSmu', label: 'SMU' },
  { key: 'costRa', label: 'RA' },
  { key: 'costSgOut', label: 'SG Out' },
  { key: 'costSgIn', label: 'SG In' },
]

export interface ComparisonRowModel {
  date: string
  revenue: (number | null)[] // index-aligned with columns; null = no shipment, distinct from 0
  cost: (number | null)[]
  incompleteTos: number[]
  components: Record<CostComponentKey, (number | null)[]>
}

export interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  components: Record<CostComponentKey, (number | null)[]> | null // null = this row does not expand
  incompleteTos: number[] | null
}

export interface ComparisonTableModel {
  columns: PnlGroupComparisonColumn[]
  rows: ComparisonRowModel[]
  footerRows: ComparisonFooterRowModel[]
}

function emptyComponents(): Record<CostComponentKey, (number | null)[]> {
  return { costSmu: [], costRa: [], costSgOut: [], costSgIn: [] }
}

export function toComparisonTable(data: PnlGroupComparison): ComparisonTableModel {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      date: row.date,
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      incompleteTos: row.cells.map((c) => (c ? c.incompleteTos : 0)),
      components,
    }
  })

  const totalComponents = emptyComponents()
  totalComponents.costSmu = data.footer.map((f) => f.totalCostSmu)
  totalComponents.costRa = data.footer.map((f) => f.totalCostRa)
  totalComponents.costSgOut = data.footer.map((f) => f.totalCostSgOut)
  totalComponents.costSgIn = data.footer.map((f) => f.totalCostSgIn)

  const footerRows: ComparisonFooterRowModel[] = [
    {
      label: 'Total',
      revenue: data.footer.map((f) => f.totalRevenue),
      cost: data.footer.map((f) => f.totalCost),
      components: totalComponents,
      incompleteTos: data.footer.map((f) => f.incompleteTos),
    },
    {
      // No component breakdown: the average of a component is not itself a cost anyone books.
      label: 'Avg / Day',
      revenue: data.footer.map((f) => f.avgRevenuePerDay),
      cost: data.footer.map((f) => f.avgCostPerDay),
      components: null,
      incompleteTos: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}

// Routes belonging to more than one of the selected groups. The comparison columns are deliberately
// independent, so a shared route contributes to every column that holds it and the columns do not
// sum to a period total. Surfacing the overlap stops the table being read as a partition.
export function overlappingRoutes(
  groups: RouteGroup[],
): { route: string; groupNames: string[] }[] {
  const byRoute = new Map<string, string[]>()
  for (const group of groups) {
    for (const route of group.routes) {
      const label = `${route.originLabel} → ${route.dest}`
      const names = byRoute.get(label)
      if (names) names.push(group.name)
      else byRoute.set(label, [group.name])
    }
  }
  return [...byRoute.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([route, groupNames]) => ({ route, groupNames }))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/frontend && pnpm test -- groupComparison.spec
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/pnl/utils/groupComparison.ts apps/frontend/src/features/pnl/utils/groupComparison.spec.ts
git commit -m "feat(pnl): project the group comparison response into table props"
```

---

## Task 11: Comparison table component

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx`
- Test: `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx`

**Interfaces:**
- Consumes: `ComparisonTableModel`, `COST_COMPONENTS` from Task 10; `num` and `formatDayLabel` from the existing PnL utils.
- Produces: `PnlGroupComparisonTable` with props `{ model: ComparisonTableModel }`. Owns only its `Set<string>` of expanded dates. `'__footer__'` is the reserved key for the expanded Total row.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx`:

```tsx
/**
 * Unit tests for PnlGroupComparisonTable. The model is hand-built rather than produced by
 * toComparisonTable, so these tests isolate the renderer from the projection (covered in
 * groupComparison.spec.ts).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonTable } from './PnlGroupComparisonTable'
import { ComparisonTableModel } from '../utils/groupComparison'

const columns = [
  { id: 'g1', name: 'Kalimantan', routeCount: 3 },
  { id: 'g2', name: 'Sumatera', routeCount: 2 },
]

function baseModel(overrides: Partial<ComparisonTableModel> = {}): ComparisonTableModel {
  return {
    columns,
    rows: [
      {
        date: '2026-05-01',
        revenue: [1000, null],
        cost: [800, null],
        incompleteTos: [0, 0],
        components: {
          costSmu: [500, null],
          costRa: [100, null],
          costSgOut: [150, null],
          costSgIn: [50, null],
        },
      },
      {
        date: '2026-05-02',
        revenue: [0, 2000],
        cost: [0, 1500],
        incompleteTos: [3, 0],
        components: {
          costSmu: [0, 900],
          costRa: [0, 200],
          costSgOut: [0, 300],
          costSgIn: [0, 100],
        },
      },
    ],
    footerRows: [
      {
        label: 'Total',
        revenue: [1000, 2000],
        cost: [800, 1500],
        components: {
          costSmu: [500, 900],
          costRa: [100, 200],
          costSgOut: [150, 300],
          costSgIn: [50, 100],
        },
        incompleteTos: [3, 0],
      },
      {
        label: 'Avg / Day',
        revenue: [66, 133],
        cost: [53, 100],
        components: null,
        incompleteTos: null,
      },
    ],
    ...overrides,
  }
}

it('renders a Revenue and a Cost block header spanning the group columns', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByText('Revenue')).toHaveAttribute('colspan', '2')
  expect(screen.getByText('Cost')).toHaveAttribute('colspan', '2')
  expect(screen.getAllByText('Kalimantan')).toHaveLength(2) // once under each block
})

it('renders a missing cell as an em-dash and a real zero as 0', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  const firstRow = screen.getByTestId('row-2026-05-01')
  expect(within(firstRow).getAllByText('—').length).toBeGreaterThan(0)

  const secondRow = screen.getByTestId('row-2026-05-02')
  expect(within(secondRow).getAllByText('0').length).toBeGreaterThan(0)
})

it('expands a clicked cost cell into the four components for every group', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  const smuRow = screen.getByTestId('detail-2026-05-01-costSmu')
  expect(within(smuRow).getByText('SMU')).toBeInTheDocument()
  expect(within(smuRow).getByText('500')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costRa')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costSgOut')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costSgIn')).toBeInTheDocument()
})

it('collapses again on a second click', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
})

it('keeps several dates open at once', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))

  expect(screen.getByTestId('detail-2026-05-01-costSmu')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-02-costSmu')).toBeInTheDocument()
})

// Only cost decomposes, so only cost cells are actionable.
it('does not make revenue cells clickable', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.queryByTestId('revenue-2026-05-01-g1')?.tagName).not.toBe('BUTTON')
})

it('marks a cost cell that contains uncosted TOs', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByTestId('cost-2026-05-02-g1')).toHaveAttribute(
    'title',
    expect.stringContaining('3 TO belum ada cost'),
  )
})

it('expands the Total footer row but not Avg / Day', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByTestId('cost-__footer__-g1')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('cost-__footer__-g1'))
  expect(screen.getByTestId('detail-__footer__-costSmu')).toBeInTheDocument()

  expect(screen.queryByTestId('cost-Avg / Day-g1')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm test -- PnlGroupComparisonTable.spec
```

Expected: FAIL — `Cannot find module './PnlGroupComparisonTable'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import { formatDayLabel } from '../utils/dailyMatrix'
import { COST_COMPONENTS, ComparisonTableModel } from '../utils/groupComparison'
import { num } from '../utils/format'

interface PnlGroupComparisonTableProps {
  model: ComparisonTableModel
}

// The Total footer row expands like a body row; this is the key it occupies in the open set.
const FOOTER_KEY = '__footer__'

// A missing value is marked, not left blank: an empty cell and a real 0 read the same at a glance,
// and a clickable cell needs something to aim at. Same rule as PnlMatrixTable.
function formatValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return num(Math.round(value))
}

function incompleteTooltip(count: number): string | undefined {
  return count > 0
    ? `${count} TO belum ada cost — cost di sel ini lebih rendah dari seharusnya`
    : undefined
}

function costCellTitle(incomplete: number): string {
  const hint = 'Lihat rincian SMU, RA, SG Out, SG In'
  const warning = incompleteTooltip(incomplete)
  return warning ? `${hint} — ${warning}` : hint
}

export function PnlGroupComparisonTable({ model }: PnlGroupComparisonTableProps) {
  const [openDates, setOpenDates] = useState<Set<string>>(new Set())
  const groupCount = model.columns.length

  const toggle = (key: string) =>
    setOpenDates((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // One detail row per component, spanning the Revenue block (blank) and the Cost block (filled).
  const detailRows = (
    key: string,
    components: Record<string, (number | null)[]>,
    striped: boolean,
  ) =>
    COST_COMPONENTS.map(({ key: componentKey, label }) => (
      <tr
        key={`${key}-${componentKey}`}
        data-testid={`detail-${key}-${componentKey}`}
        className={striped ? 'bg-muted/30' : 'bg-muted/10'}
      >
        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1 pl-6 text-xs text-muted-foreground">
          {label}
        </td>
        {Array.from({ length: groupCount }, (_, i) => (
          <td key={`rev-${i}`} className="border-b border-l" />
        ))}
        {components[componentKey].map((value, i) => (
          <td
            key={`cost-${i}`}
            className="whitespace-nowrap border-b border-l px-3 py-1 text-right text-xs text-muted-foreground"
          >
            {formatValue(value)}
          </td>
        ))}
      </tr>
    ))

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-left font-medium"
              >
                Date
              </th>
              <th
                colSpan={groupCount}
                className="border-b border-l bg-green-100 px-3 py-1.5 text-center font-semibold dark:bg-green-950/40"
              >
                Revenue
              </th>
              <th
                colSpan={groupCount}
                className="border-b border-l bg-blue-100 px-3 py-1.5 text-center font-semibold dark:bg-blue-950/40"
              >
                Cost
              </th>
            </tr>
            <tr>
              {model.columns.map((column) => (
                <th
                  key={`rev-${column.id}`}
                  className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
              {model.columns.map((column) => (
                <th
                  key={`cost-${column.id}`}
                  className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {model.rows.map((row, rowIndex) => {
              const striped = rowIndex % 2 === 1
              return (
                // A row and its detail rows are siblings, so the pair is wrapped in a keyed
                // Fragment — a bare <> cannot carry the key React needs inside a map.
                <React.Fragment key={row.date}>
                  <tr
                    data-testid={`row-${row.date}`}
                    className={striped ? 'bg-muted/30' : ''}
                  >
                    <td
                      className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1.5 ${striped ? 'bg-muted/30' : 'bg-card'}`}
                    >
                      {formatDayLabel(row.date)}
                    </td>
                    {row.revenue.map((value, i) => (
                      <td
                        key={`rev-${i}`}
                        data-testid={`revenue-${row.date}-${model.columns[i].id}`}
                        className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                      >
                        {formatValue(value)}
                      </td>
                    ))}
                    {row.cost.map((value, i) => (
                      <td key={`cost-${i}`} className="border-b border-l p-0">
                        <button
                          type="button"
                          data-testid={`cost-${row.date}-${model.columns[i].id}`}
                          title={costCellTitle(row.incompleteTos[i])}
                          aria-expanded={openDates.has(row.date)}
                          className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                          onClick={() => toggle(row.date)}
                        >
                          {formatValue(value)}
                          {row.incompleteTos[i] > 0 && (
                            <span className="ml-1 text-amber-600">•</span>
                          )}
                        </button>
                      </td>
                    ))}
                  </tr>
                  {openDates.has(row.date) && detailRows(row.date, row.components, striped)}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            {model.footerRows.map((footerRow, i) => (
              <React.Fragment key={footerRow.label}>
                <tr className={i === 0 ? 'border-t-2 font-semibold' : 'font-semibold'}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1.5 text-right">
                    {footerRow.label}
                  </td>
                  {footerRow.revenue.map((value, ci) => (
                    <td
                      key={`rev-${ci}`}
                      className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                  {footerRow.cost.map((value, ci) =>
                    footerRow.components ? (
                      <td key={`cost-${ci}`} className="border-b border-l p-0">
                        <button
                          type="button"
                          data-testid={`cost-${FOOTER_KEY}-${model.columns[ci].id}`}
                          title={costCellTitle(footerRow.incompleteTos?.[ci] ?? 0)}
                          aria-expanded={openDates.has(FOOTER_KEY)}
                          className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                          onClick={() => toggle(FOOTER_KEY)}
                        >
                          {formatValue(value)}
                          {(footerRow.incompleteTos?.[ci] ?? 0) > 0 && (
                            <span className="ml-1 text-amber-600">•</span>
                          )}
                        </button>
                      </td>
                    ) : (
                      <td
                        key={`cost-${ci}`}
                        className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                      >
                        {formatValue(value)}
                      </td>
                    ),
                  )}
                </tr>
                {footerRow.components &&
                  openDates.has(FOOTER_KEY) &&
                  detailRows(FOOTER_KEY, footerRow.components, false)}
              </React.Fragment>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/frontend && pnpm test -- PnlGroupComparisonTable.spec
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx
git commit -m "feat(pnl): add the group comparison table with expandable cost detail"
```

---

## Task 12: Comparison tab container and PnL wiring

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx`
- Test: `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx:63-69, 140-159, 254-258`

**Interfaces:**
- Consumes: `usePnlGroupComparison` (Task 7), `useRouteGroups` (Task 7), `toComparisonTable` / `overlappingRoutes` (Task 10), `PnlGroupComparisonTable` (Task 11).
- Produces: `PnlGroupComparisonView` with props `{ filter: PnlFilter }`; the `'groups'` member of `PnlView`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonView } from './PnlGroupComparisonView'
import { PnlFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => ({
  ...jest.requireActual('../hooks/usePnl'),
  usePnlGroupComparison: jest.fn(),
}))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(),
}))

import { usePnlGroupComparison } from '../hooks/usePnl'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

const route = (dest: string) => ({ origin: 'Jabo', originLabel: 'CGK', dest })

beforeEach(() => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'Kalimantan', description: null, routes: [route('Balikpapan'), route('Batam')] },
      { id: 'g2', name: 'Sumatera', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  ;(usePnlGroupComparison as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
})

it('asks the user to pick a group before showing any table', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByText(/pilih minimal satu group/i)).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('lists every group as a checkbox with its route count', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByLabelText(/Kalimantan/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Sumatera/)).toBeInTheDocument()
})

// The columns are independent by design, so a shared route lands in both and the columns do not
// sum to a period total. Saying so stops the table being read as a partition.
it('warns when the selected groups share a route', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/Kalimantan/))
  fireEvent.click(screen.getByLabelText(/Sumatera/))

  expect(screen.getByText(/CGK → Batam/)).toBeInTheDocument()
  expect(screen.getByText(/Kalimantan, Sumatera/)).toBeInTheDocument()
})

it('does not warn when the selected groups are disjoint', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'A', description: null, routes: [route('Aceh')] },
      { id: 'g2', name: 'B', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/A/))
  fireEvent.click(screen.getByLabelText(/B/))

  expect(screen.queryByText(/berbagi/i)).not.toBeInTheDocument()
})

it('tells the user when no groups exist yet', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({ data: [], isLoading: false })
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByText(/belum ada route group/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm test -- PnlGroupComparisonView.spec
```

Expected: FAIL — `Cannot find module './PnlGroupComparisonView'`.

- [ ] **Step 3: Write the container**

Create `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { PnlFilter, usePnlGroupComparison } from '../hooks/usePnl'
import { overlappingRoutes, toComparisonTable } from '../utils/groupComparison'
import { PnlGroupComparisonTable } from './PnlGroupComparisonTable'

interface PnlGroupComparisonViewProps {
  filter: PnlFilter
}

export function PnlGroupComparisonView({ filter }: PnlGroupComparisonViewProps) {
  // Selection order is the column order, so the array is appended to rather than re-sorted.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { data: groups, isLoading: isLoadingGroups } = useRouteGroups()
  const { data, isLoading, isError, refetch } = usePnlGroupComparison(filter, selectedIds)

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const selectedGroups = (groups ?? []).filter((g) => selectedIds.includes(g.id))
  const overlaps = overlappingRoutes(selectedGroups)

  if (isLoadingGroups) {
    return <div className="h-24 animate-pulse rounded-lg border bg-card" />
  }

  if ((groups ?? []).length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Route Group.</span>{' '}
          <Link href="/route-groups" className="text-primary underline">
            Buat satu dulu
          </Link>{' '}
          <span>untuk mulai membandingkan.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Group</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(groups ?? []).map((group) => (
            <label key={group.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`${group.name} (${group.routes.length} rute)`}
                checked={selectedIds.includes(group.id)}
                onChange={() => toggle(group.id)}
              />
              <span>{group.name}</span>
              <span className="text-xs text-muted-foreground">{group.routes.length} rute</span>
            </label>
          ))}
        </div>

        {overlaps.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {/* Built as one interpolated string rather than mixed JSX children, so the whole
                sentence lands in a single text node the tests can match on. */}
            {overlaps.map((o) => (
              <p key={o.route}>
                {`${o.groupNames.join(', ')} berbagi rute ${o.route} — angkanya dihitung di setiap kolom, jadi kolom-kolom ini tidak boleh dijumlahkan.`}
              </p>
            ))}
          </div>
        )}
      </div>

      {selectedIds.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih minimal satu group untuk melihat perbandingan.
          </p>
        </div>
      ) : isLoading ? (
        <div className="h-[420px] animate-pulse rounded-lg border bg-card" />
      ) : isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load the comparison.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : data ? (
        <PnlGroupComparisonTable model={toComparisonTable(data)} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/frontend && pnpm test -- PnlGroupComparisonView.spec
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the tab into the PnL page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`:

Add the import next to the other feature component imports:

```ts
import { PnlGroupComparisonView } from '@/features/pnl/components/PnlGroupComparisonView'
```

Change line 63:

```ts
type PnlView = 'estimate' | 'actual' | 'daily' | 'groups'
```

Add to `VIEW_SUBTITLE` (lines 65-69):

```ts
  groups: 'Revenue and cost per date, compared across route groups',
```

Add a button after the "Daily Report" button (which closes at line 158):

```tsx
            <button
              className={`px-3 py-1.5 border-l ${view === 'groups' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('groups')}
            >
              Group Comparison
            </button>
```

Add a branch in the render chain, after the `view === 'daily'` branch (line 256-257):

```tsx
      ) : view === 'groups' ? (
        filter && <PnlGroupComparisonView filter={filter} />
```

- [ ] **Step 6: Run the whole frontend suite**

```bash
cd apps/frontend && pnpm test && pnpm type-check && pnpm lint
```

Expected: all tests pass; type-check silent; lint clean.

- [ ] **Step 7: Check the tab by hand**

Run `pnpm dev` from the repo root and open `http://localhost:3000/pnl`. Confirm:
- a "Group Comparison" button sits after "Daily Report";
- before ticking anything, the empty state shows and the Network tab shows **no** request to `/pnl/breakdown/group-comparison`;
- ticking two groups adds two columns under Revenue and two under Cost, and the date rows cover the whole cycle;
- clicking a Cost cell opens SMU / RA / SG Out / SG In filled for both groups, and the four values add up to the cell above;
- clicking a second date leaves the first open;
- changing the cycle or date basis in the page header reloads the table for the new period;
- ticking two groups that share a route shows the amber overlap note.

- [ ] **Step 8: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/pnl/components/ "apps/frontend/src/app/(dashboard)/pnl/page.tsx"
git commit -m "feat(pnl): add the Group Comparison tab"
```

---

## Task 13: Full-suite verification

**Files:** none changed unless a regression surfaces.

**Interfaces:**
- Consumes: everything from Tasks 1-12.
- Produces: a green build on both apps.

- [ ] **Step 1: Run the full backend suite**

```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=4096 pnpm test -- --runInBand
```

Expected: all suites pass. The heap bump and `--runInBand` are both required — `--runInBand` alone still core-dumps on this suite.

- [ ] **Step 2: Run the full frontend suite**

```bash
cd apps/frontend && pnpm test
```

Expected: all suites pass.

- [ ] **Step 3: Build both apps**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm build
```

Expected: backend `nest build` and frontend `next build` both succeed.

- [ ] **Step 4: Confirm nothing else regressed on the PnL numbers**

The Daily Report tab and the group comparison read the same view. Spot-check that a single-group comparison whose routes are all 18 station pairs totals the same revenue as the Daily Report footer for the same cycle:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d app -c "
SELECT ROUND(SUM(revenue_total)) AS daily_report_revenue
FROM v_pnl_to
WHERE cycle_ata = '2026-05-1H' AND date_ata IS NOT NULL
  AND origin_station IS NOT NULL AND dest_station IS NOT NULL;"
```

Expected: matches the Total row of a Group Comparison whose single group holds all 18 routes.

- [ ] **Step 5: Commit any fixes**

If steps 1-4 surfaced nothing, there is nothing to commit. Otherwise:

```bash
cd /home/faris/code/esp/esp-dashboard
git add -A
git commit -m "fix(route-group): address full-suite regressions"
```

---

## Deploy Notes

Record these for whoever ships this:

1. **Run the migration.** `pnpm migration:run` creates `route_groups` and `route_group_routes`.
2. **Restart the backend before assigning permissions.** The four `*.route_group` rows are seeded into the `permissions` table on bootstrap from the `Permission` enum, so they do not exist until the new build has started once.
3. **Grant `read.route_group` to every role that uses PnL.** Without it the group multi-select in the new tab is empty and the tab looks broken. Grant `create` / `update` / `delete.route_group` only to the admin roles that should manage groups.
4. **No `v_pnl_to` change**, so no `REFRESH MATERIALIZED VIEW` is needed and no existing PnL number moves.
