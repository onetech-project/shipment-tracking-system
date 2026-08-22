# Vendor Group CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a Vendor Group page — named sets of vendor names, created, edited and deleted like Route Groups — plus the `available-vendors` endpoint that feeds its picker, and the four permissions that gate all of it.

**Architecture:** A near-clone of the `route-groups` module, deliberately diverged in three places. (a) The child table keys on a bare `vendor` string rather than an object, so its DTO uses per-element `class-validator` decorators instead of `@ValidateNested`. (b) `available-vendors` is a genuine `UNION` of the rate-card master (`air_shipments_smu.vendor`) and the values actually observed on TOs (`v_pnl_to.vendor`), returning `has_data` and `in_master` separately — route-groups can be master-only because its containment was measured; vendor containment has not been, which is what Task 1 fixes. (c) `VendorPicker` is written from scratch rather than copied from `RoutePicker`, because `RoutePicker` leans on an origin grouping axis that vendors do not have.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + raw SQL over Postgres; Next.js 14 App Router + React 18 + @tanstack/react-query; Jest + @testing-library/react; class-validator for backend DTOs.

**Spec:** [`docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md`](../specs/2026-08-22-pnl-vendor-comparison-design.md) — see **Fitur 3 — Vendor Group** and **Kelayakan**.

**Scope note:** This is plan 2 of 3. Plan 1 is the Route Comparison foundation (independent of this one). Plan 3 is the PnL Vendor Comparison tab and depends on both. Nothing in this plan touches the PnL module, the comparison table, or the PnL page — the tab that consumes these groups is plan 3's work. Everything here ships on its own: a Vendor Group menu that manages groups nothing reads yet is harmless, and it is the precondition for plan 3.

## Global Constraints

- Vendor names are used **raw, end to end**. No `BTRIM`, no lowercasing, no case folding, at any layer — picker, DTO, service, SQL, storage. The value the user picks, the value stored in `vendor_group_vendors.vendor`, and the value plan 3 joins against `v_pnl_to.vendor` must be byte-identical, or `has_data` and the aggregation will disagree with each other and nobody will be able to tell which one is lying.
- The only values excluded from the vendor list are `NULL` and the empty string, written explicitly as `vendor IS NOT NULL AND vendor <> ''`. Do **not** use `NULLIF(BTRIM(vendor), '')` — that is what `route-groups` does for stations, and copying it here would silently normalise names on one side of a join.
- `available-vendors` is a **union**, not a `LEFT JOIN` from master. Master-only would drop any vendor that has bookings but no rate-card row. That case is not proven by `smu_rate_missing` — that issue fires on a miss over the whole `(vendor, airlines, origin, destination)` key, not on the vendor alone — but the master is a Google-Sheet snapshot rewritten on every sync, so the containment Task 1 measures is a fact about today's sheet, not about the schema. The union costs nothing and removes the dependency on that measurement.
- The four new permissions are `read.vendor_group`, `create.vendor_group`, `update.vendor_group`, `delete.vendor_group`. Do **not** rename or reuse `read.route_group`: `permissions` is seeded insert-only at boot (`apps/backend/src/modules/permissions/permissions.service.ts:19-33`), so renaming an enum member orphans the old row and silently revokes it from every role.
- Every new response field is read on the frontend behind a `?? ` fallback. Frontend and backend deploy in parallel; a new frontend must survive an old backend.
- No Zod. Backend DTOs use `class-validator`; frontend forms validate by hand. The login form is the only Zod in this repo and it stays that way.
- Backend tests: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`. The heap bump *and* `--runInBand` are both required; either alone core-dumps.
- Frontend tests: `cd apps/frontend && pnpm exec jest <pattern>`.
- Type gate: `pnpm exec tsc --noEmit` in the app you changed. `packages/shared` is compiled by both apps, so a change there must be typechecked from both.
- `next lint` already fails on seven pre-existing files and is **not** a gate. Do not try to fix it.
- Explanatory copy is Indonesian, structural labels (Name, Description, Vendors, Save, Cancel, Delete) are English. Match the surrounding file.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `apps/backend/src/database/migrations/20260822000001-vendor-groups.ts` | DDL for `vendor_groups` and `vendor_group_vendors`, plus the reverse-lookup index and a working `down()` |
| `apps/backend/src/modules/vendor-groups/entities/vendor-group.entity.ts` | TypeORM mapping for the parent row |
| `apps/backend/src/modules/vendor-groups/entities/vendor-group-vendor.entity.ts` | TypeORM mapping for the membership row, composite PK |
| `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.ts` | Create payload validation — `vendors: string[]`, per-element rules |
| `apps/backend/src/modules/vendor-groups/dto/update-vendor-group.dto.ts` | Patch payload validation — every field optional |
| `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.spec.ts` | Pins the decorator set, including that names are never normalised |
| `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts` | The union query, the raw-SQL read, and delete-then-insert writes in a transaction |
| `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts` | Service unit tests over a mocked `DataSource` |
| `apps/backend/src/modules/vendor-groups/vendor-groups.controller.ts` | Five routes, `@Authorize` per method, `@HttpCode(204)` on delete |
| `apps/backend/src/modules/vendor-groups/vendor-groups.controller.spec.ts` | Controller pass-through tests |
| `apps/backend/src/modules/vendor-groups/vendor-groups.module.ts` | Module wiring |

**Backend — modified**

| File | Change |
|---|---|
| `packages/shared/src/auth/index.ts:93` | Four new `Permission` members after `DELETE_ROUTE_GROUP` |
| `apps/backend/src/app.module.ts:30, :100` | Import and register `VendorGroupsModule` |

**Frontend — created**

| File | Responsibility |
|---|---|
| `apps/frontend/src/features/vendor-groups/types.ts` | `AvailableVendor`, `VendorGroup`, `VendorGroupPayload` |
| `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.ts` | Queries keyed `['vendor-groups']`, mutations, and the rolling-deploy `?? ` normalisation |
| `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.spec.ts` | Pins the query keys and the `select` fallbacks |
| `apps/frontend/src/features/vendor-groups/components/VendorPicker.tsx` | Flat alphabetical list + search + amber dot + no-rate-card label + counter |
| `apps/frontend/src/features/vendor-groups/components/VendorPicker.spec.tsx` | Picker behaviour, including that search never alters the stored name |
| `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.tsx` | Create/edit form, manual validation |
| `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.spec.tsx` | The two rules the form owns, plus raw-name pass-through |
| `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.tsx` | Confirm dialog that surfaces backend errors |
| `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.spec.tsx` | Error surfacing and close-on-success |
| `apps/frontend/src/app/(dashboard)/vendor-groups/page.tsx` | Table, permission gating, modal orchestration |

**Frontend — modified**

| File | Change |
|---|---|
| `apps/frontend/src/components/layout/sidebar.tsx:23, :155` | `Truck` icon import and a Vendor Group entry gated on `read.vendor_group` |

**Docs — modified**

| File | Change |
|---|---|
| `docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md:44` | Task 1 replaces the "Belum diukur" heading with the measured number |

---

### Task 1: Measure the vendor containment gap before writing any code

The spec's Kelayakan section names one query it explicitly did **not** run, and says the answer decides whether `available-vendors` may be master-only. Route Group is master-only only because its containment was measured and the number recorded in a code comment (`apps/backend/src/modules/route-groups/route-groups.service.ts:38-41`); vendor has no equivalent evidence.

Run it first. The design already commits to a union regardless of the answer — the number is what tells a future reader whether the union is load-bearing today or merely insurance, and that difference matters the moment someone proposes simplifying it away.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md:44`
- Test: none — this task runs queries, it does not change behaviour.

**Interfaces:**
- Consumes: the running Postgres at `DATABASE_URL` in `apps/backend/.env`.
- Produces: a recorded integer in the spec's Kelayakan section; no code artefacts.

- [ ] **Step 1: Run the containment query from the spec**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -At -c "
SELECT count(*) FROM (
  SELECT DISTINCT vendor FROM v_pnl_to          WHERE vendor IS NOT NULL AND vendor <> ''
  EXCEPT
  SELECT DISTINCT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> ''
) x;
"
```

Expected: a single integer on stdout. Write it down — every later step in this task refers to it.

This deliberately tightens the spec's query by the `AND vendor <> ''` filter on both sides of the `EXCEPT`. The spec's version filters only `vendor IS NOT NULL`, but `getAvailableVendors` (Task 4) also drops `''`, and the spec itself records that TOs with an empty vendor name exist — the `vendor` column is not `NULLIF`-ed on the way into `v_pnl_to`. Without the extra filter the empty string counts as an orphan here while the endpoint never emits it, and the cross-check in Task 4 Step 6 would be off by one against code that is correct.

If `psql` cannot connect, **stop**. Do not proceed to Task 2 with an assumed number: the whole point of this task is that the design currently rests on an unmeasured claim. Get the database up, or get the number from whoever can run it, then continue.

- [ ] **Step 2: Put faces on the number**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -c "
SELECT vendor, count(*) AS tos
FROM v_pnl_to
WHERE vendor IS NOT NULL AND vendor <> ''
  AND vendor NOT IN (SELECT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> '')
GROUP BY vendor
ORDER BY tos DESC
LIMIT 50;
"
```

Expected: zero rows if Step 1 returned `0`, otherwise the vendor names that are booked but have no rate-card row, biggest first. These are exactly the vendors a master-only endpoint would make unselectable. They are not the same set as the TOs carrying `issue = 'smu_rate_missing'` — that issue fires on a miss over the whole `(vendor, airlines, origin, destination)` rate-card key, so most of those rows have a vendor that is perfectly present in the master.

Also run the mirror direction, which is the number the picker's amber dot reports on:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -At -c "
SELECT
  (SELECT count(DISTINCT vendor) FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> '') AS master_vendors,
  (SELECT count(DISTINCT vendor) FROM v_pnl_to        WHERE vendor IS NOT NULL AND vendor <> '') AS used_vendors;
