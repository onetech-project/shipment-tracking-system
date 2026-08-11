# Barhal 4-step Koli wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-modal Barhal "create Koli" flow with a 4-step wizard (Buat Koli → TO → Kelola Berat → Input SMU), backed by a `remarks`/`lt_number`-aware TO source and koli-level SMU with bulk apply.

**Architecture:** NestJS module (`apps/backend/src/modules/barhal`) exposes one endpoint per wizard step against two Postgres tables (`barhal_koli`, `barhal_koli_to`) plus generated columns on the existing `air_shipments_compileaircgk` sheet-backed table. The Next.js frontend (`apps/frontend/src/features/barhal`) replaces `TambahKoliModal` with a stepper component that calls the matching endpoint per step, so progress persists in the DB between steps (resumable).

**Tech Stack:** NestJS + TypeORM (raw `DataSource.query` for reads, entity repos for writes) + class-validator DTOs; Next.js (App Router) + TanStack Query + Tailwind, following existing `useBarhal.ts` / `TambahKoliModal.tsx` conventions.

## Global Constraints

- Branch `feature/barhal-menu` is unreleased — no backward-compat shims for the old schema/API shape (spec: "Out of scope").
- `koli_number` format: `` `${d}${MonAbbr}-${originName}-${destName}-Barhal${n}` `` using the existing English `MONTH_ABBR` array in `barhal.service.ts` (e.g. `1Jun-Kosambi-Badung-Barhal1`).
- `volume = (length_cm * width_cm * height_cm) / 6000`.
- Vendor is always the literal string `"ESP"` (not a sheet column).
- Blank/omitted fields in SMU update and bulk-SMU update must never overwrite existing non-null values.
- Permissions: `READ_BARHAL` on all GETs, `CREATE_BARHAL` on all mutating endpoints (POST/PUT/PATCH) — same two permissions used today, no new permission enum values.
- Follow existing repo conventions: migrations under `apps/backend/src/database/migrations/<timestamp>-<name>.ts` named with the next chronological 14-digit timestamp after `20260721000001`; DTOs use `class-validator`; service reads use `this.dataSource.query(...)` with parameterized `$1, $2, ...` placeholders (SQL injection safety — never string-interpolate user input into query text).

---

## Task 1: Migration — schema changes

**Files:**
- Create: `apps/backend/src/database/migrations/20260724000001-barhal-wizard-redesign.ts`
- Test: manual (`up`/`down` run against local DB — see Step 3)

**Interfaces:**
- Produces: `air_shipments_compileaircgk.remarks`, `air_shipments_compileaircgk.lt_number` (generated TEXT columns), `air_shipments_compileaircgk.completed_date` (generated DATE column, parsed from the existing `completed_time` "DD-Mon-YYYY" text — reuses the same day/month/year extraction as the table's existing `cycle_period` column); `barhal_koli.origin_name`, `barhal_koli.dest_name`, `barhal_koli.batang_kayu`, `barhal_koli.smu_number`, `barhal_koli.airlines`, `barhal_koli.flight_no`, `barhal_koli.std`, `barhal_koli.sta` (new columns); `barhal_koli_to` with `smu_*` columns dropped.

- [ ] **Step 1: Write the migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm'

// Redesigns Barhal Koli creation as a 4-step wizard (Buat Koli -> TO -> Kelola Berat -> Input SMU).
// - air_shipments_compileaircgk gains `remarks`/`lt_number` generated columns (same
//   extra_fields-derived STORED pattern as its existing columns) so TOs can be filtered to
//   Barhal-only and the TO list can show LT Number.
// - barhal_koli drops the IATA-code-based route/origin_code/dest_code in favor of plain
//   origin_name/dest_name text (DC suffix stripped), adds batang_kayu, and gains koli-level SMU
//   fields (smu_number/airlines/flight_no/std/sta) since SMU is now entered once per Koli
//   (optionally bulk-applied across a date+destination group) rather than per TO line.
// - barhal_koli_to drops its now-unused per-line smu_* snapshot columns.
export class BarhalWizardRedesign20260724000001 implements MigrationInterface {
  name = 'BarhalWizardRedesign20260724000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS remarks    TEXT GENERATED ALWAYS AS (extra_fields->>'remarks') STORED,
        ADD COLUMN IF NOT EXISTS lt_number  TEXT GENERATED ALWAYS AS (extra_fields->>'lt_number') STORED,
        ADD COLUMN IF NOT EXISTS completed_date DATE GENERATED ALWAYS AS (
          CASE WHEN extra_fields->>'completed_time' IS NULL OR extra_fields->>'completed_time' = ''
               THEN NULL
               ELSE MAKE_DATE(
                 SUBSTRING(extra_fields->>'completed_time', 8, 4)::INTEGER,
                 CASE SUBSTRING(extra_fields->>'completed_time', 4, 3)
                   WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3
                   WHEN 'Apr' THEN 4 WHEN 'May' THEN 5 WHEN 'Jun' THEN 6
                   WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8 WHEN 'Sep' THEN 9
                   WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
                   ELSE 1
                 END,
                 SUBSTRING(extra_fields->>'completed_time', 1, 2)::INTEGER
               )
          END
        ) STORED
    `)

    await queryRunner.query(`ALTER TABLE barhal_koli DROP CONSTRAINT IF EXISTS uq_barhal_koli_date_route_seq`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_barhal_koli_route`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        DROP COLUMN IF EXISTS route,
        DROP COLUMN IF EXISTS origin_code,
        DROP COLUMN IF EXISTS dest_code,
        ADD COLUMN origin_name TEXT NOT NULL DEFAULT '',
        ADD COLUMN dest_name   TEXT NOT NULL DEFAULT '',
        ADD COLUMN batang_kayu INTEGER,
        ADD COLUMN smu_number  TEXT,
        ADD COLUMN airlines    TEXT,
        ADD COLUMN flight_no   TEXT,
        ADD COLUMN std         TIMESTAMPTZ,
        ADD COLUMN sta         TIMESTAMPTZ
    `)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN origin_name DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN dest_name DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after DROP DEFAULT`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        ADD CONSTRAINT uq_barhal_koli_date_origin_dest_seq UNIQUE (koli_date, origin_name, dest_name, sequence_no)
    `)
    await queryRunner.query(`CREATE INDEX idx_barhal_koli_origin_dest ON barhal_koli(origin_name, dest_name)`)

    await queryRunner.query(`
      ALTER TABLE barhal_koli_to
        DROP COLUMN IF EXISTS smu_account,
        DROP COLUMN IF EXISTS smu_airlines,
        DROP COLUMN IF EXISTS smu_flight_date,
        DROP COLUMN IF EXISTS smu_flight_number
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE barhal_koli_to
        ADD COLUMN smu_account       TEXT,
        ADD COLUMN smu_airlines      TEXT,
        ADD COLUMN smu_flight_date   TEXT,
        ADD COLUMN smu_flight_number TEXT
    `)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_barhal_koli_origin_dest`)
    await queryRunner.query(`ALTER TABLE barhal_koli DROP CONSTRAINT IF EXISTS uq_barhal_koli_date_origin_dest_seq`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        DROP COLUMN IF EXISTS origin_name,
        DROP COLUMN IF EXISTS dest_name,
        DROP COLUMN IF EXISTS batang_kayu,
        DROP COLUMN IF EXISTS smu_number,
        DROP COLUMN IF EXISTS airlines,
        DROP COLUMN IF EXISTS flight_no,
        DROP COLUMN IF EXISTS std,
        DROP COLUMN IF EXISTS sta,
        ADD COLUMN route        TEXT NOT NULL DEFAULT '',
        ADD COLUMN origin_code  TEXT NOT NULL DEFAULT '',
        ADD COLUMN dest_code    TEXT NOT NULL DEFAULT ''
    `)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN route DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN origin_code DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN dest_code DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before SET DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after SET DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after SET NOT NULL`)
    await queryRunner.query(`CREATE INDEX idx_barhal_koli_route ON barhal_koli(route)`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        ADD CONSTRAINT uq_barhal_koli_date_route_seq UNIQUE (koli_date, route, sequence_no)
    `)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS remarks,
        DROP COLUMN IF EXISTS lt_number,
        DROP COLUMN IF EXISTS completed_date
    `)
  }
}
```

- [ ] **Step 2: Verify no other migration file already claims this timestamp**

Run: `ls apps/backend/src/database/migrations | grep 20260724000001`
Expected: no output (filename is free)

- [ ] **Step 3: Run the migration up and down against the local dev DB**

Run: `cd apps/backend && npm run typeorm -- migration:run -d src/database/data-source.ts`
Expected: `BarhalWizardRedesign20260724000001` listed as executed, no errors.

Run: `cd apps/backend && npm run typeorm -- migration:revert -d src/database/data-source.ts`
Expected: reverts cleanly, no errors. Then re-run `migration:run` to leave the DB in the new state for subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/migrations/20260724000001-barhal-wizard-redesign.ts
git commit -m "feat(barhal): migrate schema for 4-step Koli wizard"
```

---

## Task 2: Update entities

**Files:**
- Modify: `apps/backend/src/modules/barhal/entities/barhal-koli.entity.ts`
- Modify: `apps/backend/src/modules/barhal/entities/barhal-koli-to.entity.ts`