"
```

Expected: two integers. On the current database `master_vendors = 5` and `used_vendors = 3`, so roughly two of the five picker rows carry an amber dot. A much larger `master_vendors` on another environment is equally normal and simply means more dots — the count is context for reading the picker, not an assertion.

- [ ] **Step 3: Record the number in the spec**

```bash
cd /home/faris/code/esp/esp-dashboard
ORPHANS=$(psql "$(grep -E '^DATABASE_URL=' apps/backend/.env | cut -d= -f2-)" -At -c "
SELECT count(*) FROM (
  SELECT DISTINCT vendor FROM v_pnl_to          WHERE vendor IS NOT NULL AND vendor <> ''
  EXCEPT
  SELECT DISTINCT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> ''
) x;
")
sed -i "s|^\*\*Belum diukur, wajib diukur sebelum implementasi:\*\*\$|**Diukur $(date +%F) — vendor di \`v_pnl_to\` yang tidak ada di \`air_shipments_smu\`: ${ORPHANS}.** Union tetap dipakai apa pun angkanya: ia snapshot satu sheet sync, bukan sifat skema.|" \
  docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md
grep -n '^\*\*Diukur' docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md
```

Expected: the `grep` prints one line, at line 44, carrying today's date and the measured integer. The SQL block underneath it is left in place — it is the query that produced the number and re-running it later is how anyone checks whether the answer has drifted.

- [ ] **Step 4: Commit the measurement**

```bash
cd /home/faris/code/esp/esp-dashboard
ORPHANS=$(sed -n 's/^\*\*Diukur .*: \([0-9]*\)\.\*\*.*/\1/p' docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md)
git add docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md
git commit -m "docs(pnl): record that ${ORPHANS} booked vendors are missing from the rate-card master"
```

---

### Task 2: Create the vendor_groups and vendor_group_vendors tables

**Files:**
- Create: `apps/backend/src/database/migrations/20260822000001-vendor-groups.ts`
- Test: none — migrations in this repo have no unit tests; the gate is that `migration:run` succeeds and `migration:revert` puts the schema back.

**Interfaces:**
- Consumes: nothing.
- Produces: tables `vendor_groups(id, name, description, created_at, updated_at)` and `vendor_group_vendors(vendor_group_id, vendor)`; index `idx_vendor_group_vendors_vendor`.

- [ ] **Step 1: Write the migration**

Create `apps/backend/src/database/migrations/20260822000001-vendor-groups.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Named sets of vendor names, used by the PnL vendor-comparison tab.
//
// The vendor is stored as raw text rather than a foreign key for the same reason route_group_routes
// stores station text: no table has the vendor name as a primary key. air_shipments_smu is a
// Google-Sheet-synced rate card whose rows are rewritten on every sync, so its ids are not stable —
// but the name itself is exactly the key v_pnl_to.vendor carries and the comparison query joins on.
//
// The name is stored with no normalisation of any kind. Trimming or case-folding here would make
// the stored value differ from v_pnl_to.vendor, and the join would quietly miss.
export class VendorGroups20260822000001 implements MigrationInterface {
  name = 'VendorGroups20260822000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vendor_groups (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_vendor_groups"      PRIMARY KEY (id),
        CONSTRAINT "uq_vendor_groups_name" UNIQUE (name)
      )
    `)

    // VARCHAR(200), not 100: vendor names are free text from a spreadsheet. 200 gives an over-long
    // name a clean 400 from the DTO's MaxLength rather than a row-size error from the primary-key
    // btree at insert time.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vendor_group_vendors (
        vendor_group_id UUID         NOT NULL,
        vendor          VARCHAR(200) NOT NULL,
        CONSTRAINT "pk_vendor_group_vendors" PRIMARY KEY (vendor_group_id, vendor),
        CONSTRAINT "fk_vendor_group_vendors_group"
          FOREIGN KEY (vendor_group_id) REFERENCES vendor_groups(id) ON DELETE CASCADE
      )
    `)

    // Serves the reverse lookup only — "which groups contain this vendor", which is what the
    // overlap banner asks. The forward direction is already covered by vendor_group_id being the
    // leading column of the primary key, so an index on vendor_group_id would be dead weight.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_group_vendors_vendor
        ON vendor_group_vendors (vendor)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Child first: the FK would block the parent drop.
    await queryRunner.query(`DROP TABLE IF EXISTS vendor_group_vendors`)
    await queryRunner.query(`DROP TABLE IF EXISTS vendor_groups`)
  }
}
```

No `organization_id` and no soft delete, matching `20260816000002-route-groups.ts` — the README describes CLS org-scoping but route groups do not carry it either, and introducing a scoping column on only one of the two sibling tables would be worse than the current consistency.

- [ ] **Step 2: Run the migration**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm run migration:run
```

Expected: `Migration VendorGroups20260822000001 has been executed successfully.`

- [ ] **Step 3: Verify the schema is what the DDL says**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -c "\d vendor_group_vendors"
```

Expected: `vendor` is `character varying(200) not null`; the primary key is `(vendor_group_id, vendor)`; `idx_vendor_group_vendors_vendor` is listed as a btree on `(vendor)`; the foreign key shows `ON DELETE CASCADE`. If an index on `vendor_group_id` appears, you copied the route-groups index by mistake — remove it.

- [ ] **Step 4: Verify down() actually reverses**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
pnpm run migration:revert
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -At -c "SELECT to_regclass('vendor_groups'), to_regclass('vendor_group_vendors');"
pnpm run migration:run
```

Expected: the middle command prints `|` (both `NULL`), proving both tables were dropped; the third re-applies cleanly. A `down()` that has never been executed is a `down()` that does not work.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/database/migrations/20260822000001-vendor-groups.ts
git commit -m "feat(pnl): add vendor_groups tables, keyed on the raw vendor name the view carries"
```

---

### Task 3: Add the four vendor-group permissions

**Files:**
- Modify: `packages/shared/src/auth/index.ts:93`
- Test: none — the enum is a constant list; the meaningful verification is the rollout in Task 15.

**Interfaces:**
- Consumes: nothing.
- Produces: `Permission.READ_VENDOR_GROUP`, `Permission.CREATE_VENDOR_GROUP`, `Permission.UPDATE_VENDOR_GROUP`, `Permission.DELETE_VENDOR_GROUP`, with string values `read.vendor_group`, `create.vendor_group`, `update.vendor_group`, `delete.vendor_group`.

- [ ] **Step 1: Add the members**

In `packages/shared/src/auth/index.ts`, immediately after line 93 (`DELETE_ROUTE_GROUP = 'delete.route_group',`) and before the closing `}` of the enum, add:

```ts

  // Vendor Group — named sets of vendor names used by the PnL vendor-comparison tab. Reads gate
  // both the menu and the vendor picker. Note the tab itself is only gated in the UI: the
  // /pnl/breakdown/* endpoints require read.pnl and @Authorize on a method replaces rather than
  // adds to the class-level decorator, so read.vendor_group genuinely protects /vendor-groups only.
  READ_VENDOR_GROUP = 'read.vendor_group',
  CREATE_VENDOR_GROUP = 'create.vendor_group',
  UPDATE_VENDOR_GROUP = 'update.vendor_group',
  DELETE_VENDOR_GROUP = 'delete.vendor_group',
```

All four match the CHECK constraint `^(read|create|update|delete)\.[a-z][a-z0-9_]*$` from `apps/backend/src/database/migrations/20260314000004-create-roles-permissions.ts:31-32`.

Nothing else needs to change for the Roles panel: it groups permissions by `p.name.split('.')[1]` (`apps/frontend/src/features/roles/components/role-permissions-panel.tsx:57-62`), so a "Vendor_group" section appears beside the existing "Route_group" section with no frontend work at all.

- [ ] **Step 2: Confirm the values are what the guard will compare against**

```bash
cd /home/faris/code/esp/esp-dashboard
grep -n "VENDOR_GROUP" packages/shared/src/auth/index.ts
```

Expected: exactly four lines, values `read.vendor_group`, `create.vendor_group`, `update.vendor_group`, `delete.vendor_group` — lowercase, singular `vendor_group`, underscore not hyphen. A typo here does not fail any test: the permission row simply gets seeded under the wrong name and every non-super-admin is locked out for reasons nobody can see.

- [ ] **Step 3: Typecheck both apps**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
```

Expected: no output from either. `packages/shared` is consumed by both, so a change there has two type gates, not one.

- [ ] **Step 4: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add packages/shared/src/auth/index.ts
git commit -m "feat(pnl): add the four vendor_group permissions alongside the route_group ones"
```

---

### Task 4: Service returns the union of master and used vendors

This is the one place where copying `route-groups` would be wrong. `getAvailableRoutes` starts from the master and `LEFT JOIN`s the observed set; that is safe only because its containment was measured. Task 1 measured the vendor equivalent, and the union is what makes the answer harmless either way.

**Files:**
- Create: `apps/backend/src/modules/vendor-groups/entities/vendor-group.entity.ts`
- Create: `apps/backend/src/modules/vendor-groups/entities/vendor-group-vendor.entity.ts`
- Create: `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`
- Test: `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts`

**Interfaces:**
- Consumes: tables from Task 2.
- Produces:
  - `interface AvailableVendor { vendor: string; hasData: boolean; inMaster: boolean }`
  - `interface VendorGroup { id: string; name: string; description: string | null; vendors: string[] }`
  - `VendorGroupsService.getAvailableVendors(): Promise<AvailableVendor[]>`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { DataSource, EntityManager } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { VendorGroupsService } from './vendor-groups.service'
import { VendorGroupEntity } from './entities/vendor-group.entity'

describe('VendorGroupsService', () => {
  let service: VendorGroupsService
  let dataSource: { query: jest.Mock; transaction: jest.Mock }
  let manager: { getRepository: jest.Mock }
  let groupRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  // Repos handed out by the transactional EntityManager. Deliberately separate doubles from the
  // injected `groupRepo`: create/update must write through the transaction, and a shared double
  // would hide the difference.
  let txGroupRepo: { create: jest.Mock; save: jest.Mock; update: jest.Mock }
  let txVendorRepo: { delete: jest.Mock; insert: jest.Mock }

  beforeEach(async () => {
    groupRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    txGroupRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
    }
    txVendorRepo = { delete: jest.fn(), insert: jest.fn() }
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === VendorGroupEntity ? txGroupRepo : txVendorRepo,
      ),
    }
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    }
    const module = await Test.createTestingModule({
      providers: [
        VendorGroupsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(VendorGroupEntity), useValue: groupRepo },
      ],
    }).compile()
    service = module.get(VendorGroupsService)
  })

  describe('getAvailableVendors', () => {
    it('maps every row to its two independent flags', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
        // Booked but absent from the rate-card master — the case a master-only endpoint would
        // make unselectable altogether.
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: false },
        // On the rate card but never flown — selectable, but renders an all-em-dash column.
        { vendor: 'Sriwijaya Air', has_data: false, in_master: true },
      ])

      await expect(service.getAvailableVendors()).resolves.toEqual([
        { vendor: 'ASIA CARGO', hasData: true, inMaster: true },
        { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false },
        { vendor: 'Sriwijaya Air', hasData: false, inMaster: true },
      ])
    })

    it('queries both sources and unions them rather than joining from the master', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getAvailableVendors()

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain('FROM air_shipments_smu')
      expect(sql).toContain('FROM v_pnl_to')
      expect(sql).toContain('SELECT vendor FROM master UNION SELECT vendor FROM used')
      expect(sql).not.toContain('LEFT JOIN')
    })

    // Decision #7: the stored value has to be byte-identical to v_pnl_to.vendor. BTRIM on one side
    // of that join is a silent bug, so it must not appear anywhere in this query.
    it('filters NULL and empty names explicitly, never by normalising them', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getAvailableVendors()

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain("WHERE vendor IS NOT NULL AND vendor <> ''")
      expect(sql).not.toContain('BTRIM')
      expect(sql).not.toContain('NULLIF')
      expect(sql).not.toContain('LOWER')
    })

    it('returns an empty list when neither source has a vendor', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.getAvailableVendors()).resolves.toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: FAIL — `Cannot find module './vendor-groups.service'`.

- [ ] **Step 3: Create the entities**

Create `apps/backend/src/modules/vendor-groups/entities/vendor-group.entity.ts`:

```ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('vendor_groups')
export class VendorGroupEntity {
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

Create `apps/backend/src/modules/vendor-groups/entities/vendor-group-vendor.entity.ts`:

```ts
import { Entity, PrimaryColumn } from 'typeorm'

// Composite primary key across both columns: a vendor may sit in many groups and a group holds many
// vendors, but the same vendor twice in one group is meaningless.
//
// length 200 mirrors the column, and the value is stored exactly as received — the aggregation in
// the vendor-comparison tab joins this string to v_pnl_to.vendor with plain equality.
@Entity('vendor_group_vendors')
export class VendorGroupVendorEntity {
  @PrimaryColumn({ name: 'vendor_group_id', type: 'uuid' })
  vendorGroupId: string

  @PrimaryColumn({ name: 'vendor', length: 200 })
  vendor: string
}
```

- [ ] **Step 4: Create the service with the union query**

Create `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'

export interface AvailableVendor {
  vendor: string // raw name, byte-identical to what v_pnl_to.vendor holds
  hasData: boolean // appears in v_pnl_to; false means a group holding it renders an empty column
  inMaster: boolean // appears in air_shipments_smu; false = booked with no rate-card row at all
}

export interface VendorGroup {
  id: string
  name: string
  description: string | null
  vendors: string[]
}

@Injectable()
export class VendorGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VendorGroupEntity)
    private readonly groupRepo: Repository<VendorGroupEntity>,
  ) {}

  // A genuine union of the rate-card master and the values TOs actually carry, not a LEFT JOIN
  // from the master the way getAvailableRoutes does it. Route Group can be master-only because its
  // containment was measured and holds; the vendor equivalent is recorded in the spec's Kelayakan
  // section. Nothing proves a booked vendor is missing from the master today — smu_rate_missing
  // does not, since it fires on a miss over the whole (vendor, airlines, origin, destination) key
  // rather than on the vendor alone — but the master is a Google-Sheet snapshot rewritten on every
  // sync, so that measurement is a fact about today's sheet, not about the schema. The moment a
  // sync drops a vendor that TOs already reference, a master-only list makes it unselectable — and
  // the group that names it silently empties. The union costs nothing and removes that dependency.
  //
  // Names are taken raw. The only exclusions are NULL and '', written as an explicit comparison
  // rather than NULLIF(BTRIM(...)): trimming here would store a value that no longer equals
  // v_pnl_to.vendor, and the comparison join would silently miss every row.
  async getAvailableVendors(): Promise<AvailableVendor[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT vendor FROM air_shipments_smu
        WHERE vendor IS NOT NULL AND vendor <> ''
      ),
      used AS (
        SELECT DISTINCT vendor FROM v_pnl_to
        WHERE vendor IS NOT NULL AND vendor <> ''
      )
      SELECT v.vendor,
             (v.vendor IN (SELECT vendor FROM used))   AS has_data,
             (v.vendor IN (SELECT vendor FROM master)) AS in_master
      FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
      ORDER BY v.vendor
    `)

    return (rows as { vendor: string; has_data: boolean; in_master: boolean }[]).map((r) => ({
      vendor: r.vendor,
      hasData: r.has_data,
      inMaster: r.in_master,
    }))
  }
}
```

`v_pnl_to` is a materialized view refreshed only on sheet sync (`apps/backend/src/modules/air-shipments/air-shipments.service.ts:1143`) and settlement upload (`apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts:125`), so `has_data` lags a refresh. That is expected and is not something this endpoint should paper over.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Sanity-check the query against the real database**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -c "
WITH master AS (
  SELECT DISTINCT vendor FROM air_shipments_smu
  WHERE vendor IS NOT NULL AND vendor <> ''
),
used AS (
  SELECT DISTINCT vendor FROM v_pnl_to
  WHERE vendor IS NOT NULL AND vendor <> ''
)
SELECT v.vendor,
       (v.vendor IN (SELECT vendor FROM used))   AS has_data,
       (v.vendor IN (SELECT vendor FROM master)) AS in_master
FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
ORDER BY v.vendor
LIMIT 20;
"
```

Expected: rows come back with both boolean columns populated — that is all this `LIMIT 20` sample proves. Do **not** cross-check the containment number against it: the limit takes the first 20 names alphabetically, so on an environment with more than 20 vendors the `in_master = false` rows here are a subset, not the whole set. For the cross-check, re-run without the ordering and limit, wrapped in a count:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -At -c "
WITH master AS (
  SELECT DISTINCT vendor FROM air_shipments_smu
  WHERE vendor IS NOT NULL AND vendor <> ''
),
used AS (
  SELECT DISTINCT vendor FROM v_pnl_to
  WHERE vendor IS NOT NULL AND vendor <> ''
)
SELECT count(*) FROM used WHERE vendor NOT IN (SELECT vendor FROM master);
"
```

Expected: the same integer you recorded in **Task 1 Step 1**. On the current database that is `0`.

- [ ] **Step 7: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/vendor-groups
git commit -m "feat(pnl): list selectable vendors as a union so booked vendors without a rate card stay pickable"
```

---

### Task 5: DTOs validate bare vendor strings without normalising them

**Files:**
- Create: `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.ts`
- Create: `apps/backend/src/modules/vendor-groups/dto/update-vendor-group.dto.ts`
- Test: `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CreateVendorGroupDto { name: string; description?: string | null; vendors: string[] }`
  - `UpdateVendorGroupDto { name?: string; description?: string | null; vendors?: string[] }`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.spec.ts`:

```ts
/**
 * Pins the decorator set on CreateVendorGroupDto. Vendors are bare strings, so the rules are
 * per-element (`{ each: true }`) rather than @ValidateNested + @Type — that pair exists on the
 * route-group DTO only because a route member is an object, and copying it here would make
 * class-transformer try to instantiate a class from a string.
 */
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateVendorGroupDto } from './create-vendor-group.dto'

const constraintsFor = (payload: unknown, property: string): Record<string, string> => {
  const errors = validateSync(plainToInstance(CreateVendorGroupDto, payload))
  return errors.find((e) => e.property === property)?.constraints ?? {}
}

it('accepts a payload whose vendors are plain non-empty strings', () => {
  const errors = validateSync(
    plainToInstance(CreateVendorGroupDto, {
      name: 'Maskapai Nasional',
      description: 'vendor pelat merah',
      vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
    }),
  )

  expect(errors).toEqual([])
})

it('rejects an empty vendors array', () => {
  expect(constraintsFor({ name: 'X', vendors: [] }, 'vendors')).toHaveProperty('arrayMinSize')
})

it('rejects an empty string inside vendors', () => {
  expect(constraintsFor({ name: 'X', vendors: ['GARUDA', ''] }, 'vendors')).toHaveProperty(
    'isNotEmpty',
  )
})

it('rejects a vendor name longer than the 200-character column', () => {
  expect(constraintsFor({ name: 'X', vendors: ['A'.repeat(201)] }, 'vendors')).toHaveProperty(
    'maxLength',
  )
})

// A route-group-shaped member is the exact mistake this DTO exists to prevent.
it('rejects an object where a vendor string is expected', () => {
  expect(
    constraintsFor({ name: 'X', vendors: [{ origin: 'Jabo', dest: 'Aceh' }] }, 'vendors'),
  ).toHaveProperty('isString')
})

// Decision #7. The DTO must not be a normalisation point: whatever the picker sends is what gets
// stored, because that is what v_pnl_to.vendor is going to be compared against.
it('leaves surrounding whitespace and casing on a vendor name untouched', () => {
  const dto = plainToInstance(CreateVendorGroupDto, {
    name: 'X',
    vendors: ['  garuda Indonesia '],
  })

  expect(validateSync(dto)).toEqual([])
  expect(dto.vendors).toEqual(['  garuda Indonesia '])
})