**Interfaces:**
- Consumes: Task 1's column set.
- Produces: `BarhalKoli` fields `origin_name: string`, `dest_name: string`, `batang_kayu: number | null`, `smu_number: string | null`, `airlines: string | null`, `flight_no: string | null`, `std: Date | null`, `sta: Date | null`, `weight_before: number | null`, `weight_after: number | null` (both now nullable). `BarhalKoliTo` unchanged except `smu_*` fields removed.

- [ ] **Step 1: Rewrite `barhal-koli.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm'
import { BarhalKoliTo } from './barhal-koli-to.entity'

@Entity('barhal_koli')
@Unique('uq_barhal_koli_number', ['koli_number'])
@Unique('uq_barhal_koli_date_origin_dest_seq', ['koli_date', 'origin_name', 'dest_name', 'sequence_no'])
export class BarhalKoli {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'koli_number', type: 'text' })
  koli_number: string

  @Index('idx_barhal_koli_date')
  @Column({ name: 'koli_date', type: 'date' })
  koli_date: string

  @Index('idx_barhal_koli_origin_dest')
  @Column({ name: 'origin_name', type: 'text' })
  origin_name: string

  @Column({ name: 'dest_name', type: 'text' })
  dest_name: string

  @Column({ name: 'sequence_no', type: 'integer' })
  sequence_no: number

  @Column({ name: 'weight_before', type: 'numeric', nullable: true })
  weight_before: number | null

  @Column({ name: 'packing_kayu_weight', type: 'numeric', default: 0 })
  packing_kayu_weight: number

  @Column({ name: 'weight_after', type: 'numeric', nullable: true })
  weight_after: number | null

  @Column({ name: 'length_cm', type: 'numeric', nullable: true })
  length_cm: number | null

  @Column({ name: 'width_cm', type: 'numeric', nullable: true })
  width_cm: number | null

  @Column({ name: 'height_cm', type: 'numeric', nullable: true })
  height_cm: number | null

  @Column({ name: 'volume', type: 'numeric', nullable: true })
  volume: number | null

  @Column({ name: 'batang_kayu', type: 'integer', nullable: true })
  batang_kayu: number | null

  @Column({ name: 'smu_number', type: 'text', nullable: true })
  smu_number: string | null

  @Column({ name: 'airlines', type: 'text', nullable: true })
  airlines: string | null

  @Column({ name: 'flight_no', type: 'text', nullable: true })
  flight_no: string | null

  @Column({ name: 'std', type: 'timestamptz', nullable: true })
  std: Date | null

  @Column({ name: 'sta', type: 'timestamptz', nullable: true })
  sta: Date | null

  @Column({ name: 'total_to', type: 'integer', default: 0 })
  total_to: number

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  created_by: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date

  @OneToMany(() => BarhalKoliTo, (line) => line.koli)
  lines: BarhalKoliTo[]
}
```

- [ ] **Step 2: Rewrite `barhal-koli-to.entity.ts`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BarhalKoli } from './barhal-koli.entity'

@Entity('barhal_koli_to')
@Unique('uq_barhal_koli_to_to_number', ['to_number'])
export class BarhalKoliTo {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'koli_id', type: 'uuid' })
  koli_id: string

  @ManyToOne(() => BarhalKoli, (koli) => koli.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'koli_id' })
  koli: BarhalKoli

  @Index('idx_barhal_koli_to_to_number')
  @Column({ name: 'to_number', type: 'text' })
  to_number: string

  @Column({ name: 'awb', type: 'text', nullable: true })
  awb: string | null

  @Column({ name: 'gross_weight', type: 'numeric', nullable: true })
  gross_weight: number | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date
}
```

- [ ] **Step 3: Type-check the backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors only in `barhal.service.ts`/`barhal.controller.ts`/DTOs (fixed in later tasks) — no errors in the two entity files themselves.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/barhal/entities/
git commit -m "feat(barhal): update entities for origin/dest naming and koli-level SMU"
```

---

## Task 3: Rewrite DTOs

**Files:**
- Modify: `apps/backend/src/modules/barhal/dto/available-to.dto.ts`
- Modify: `apps/backend/src/modules/barhal/dto/create-barhal-koli.dto.ts` (rename usage to "create shell")
- Create: `apps/backend/src/modules/barhal/dto/attach-tos.dto.ts`
- Create: `apps/backend/src/modules/barhal/dto/update-packing.dto.ts`
- Create: `apps/backend/src/modules/barhal/dto/update-smu.dto.ts`
- Create: `apps/backend/src/modules/barhal/dto/bulk-update-smu.dto.ts`
- Modify: `apps/backend/src/modules/barhal/dto/list-barhal-koli.dto.ts`
- Modify: `apps/backend/src/modules/barhal/dto/barhal-dashboard-query.dto.ts`

**Interfaces:**
- Produces: `CreateBarhalKoliDto { koliDate, origin, dest }`, `AttachTosDto { toNumbers: string[] }`, `UpdatePackingDto { weightAfter, lengthCm?, widthCm?, heightCm?, batangKayu? }`, `UpdateSmuDto { smuNumber?, airlines?, flightNo?, std?, sta? }`, `BulkUpdateSmuDto { koliDate, dest, smuNumber?, airlines?, flightNo?, std?, sta? }`, `AvailableToDto { search?, date?, origin?, dest? }`, `ListBarhalKoliDto { search?, date?, origin?, dest?, page?, pageSize? }`, `BarhalDashboardQueryDto { startDate?, endDate?, origin?, dest? }`.

- [ ] **Step 1: Rewrite `create-barhal-koli.dto.ts` as the Step-1 shell DTO**

```typescript
import { IsDateString, IsString } from 'class-validator'

export class CreateBarhalKoliDto {
  @IsDateString()
  koliDate: string

  @IsString()
  origin: string

  @IsString()
  dest: string
}
```

- [ ] **Step 2: Create `attach-tos.dto.ts`**

```typescript
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator'

export class AttachTosDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  toNumbers: string[]
}
```

- [ ] **Step 3: Create `update-packing.dto.ts`**

```typescript
import { IsNumber, IsOptional, Min } from 'class-validator'

export class UpdatePackingDto {
  @IsNumber()
  @Min(0)
  weightAfter: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthCm?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthCm?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  batangKayu?: number
}
```

- [ ] **Step 4: Create `update-smu.dto.ts`**

```typescript
import { IsDateString, IsOptional, IsString } from 'class-validator'

export class UpdateSmuDto {
  @IsOptional()
  @IsString()
  smuNumber?: string

  @IsOptional()
  @IsString()
  airlines?: string

  @IsOptional()
  @IsString()
  flightNo?: string

  @IsOptional()
  @IsDateString()
  std?: string

  @IsOptional()
  @IsDateString()
  sta?: string
}
```

- [ ] **Step 5: Create `bulk-update-smu.dto.ts`**

```typescript
import { IsDateString, IsOptional, IsString } from 'class-validator'

export class BulkUpdateSmuDto {
  @IsDateString()
  koliDate: string

  @IsString()
  dest: string

  @IsOptional()
  @IsString()
  smuNumber?: string

  @IsOptional()
  @IsString()
  airlines?: string

  @IsOptional()
  @IsString()
  flightNo?: string

  @IsOptional()
  @IsDateString()
  std?: string

  @IsOptional()
  @IsDateString()
  sta?: string
}
```

- [ ] **Step 6: Rewrite `available-to.dto.ts`**

```typescript
import { IsOptional, IsString, IsDateString } from 'class-validator'

export class AvailableToDto {
  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  search?: string
}
```

- [ ] **Step 7: Rewrite `list-barhal-koli.dto.ts`**

```typescript
import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ListBarhalKoliDto {
  // Matches No. Koli, No. Penerbangan (flight number), and No. TO.
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 25
}
```

- [ ] **Step 8: Rewrite `barhal-dashboard-query.dto.ts`**

```typescript
import { IsOptional, IsDateString, IsString } from 'class-validator'

export class BarhalDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/barhal/dto/
git commit -m "feat(barhal): rewrite DTOs for per-step wizard endpoints"
```

---

## Task 4: Service — stations, available TOs (Barhal-only + full filters), delete station-code util

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` (partial — this task's methods only; later tasks add the rest)
- Delete: `apps/backend/src/modules/barhal/station-code.util.ts`
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` (new file)

**Interfaces:**
- Consumes: `BarhalKoli`/`BarhalKoliTo` repos, `DataSource` (as constructor-injected in the existing service).
- Produces: `normalizeStationName(raw: string | null | undefined): string` (module-level helper, exported for the test), `BarhalService.getStations(): Promise<{ origins: string[]; dests: string[] }>`, `BarhalService.getAvailableTos(dto: AvailableToDto): Promise<AvailableToRow[]>` where `AvailableToRow = { to_number, awb, gross_weight, origin_station, dest_station, vendor: 'ESP', lt_number, remarks, date }`.

- [ ] **Step 1: Delete the now-unused station-code util and its re-export**

```bash
rm apps/backend/src/modules/barhal/station-code.util.ts
```

Then remove this line from the bottom of `barhal.service.ts` (present from the old implementation):
```typescript
// Re-export so callers deriving codes from raw station names (outside the service) stay consistent.
export { deriveStationCode }
```
And remove the `import { buildRouteLabel, deriveStationCode } from './station-code.util'` import line.

- [ ] **Step 2: Write the failing tests for `normalizeStationName` and `getAvailableTos`**