it('rejects a name longer than the 100-character column', () => {
  expect(constraintsFor({ name: 'A'.repeat(101), vendors: ['GARUDA'] }, 'name')).toHaveProperty(
    'maxLength',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest create-vendor-group.dto.spec --runInBand
```

Expected: FAIL — `Cannot find module './create-vendor-group.dto'`.

- [ ] **Step 3: Write the create DTO**

Create `apps/backend/src/modules/vendor-groups/dto/create-vendor-group.dto.ts`:

```ts
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class CreateVendorGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string | null

  // Bare strings, so the rules are per-element. No @ValidateNested and no @Type: those belong to
  // the route-group DTO, whose members are objects. A group with no vendors would be a permanently
  // empty column, hence ArrayMinSize(1). MaxLength(200) matches vendor_group_vendors.vendor so an
  // over-long name is a 400 rather than a database error.
  //
  // Nothing here trims or lowercases. The value that arrives is the value that gets stored, so it
  // stays byte-identical to v_pnl_to.vendor.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  vendors: string[]
}
```

- [ ] **Step 4: Write the update DTO**

Create `apps/backend/src/modules/vendor-groups/dto/update-vendor-group.dto.ts`:

```ts
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class UpdateVendorGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  // Nullable rather than merely optional: `null` clears the description, an absent field leaves it
  // alone. The service depends on being able to tell those two apart.
  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  vendors?: string[]
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest create-vendor-group.dto.spec --runInBand
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/vendor-groups/dto
git commit -m "feat(pnl): validate vendor group members as bare strings, leaving the names untouched"
```

---

### Task 6: Service reads groups and creates them transactionally

**Files:**
- Modify: `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`
- Test: `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts`

**Interfaces:**
- Consumes: `CreateVendorGroupDto` from Task 5; `getAvailableVendors` from Task 4.
- Produces:
  - `VendorGroupsService.findAll(): Promise<VendorGroup[]>`
  - `VendorGroupsService.create(dto: CreateVendorGroupDto): Promise<VendorGroup>`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('VendorGroupsService', ...)` block in `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts`, after the `getAvailableVendors` block:

```ts
  describe('findAll', () => {
    it('returns each group with its vendor names', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        { id: 'vg1', name: 'Maskapai', description: null, vendor: 'Sriwijaya Air' },
        { id: 'vg2', name: 'Kargo', description: 'pihak ketiga', vendor: 'ASIA CARGO' },
      ])

      await expect(service.findAll()).resolves.toEqual([
        {
          id: 'vg1',
          name: 'Maskapai',
          description: null,
          vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
        },
        { id: 'vg2', name: 'Kargo', description: 'pihak ketiga', vendors: ['ASIA CARGO'] },
      ])
    })

    it('returns an empty array when there are no groups', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await expect(service.findAll()).resolves.toEqual([])
    })

    it('yields vendors: [] for a group whose LEFT JOIN produced a single all-null row', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Empty', description: null, vendor: null },
      ])

      await expect(service.findAll()).resolves.toEqual([
        { id: 'vg1', name: 'Empty', description: null, vendors: [] },
      ])
    })
  })

  describe('create', () => {
    it('rejects a vendor that is in neither the master nor the observed set', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])

      await expect(
        service.create({ name: 'Bad', vendors: ['NOBODY AIR'] }),
      ).rejects.toThrow('Unknown vendor: NOBODY AIR')
    })

    // A vendor that exists only in v_pnl_to must be accepted — that is the entire reason
    // getAvailableVendors is a union rather than a master lookup.
    it('accepts a vendor that exists only in the observed set', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: false }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).resolves.toEqual({
        id: 'new-id',
        name: 'Maskapai',
        description: null,
        vendors: ['GARUDA INDONESIA'],
      })
    })

    // Case and whitespace are significant: 'garuda indonesia' is a different vendor from
    // 'GARUDA INDONESIA' as far as the comparison join is concerned, so it must not be accepted
    // by accident.
    it('matches vendor names exactly, without folding case or trimming', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])

      await expect(
        service.create({ name: 'Maskapai', vendors: ['garuda indonesia'] }),
      ).rejects.toThrow('Unknown vendor: garuda indonesia')
    })

    it('rejects a duplicate name with a conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce({ id: 'existing', name: 'Maskapai' })

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('A vendor group named "Maskapai" already exists')
    })

    it('saves the group, de-dupes the vendors, and returns the created group', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: 'pulau', vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      const result = await service.create({
        name: 'Maskapai',
        description: 'pulau',
        vendors: ['GARUDA INDONESIA', 'GARUDA INDONESIA'],
      })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Maskapai', description: 'pulau' }),
      )
      expect(txVendorRepo.delete).toHaveBeenCalledWith({ vendorGroupId: 'new-id' })
      expect(txVendorRepo.insert).toHaveBeenCalledWith([
        { vendorGroupId: 'new-id', vendor: 'GARUDA INDONESIA' },
      ])
      // The writes must go through the transactional manager, not the injected repos — that is the
      // whole point of wrapping them together.
      expect(groupRepo.save).not.toHaveBeenCalled()
      expect(groupRepo.update).not.toHaveBeenCalled()
      expect(result).toEqual({
        id: 'new-id',
        name: 'Maskapai',
        description: 'pulau',
        vendors: ['GARUDA INDONESIA'],
      })
    })

    it('normalizes a whitespace-only description to null', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'GARUDA INDONESIA', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'new-id', name: 'Maskapai', description: null, vendor: 'GARUDA INDONESIA' },
        ])
      groupRepo.findOne.mockResolvedValueOnce(null)

      await service.create({
        name: 'Maskapai',
        description: '   ',
        vendors: ['GARUDA INDONESIA'],
      })

      expect(txGroupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
    })

    it('maps a unique-name race (23505 on uq_vendor_groups_name) to the same ConflictException as the pre-check', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txGroupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_vendor_groups_name',
        }),
      )

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('A vendor group named "Maskapai" already exists')
    })

    it('does not remap a 23505 from an unrelated constraint into a name conflict', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txGroupRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('some other violation'), {
          code: '23505',
          constraint: 'pk_vendor_group_vendors',
        }),
      )

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('some other violation')
    })

    it('propagates an error from the transactional vendor insert rather than swallowing it', async () => {
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'GARUDA INDONESIA', has_data: true, in_master: true },
      ])
      groupRepo.findOne.mockResolvedValueOnce(null)
      txVendorRepo.insert.mockRejectedValueOnce(new Error('insert failed'))

      await expect(
        service.create({ name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }),
      ).rejects.toThrow('insert failed')

      expect(dataSource.transaction).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: FAIL — `service.findAll is not a function` and `service.create is not a function`.

- [ ] **Step 3: Add the imports and constants**

In `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`, replace the import block and add the two constants above the `@Injectable()` line:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'
import { VendorGroupVendorEntity } from './entities/vendor-group-vendor.entity'
import { CreateVendorGroupDto } from './dto/create-vendor-group.dto'
import { UpdateVendorGroupDto } from './dto/update-vendor-group.dto'
```

and, immediately before `@Injectable()`:

```ts
const UNIQUE_VIOLATION = '23505'
const NAME_UNIQUE_CONSTRAINT = 'uq_vendor_groups_name'
```

`UpdateVendorGroupDto` is imported now and used in Task 7; TypeScript does not complain about an unused import under this repo's config, and importing both at once keeps the import block from being edited twice.

- [ ] **Step 4: Add findAll**

Add to the class, after `getAvailableVendors`:

```ts
  // One flat query rather than a TypeORM relation load: the row count is tiny and a join keeps
  // vendor ordering under this method's control.
  async findAll(): Promise<VendorGroup[]> {
    const rows = await this.dataSource.query(`
      SELECT g.id, g.name, g.description, v.vendor
      FROM vendor_groups g
      LEFT JOIN vendor_group_vendors v ON v.vendor_group_id = g.id
      ORDER BY g.name, v.vendor
    `)

    const byId = new Map<string, VendorGroup>()
    for (const row of rows as Record<string, string | null>[]) {
      const id = row.id as string
      let group = byId.get(id)
      if (!group) {
        group = { id, name: row.name as string, description: row.description, vendors: [] }
        byId.set(id, group)
      }
      // The LEFT JOIN yields one all-null row for a group whose vendors were removed. Tested for
      // NULL rather than for truthiness so that a vendor name is never dropped for looking empty —
      // names are raw text and this method is not a filter.
      if (row.vendor !== null && row.vendor !== undefined) group.vendors.push(row.vendor)
    }
    return [...byId.values()]
  }
```

- [ ] **Step 5: Add create and its helpers**

Add to the class, after `findAll`:

```ts
  async create(dto: CreateVendorGroupDto): Promise<VendorGroup> {
    await this.assertVendorsExist(dto.vendors)
    await this.assertNameFree(dto.name)

    let groupId: string
    try {
      groupId = await this.dataSource.transaction(async (manager) => {
        const groupRepo = manager.getRepository(VendorGroupEntity)
        const group = await groupRepo.save(
          groupRepo.create({
            name: dto.name,
            description: this.normalizeDescription(dto.description),
          }),
        )
        await this.replaceVendors(manager, group.id, dto.vendors)
        return group.id
      })
    } catch (err: unknown) {
      this.throwIfNameUniqueViolation(err, dto.name)
      throw err
    }

    return this.findOneOrThrow(groupId)
  }

  private async findOneOrThrow(id: string): Promise<VendorGroup> {
    const group = (await this.findAll()).find((g) => g.id === id)
    if (!group) throw new NotFoundException('Vendor group not found')
    return group
  }

  private async assertNameFree(name: string): Promise<void> {
    const clash = await this.groupRepo.findOne({ where: { name } })
    if (clash) throw new ConflictException(`A vendor group named "${name}" already exists`)
  }

  // Rejects a vendor that neither the rate card nor any TO has ever mentioned: it could only ever
  // render as a column of em-dashes. The comparison is exact — case-sensitive, whitespace-sensitive
  // — because the stored string has to equal v_pnl_to.vendor for the comparison query to find it.
  // Accepting a near-match here would store a name that silently aggregates to nothing.
  private async assertVendorsExist(vendors: string[]): Promise<void> {
    const available = await this.getAvailableVendors()
    const known = new Set(available.map((v) => v.vendor))
    for (const vendor of vendors) {
      if (!known.has(vendor)) {
        throw new ConflictException(`Unknown vendor: ${vendor}`)
      }
    }
  }

  // Deletes and re-inserts inside the caller's transaction so the group write and its membership
  // rows commit or roll back together. De-duplicated first: the composite primary key means sending
  // the same name twice would throw partway through the insert, after the delete had already
  // happened, leaving the group with no vendors at all. That de-dupe is about the key, not about
  // ordering: findAll re-reads with ORDER BY g.name, v.vendor, so what the API returns is
  // alphabetical regardless of the order the admin ticked boxes in.
  private async replaceVendors(
    manager: EntityManager,
    groupId: string,
    vendors: string[],
  ): Promise<void> {
    const vendorRepo = manager.getRepository(VendorGroupVendorEntity)
    const unique = [...new Set(vendors)]

    await vendorRepo.delete({ vendorGroupId: groupId })
    await vendorRepo.insert(unique.map((vendor) => ({ vendorGroupId: groupId, vendor })))
  }

  // '' and whitespace-only are folded into null so the column has one empty state instead of two.
  // This applies to the group's own description only — never to a vendor name.
  private normalizeDescription(description?: string | null): string | null {
    if (description == null) return null
    const trimmed = description.trim()
    return trimmed === '' ? null : trimmed
  }

  // assertNameFree is a check-then-act and so still races two concurrent creates. This catches the
  // loser's constraint violation and reshapes it into the same ConflictException the pre-check
  // produces, so both paths look identical to the caller instead of surfacing a raw 500.
  private throwIfNameUniqueViolation(err: unknown, name: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NAME_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`A vendor group named "${name}" already exists`)
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: PASS, 16 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/vendor-groups
git commit -m "feat(pnl): read and create vendor groups, matching member names exactly as stored"
```

---

### Task 7: Service updates and deletes groups

**Files:**
- Modify: `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`
- Test: `apps/backend/src/modules/vendor-groups/vendor-groups.service.spec.ts`

**Interfaces:**
- Consumes: `UpdateVendorGroupDto` from Task 5; the helpers from Task 6.
- Produces:
  - `VendorGroupsService.update(id: string, dto: UpdateVendorGroupDto): Promise<VendorGroup>`
  - `VendorGroupsService.remove(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('VendorGroupsService', ...)` block, after the `create` block:

```ts
  describe('update', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Vendor group not found',
      )
    })

    it('replaces the vendors without touching name/description when only vendors are given', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query
        .mockResolvedValueOnce([{ vendor: 'ASIA CARGO', has_data: true, in_master: true }])
        .mockResolvedValueOnce([
          { id: 'vg1', name: 'Maskapai', description: 'pulau', vendor: 'ASIA CARGO' },
        ])

      const result = await service.update('vg1', { vendors: ['ASIA CARGO'] })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.update).not.toHaveBeenCalled()
      expect(txVendorRepo.delete).toHaveBeenCalledWith({ vendorGroupId: 'vg1' })
      expect(txVendorRepo.insert).toHaveBeenCalledWith([
        { vendorGroupId: 'vg1', vendor: 'ASIA CARGO' },
      ])
      expect(groupRepo.update).not.toHaveBeenCalled()
      expect(result.name).toBe('Maskapai')
      expect(result.description).toBe('pulau')
    })

    it('rejects an unknown vendor before writing anything', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'vg1', name: 'Maskapai', description: null })
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
      ])

      await expect(service.update('vg1', { vendors: ['NOBODY AIR'] })).rejects.toThrow(
        'Unknown vendor: NOBODY AIR',
      )
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('normalizes description to null when explicitly cleared', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: null, vendor: null },
      ])

      await service.update('vg1', { description: null })

      expect(dataSource.transaction).toHaveBeenCalled()
      expect(txGroupRepo.update).toHaveBeenCalledWith('vg1', { description: null })
      expect(groupRepo.update).not.toHaveBeenCalled()
    })

    it('maps a unique-name race (23505 on uq_vendor_groups_name) to the same ConflictException as the pre-check', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce({ id: 'vg1', name: 'Lama' })
        .mockResolvedValueOnce(null)
      txGroupRepo.update.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_vendor_groups_name',
        }),
      )

      await expect(service.update('vg1', { name: 'Baru' })).rejects.toThrow(
        'A vendor group named "Baru" already exists',
      )
    })

    it('propagates an error from the transactional vendor insert rather than swallowing it', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { vendor: 'ASIA CARGO', has_data: true, in_master: true },
      ])
      txVendorRepo.insert.mockRejectedValueOnce(new Error('insert failed'))

      await expect(service.update('vg1', { vendors: ['ASIA CARGO'] })).rejects.toThrow(
        'insert failed',
      )

      expect(dataSource.transaction).toHaveBeenCalled()
    })

    // An empty patch with no vendors has nothing to write, so it must not open a transaction just
    // to read the row back.
    it('skips the transaction entirely when the patch is empty and no vendors are given', async () => {
      groupRepo.findOne.mockResolvedValueOnce({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
      })
      dataSource.query.mockResolvedValueOnce([
        { id: 'vg1', name: 'Maskapai', description: 'pulau', vendor: null },
      ])

      const result = await service.update('vg1', {})

      expect(dataSource.transaction).not.toHaveBeenCalled()
      expect(result).toEqual({
        id: 'vg1',
        name: 'Maskapai',
        description: 'pulau',
        vendors: [],
      })
    })
  })

  describe('remove', () => {
    it('throws when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.remove('missing')).rejects.toThrow('Vendor group not found')
    })

    it('deletes the group by id', async () => {
      groupRepo.findOne.mockResolvedValueOnce({ id: 'vg1', name: 'Maskapai' })

      await service.remove('vg1')

      expect(groupRepo.delete).toHaveBeenCalledWith('vg1')
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: FAIL — `service.update is not a function` and `service.remove is not a function`.

- [ ] **Step 3: Add update**

In `apps/backend/src/modules/vendor-groups/vendor-groups.service.ts`, add to the class immediately after `create`:

```ts
  async update(id: string, dto: UpdateVendorGroupDto): Promise<VendorGroup> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vendor group not found')

    if (dto.vendors) await this.assertVendorsExist(dto.vendors)
    if (dto.name && dto.name !== existing.name) await this.assertNameFree(dto.name)

    const patch: Partial<Pick<VendorGroupEntity, 'name' | 'description'>> = {}
    if (dto.name) patch.name = dto.name
    if (dto.description !== undefined) {
      patch.description = this.normalizeDescription(dto.description)
    }

    // Nothing to write: skip the transaction rather than opening an empty BEGIN/COMMIT before the
    // read-back below.
    if (Object.keys(patch).length > 0 || dto.vendors) {
      try {
        await this.dataSource.transaction(async (manager) => {
          if (Object.keys(patch).length > 0) {
            await manager.getRepository(VendorGroupEntity).update(id, patch)
          }
          if (dto.vendors) await this.replaceVendors(manager, id, dto.vendors)
        })
      } catch (err: unknown) {
        this.throwIfNameUniqueViolation(err, dto.name ?? existing.name)
        throw err
      }
    }

    return this.findOneOrThrow(id)
  }
```

- [ ] **Step 4: Add remove**

Add immediately after `update`:

```ts
  async remove(id: string): Promise<void> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vendor group not found')
    // vendor_group_vendors rows go with it via ON DELETE CASCADE.
    await this.groupRepo.delete(id)
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.service.spec --runInBand
```

Expected: PASS, 25 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/vendor-groups
git commit -m "feat(pnl): update and delete vendor groups, validating members before any write lands"
```

---

### Task 8: Expose the module over HTTP

**Files:**
- Create: `apps/backend/src/modules/vendor-groups/vendor-groups.controller.ts`
- Create: `apps/backend/src/modules/vendor-groups/vendor-groups.module.ts`
- Modify: `apps/backend/src/app.module.ts:30` (import) and `:100` (registration)
- Test: `apps/backend/src/modules/vendor-groups/vendor-groups.controller.spec.ts`

**Interfaces:**
- Consumes: `VendorGroupsService` from Tasks 4/6/7; `Permission.*_VENDOR_GROUP` from Task 3.
- Produces:
  - `GET /api/vendor-groups` → `VendorGroup[]`, requires `read.vendor_group`
  - `GET /api/vendor-groups/available-vendors` → `AvailableVendor[]`, requires `read.vendor_group`
  - `POST /api/vendor-groups` → `VendorGroup`, requires `create.vendor_group`
  - `PATCH /api/vendor-groups/:id` → `VendorGroup`, requires `update.vendor_group`
  - `DELETE /api/vendor-groups/:id` → 204, requires `delete.vendor_group`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/vendor-groups/vendor-groups.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { VendorGroupsController } from './vendor-groups.controller'
import { VendorGroupsService } from './vendor-groups.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

describe('VendorGroupsController', () => {
  let controller: VendorGroupsController
  let service: {
    findAll: jest.Mock
    getAvailableVendors: jest.Mock
    create: jest.Mock
    update: jest.Mock
    remove: jest.Mock
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      getAvailableVendors: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'vg1' }),
      update: jest.fn().mockResolvedValue({ id: 'vg1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    const module = await Test.createTestingModule({
      controllers: [VendorGroupsController],
      providers: [{ provide: VendorGroupsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = module.get(VendorGroupsController)
  })

  it('lists groups', async () => {
    await controller.findAll()
    expect(service.findAll).toHaveBeenCalled()
  })

  it('lists available vendors', async () => {
    await controller.getAvailableVendors()
    expect(service.getAvailableVendors).toHaveBeenCalled()
  })

  it('passes the create payload straight through', async () => {
    const dto = { name: 'Maskapai', vendors: ['GARUDA INDONESIA'] }
    await controller.create(dto)
    expect(service.create).toHaveBeenCalledWith(dto)
  })

  it('passes the id and payload to update', async () => {
    await controller.update('vg1', { name: 'Baru' })
    expect(service.update).toHaveBeenCalledWith('vg1', { name: 'Baru' })
  })

  it('passes the id to remove', async () => {
    await controller.remove('vg1')
    expect(service.remove).toHaveBeenCalledWith('vg1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups.controller.spec --runInBand
```

Expected: FAIL — `Cannot find module './vendor-groups.controller'`.

- [ ] **Step 3: Write the controller**

Create `apps/backend/src/modules/vendor-groups/vendor-groups.controller.ts`:

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
import { VendorGroupsService } from './vendor-groups.service'
import { CreateVendorGroupDto } from './dto/create-vendor-group.dto'
import { UpdateVendorGroupDto } from './dto/update-vendor-group.dto'

@ApiTags('Vendor Groups')
@Controller('vendor-groups')
@UseGuards(JwtAuthGuard)
export class VendorGroupsController {
  constructor(private readonly service: VendorGroupsService) {}

  @Get()
  @Authorize(Permission.READ_VENDOR_GROUP)
  findAll() {
    return this.service.findAll()
  }

  // Declared before ':id' would be, and is a distinct literal path, so no route shadowing.
  @Get('available-vendors')
  @Authorize(Permission.READ_VENDOR_GROUP)
  getAvailableVendors() {
    return this.service.getAvailableVendors()
  }

  @Post()
  @Authorize(Permission.CREATE_VENDOR_GROUP)
  create(@Body() dto: CreateVendorGroupDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_VENDOR_GROUP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorGroupDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_VENDOR_GROUP)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

- [ ] **Step 4: Write the module**

Create `apps/backend/src/modules/vendor-groups/vendor-groups.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'
import { VendorGroupVendorEntity } from './entities/vendor-group-vendor.entity'
import { VendorGroupsService } from './vendor-groups.service'
import { VendorGroupsController } from './vendor-groups.controller'

@Module({
  imports: [TypeOrmModule.forFeature([VendorGroupEntity, VendorGroupVendorEntity])],
  providers: [VendorGroupsService],
  controllers: [VendorGroupsController],
  // Exported so the PnL module can resolve group memberships when the Vendor Comparison tab lands.
  exports: [VendorGroupsService],
})
export class VendorGroupsModule {}
```

- [ ] **Step 5: Register the module**

In `apps/backend/src/app.module.ts`, add after line 30 (`import { RouteGroupsModule } ...`):

```ts
import { VendorGroupsModule } from './modules/vendor-groups/vendor-groups.module'
```

and after line 100 (`RouteGroupsModule,`), inside the `imports` array:

```ts
    VendorGroupsModule,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest vendor-groups --runInBand
```

Expected: PASS — 25 service tests, 7 DTO tests, 5 controller tests.

- [ ] **Step 7: Verify the routes are actually mounted**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm run start:dev
```

Expected: the Nest bootstrap log lists `Mapped {/api/vendor-groups, GET}`, `{/api/vendor-groups/available-vendors, GET}`, `{/api/vendor-groups, POST}`, `{/api/vendor-groups/:id, PATCH}` and `{/api/vendor-groups/:id, DELETE}`. Stop the server afterwards. If `available-vendors` is missing, it is being shadowed — check it is declared before any `:id` route.

- [ ] **Step 8: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/backend/src/modules/vendor-groups apps/backend/src/app.module.ts
git commit -m "feat(pnl): expose vendor groups over HTTP behind the four vendor_group permissions"
```

---

### Task 9: Frontend types and hooks

**Files:**
- Create: `apps/frontend/src/features/vendor-groups/types.ts`
- Create: `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.ts`
- Test: `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.spec.ts`

**Interfaces:**
- Consumes: the endpoints from Task 8.
- Produces:
  - `AvailableVendor { vendor: string; hasData: boolean; inMaster: boolean }`
  - `VendorGroup { id: string; name: string; description: string | null; vendors: string[] }`
  - `VendorGroupPayload { name: string; description?: string | null; vendors: string[] }`
  - `useVendorGroups(options?: { enabled?: boolean })`, `useAvailableVendors()`, `useCreateVendorGroup()`, `useUpdateVendorGroup()`, `useDeleteVendorGroup()`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.spec.ts`:

```ts
/**
 * Pins the query keys and the rolling-deploy defaults. useQuery is mocked so the assertions read
 * the exact config TanStack Query would see, without needing a live QueryClient — the same
 * technique usePnl.spec.ts uses.
 */
import { useQuery } from '@tanstack/react-query'
import { useAvailableVendors, useVendorGroups } from './useVendorGroups'

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}))
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(() => Promise.resolve({ data: [] })) },
}))

beforeEach(() => jest.clearAllMocks())

describe('useVendorGroups', () => {
  it('keys the group list under vendor-groups and respects the enabled flag', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups({ enabled: false })

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.queryKey).toEqual(['vendor-groups'])
    expect(config.enabled).toBe(false)
  })

  // Frontend and backend deploy in parallel, so a group served without its vendors array must
  // still render as a group with no vendors rather than crashing the table's .join().
  it('defaults a missing vendors array to an empty one', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.select([{ id: 'vg1', name: 'Maskapai', description: null }])).toEqual([
      { id: 'vg1', name: 'Maskapai', description: null, vendors: [] },
    ])
  })
})

describe('useAvailableVendors', () => {
  it('keys the vendor list beneath the group list so a write invalidates both', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.queryKey).toEqual(['vendor-groups', 'available-vendors'])
  })

  it('defaults both flags to true when a backend that predates them answers', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    // Silence rather than a warning on every row: a backend that cannot tell us has not told us
    // that anything is wrong.
    expect(config.select([{ vendor: 'GARUDA INDONESIA' }])).toEqual([
      { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: true },
    ])
  })

  it('passes both flags through untouched when the backend does send them', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(
      config.select([{ vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false }]),
    ).toEqual([{ vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest useVendorGroups
```

Expected: FAIL — `Cannot find module './useVendorGroups'`.

- [ ] **Step 3: Write the types**

Create `apps/frontend/src/features/vendor-groups/types.ts`:

```ts
export interface AvailableVendor {
  vendor: string // raw name, byte-identical to what v_pnl_to.vendor holds — never trimmed or cased
  hasData: boolean // false = no TO has ever carried this vendor, so it renders as an empty column
  inMaster: boolean // false = booked but absent from the SMU rate card entirely
}

export interface VendorGroup {
  id: string
  name: string
  description: string | null
  vendors: string[]
}

// The write shape. Vendors go back exactly as they came out of the picker.
export interface VendorGroupPayload {
  name: string
  // description: null clears it; omitting the field leaves it unchanged on update.
  description?: string | null
  vendors: string[]
}
```

- [ ] **Step 4: Write the hooks**

Create `apps/frontend/src/features/vendor-groups/hooks/useVendorGroups.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { AvailableVendor, VendorGroup, VendorGroupPayload } from '../types'

// The wire shapes are deliberately looser than the domain types above. Frontend and backend deploy
// in parallel, so a response from a backend that predates a field must still parse; every such
// field is optional here and defaulted in `select`, which is the one place that reads it.
interface VendorGroupWire {
  id: string
  name: string
  description: string | null
  vendors?: string[]
}

interface AvailableVendorWire {
  vendor: string
  hasData?: boolean
  inMaster?: boolean
}

export function useVendorGroups(options?: { enabled?: boolean }) {
  return useQuery<VendorGroupWire[], Error, VendorGroup[]>({
    queryKey: ['vendor-groups'],
    queryFn: () => apiClient.get('/vendor-groups').then((r) => r.data),
    select: (rows) => rows.map((row) => ({ ...row, vendors: row.vendors ?? [] })),
    staleTime: 60 * 1000,
    enabled: options?.enabled,
  })
}

// Keyed beneath ['vendor-groups'] on purpose: the mutations below invalidate that prefix, so a new
// group also refreshes the vendor list. The list itself barely moves between sheet syncs, so it is
// cached far longer than the groups.
export function useAvailableVendors() {
  return useQuery<AvailableVendorWire[], Error, AvailableVendor[]>({
    queryKey: ['vendor-groups', 'available-vendors'],
    queryFn: () => apiClient.get('/vendor-groups/available-vendors').then((r) => r.data),
    // Both flags default to true. A backend that cannot answer has not said anything is wrong, and
    // dotting every vendor with a warning we cannot substantiate would train the admin to ignore it.
    select: (rows) =>
      rows.map((row) => ({
        vendor: row.vendor,
        hasData: row.hasData ?? true,
        inMaster: row.inMaster ?? true,
      })),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorGroupPayload) =>
      apiClient.post<VendorGroup>('/vendor-groups', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}

export function useUpdateVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VendorGroupPayload }) =>
      apiClient.patch<VendorGroup>(`/vendor-groups/${id}`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}

export function useDeleteVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/vendor-groups/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest useVendorGroups
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/vendor-groups
git commit -m "feat(pnl): add vendor group queries that survive a backend still missing the new flags"
```

---

### Task 10: VendorPicker

Written from scratch, not copied. `RoutePicker` groups its ~31 pairs under an origin heading and shows only the destination inside each section — a shape that exists because routes have an origin axis. Vendor names are free text from a spreadsheet with no such axis and no bounded count, so the workable shape is one flat list, ordered by the endpoint, with a search box.

**Files:**
- Create: `apps/frontend/src/features/vendor-groups/components/VendorPicker.tsx`
- Test: `apps/frontend/src/features/vendor-groups/components/VendorPicker.spec.tsx`

**Interfaces:**
- Consumes: `AvailableVendor` from Task 9.
- Produces: `VendorPicker({ vendors, value, onChange }: { vendors: AvailableVendor[]; value: string[]; onChange: (next: string[]) => void })`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/vendor-groups/components/VendorPicker.spec.tsx`:

```tsx
/**
 * Unit tests for VendorPicker. The vendor list is passed in rather than fetched, so these isolate
 * the picker from the data layer. The load-bearing assertion is the last one: search filters on a
 * lowercased copy but every value handed back to onChange is the raw name, because that string
 * ends up in the database and is compared byte-for-byte against v_pnl_to.vendor.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VendorPicker } from './VendorPicker'
import { AvailableVendor } from '../types'

const vendors: AvailableVendor[] = [
  { vendor: 'ASIA CARGO', hasData: true, inMaster: true },
  { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false },
  { vendor: 'Sriwijaya Air', hasData: false, inMaster: true },
]

it('renders one flat list in the order given, with no grouping headers', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'))).toEqual([
    'ASIA CARGO',
    'GARUDA INDONESIA',
    'Sriwijaya Air',
  ])
})

it('checks the vendors already in value', () => {
  render(<VendorPicker vendors={vendors} value={['GARUDA INDONESIA']} onChange={jest.fn()} />)

  expect(screen.getByLabelText('ASIA CARGO')).not.toBeChecked()
  expect(screen.getByLabelText('GARUDA INDONESIA')).toBeChecked()
})

it('adds a vendor on tick', () => {
  const onChange = jest.fn()
  render(<VendorPicker vendors={vendors} value={[]} onChange={onChange} />)

  fireEvent.click(screen.getByLabelText('Sriwijaya Air'))

  expect(onChange).toHaveBeenCalledWith(['Sriwijaya Air'])
})

it('removes a vendor on untick', () => {
  const onChange = jest.fn()
  render(
    <VendorPicker
      vendors={vendors}
      value={['ASIA CARGO', 'GARUDA INDONESIA']}
      onChange={onChange}
    />,
  )

  fireEvent.click(screen.getByLabelText('ASIA CARGO'))

  expect(onChange).toHaveBeenCalledWith(['GARUDA INDONESIA'])
})

// Selecting one of these is legitimate, but it renders as an all-em-dash column, so the picker
// says so rather than letting the admin find out in the comparison table.
it('marks a vendor no TO has ever used', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getByTitle('Belum ada TO yang memakai vendor ini')).toBeInTheDocument()
})

// A separate signal from the amber dot, and the opposite problem: there IS data, but the rate card
// has no row for this vendor at all.
it('labels a vendor that has data but no rate card', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getByText('ada data, tidak ada rate card')).toBeInTheDocument()
})

it('filters case-insensitively but hands back the raw name', () => {
  const onChange = jest.fn()
  render(<VendorPicker vendors={vendors} value={[]} onChange={onChange} />)

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'sriwijaya' } })

  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Sriwijaya Air'))
  expect(onChange).toHaveBeenCalledWith(['Sriwijaya Air'])
})

it('counts the whole selection, including rows the current search hides', () => {
  render(
    <VendorPicker
      vendors={vendors}
      value={['ASIA CARGO', 'Sriwijaya Air']}
      onChange={jest.fn()}
    />,
  )

  expect(screen.getByText('2 selected')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'garuda' } })

  expect(screen.getByText('2 selected')).toBeInTheDocument()
})

it('explains an empty search result differently from an empty vendor list', () => {
  const { rerender } = render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'zzz' } })
  expect(screen.getByText('No vendor matches that search.')).toBeInTheDocument()

  rerender(<VendorPicker vendors={[]} value={[]} onChange={jest.fn()} />)
  expect(screen.getByText('No vendors available.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest VendorPicker
```

Expected: FAIL — `Cannot find module './VendorPicker'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/vendor-groups/components/VendorPicker.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AvailableVendor } from '../types'

interface VendorPickerProps {
  vendors: AvailableVendor[]
  value: string[]
  onChange: (next: string[]) => void
}

// Deliberately not a copy of RoutePicker. RoutePicker sections its list under an origin label and
// shows only the destination inside each section; that works because routes have an origin axis and
// there are about 31 of them. Vendor names are free text from a Google Sheet with no such axis, so
// the shape here is one flat list plus a search box.
//
// Order comes from the endpoint's `ORDER BY v.vendor`. The picker does not re-sort: a client-side
// sort would use a different collation from Postgres and the two lists would drift apart for no
// benefit.
export function VendorPicker({ vendors, value, onChange }: VendorPickerProps) {
  const [search, setSearch] = useState('')
  const selected = new Set(value)

  const query = search.trim().toLowerCase()
  // Lowercasing happens on a throwaway copy, for matching only. Everything handed to onChange is
  // the raw `v.vendor` string — that value is stored and later compared byte-for-byte against
  // v_pnl_to.vendor, so normalising it anywhere on this path is a silent data bug.
  const filtered = query ? vendors.filter((v) => v.vendor.toLowerCase().includes(query)) : vendors

  const toggle = (vendor: string) =>
    onChange(selected.has(vendor) ? value.filter((v) => v !== vendor) : [...value, vendor])

  return (
    <div className="space-y-2">
      <input
        type="search"
        aria-label="Search vendors"
        placeholder="Cari vendor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {/* Counts `value`, not `filtered`, so narrowing the search never looks like it dropped picks. */}
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-3">
        {filtered.map((v) => (
          <label key={v.vendor} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={v.vendor}
              checked={selected.has(v.vendor)}
              onChange={() => toggle(v.vendor)}
            />
            <span className="truncate">{v.vendor}</span>
            {!v.hasData && (
              <span
                title="Belum ada TO yang memakai vendor ini"
                className="shrink-0 text-xs text-amber-600"
              >
                •
              </span>
            )}
            {!v.inMaster && (
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                ada data, tidak ada rate card
              </span>
            )}
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {vendors.length === 0 ? 'No vendors available.' : 'No vendor matches that search.'}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest VendorPicker
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/vendor-groups/components/VendorPicker.tsx apps/frontend/src/features/vendor-groups/components/VendorPicker.spec.tsx
git commit -m "feat(pnl): add a searchable flat vendor picker that never rewrites the names it returns"
```

---

### Task 11: VendorGroupForm

**Files:**
- Create: `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.tsx`
- Test: `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.spec.tsx`

**Interfaces:**
- Consumes: `VendorPicker` from Task 10; `AvailableVendor`, `VendorGroup`, `VendorGroupPayload` from Task 9.
- Produces: `VendorGroupForm({ initial?, vendors, onSubmit, onCancel })` where `onSubmit: (payload: VendorGroupPayload) => Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.spec.tsx`:

```tsx
/**
 * Unit tests for VendorGroupForm. These pin the three rules the form owns: the client-side mirror
 * of the DTO's ArrayMinSize(1), sending `description: null` (not undefined) when the field is
 * cleared — undefined tells the backend to leave the existing value alone, so a description could
 * never be removed — and that vendor names go out exactly as they came in.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VendorGroupForm } from './VendorGroupForm'
import { AvailableVendor, VendorGroup } from '../types'

const vendors: AvailableVendor[] = [
  { vendor: '  ASIA CARGO ', hasData: true, inMaster: true },
  { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: true },
]

it('rejects submission when no vendor is selected', async () => {
  const onSubmit = jest.fn()
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Maskapai' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Pick at least one vendor')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('rejects submission when the name is blank', async () => {
  const onSubmit = jest.fn()
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.click(screen.getByLabelText('GARUDA INDONESIA'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Name is required')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('sends description: null rather than undefined when the description is cleared', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const initial: VendorGroup = {
    id: 'vg-1',
    name: 'Maskapai',
    description: 'deskripsi lama',
    vendors: ['GARUDA INDONESIA'],
  }
  render(
    <VendorGroupForm
      initial={initial}
      vendors={vendors}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
    />,
  )

  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

  const payload = onSubmit.mock.calls[0][0]
  expect(payload.description).toBeNull()
  expect('description' in payload).toBe(true)
})

// The group's own name is trimmed — it is ours. The vendor names are not: they are the join key.
it('trims the group name but sends the vendor names byte-for-byte', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '  Maskapai  ' } })
  // The identity normalizer is required: getByLabelText normalises the aria-label it reads (trim +
  // whitespace collapse) but never the matcher, so the untrimmed string could not otherwise match.
  fireEvent.click(screen.getByLabelText('  ASIA CARGO ', { normalizer: (v: string) => v }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'Maskapai',
    description: null,
    vendors: ['  ASIA CARGO '],
  })
})

it('surfaces the backend message when the submit rejects', async () => {
  const onSubmit = jest.fn().mockRejectedValue({
    response: { data: { message: 'A vendor group named "Maskapai" already exists' } },
  })
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Maskapai' } })
  fireEvent.click(screen.getByLabelText('GARUDA INDONESIA'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(
    await screen.findByText('A vendor group named "Maskapai" already exists'),
  ).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest VendorGroupForm
```

Expected: FAIL — `Cannot find module './VendorGroupForm'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/vendor-groups/components/VendorGroupForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { AvailableVendor, VendorGroup, VendorGroupPayload } from '../types'
import { VendorPicker } from './VendorPicker'

interface VendorGroupFormProps {
  initial?: VendorGroup
  vendors: AvailableVendor[]
  onSubmit: (payload: VendorGroupPayload) => Promise<void>
  onCancel: () => void
}

export function VendorGroupForm({ initial, vendors, onSubmit, onCancel }: VendorGroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<string[]>(initial?.vendors ?? [])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    // Mirrors ArrayMinSize(1) on the DTO: a group with no vendors is a permanently empty column.
    if (selected.length === 0) {
      setError('Pick at least one vendor')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // The group name is trimmed because it is ours and only ever displayed. The vendor names are
      // sent exactly as the picker produced them — they are the key the comparison query joins on,
      // and trimming one side of that join is a silent miss.
      //
      // description must be null rather than undefined when cleared: the backend reads an omitted
      // field as "leave unchanged", so undefined would make an existing description unremovable.
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        vendors: selected,
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
      <FormField label="Name" htmlFor="vg-name" required>
        <Input id="vg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Description" htmlFor="vg-description">
        <Input
          id="vg-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <FormField
        label="Vendors"
        htmlFor="vg-vendors"
        required
        hint="Titik amber = belum ada TO yang memakai vendor ini."
      >
        <div id="vg-vendors">
          <VendorPicker vendors={vendors} value={selected} onChange={setSelected} />
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

Note the `Input` for the name carries no `required` attribute, unlike `RouteGroupForm`. The blank-name test submits the form with an empty name and asserts the form's own message; a native `required` would have the browser block submission first and the message would never render.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest VendorGroupForm
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/vendor-groups/components/VendorGroupForm.tsx apps/frontend/src/features/vendor-groups/components/VendorGroupForm.spec.tsx
git commit -m "feat(pnl): add the vendor group form, trimming its own name but never the members"
```

---

### Task 12: DeleteVendorGroupDialog

**Files:**
- Create: `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.tsx`
- Test: `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.spec.tsx`

**Interfaces:**
- Consumes: `VendorGroup` from Task 9.
- Produces: `DeleteVendorGroupDialog({ group, onConfirm, onClose })` where `onConfirm: () => Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.spec.tsx`:

```tsx
/**
 * Unit tests for DeleteVendorGroupDialog. These pin that a rejecting onConfirm surfaces the
 * backend's message inside the dialog rather than failing silently: without a catch, the rejection
 * goes unhandled and the user is left staring at a dialog that just re-enabled its button with no
 * explanation.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DeleteVendorGroupDialog } from './DeleteVendorGroupDialog'
import { VendorGroup } from '../types'

const group: VendorGroup = {
  id: 'vg-1',
  name: 'Maskapai',
  description: null,
  vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
}

it('names the group and says how many vendors it holds', () => {
  render(<DeleteVendorGroupDialog group={group} onConfirm={jest.fn()} onClose={jest.fn()} />)

  expect(screen.getByText('Delete “Maskapai”?')).toBeInTheDocument()
  expect(screen.getByText(/2 vendor/)).toBeInTheDocument()
})

it('shows the backend error message and keeps the dialog open when the delete fails', async () => {
  const onConfirm = jest.fn().mockRejectedValue({
    response: { data: { message: 'Vendor group not found' } },
  })
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('Vendor group not found')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
})

it('falls back to a generic message when the error has no response payload', async () => {
  const onConfirm = jest.fn().mockRejectedValue(new Error('network down'))
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('An error occurred')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

it('closes the dialog when the delete succeeds', async () => {
  const onConfirm = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest DeleteVendorGroupDialog
```

Expected: FAIL — `Cannot find module './DeleteVendorGroupDialog'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VendorGroup } from '../types'

interface DeleteVendorGroupDialogProps {
  group: VendorGroup
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function DeleteVendorGroupDialog({
  group,
  onConfirm,
  onClose,
}: DeleteVendorGroupDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{group.name}”?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {group.vendors.length} vendor di group ini tidak ikut terhapus — yang hilang hanya
          pengelompokannya. Perbandingan PnL yang sedang menampilkan group ini akan kehilangan
          kolomnya.
        </p>
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest DeleteVendorGroupDialog
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.tsx apps/frontend/src/features/vendor-groups/components/DeleteVendorGroupDialog.spec.tsx
git commit -m "feat(pnl): confirm vendor group deletion and surface the reason when it fails"
```

---

### Task 13: The /vendor-groups page

Route Group has three component specs and no page spec (`apps/frontend/src/app/(dashboard)/route-groups/` contains only `page.tsx`). This page matches that: its logic is permission gating and modal orchestration, both already covered by the shell it mirrors. The gate here is `tsc` plus the manual check in Step 3.

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/vendor-groups/page.tsx`
- Test: none — see above.

**Interfaces:**
- Consumes: every hook from Task 9, plus `VendorGroupForm` and `DeleteVendorGroupDialog`.
- Produces: the route `/vendor-groups`.

- [ ] **Step 1: Write the page**

Create `apps/frontend/src/app/(dashboard)/vendor-groups/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { VendorGroupForm } from '@/features/vendor-groups/components/VendorGroupForm'
import { DeleteVendorGroupDialog } from '@/features/vendor-groups/components/DeleteVendorGroupDialog'
import {
  useAvailableVendors,
  useCreateVendorGroup,
  useDeleteVendorGroup,
  useUpdateVendorGroup,
  useVendorGroups,
} from '@/features/vendor-groups/hooks/useVendorGroups'
import { VendorGroup, VendorGroupPayload } from '@/features/vendor-groups/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; group: VendorGroup }
  | { type: 'delete'; group: VendorGroup }
  | null

export default function VendorGroupsPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [modal, setModal] = useState<Modal>(null)

  const canRead = !loading && !!user && hasPermission('read.vendor_group')
  const { data: groups, isLoading } = useVendorGroups({ enabled: canRead })
  // Disabling Create/Edit while the vendor list is still loading, rather than threading a loading
  // state into VendorPicker, keeps the picker's controlled-component contract untouched: the modal
  // that would show "No vendors available." mid-fetch simply cannot open yet.
  const { data: vendors, isLoading: isVendorsLoading } = useAvailableVendors()
  const createGroup = useCreateVendorGroup()
  const updateGroup = useUpdateVendorGroup()
  const deleteGroup = useDeleteVendorGroup()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.vendor_group')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  const handleCreate = async (payload: VendorGroupPayload) => {
    await createGroup.mutateAsync(payload)
    setModal(null)
  }

  const handleEdit = async (group: VendorGroup, payload: VendorGroupPayload) => {
    await updateGroup.mutateAsync({ id: group.id, payload })
    setModal(null)
  }

  // The effect above handles the redirect, but without these early returns React can commit and
  // paint a tick before the effect fires, flashing the table at an unpermitted user. The backend
  // still enforces this on GET /vendor-groups, so this guard is about page chrome and a pointless
  // request, not data exposure.
  if (loading || !user) return null
  if (!hasPermission('read.vendor_group')) return null

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Vendor Group"
        action={
          hasPermission('create.vendor_group') ? (
            <Button onClick={() => setModal({ type: 'create' })} disabled={isVendorsLoading}>
              + New Group
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Vendors</th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((group, idx) => (
              <tr
                key={group.id}
                className={`border-t hover:bg-muted/30 ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}
              >
                <td className="px-4 py-3 font-medium">{group.name}</td>
                <td className="px-4 py-3">{group.description ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {group.vendors.join(', ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {hasPermission('update.vendor_group') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isVendorsLoading}
                        onClick={() => setModal({ type: 'edit', group })}
                      >
                        Edit
                      </Button>
                    )}
                    {hasPermission('delete.vendor_group') && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setModal({ type: 'delete', group })}
                      >
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
                  No vendor groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'create' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Vendor Group</DialogTitle></DialogHeader>
            <VendorGroupForm
              vendors={vendors ?? []}
              onSubmit={handleCreate}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog open onOpenChange={(open) => { if (!open) setModal(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Vendor Group</DialogTitle></DialogHeader>
            <VendorGroupForm
              initial={modal.group}
              vendors={vendors ?? []}
              onSubmit={(payload) => handleEdit(modal.group, payload)}
              onCancel={() => setModal(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {modal?.type === 'delete' && (
        <DeleteVendorGroupDialog
          group={modal.group}
          onConfirm={() => deleteGroup.mutateAsync(modal.group.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
```

`group.vendors.join(', ')` needs no `?? []` here — `useVendorGroups` already defaults it in `select`, which is the single place that reads the wire shape and the only place that fallback belongs.

- [ ] **Step 2: Typecheck**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Exercise the page in the browser**

Start both apps, log in as a super admin (which bypasses the permission gate — Task 15 is where a real account is used) and open `http://localhost:3000/vendor-groups`. Confirm, in order:

1. The table renders with "No vendor groups yet."
2. "+ New Group" opens the modal; the picker lists vendors, and typing in the search box narrows it.
3. Saving with no vendor ticked shows "Pick at least one vendor".
4. A group saves, appears in the table, and its Vendors cell shows the names comma-separated.
5. Edit pre-ticks exactly the vendors already in the group.
6. Delete asks for confirmation, names the group, and the row disappears.
7. Creating a second group with the same name shows the backend's conflict message inside the form rather than a blank dialog.

- [ ] **Step 4: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add "apps/frontend/src/app/(dashboard)/vendor-groups/page.tsx"
git commit -m "feat(pnl): add the Vendor Group page so groups can be managed before the tab exists"
```

---

### Task 14: Sidebar entry

**Files:**
- Modify: `apps/frontend/src/components/layout/sidebar.tsx:23` (icon import) and `:155` (new entry)
- Test: none — there is no sidebar spec in this repo, and adding the first one for a four-line conditional would set a precedent this plan is not the place to set.

**Interfaces:**
- Consumes: `read.vendor_group` from Task 3; the route from Task 13.
- Produces: a "Vendor Group" link in the Air Shipments group of the sidebar.

- [ ] **Step 1: Add the icon import**

In `apps/frontend/src/components/layout/sidebar.tsx`, in the `lucide-react` import block, add `Truck` after `Route` (line 23):

```ts
  Route,
  Truck,
```

- [ ] **Step 2: Add the nav entry**

Immediately after the closing `)}` of the `read.route_group` block (line 155) and before the `</div>` that closes the Air Shipments group, add:

```tsx
            {hasPermission('read.vendor_group') && (
              <NavLink
                href="/vendor-groups"
                icon={<Truck size={16} />}
                label="Vendor Group"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
```

It sits next to Route Group deliberately: the two are siblings, and a user looking for one will look for the other in the same place.

- [ ] **Step 3: Typecheck**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Check both sidebar states**

With the app running and logged in as a super admin, confirm:

1. Expanded sidebar: "Vendor Group" appears directly under "Route Group", with a truck icon.
2. Collapsed sidebar: only the icon shows, and hovering gives the "Vendor Group" tooltip — `NavLink` passes `title={collapsed ? label : undefined}`.
3. Clicking it navigates to `/vendor-groups` and the entry highlights as active.

- [ ] **Step 5: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/components/layout/sidebar.tsx
git commit -m "feat(pnl): put Vendor Group in the sidebar beside its Route Group sibling"
```

---

### Task 15: Register the permissions and verify them on a non-super-admin account

**This task cannot be skipped and cannot be done as a super admin.** Two independent things make the new permissions invisible until deliberately handled:

1. **They do not exist until the backend restarts.** `PermissionsService.seedPermissions` runs in `onApplicationBootstrap` and is insert-only (`apps/backend/src/modules/permissions/permissions.service.ts:19-33`). Until a restart, `read.vendor_group` is not a row in `permissions` and cannot be granted to anything.
2. **They are granted to no role.** Nothing in this plan writes a `role_permissions` row. Every existing role sees a hidden menu and a 403 until someone grants them.

And the reason a super admin cannot verify any of it: `RbacGuard` returns `true` on `user.isSuperAdmin` before it ever looks a permission up (`apps/backend/src/common/guards/rbac.guard.ts:38-41`), and `usePermissions().hasPermission` short-circuits on `isSuperAdmin` the same way (`apps/frontend/src/shared/hooks/use-permissions.ts:9-10`). A super admin therefore sees the menu and gets 200s from every endpoint whether the grant step happened or not. Verifying with one proves nothing at all.

**Files:** none.

- [ ] **Step 1: Restart the backend so the permissions seed**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm run start:dev
```

Leave it running for the rest of this task.

- [ ] **Step 2: Confirm the four rows exist**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -c "
SELECT name, action, resource FROM permissions WHERE name LIKE '%vendor_group' ORDER BY name;
"
```

Expected: exactly four rows — `create.vendor_group`, `delete.vendor_group`, `read.vendor_group`, `update.vendor_group`, each with `resource = 'vendor_group'`. If you get zero rows the backend did not actually restart; if you get a name with a hyphen or a plural, fix `packages/shared/src/auth/index.ts` and note that the wrong row now also exists and must be deleted by hand — the seeder never removes anything.

- [ ] **Step 3: Confirm no role has them yet**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -c "
SELECT r.name AS role, p.name AS permission
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
JOIN roles r ON r.id = rp.role_id
WHERE p.name LIKE '%vendor_group'
ORDER BY 1, 2;
"
```

Expected: zero rows. That is the correct starting state — this step exists so the grant in Step 4 is observably a change rather than a no-op.

- [ ] **Step 4: Grant them to a role through the UI**

Log in as a super admin, go to Settings → Roles, pick the role that already holds `read.route_group`, and tick the four permissions in the **Vendor_group** section. That section appears with no frontend work because the panel groups by `p.name.split('.')[1]` (`apps/frontend/src/features/roles/components/role-permissions-panel.tsx:57-62`). Save, then re-run the query from Step 3 and confirm four rows now come back.

- [ ] **Step 5: Verify as a non-super-admin who has the permissions**

Log out. Log in as a **plain user** holding the role you just granted — confirm the account with:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -At -c "
SELECT username, is_super_admin FROM users WHERE username = '<the account you are testing with>';
"
```

`is_super_admin` must be `f`. If it is `t`, stop and find another account — the rest of this step measures nothing on a super admin.

Then confirm:

1. "Vendor Group" is in the sidebar.
2. `/vendor-groups` loads and lists groups.
3. Create, edit and delete all succeed.

- [ ] **Step 6: Verify as a non-super-admin who does not have them**

Log in as a plain user on a role **without** the four permissions and confirm:

1. "Vendor Group" is absent from the sidebar.
2. Navigating directly to `/vendor-groups` redirects to `/dashboard`.
3. The API refuses independently of the UI:

```bash
curl -i -H "Authorization: Bearer <that user's access token>" http://localhost:4000/api/vendor-groups
```

Expected: `403 Forbidden` with `Missing permission: read.vendor_group`. A `200` here means `@Authorize` is missing from the handler; a `401` means the token is wrong, not that the gate works.

- [ ] **Step 7: Record what was granted**

Grants are database state, not code, so they do not travel with the branch. Note in the PR description which role received the four permissions on which environment, so whoever deploys knows they must repeat Steps 1 and 4 there. Without that note the feature ships invisible to every non-super-admin user, and the bug report will read "the menu is missing".

---

### Task 16: Full-suite verification

**Files:** none.

- [ ] **Step 1: Run both suites in full**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec jest
```

Expected: PASS in both. Record any pre-existing failure explicitly rather than assuming it is unrelated.

- [ ] **Step 2: Typecheck both apps**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit
```

Expected: no output from either.

- [ ] **Step 3: Confirm nothing normalises a vendor name anywhere on the path**

```bash
cd /home/faris/code/esp/esp-dashboard
grep -rn "BTRIM\|NULLIF\|toLowerCase\|toUpperCase\|\.trim()" \
  apps/backend/src/modules/vendor-groups \
  apps/frontend/src/features/vendor-groups
```

Expected: exactly these ten lines and no others —

- `vendor-groups.service.ts`: the `// rather than NULLIF(BTRIM(...))` comment, and `const trimmed = description.trim()` in `normalizeDescription`
- `vendor-groups.service.spec.ts`: the `// Decision #7: … BTRIM on one side` comment, `expect(sql).not.toContain('BTRIM')`, and `expect(sql).not.toContain('NULLIF')`
- `VendorGroupForm.tsx`: `if (!name.trim())`, `name: name.trim()`, and `description: description.trim() || null`
- `VendorPicker.tsx`: `const query = search.trim().toLowerCase()` and `vendors.filter((v) => v.vendor.toLowerCase().includes(query))`

The only two that touch a vendor name are the last pair, and both act on the throwaway search haystack — neither may appear on the value passed to `onChange`. Everything else acts on the group's own fields, on a comment, or on an assertion that the normalisation is absent. An eleventh line is the alarm: something is rewriting a vendor name, and plan 3's aggregation will silently return nothing for that group.

- [ ] **Step 4: Confirm the module is a complete ten files**

```bash
cd /home/faris/code/esp/esp-dashboard
find apps/backend/src/modules/vendor-groups -type f | sort
```

Expected: `dto/create-vendor-group.dto.ts`, `dto/create-vendor-group.dto.spec.ts`, `dto/update-vendor-group.dto.ts`, `entities/vendor-group-vendor.entity.ts`, `entities/vendor-group.entity.ts`, `vendor-groups.controller.spec.ts`, `vendor-groups.controller.ts`, `vendor-groups.module.ts`, `vendor-groups.service.spec.ts`, `vendor-groups.service.ts`. Ten, not the nine `route-groups` has: Task 5 adds `create-vendor-group.dto.spec.ts`, which has no route-groups counterpart.

- [ ] **Step 5: Commit anything the verification changed**

```bash
cd /home/faris/code/esp/esp-dashboard
git add -A
git commit -m "test(pnl): verify the vendor group module end to end before handing off to plan 3"
```

---

## Self-Review

**Spec coverage.** Every requirement in "Fitur 3 — Vendor Group" and the vendor half of "Kelayakan" maps to a task:

| Spec requirement | Task |
|---|---|
| Kelayakan: run the unmeasured containment query and record the number | 1 |
| `vendor_groups` DDL: `IF NOT EXISTS`, quoted constraint names, `uq_vendor_groups_name` | 2 |
| `vendor_group_vendors` DDL: `VARCHAR(200)`, composite PK, `ON DELETE CASCADE` | 2 |
| Index on `(vendor)` for the reverse lookup, **not** on `vendor_group_id` | 2, verified in Task 2 Step 3 |
| `down()` drops child before parent | 2, executed in Task 2 Step 4 |
| No `organization_id`, no soft delete — matching `20260816000002-route-groups.ts` | 2 |
| Four permissions after `packages/shared/src/auth/index.ts:93` | 3 |
| Permission names satisfy the CHECK constraint regex | 3 Step 2 |
| Roles panel needs no frontend work (auto-grouping by resource) | 3, exercised in 15 Step 4 |
| `available-vendors` is a genuine `UNION` of master and used | 4 |
| Returns `has_data` **and** `in_master` as independent flags | 4 |
| Names taken raw; only `NULL` and `''` excluded, by explicit comparison | 4, DTO 5, form 11, picker 10, swept in 16 Step 3 |
| No `BTRIM` / `NULLIF` / case folding anywhere on the path | 4 Step 1 (asserted in SQL), 16 Step 3 (swept across both apps) |
| DTO `vendors: string[]` with the five listed decorators, no `@ValidateNested`/`@Type` | 5 |
| Ten backend module files — `route-groups/`'s nine plus the DTO spec | 4, 5, 6, 7, 8; counted in 16 Step 4 |
| Controller: 5 routes, `@Authorize` per method, `@HttpCode(204)` on DELETE | 8 |
| Service: raw-SQL read, delete-then-insert children in a transaction, name pre-check plus `23505` remap, `''`→`null` description | 6, 7 |
| `assertVendorsExist` accepts anything in master ∪ used | 6 |
| Registered in `app.module.ts` | 8 |
| `features/vendor-groups/` with types, hooks keyed `['vendor-groups']`, picker, form, delete dialog | 9, 10, 11, 12 |
| Manual validation, no Zod | 11 |
| `VendorPicker` is flat + search + amber dot + separate `in_master` label + counter, **not** a `RoutePicker` copy | 10 |
| `/vendor-groups` page | 13 |
| Sidebar entry after `sidebar.tsx:155`, gated on `read.vendor_group`, beside Route Group | 14 |
| Risk #1: permissions need a restart, are granted to nobody, and super admins bypass both gates | 15 |

Deliberately **not** in this plan, because the spec assigns them elsewhere: the Vendor Comparison tab, `parseVendorColumnPicks`, `PnlVendorPick`, the coverage banner, the overlap banner, `MultiVendorFilter`, `toVendorComparisonTable`, and the `vendors` field on `PnlRouteFilter`. All of those are plan 3. The overlap banner is the only consumer of `idx_vendor_group_vendors_vendor`, so that index ships one plan ahead of its reader — deliberately, since it belongs to the DDL and retro-fitting an index in a later migration is how you end up with two migrations owning one table.

**Placeholder scan.** No `TBD`, no `TODO`, no "similar to Task N", no "add error handling", no "write tests for the above". Every code block is complete and copy-pasteable. Repeated boilerplate — the service spec's `beforeEach`, the three `psql "$(grep …)"` invocations, the `catch` block in both dialogs — is written out in full each time rather than cross-referenced. The one value this plan cannot know in advance is the containment count from Task 1; it is never written as a placeholder, because Task 1 Step 3 captures it into a shell variable and `sed` substitutes it, and no later task embeds the number in code.

**Type consistency.**

- `AvailableVendor` is `{ vendor, hasData, inMaster }` in both `vendor-groups.service.ts` (Task 4) and `features/vendor-groups/types.ts` (Task 9). The wire form is `{ vendor, has_data, in_master }` and is converted in exactly one place, the `.map()` at the end of `getAvailableVendors`.
- `VendorGroup` is `{ id, name, description, vendors }` on both sides, identically.
- `VendorGroupPayload` (frontend) is the structural mirror of `CreateVendorGroupDto` (backend); `description?: string | null` is nullable on both, and both treat `undefined` as "leave unchanged" and `null` as "clear".
- `VendorGroupsService.getAvailableVendors`, `findAll`, `create`, `update`, `remove` are named identically in Tasks 4, 6, 7 and in the controller (Task 8) and its spec.
- `txVendorRepo` is the transactional double in Tasks 4, 6 and 7 — one name across all three, because they append to a single spec file.
- The picker's prop name is `vendors` in Task 10, Task 11 and Task 13; the form's selection state is `string[]` throughout, never `{ vendor: string }[]`.
- `VendorGroupWire.vendors` and `AvailableVendorWire.hasData` / `.inMaster` are optional exactly where the rolling-deploy rule requires, and are the only optional fields introduced.

---

## Execution Handoff

Plan complete and independent: it does not touch a single file plan 1 touches, so the two can run in either order or in parallel. Plan 3 (Vendor Comparison tab) needs both — the row/column generalisation from plan 1 and the `vendor_groups` tables plus `available-vendors` from this one.