Create `apps/backend/src/modules/barhal/barhal.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BarhalService, normalizeStationName } from './barhal.service'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'

describe('normalizeStationName', () => {
  it('strips a trailing "DC" suffix and trims whitespace', () => {
    expect(normalizeStationName('Kosambi DC')).toBe('Kosambi')
    expect(normalizeStationName('Badung  DC ')).toBe('Badung')
    expect(normalizeStationName('Denpasar')).toBe('Denpasar')
    expect(normalizeStationName(null)).toBe('')
  })
})

describe('BarhalService', () => {
  let service: BarhalService
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        BarhalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(BarhalKoli), useValue: {} },
        { provide: getRepositoryToken(BarhalKoliTo), useValue: {} },
      ],
    }).compile()
    service = module.get(BarhalService)
  })

  describe('getAvailableTos', () => {
    it('filters to Barhal-only TOs and applies search/date/origin/dest params', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10, origin_station: 'Kosambi DC', dest_station: 'Badung DC', lt_number: 'LT1', remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const rows = await service.getAvailableTos({ search: 'TO1', date: '2026-06-01', origin: 'Kosambi', dest: 'Badung' })
      expect(rows).toHaveLength(1)
      expect(rows[0].vendor).toBe('ESP')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/remarks ILIKE/i)
      expect(params).toContain('%barhal%')
      expect(params).toContain('%TO1%')
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: FAIL — `normalizeStationName` is not exported / `getAvailableTos` signature doesn't match yet.

- [ ] **Step 4: Implement `normalizeStationName` and rewrite `getStations`/`getAvailableTos` in `barhal.service.ts`**

Replace the file's `getRoutes`/`getAvailableTos` section (keep the rest of the file as-is for now — later tasks replace the remaining methods) with:

```typescript
export function normalizeStationName(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/\s+DC$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
}

interface AvailableToRow {
  to_number: string
  awb: string | null
  gross_weight: number | null
  origin_station: string | null
  dest_station: string | null
  lt_number: string | null
  remarks: string | null
  date: string | null
  vendor: 'ESP'
}
```

Inside the `BarhalService` class, replace `getRoutes` with:

```typescript
  /** Distinct normalized origin/destination names among Barhal-eligible TOs, for wizard/filter dropdowns. */
  async getStations(): Promise<{ origins: string[]; dests: string[] }> {
    const rows: { origin_station: string; dest_station: string }[] = await this.dataSource.query(`
      SELECT DISTINCT origin_station, dest_station
      FROM air_shipments_compileaircgk
      WHERE remarks ILIKE '%barhal%'
        AND origin_station IS NOT NULL AND origin_station != ''
        AND dest_station IS NOT NULL AND dest_station != ''
    `)
    const origins = new Set<string>()
    const dests = new Set<string>()
    for (const row of rows) {
      const origin = normalizeStationName(row.origin_station)
      const dest = normalizeStationName(row.dest_station)
      if (origin) origins.add(origin)
      if (dest) dests.add(dest)
    }
    return { origins: Array.from(origins).sort(), dests: Array.from(dests).sort() }
  }
```

And replace `getAvailableTos` with:

```typescript
  /** Barhal-only TOs (remarks ILIKE '%barhal%') not yet packed into any Koli. */
  async getAvailableTos(dto: AvailableToDto): Promise<AvailableToRow[]> {
    const params: unknown[] = []
    const conditions: string[] = [`c.remarks ILIKE '%barhal%'`]

    if (dto.search) {
      params.push(`%${dto.search}%`)
      conditions.push(`(c.to_number ILIKE $${params.length} OR c.lt_number ILIKE $${params.length})`)
    }
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`c.completed_date = $${params.length}`)
    }

    const rows: AvailableToRow[] = await this.dataSource.query(
      `
      SELECT
        c.to_number,
        c.awb,
        c.gross_weight,
        c.origin_station,
        c.dest_station,
        c.lt_number,
        c.remarks,
        c.completed_date AS date
      FROM air_shipments_compileaircgk c
      WHERE c.to_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number)
        AND ${conditions.join(' AND ')}
      ORDER BY c.to_number
      `,
      params,
    )

    const filtered = rows.filter((row) => {
      if (dto.origin && normalizeStationName(row.origin_station) !== dto.origin) return false
      if (dto.dest && normalizeStationName(row.dest_station) !== dto.dest) return false
      return true
    })
    return filtered.map((row) => ({ ...row, vendor: 'ESP' as const }))
  }
```

Note: `completed_date` is the DATE column added in Task 1, parsed from `completed_time` (format
`DD-Mon-YYYY`, e.g. `05-Jun-2026`) the same way the table's existing `cycle_period` generated
column does — it lets the Step 2 date-picker filter compare directly against a real date, and is
also what's returned as the TO list's "Date" column.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git rm apps/backend/src/modules/barhal/station-code.util.ts
git commit -m "feat(barhal): filter available TOs to Barhal-only, add stations lookup"
```

---

## Task 5: Service — createKoliShell (Step 1) and attachTos (Step 2)

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeStationName` (Task 4), `CreateBarhalKoliDto`, `AttachTosDto` (Task 3).
- Produces: `BarhalService.createKoliShell(dto: CreateBarhalKoliDto, userId?: string): Promise<BarhalKoli>`, `BarhalService.attachTos(id: string, dto: AttachTosDto): Promise<BarhalKoli>`.

- [ ] **Step 1: Write the failing tests**

Add to `barhal.service.spec.ts`:

```typescript
  describe('createKoliShell', () => {
    it('generates a koli_number from date/origin/dest and creates an empty shell', async () => {
      dataSource.query
        .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
        .mockResolvedValueOnce([{ count: 0 }]) // sequence count
      const manager = { query: dataSource.query, create: jest.fn((_, v) => v), save: jest.fn((v) => Promise.resolve(v)) }
      ;(service as any).dataSource.transaction = jest.fn((cb: any) => cb(manager))
      const koli = await service.createKoliShell({ koliDate: '2026-06-01', origin: 'Kosambi DC', dest: 'Badung DC' })
      expect(koli.koli_number).toBe('1Jun-Kosambi-Badung-Barhal1')
      expect(koli.origin_name).toBe('Kosambi')
      expect(koli.dest_name).toBe('Badung')
      expect(koli.total_to).toBe(0)
      expect(koli.weight_before).toBeNull()
    })
  })

  describe('attachTos', () => {
    it('sums gross_weight into weight_before and sets total_to', async () => {
      const koliRepo = { findOne: jest.fn().mockResolvedValue({ id: 'k1' }), save: jest.fn((v) => Promise.resolve(v)) }
      ;(service as any).koliRepo = koliRepo
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10 },
        { to_number: 'TO2', awb: 'AWB2', gross_weight: 5 },
      ])
      const lineRepo = { create: jest.fn((v) => v), save: jest.fn().mockResolvedValue(undefined) }
      ;(service as any).lineRepo = lineRepo
      const koli = await service.attachTos('k1', { toNumbers: ['TO1', 'TO2'] })
      expect(koli.weight_before).toBe(15)
      expect(koli.total_to).toBe(2)
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: FAIL — `createKoliShell`/`attachTos` are not defined.

- [ ] **Step 3: Implement `createKoliShell` and `attachTos`**

Replace the old `createKoli` method (and the `koliDatePrefix`/`MONTH_ABBR` top-level constants stay as-is — reuse them) with:

```typescript
  async createKoliShell(dto: CreateBarhalKoliDto, userId?: string): Promise<BarhalKoli> {
    const originName = normalizeStationName(dto.origin)
    const destName = normalizeStationName(dto.dest)
    if (!originName || !destName) {
      throw new BadRequestException('origin and dest must not be blank')
    }
    const datePrefix = koliDatePrefix(dto.koliDate)

    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `${dto.koliDate}|${originName}|${destName}`,
          ])
          const { count } = (
            await manager.query(
              `SELECT COUNT(*)::int AS count FROM barhal_koli WHERE koli_date = $1 AND origin_name = $2 AND dest_name = $3`,
              [dto.koliDate, originName, destName],
            )
          )[0]
          const sequenceNo = count + 1
          const koliNumber = `${datePrefix}-${originName}-${destName}-Barhal${sequenceNo}`

          const koli = manager.create(BarhalKoli, {
            koli_number: koliNumber,
            koli_date: dto.koliDate,
            origin_name: originName,
            dest_name: destName,
            sequence_no: sequenceNo,
            weight_before: null,
            packing_kayu_weight: 0,
            weight_after: null,
            total_to: 0,
            created_by: userId ?? null,
          })
          return manager.save(koli)
        })
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        if (code === UNIQUE_VIOLATION && attempt < maxAttempts - 1) continue
        if (code === UNIQUE_VIOLATION) throw new ConflictException('Could not generate a unique Koli number, please retry')
        throw err
      }
    }
    throw new ConflictException('Could not generate a unique Koli number, please retry')
  }

  async attachTos(id: string, dto: AttachTosDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')

    const toRows: { to_number: string; awb: string | null; gross_weight: number | null }[] = await this.dataSource.query(
      `SELECT to_number, awb, gross_weight FROM air_shipments_compileaircgk WHERE to_number = ANY($1)`,
      [dto.toNumbers],
    )
    if (toRows.length !== dto.toNumbers.length) {
      throw new BadRequestException('One or more selected TOs could not be found')
    }

    try {
      const lines = toRows.map((row) =>
        this.lineRepo.create({ koli_id: id, to_number: row.to_number, awb: row.awb, gross_weight: row.gross_weight }),
      )
      await this.lineRepo.save(lines)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === UNIQUE_VIOLATION) throw new ConflictException('One or more selected TOs were already packed into another Koli')
      throw err
    }

    koli.weight_before = toRows.reduce((sum, row) => sum + Number(row.gross_weight ?? 0), 0)
    koli.total_to = toRows.length
    return this.koliRepo.save(koli)
  }
```

Add the corresponding imports at the top of `barhal.service.ts`:
```typescript
import { AttachTosDto } from './dto/attach-tos.dto'
```
(`CreateBarhalKoliDto` is already imported.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): split Koli creation into shell (Step 1) + attach-TOs (Step 2)"
```

---

## Task 6: Service — updatePacking (Step 3), updateSmu + bulkUpdateSmu (Step 4)

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.service.spec.ts`

**Interfaces:**
- Consumes: `UpdatePackingDto`, `UpdateSmuDto`, `BulkUpdateSmuDto` (Task 3).
- Produces: `BarhalService.updatePacking(id: string, dto: UpdatePackingDto): Promise<BarhalKoli>`, `BarhalService.updateSmu(id: string, dto: UpdateSmuDto): Promise<BarhalKoli>`, `BarhalService.bulkUpdateSmu(dto: BulkUpdateSmuDto): Promise<{ updated: number }>`.

- [ ] **Step 1: Write the failing tests**

Add to `barhal.service.spec.ts`:

```typescript
  describe('updatePacking', () => {
    it('computes volume as (L*W*H)/6000 and stores weightAfter/batangKayu', async () => {
      const koliRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'k1', weight_before: 100 }),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const koli = await service.updatePacking('k1', { weightAfter: 120, lengthCm: 60, widthCm: 50, heightCm: 40, batangKayu: 8 })
      expect(koli.weight_after).toBe(120)
      expect(koli.volume).toBeCloseTo(20)
      expect(koli.batang_kayu).toBe(8)
    })
  })

  describe('updateSmu', () => {
    it('does not overwrite existing fields left blank', async () => {
      const koliRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'k1', smu_number: 'SMU-OLD', airlines: 'Garuda' }),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const koli = await service.updateSmu('k1', { flightNo: 'GA123' })
      expect(koli.smu_number).toBe('SMU-OLD')
      expect(koli.airlines).toBe('Garuda')
      expect(koli.flight_no).toBe('GA123')
    })
  })

  describe('bulkUpdateSmu', () => {
    it('updates every koli matching date+dest, skipping blank fields', async () => {
      const koliRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'k1', smu_number: 'OLD' },
          { id: 'k2', smu_number: null },
        ]),
        save: jest.fn((v) => Promise.resolve(v)),
      }
      ;(service as any).koliRepo = koliRepo
      const result = await service.bulkUpdateSmu({ koliDate: '2026-06-01', dest: 'Badung', airlines: 'Garuda' })
      expect(result.updated).toBe(2)
      expect(koliRepo.save).toHaveBeenCalledTimes(2)
      expect(koliRepo.find).toHaveBeenCalledWith({ where: { koli_date: '2026-06-01', dest_name: 'Badung' } })
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement the three methods**

Add to `BarhalService` in `barhal.service.ts`:

```typescript
  async updatePacking(id: string, dto: UpdatePackingDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')

    koli.weight_after = dto.weightAfter
    if (dto.lengthCm != null) koli.length_cm = dto.lengthCm
    if (dto.widthCm != null) koli.width_cm = dto.widthCm
    if (dto.heightCm != null) koli.height_cm = dto.heightCm
    if (dto.batangKayu != null) koli.batang_kayu = dto.batangKayu
    koli.volume =
      koli.length_cm != null && koli.width_cm != null && koli.height_cm != null
        ? (koli.length_cm * koli.width_cm * koli.height_cm) / 6000
        : koli.volume
    return this.koliRepo.save(koli)
  }

  private applySmuFields(koli: BarhalKoli, dto: UpdateSmuDto | BulkUpdateSmuDto): void {
    if (dto.smuNumber) koli.smu_number = dto.smuNumber
    if (dto.airlines) koli.airlines = dto.airlines
    if (dto.flightNo) koli.flight_no = dto.flightNo
    if (dto.std) koli.std = new Date(dto.std)
    if (dto.sta) koli.sta = new Date(dto.sta)
  }

  async updateSmu(id: string, dto: UpdateSmuDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')
    this.applySmuFields(koli, dto)
    return this.koliRepo.save(koli)
  }

  async bulkUpdateSmu(dto: BulkUpdateSmuDto): Promise<{ updated: number }> {
    const destName = normalizeStationName(dto.dest)
    const kolis = await this.koliRepo.find({ where: { koli_date: dto.koliDate, dest_name: destName || dto.dest } })
    for (const koli of kolis) {
      this.applySmuFields(koli, dto)
      await this.koliRepo.save(koli)
    }
    return { updated: kolis.length }
  }
```

Add imports:
```typescript
import { UpdatePackingDto } from './dto/update-packing.dto'
import { UpdateSmuDto } from './dto/update-smu.dto'
import { BulkUpdateSmuDto } from './dto/bulk-update-smu.dto'
```

Note on the test for `bulkUpdateSmu`: it asserts `find` was called with `dest_name: 'Badung'` — the
test passes `dest: 'Badung'` (already normalized), so `normalizeStationName('Badung') || 'Badung'`
resolves to `'Badung'`, matching.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): add packing (Step 3) and single/bulk SMU (Step 4) updates"
```

---

## Task 7: Service — regroup listKoli/getDashboard/exportCsv by origin+dest, update CSV builder

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts`
- Modify: `apps/backend/src/modules/barhal/barhal-csv.builder.ts`
- Modify: `apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts` (if it exists — create it if not)
- Modify: `apps/backend/src/modules/barhal/barhal.service.spec.ts`

**Interfaces:**
- Consumes: `ListBarhalKoliDto`, `BarhalDashboardQueryDto` (Task 3, both now with `origin`/`dest` instead of `route`).
- Produces: `BarhalCsvRow` reshaped to `{ koliNumber, koliDate, originName, destName, totalTo, weightBefore, weightAfter, chwt }`; `buildBarhalCsv(rows: BarhalCsvRow[]): string` with header `['No. Koli', 'Tanggal', 'Origin', 'Destinasi', 'Total TO', 'Weight Before', 'Weight After', 'ChWt']`.

- [ ] **Step 1: Check for an existing CSV builder spec**

Run: `find apps/backend/src/modules/barhal -name "barhal-csv.builder.spec.ts"`

If it exists, read it first and update its expectations to match Step 2 below instead of writing a fresh file. If it doesn't exist, create it as written in Step 2.

- [ ] **Step 2: Write/update the failing CSV builder test**

`apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts`:

```typescript
import { buildBarhalCsv } from './barhal-csv.builder'

describe('buildBarhalCsv', () => {
  it('emits Origin/Destinasi columns instead of Rute', () => {
    const csv = buildBarhalCsv([
      { koliNumber: '1Jun-Kosambi-Badung-Barhal1', koliDate: '2026-06-01', originName: 'Kosambi', destName: 'Badung', totalTo: 2, weightBefore: 15, weightAfter: 20, chwt: 25 },
    ])
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('No. Koli,Tanggal,Origin,Destinasi,Total TO,Weight Before,Weight After,ChWt')
    expect(row).toBe('1Jun-Kosambi-Badung-Barhal1,2026-06-01,Kosambi,Badung,2,15,20,25')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal-csv.builder.spec.ts`
Expected: FAIL — `BarhalCsvRow` shape mismatch / header text mismatch.

- [ ] **Step 4: Rewrite `barhal-csv.builder.ts`**

```typescript
/**
 * Pure CSV builder for the Barhal dashboard export. Kept free of NestJS/DB dependencies so it
 * can be unit-tested in isolation, mirroring the air-shipments SLA export builder's shape
 * (sla-export.builder.ts) — just plain RFC4180 CSV instead of a styled .xlsx workbook.
 */

export interface BarhalCsvRow {
  koliNumber: string
  koliDate: string
  originName: string
  destName: string
  totalTo: number
  weightBefore: number
  weightAfter: number
  chwt: number
}

const HEADERS = ['No. Koli', 'Tanggal', 'Origin', 'Destinasi', 'Total TO', 'Weight Before', 'Weight After', 'ChWt']

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildBarhalCsv(rows: BarhalCsvRow[]): string {
  const lines = [HEADERS.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [row.koliNumber, row.koliDate, row.originName, row.destName, row.totalTo, row.weightBefore, row.weightAfter, row.chwt]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal-csv.builder.spec.ts`
Expected: PASS

- [ ] **Step 6: Update `listKoli`, `getDashboard`, `exportCsv` in `barhal.service.ts` to filter/group by origin+dest**

Replace the three methods:

```typescript
  async listKoli(dto: ListBarhalKoliDto) {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 25
    const qb = this.koliRepo
      .createQueryBuilder('k')
      .orderBy('k.koli_date', 'DESC')
      .addOrderBy('k.koli_number', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (dto.date) qb.andWhere('k.koli_date = :date', { date: dto.date })
    if (dto.origin) qb.andWhere('k.origin_name = :origin', { origin: dto.origin })
    if (dto.dest) qb.andWhere('k.dest_name = :dest', { dest: dto.dest })
    if (dto.search) {
      qb.andWhere(
        `(k.koli_number ILIKE :search OR EXISTS (
          SELECT 1 FROM barhal_koli_to bkt
          WHERE bkt.koli_id = k.id AND bkt.to_number ILIKE :search
        ) OR k.flight_no ILIKE :search)`,
        { search: `%${dto.search}%` },
      )
    }

    const [data, total] = await qb.getManyAndCount()
    return { data, total, page, pageSize }
  }

  async getDashboard(dto: BarhalDashboardQueryDto) {
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`k.koli_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const totals = (
      await this.dataSource.query(
        `
        SELECT
          COUNT(*)::int AS koli_count,
          COALESCE(SUM(k.total_to), 0)::int AS total_to,
          COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
          COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after
        FROM barhal_koli k
        ${where}
        `,
        params,
      )
    )[0]

    const perRoute = await this.dataSource.query(
      `
      SELECT
        k.origin_name, k.dest_name,
        COUNT(*)::int AS koli_count,
        COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
        COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after,
        COALESCE(SUM(l.chwt), 0)::numeric AS chwt
      FROM barhal_koli k
      LEFT JOIN (
        SELECT bkt.koli_id, SUM(s.chwt) AS chwt
        FROM barhal_koli_to bkt
        LEFT JOIN air_shipments_smu_rate_cgk_spx s ON s.awb = bkt.awb
        GROUP BY bkt.koli_id
      ) l ON l.koli_id = k.id
      ${where}
      GROUP BY k.origin_name, k.dest_name
      ORDER BY k.origin_name, k.dest_name
      `,
      params,
    )

    const drillDown = await this.dataSource.query(
      `
      SELECT k.koli_date, k.origin_name, k.dest_name,
             COUNT(*)::int AS koli_count,
             COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
             COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after
      FROM barhal_koli k
      ${where}
      GROUP BY k.koli_date, k.origin_name, k.dest_name
      ORDER BY k.koli_date DESC, k.origin_name, k.dest_name
      `,
      params,
    )

    return { totals, perRoute, drillDown }
  }

  async exportCsv(dto: BarhalDashboardQueryDto): Promise<string> {
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`k.koli_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows: BarhalCsvRow[] = await this.dataSource.query(
      `
      SELECT
        k.koli_number   AS "koliNumber",
        k.koli_date     AS "koliDate",
        k.origin_name   AS "originName",
        k.dest_name     AS "destName",
        k.total_to      AS "totalTo",
        k.weight_before::numeric AS "weightBefore",
        k.weight_after::numeric  AS "weightAfter",
        COALESCE((
          SELECT SUM(s.chwt) FROM barhal_koli_to bkt
          LEFT JOIN air_shipments_smu_rate_cgk_spx s ON s.awb = bkt.awb
          WHERE bkt.koli_id = k.id
        ), 0)::numeric AS "chwt"
      FROM barhal_koli k
      ${where}
      ORDER BY k.koli_date DESC, k.koli_number DESC
      `,
      params,
    )
    return buildBarhalCsv(rows)
  }
```

- [ ] **Step 7: Run the full service test suite**

Run: `cd apps/backend && npx jest src/modules/barhal`
Expected: PASS (all specs in the module)

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal-csv.builder.ts apps/backend/src/modules/barhal/barhal-csv.builder.spec.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): regroup list/dashboard/CSV export by origin+dest"
```

---

## Task 8: Controller — wire the new per-step endpoints

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.controller.ts`

**Interfaces:**
- Consumes: every DTO from Task 3 and every service method from Tasks 4–7.
- Produces: HTTP routes `GET /barhal/stations`, `GET /barhal/available-tos`, `GET /barhal/koli`, `GET /barhal/koli/:id`, `POST /barhal/koli`, `PUT /barhal/koli/:id/tos`, `PATCH /barhal/koli/:id/packing`, `PATCH /barhal/koli/:id/smu`, `PATCH /barhal/koli/bulk-smu`, `GET /barhal/dashboard`, `GET /barhal/export.csv`.

- [ ] **Step 1: Rewrite `barhal.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { Permission } from '@shared/auth'
import { BarhalService } from './barhal.service'
import { CreateBarhalKoliDto } from './dto/create-barhal-koli.dto'
import { AttachTosDto } from './dto/attach-tos.dto'
import { UpdatePackingDto } from './dto/update-packing.dto'
import { UpdateSmuDto } from './dto/update-smu.dto'
import { BulkUpdateSmuDto } from './dto/bulk-update-smu.dto'
import { ListBarhalKoliDto } from './dto/list-barhal-koli.dto'
import { AvailableToDto } from './dto/available-to.dto'
import { BarhalDashboardQueryDto } from './dto/barhal-dashboard-query.dto'

@ApiTags('Barhal')
@Controller('barhal')
@UseGuards(JwtAuthGuard)
export class BarhalController {
  constructor(private readonly service: BarhalService) {}

  @Get('stations')
  @Authorize(Permission.READ_BARHAL)
  getStations() {
    return this.service.getStations()
  }

  @Get('available-tos')
  @Authorize(Permission.READ_BARHAL)
  getAvailableTos(@Query() dto: AvailableToDto) {
    return this.service.getAvailableTos(dto)
  }

  @Get('koli')
  @Authorize(Permission.READ_BARHAL)
  listKoli(@Query() dto: ListBarhalKoliDto) {
    return this.service.listKoli(dto)
  }

  @Get('koli/:id')
  @Authorize(Permission.READ_BARHAL)
  getKoliDetail(@Param('id') id: string) {
    return this.service.getKoliDetail(id)
  }

  @Post('koli')
  @Authorize(Permission.CREATE_BARHAL)
  createKoliShell(@Body() dto: CreateBarhalKoliDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createKoliShell(dto, user.id)
  }

  @Put('koli/:id/tos')
  @Authorize(Permission.CREATE_BARHAL)
  attachTos(@Param('id') id: string, @Body() dto: AttachTosDto) {
    return this.service.attachTos(id, dto)
  }

  @Patch('koli/:id/packing')
  @Authorize(Permission.CREATE_BARHAL)
  updatePacking(@Param('id') id: string, @Body() dto: UpdatePackingDto) {
    return this.service.updatePacking(id, dto)
  }

  @Patch('koli/:id/smu')
  @Authorize(Permission.CREATE_BARHAL)
  updateSmu(@Param('id') id: string, @Body() dto: UpdateSmuDto) {
    return this.service.updateSmu(id, dto)
  }

  @Patch('koli/bulk-smu')
  @Authorize(Permission.CREATE_BARHAL)
  bulkUpdateSmu(@Body() dto: BulkUpdateSmuDto) {
    return this.service.bulkUpdateSmu(dto)
  }

  @Get('dashboard')
  @Authorize(Permission.READ_BARHAL)
  getDashboard(@Query() dto: BarhalDashboardQueryDto) {
    return this.service.getDashboard(dto)
  }

  @Get('export.csv')
  @Authorize(Permission.READ_BARHAL)
  async exportCsv(
    @Query() dto: BarhalDashboardQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.service.exportCsv(dto)
    const range = dto.startDate && dto.endDate ? `${dto.startDate}_${dto.endDate}` : 'all'
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="barhal-${range}.csv"`,
    })
    return new StreamableFile(Buffer.from(csv, 'utf-8'))
  }
}
```

- [ ] **Step 2: Type-check and run the full backend test suite**

Run: `cd apps/backend && npx tsc --noEmit && npx jest src/modules/barhal`
Expected: no type errors; all barhal specs PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.controller.ts
git commit -m "feat(barhal): wire per-step wizard endpoints on the controller"
```

---

## Task 9: Frontend types

**Files:**
- Modify: `apps/frontend/src/features/barhal/types.ts`

**Interfaces:**
- Produces: `BarhalKoli`, `BarhalKoliTo`, `AvailableTo`, `CreateKoliShellPayload`, `AttachTosPayload`, `UpdatePackingPayload`, `UpdateSmuPayload`, `BulkUpdateSmuPayload`, dashboard types — all reshaped to origin/dest naming.

- [ ] **Step 1: Rewrite `types.ts`**

```typescript
export interface BarhalKoliTo {
  id: string
  koli_id: string
  to_number: string
  awb: string | null
  gross_weight: number | null
}

export interface BarhalKoli {
  id: string
  koli_number: string
  koli_date: string
  origin_name: string
  dest_name: string
  sequence_no: number
  weight_before: number | null
  packing_kayu_weight: number
  weight_after: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume: number | null
  batang_kayu: number | null
  smu_number: string | null
  airlines: string | null
  flight_no: string | null
  std: string | null
  sta: string | null
  total_to: number
  created_at: string
  lines?: BarhalKoliTo[]
}

export interface AvailableTo {
  to_number: string
  awb: string | null
  gross_weight: number | null
  origin_station: string | null
  dest_station: string | null
  lt_number: string | null
  remarks: string | null
  date: string | null
  vendor: 'ESP'
}

export interface CreateKoliShellPayload {
  koliDate: string
  origin: string
  dest: string
}

export interface AttachTosPayload {
  toNumbers: string[]
}

export interface UpdatePackingPayload {
  weightAfter: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  batangKayu?: number
}

export interface UpdateSmuPayload {
  smuNumber?: string
  airlines?: string
  flightNo?: string
  std?: string
  sta?: string
}

export interface BulkUpdateSmuPayload {
  koliDate: string
  dest: string
  smuNumber?: string
  airlines?: string
  flightNo?: string
  std?: string
  sta?: string
}

export interface BarhalStations {
  origins: string[]
  dests: string[]
}

export interface BarhalDashboardTotals {
  koli_count: number
  total_to: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardRouteItem {
  origin_name: string
  dest_name: string
  koli_count: number
  weight_before: number
  weight_after: number
  chwt: number
}

export interface BarhalDashboardDrillDownItem {
  koli_date: string
  origin_name: string
  dest_name: string
  koli_count: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardStats {
  totals: BarhalDashboardTotals
  perRoute: BarhalDashboardRouteItem[]
  drillDown: BarhalDashboardDrillDownItem[]
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/barhal/types.ts
git commit -m "feat(barhal): reshape frontend types for origin/dest + wizard payloads"
```

(Note: this leaves the rest of the frontend non-compiling until Tasks 10–15 land — expected mid-plan, not a stopping point.)

---

## Task 10: Frontend hooks — one hook per wizard step + stations/list/dashboard updates

**Files:**
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhal.ts`

**Interfaces:**
- Consumes: types from Task 9.
- Produces: `useBarhalStations()`, `useBarhalList(params)`, `useBarhalKoliDetail(id)`, `useAvailableTos(params)`, `useCreateKoliShell()`, `useAttachTos()`, `useUpdatePacking()`, `useUpdateSmu()`, `useBulkUpdateSmu()`.

- [ ] **Step 1: Rewrite `useBarhal.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  AvailableTo,
  BarhalKoli,
  BarhalStations,
  CreateKoliShellPayload,
  AttachTosPayload,
  UpdatePackingPayload,
  UpdateSmuPayload,
  BulkUpdateSmuPayload,
} from '../types'

export interface ListBarhalKoliParams {
  search?: string
  date?: string
  origin?: string
  dest?: string
  page?: number
  pageSize?: number
}

export function useBarhalStations() {
  return useQuery<BarhalStations>({
    queryKey: ['barhal', 'stations'],
    queryFn: () => apiClient.get('/barhal/stations').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useBarhalList(params: ListBarhalKoliParams) {
  return useQuery<{ data: BarhalKoli[]; total: number; page: number; pageSize: number }>({
    queryKey: ['barhal', 'koli', params],
    queryFn: () => apiClient.get('/barhal/koli', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  })
}

export function useBarhalKoliDetail(id: string | null) {
  return useQuery<BarhalKoli>({
    queryKey: ['barhal', 'koli', 'detail', id],
    queryFn: () => apiClient.get(`/barhal/koli/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useAvailableTos(params: { origin?: string; dest?: string; date?: string; search?: string }) {
  return useQuery<AvailableTo[]>({
    queryKey: ['barhal', 'available-tos', params],
    queryFn: () => apiClient.get('/barhal/available-tos', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}

export function useCreateKoliShell() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateKoliShellPayload) =>
      apiClient.post<BarhalKoli>('/barhal/koli', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useAttachTos(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AttachTosPayload) =>
      apiClient.put<BarhalKoli>(`/barhal/koli/${koliId}/tos`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useUpdatePacking(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePackingPayload) =>
      apiClient.patch<BarhalKoli>(`/barhal/koli/${koliId}/packing`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useUpdateSmu(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateSmuPayload) =>
      apiClient.patch<BarhalKoli>(`/barhal/koli/${koliId}/smu`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useBulkUpdateSmu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: BulkUpdateSmuPayload) =>
      apiClient.patch<{ updated: number }>('/barhal/koli/bulk-smu', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/barhal/hooks/useBarhal.ts
git commit -m "feat(barhal): add per-step wizard hooks, drop route-based hooks"
```

---

## Task 11: Wizard Step 1 — Buat Koli component

**Files:**
- Create: `apps/frontend/src/features/barhal/components/wizard/Step1CreateKoli.tsx`

**Interfaces:**
- Consumes: `useBarhalStations`, `useCreateKoliShell` (Task 10).
- Produces: `Step1CreateKoli({ onCreated }: { onCreated: (koli: BarhalKoli) => void })`.

- [ ] **Step 1: Write the component**

```typescript
'use client'

import { useState } from 'react'
import { useBarhalStations, useCreateKoliShell } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step1CreateKoliProps {
  onCreated: (koli: BarhalKoli) => void
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function stripDc(name: string): string {
  return name.trim().replace(/\s+DC$/i, '').trim()
}

function previewKoliNumber(koliDate: string, origin: string, dest: string): string {
  if (!koliDate || !origin || !dest) return ''
  const [, month, day] = koliDate.split('-').map(Number)
  return `${day}${MONTH_ABBR[month - 1]}-${stripDc(origin)}-${stripDc(dest)}-Barhal?`
}

export function Step1CreateKoli({ onCreated }: Step1CreateKoliProps) {
  const [koliDate, setKoliDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: stations } = useBarhalStations()
  const createShell = useCreateKoliShell()

  const canSubmit = !!koliDate && !!origin && !!dest && !createShell.isPending

  const handleSubmit = async () => {
    setError(null)
    try {
      const koli = await createShell.mutateAsync({ koliDate, origin, dest })
      onCreated(koli)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal membuat Koli. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tanggal</label>
          <input
            type="date"
            value={koliDate}
            onChange={(e) => setKoliDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Origin</label>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Pilih origin —</option>
            {(stations?.origins ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Destinasi</label>
          <select
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Pilih destinasi —</option>
            {(stations?.dests ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Preview ID Koli</label>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
          {previewKoliNumber(koliDate, origin, dest) || '—'}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {createShell.isPending ? 'Membuat…' : 'Buat Koli'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/Step1CreateKoli.tsx
git commit -m "feat(barhal): add wizard Step 1 (Buat Koli)"
```

---

## Task 12: Wizard Step 2 — TO selection with filters + preview

**Files:**
- Modify: `apps/frontend/src/features/barhal/components/ToMultiSelect.tsx` (read first — extend, don't replace, unless its current props conflict)
- Create: `apps/frontend/src/features/barhal/components/wizard/Step2SelectTos.tsx`

**Interfaces:**
- Consumes: `useAvailableTos`, `useAttachTos` (Task 10), `AvailableTo` (Task 9).
- Produces: `Step2SelectTos({ koli, onAttached }: { koli: BarhalKoli; onAttached: (koli: BarhalKoli) => void })`.

- [ ] **Step 1: Read the existing `ToMultiSelect.tsx` to confirm its prop shape is still compatible**

Run: `cat apps/frontend/src/features/barhal/components/ToMultiSelect.tsx`

If its `options` prop type is `AvailableTo[]` and it renders `to_number`/`gross_weight` via checkboxes (matching the old shape), it needs no changes — Step2SelectTos wraps it with the added filter bar. If it hardcodes any removed `smu_*` fields, strip those references.

- [ ] **Step 2: Write the component**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useAvailableTos, useAttachTos, useBarhalStations } from '../../hooks/useBarhal'
import { ToMultiSelect } from '../ToMultiSelect'
import { BarhalKoli } from '../../types'

interface Step2SelectTosProps {
  koli: BarhalKoli
  onAttached: (koli: BarhalKoli) => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function Step2SelectTos({ koli, onAttached }: Step2SelectTosProps) {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [origin, setOrigin] = useState(koli.origin_name)
  const [dest, setDest] = useState(koli.dest_name)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: stations } = useBarhalStations()
  const { data: availableTos, isLoading } = useAvailableTos({
    search: search || undefined,
    date: date || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
  })
  const attachTos = useAttachTos(koli.id)

  const selectedRows = useMemo(
    () => (availableTos ?? []).filter((t) => selected.includes(t.to_number)),
    [availableTos, selected],
  )
  const totalWeight = selectedRows.reduce((sum, t) => sum + Number(t.gross_weight ?? 0), 0)

  const handleSubmit = async () => {
    setError(null)
    try {
      const updated = await attachTos.mutateAsync({ toNumbers: selected })
      onAttached(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menambahkan TO. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Cari TO / LT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Origin</option>
          {(stations?.origins ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <ToMultiSelect options={availableTos ?? []} selected={selected} onChange={setSelected} isLoading={isLoading} />

      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-full bg-muted px-3 py-1">Dipilih: {selectedRows.length} TO</span>
        <span className="rounded-full bg-muted px-3 py-1">Total berat: {fmt.format(totalWeight)} kg</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.length === 0 || attachTos.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {attachTos.isPending ? 'Menyimpan…' : 'Lanjut'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/Step2SelectTos.tsx apps/frontend/src/features/barhal/components/ToMultiSelect.tsx
git commit -m "feat(barhal): add wizard Step 2 (TO selection with filters + preview)"
```

---

## Task 13: Wizard Step 3 — Kelola Koli & Berat

**Files:**
- Create: `apps/frontend/src/features/barhal/components/wizard/Step3Packing.tsx`

**Interfaces:**
- Consumes: `useUpdatePacking` (Task 10).
- Produces: `Step3Packing({ koli, onSaved }: { koli: BarhalKoli; onSaved: (koli: BarhalKoli) => void })`.

- [ ] **Step 1: Write the component**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useUpdatePacking } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step3PackingProps {
  koli: BarhalKoli
  onSaved: (koli: BarhalKoli) => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

export function Step3Packing({ koli, onSaved }: Step3PackingProps) {
  const [weightAfter, setWeightAfter] = useState(koli.weight_after != null ? String(koli.weight_after) : '')
  const [lengthCm, setLengthCm] = useState(koli.length_cm != null ? String(koli.length_cm) : '')
  const [widthCm, setWidthCm] = useState(koli.width_cm != null ? String(koli.width_cm) : '')
  const [heightCm, setHeightCm] = useState(koli.height_cm != null ? String(koli.height_cm) : '')
  const [batangKayu, setBatangKayu] = useState(koli.batang_kayu != null ? String(koli.batang_kayu) : '')
  const [error, setError] = useState<string | null>(null)

  const updatePacking = useUpdatePacking(koli.id)

  const weightBefore = koli.weight_before ?? 0
  const kenaikan = weightAfter ? Number(weightAfter) - weightBefore : null
  const volume =
    lengthCm && widthCm && heightCm
      ? (Number(lengthCm) * Number(widthCm) * Number(heightCm)) / 6000
      : null

  const canSubmit = !!weightAfter && !updatePacking.isPending

  const handleSubmit = async () => {
    setError(null)
    try {
      const updated = await updatePacking.mutateAsync({
        weightAfter: Number(weightAfter),
        lengthCm: lengthCm ? Number(lengthCm) : undefined,
        widthCm: widthCm ? Number(widthCm) : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        batangKayu: batangKayu ? Number(batangKayu) : undefined,
      })
      onSaved(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Berat Sebelum</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            {fmt.format(weightBefore)} kg
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Berat Setelah Packing Kayu (kg)</label>
          <input
            type="number"
            min={0}
            value={weightAfter}
            onChange={(e) => setWeightAfter(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {kenaikan != null && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          Kenaikan Berat: <b>{kenaikan >= 0 ? '+' : ''}{fmt.format(kenaikan)} kg</b>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Panjang (cm)</label>
          <input type="number" min={0} value={lengthCm} onChange={(e) => setLengthCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Lebar (cm)</label>
          <input type="number" min={0} value={widthCm} onChange={(e) => setWidthCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tinggi (cm)</label>
          <input type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Volume</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            {volume != null ? fmt.format(volume) : '—'}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Jumlah Batang Kayu</label>
        <input type="number" min={0} value={batangKayu} onChange={(e) => setBatangKayu(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {updatePacking.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/Step3Packing.tsx
git commit -m "feat(barhal): add wizard Step 3 (Kelola Koli & Berat)"
```

---

## Task 14: Wizard Step 4 — Input SMU + bulk apply

**Files:**
- Create: `apps/frontend/src/features/barhal/components/wizard/Step4Smu.tsx`
- Delete: `apps/frontend/src/features/barhal/components/SmuDataSection.tsx` (superseded — SMU is no longer per-TO)

**Interfaces:**
- Consumes: `useUpdateSmu`, `useBulkUpdateSmu`, `useBarhalStations` (Task 10).
- Produces: `Step4Smu({ koli, onSaved }: { koli: BarhalKoli; onSaved: (koli: BarhalKoli) => void })`.

- [ ] **Step 1: Confirm `SmuDataSection` isn't imported anywhere else before deleting**

Run: `grep -rl "SmuDataSection" apps/frontend/src`
Expected: only `TambahKoliModal.tsx` (removed in Task 15) references it. If anything else references it, stop and re-scope this task.

- [ ] **Step 2: Write the component**

```typescript
'use client'

import { useState } from 'react'
import { useUpdateSmu, useBulkUpdateSmu, useBarhalStations } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step4SmuProps {
  koli: BarhalKoli
  onSaved: (koli: BarhalKoli) => void
}

export function Step4Smu({ koli, onSaved }: Step4SmuProps) {
  const [smuNumber, setSmuNumber] = useState(koli.smu_number ?? '')
  const [airlines, setAirlines] = useState(koli.airlines ?? '')
  const [flightNo, setFlightNo] = useState(koli.flight_no ?? '')
  const [std, setStd] = useState(koli.std ?? '')
  const [sta, setSta] = useState(koli.sta ?? '')
  const [error, setError] = useState<string | null>(null)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSmuNumber, setBulkSmuNumber] = useState('')
  const [bulkAirlines, setBulkAirlines] = useState('')
  const [bulkFlightNo, setBulkFlightNo] = useState('')
  const [bulkStd, setBulkStd] = useState('')
  const [bulkSta, setBulkSta] = useState('')
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const { data: stations } = useBarhalStations()
  const updateSmu = useUpdateSmu(koli.id)
  const bulkUpdateSmu = useBulkUpdateSmu()

  const handleSave = async () => {
    setError(null)
    try {
      const updated = await updateSmu.mutateAsync({
        smuNumber: smuNumber || undefined,
        airlines: airlines || undefined,
        flightNo: flightNo || undefined,
        std: std || undefined,
        sta: sta || undefined,
      })
      onSaved(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan SMU. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  const handleBulkApply = async () => {
    setBulkResult(null)
    const result = await bulkUpdateSmu.mutateAsync({
      koliDate: koli.koli_date,
      dest: koli.dest_name,
      smuNumber: bulkSmuNumber || undefined,
      airlines: bulkAirlines || undefined,
      flightNo: bulkFlightNo || undefined,
      std: bulkStd || undefined,
      sta: bulkSta || undefined,
    })
    setBulkResult(`Diterapkan ke ${result.updated} Koli (${koli.koli_date} → ${koli.dest_name})`)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nomor SMU</label>
          <input value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Airlines</label>
          <input value={airlines} onChange={(e) => setAirlines(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Flight No</label>
          <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">STD</label>
          <input type="datetime-local" value={std} onChange={(e) => setStd(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">STA</label>
          <input type="datetime-local" value={sta} onChange={(e) => setSta(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateSmu.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {updateSmu.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>

      <div className="rounded-lg border border-border p-4">
        <button type="button" onClick={() => setBulkOpen((v) => !v)} className="text-sm font-medium text-primary underline">
          {bulkOpen ? '▾' : '▸'} Isi SMU Massal ({koli.koli_date} → {koli.dest_name})
        </button>
        {bulkOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Diterapkan ke semua Koli dengan Tanggal + Destinasi yang sama. Kolom kosong tidak akan menimpa data yang sudah ada.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <input placeholder="Nomor SMU" value={bulkSmuNumber} onChange={(e) => setBulkSmuNumber(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <select value={bulkAirlines} onChange={(e) => setBulkAirlines(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— Airlines —</option>
                {(stations?.origins ?? []).length > 0 && null}
              </select>
              <input placeholder="Flight No" value={bulkFlightNo} onChange={(e) => setBulkFlightNo(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="datetime-local" value={bulkStd} onChange={(e) => setBulkStd(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="datetime-local" value={bulkSta} onChange={(e) => setBulkSta(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <button type="button" onClick={handleBulkApply} disabled={bulkUpdateSmu.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {bulkUpdateSmu.isPending ? 'Menerapkan…' : 'Terapkan'}
              </button>
            </div>
            {bulkResult && <p className="text-sm text-muted-foreground">{bulkResult}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
```

Note: the bulk Airlines field above is a placeholder `<select>` with no options wired — fix it in
Step 2 review by replacing it with a plain `<input>` (matching the per-koli Airlines field above),
since `stations` only exposes origins/dests, not an airline list. Do this before committing:

```typescript
              <input placeholder="Airlines" value={bulkAirlines} onChange={(e) => setBulkAirlines(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
```

replacing the `<select>` block (and drop the now-unused `stations` destructure if nothing else in
the file needs it — check before removing).

- [ ] **Step 3: Delete the superseded component**

```bash
git rm apps/frontend/src/features/barhal/components/SmuDataSection.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/Step4Smu.tsx
git commit -m "feat(barhal): add wizard Step 4 (Input SMU + bulk apply)"
```

---

## Task 15: Wizard container, list page/table wiring, remove old modal

**Files:**
- Create: `apps/frontend/src/features/barhal/components/wizard/BarhalKoliWizard.tsx`
- Delete: `apps/frontend/src/features/barhal/components/TambahKoliModal.tsx`
- Modify: `apps/frontend/src/features/barhal/components/BarhalFilters.tsx`
- Modify: `apps/frontend/src/features/barhal/components/BarhalListTable.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/barhal/page.tsx`

**Interfaces:**
- Consumes: `Step1CreateKoli`, `Step2SelectTos`, `Step3Packing`, `Step4Smu` (Tasks 11–14), `useBarhalStations`, `useBarhalList`, `useBarhalKoliDetail` (Task 10).
- Produces: `BarhalKoliWizard({ open, initialKoli, onClose }: { open: boolean; initialKoli?: BarhalKoli; onClose: () => void })` — a stepper modal; a Koli is "incomplete" (shows "Lanjutkan") when `total_to === 0`, or `weight_after == null`, or any of `length_cm/width_cm/height_cm/batang_kayu` is null, or `smu_number` is null.

- [ ] **Step 1: Write the wizard container**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Step1CreateKoli } from './Step1CreateKoli'
import { Step2SelectTos } from './Step2SelectTos'
import { Step3Packing } from './Step3Packing'
import { Step4Smu } from './Step4Smu'
import { BarhalKoli } from '../../types'

const STEP_LABELS = ['Buat Koli', 'Pilih TO', 'Kelola Koli & Berat', 'Input SMU']

export function isKoliIncomplete(koli: BarhalKoli): boolean {
  return (
    koli.total_to === 0 ||
    koli.weight_after == null ||
    koli.length_cm == null ||
    koli.width_cm == null ||
    koli.height_cm == null ||
    koli.batang_kayu == null ||
    !koli.smu_number
  )
}

function nextStepFor(koli: BarhalKoli): number {
  if (koli.total_to === 0) return 2
  if (koli.weight_after == null || koli.length_cm == null || koli.width_cm == null || koli.height_cm == null || koli.batang_kayu == null) return 3
  return 4
}

interface BarhalKoliWizardProps {
  open: boolean
  initialKoli?: BarhalKoli
  onClose: () => void
  onDone: () => void
}

export function BarhalKoliWizard({ open, initialKoli, onClose, onDone }: BarhalKoliWizardProps) {
  const [koli, setKoli] = useState<BarhalKoli | undefined>(initialKoli)
  const [step, setStep] = useState(initialKoli ? nextStepFor(initialKoli) : 1)

  const handleClose = () => {
    setKoli(undefined)
    setStep(1)
    onClose()
  }

  const handleStepDone = (updated: BarhalKoli, isFinal: boolean) => {
    setKoli(updated)
    if (isFinal) {
      onDone()
      handleClose()
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{koli ? koli.koli_number : 'Tambah Koli'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-3 text-xs">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {i + 1} · {label}
            </span>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto py-2">
          {step === 1 && <Step1CreateKoli onCreated={(k) => handleStepDone(k, false)} />}
          {step === 2 && koli && <Step2SelectTos koli={koli} onAttached={(k) => handleStepDone(k, false)} />}
          {step === 3 && koli && <Step3Packing koli={koli} onSaved={(k) => handleStepDone(k, false)} />}
          {step === 4 && koli && <Step4Smu koli={koli} onSaved={(k) => handleStepDone(k, true)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Read and update `BarhalFilters.tsx` and `BarhalListTable.tsx` to origin/dest**

Read both files first:
```bash
cat apps/frontend/src/features/barhal/components/BarhalFilters.tsx
cat apps/frontend/src/features/barhal/components/BarhalListTable.tsx
```

In `BarhalFilters.tsx`: replace the single `route`/`onRouteChange`/`routes: string[]` prop trio
with `origin`/`onOriginChange`/`dest`/`onDestChange`/`stations: { origins: string[]; dests: string[] }`,
rendering two `<select>`s (Origin, Destinasi) in place of the one Route `<select>`, following the
existing file's markup/styling for its current route select.

In `BarhalListTable.tsx`: replace any `koli.route` cell with two cells `koli.origin_name` /
`koli.dest_name`, and add a per-TO drill-in row (Date, Origin, Dest, LT Number, TO Number, Gross
Weight, Remarks) — sourced from `koli.lines` when a row is expanded — matching the spec's TO list
column set. Replace any `smu_account`/`smu_airlines` (line-level) references with the koli-level
`koli.smu_number`/`koli.airlines`. Add an action button per row: "Edit" when `!isKoliIncomplete(koli)`,
"Lanjutkan" when `isKoliIncomplete(koli)` (import `isKoliIncomplete` from `../wizard/BarhalKoliWizard`),
both opening the wizard with `initialKoli = koli`.

- [ ] **Step 3: Delete the old modal and rewire the list page**

```bash
git rm apps/frontend/src/features/barhal/components/TambahKoliModal.tsx
```

Rewrite `apps/frontend/src/app/(dashboard)/barhal/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalList, useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalListTable } from '@/features/barhal/components/BarhalListTable'
import { BarhalFilters } from '@/features/barhal/components/BarhalFilters'
import { BarhalKoliWizard } from '@/features/barhal/components/wizard/BarhalKoliWizard'
import { BarhalKoli } from '@/features/barhal/types'

const PAGE_SIZE = 25

function BarhalPageContent() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [page, setPage] = useState(1)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKoli, setWizardKoli] = useState<BarhalKoli | undefined>(undefined)

  const { data: stations } = useBarhalStations()
  const { data, isLoading, refetch } = useBarhalList({
    search: search || undefined,
    date: date || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    setPage(1)
  }, [search, date, origin, dest])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openWizardFor = (koli?: BarhalKoli) => {
    setWizardKoli(koli)
    setWizardOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barhal</h1>
          <p className="text-sm text-muted-foreground">
            Pencatatan dan pemantauan TO yang telah di packing kayu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/barhal/dashboard" className="text-sm text-primary underline">
            Dashboard
          </a>
          <button
            type="button"
            onClick={() => openWizardFor(undefined)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Tambah Koli
          </button>
        </div>
      </div>

      <BarhalFilters
        search={search}
        onSearchChange={setSearch}
        date={date}
        onDateChange={setDate}
        origin={origin}
        onOriginChange={setOrigin}
        dest={dest}
        onDestChange={setDest}
        stations={stations ?? { origins: [], dests: [] }}
      />

      <BarhalListTable
        data={data?.data ?? []}
        page={page}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        onOpenKoli={openWizardFor}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <BarhalKoliWizard
        open={wizardOpen}
        initialKoli={wizardKoli}
        onClose={() => setWizardOpen(false)}
        onDone={() => refetch()}
      />
    </div>
  )
}

export default function BarhalPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.barhal')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.barhal')) return null

  return <BarhalPageContent />
}
```

(`BarhalListTable`'s new `onOpenKoli` prop is consumed by the "Edit"/"Lanjutkan" button added in
Step 2 above.)

- [ ] **Step 4: Type-check and build the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors referencing `barhal`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/BarhalKoliWizard.tsx apps/frontend/src/features/barhal/components/BarhalFilters.tsx apps/frontend/src/features/barhal/components/BarhalListTable.tsx apps/frontend/src/app/"(dashboard)"/barhal/page.tsx
git rm apps/frontend/src/features/barhal/components/TambahKoliModal.tsx
git commit -m "feat(barhal): wire 4-step wizard into the list page, drop single-modal flow"
```

---

## Task 16: Dashboard page — origin/dest filters and grouping

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts`
- Modify: `apps/frontend/src/features/barhal/components/BarhalRouteChart.tsx`

**Interfaces:**
- Consumes: `BarhalDashboardStats` (Task 9, now keyed by `origin_name`/`dest_name` instead of `route`), `useBarhalStations` (Task 10).
- Produces: dashboard page with Origin + Destinasi filter dropdowns (replacing the single Route dropdown), chart labeled by `${origin_name} → ${dest_name}`.

- [ ] **Step 1: Read the three files to see their current route-based shape**

```bash
cat apps/frontend/src/app/"(dashboard)"/barhal/dashboard/page.tsx
cat apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts
cat apps/frontend/src/features/barhal/components/BarhalRouteChart.tsx
```

- [ ] **Step 2: Update `useBarhalDashboard.ts`**

Replace its `route?: string` query param with `origin?: string; dest?: string`, matching the
`BarhalDashboardQueryDto` shape from Task 3 — mirror the existing hook's structure (query key,
`apiClient.get('/barhal/dashboard', { params })`) but pass the renamed params through.

- [ ] **Step 3: Update `BarhalRouteChart.tsx`**

Replace every reference to `item.route` with `` `${item.origin_name} → ${item.dest_name}` `` for
chart labels/keys, matching `BarhalDashboardRouteItem` from Task 9.

- [ ] **Step 4: Update the dashboard page**

Replace the single Route `<select>` (fed by a now-removed `useBarhalRoutes`) with two `<select>`s
(Origin, Destinasi) fed by `useBarhalStations()` (Task 10), passing `origin`/`dest` state into
`useBarhalDashboard` and into the CSV export link's query params, following the existing page's
state/layout structure for its current single route filter.

- [ ] **Step 5: Type-check the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev` (and the backend dev server), then visit `/barhal` and
`/barhal/dashboard`:
- Create a Koli through all 4 steps end-to-end using real Barhal-tagged TOs.
- Confirm the TO picker in Step 2 only shows TOs with `remarks` containing "barhal".
- Confirm the dashboard's origin/dest filters and chart render without a `route` reference.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/"(dashboard)"/barhal/dashboard/page.tsx apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts apps/frontend/src/features/barhal/components/BarhalRouteChart.tsx
git commit -m "feat(barhal): switch dashboard filters/chart from route to origin+dest"
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** Step 1 (date/origin/dest + ID preview) → Task 11; Step 2 (Barhal-only filter, search/date/origin/dest filters, preview count+weight) → Tasks 4 + 12; Step 3 (weight before/after/kenaikan, PLT, volume, batang kayu) → Tasks 6 + 13; Step 4 (SMU fields + bulk apply by date+dest) → Tasks 6 + 14; TO list columns (Date/Vendor/Origin/Dest/LT/TO/Weight/Remarks) → Tasks 4 + 15; dashboard analytics → Task 16.
- **Type consistency check:** `BarhalKoli.origin_name`/`dest_name` (Task 2 entity) matches `origin_name`/`dest_name` used in Tasks 6, 7, 9, 15, 16 consistently — no leftover `route`/`origin_code`/`dest_code` references after Task 15. `AvailableTo.date` (Task 9) matches the service's aliased `completed_date AS date` (Task 4).
- **Known follow-up (explicitly out of scope per the spec):** no data backfill job for historical Koli rows, since the branch is unreleased.
