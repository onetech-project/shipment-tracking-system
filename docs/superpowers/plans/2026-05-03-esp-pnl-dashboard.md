# ESP P&L Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Profit & Loss dashboard that computes gross margin per Transport Order by joining revenue data from `compileaircgk` against cost rates from the SMU/RA/SG pricing dimension tables.

**Architecture:** Generated columns extract hot JSONB fields from the 5 existing dynamic tables, enabling a regular SQL view (`v_pnl_to`) to compute P&L per TO using weight-share cost allocation. A new NestJS `PnlModule` serves 5 API endpoints consumed by a new `/pnl` Next.js page with KPI cards, trend chart, AWB drilldown, and data quality panel.

**Tech Stack:** TypeORM migrations (PostgreSQL generated columns, regular view), NestJS 10, Jest, Next.js 14 App Router, Recharts 2.7.2, @tanstack/react-query, Tailwind CSS, shadcn/ui

---

## File Map

### Created
- `apps/backend/src/database/migrations/20260503000001-pnl-generated-columns-compile.ts`
- `apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts`
- `apps/backend/src/database/migrations/20260503000003-pnl-view.ts`
- `apps/backend/src/modules/pnl/pnl.module.ts`
- `apps/backend/src/modules/pnl/pnl.service.ts`
- `apps/backend/src/modules/pnl/pnl.controller.ts`
- `apps/backend/src/modules/pnl/pnl.service.spec.ts`
- `apps/backend/src/modules/pnl/pnl.controller.spec.ts`
- `apps/frontend/src/app/(dashboard)/pnl/page.tsx`
- `apps/frontend/src/features/pnl/components/PnlKpiCards.tsx`
- `apps/frontend/src/features/pnl/components/PnlTrendChart.tsx`
- `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`
- `apps/frontend/src/features/pnl/components/PnlDataQuality.tsx`
- `apps/frontend/src/features/pnl/hooks/usePnl.ts`

### Modified
- `apps/backend/src/app.module.ts` — add `PnlModule` import
- `apps/frontend/src/components/layout/sidebar.tsx` — add P&L nav entry under "Air Shipments"

---

## Prerequisite Check

Before running migrations, verify these tables exist (created by Google Sheets sync):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'air_shipments_compileaircgk',
  'air_shipments_smu_rate_cgk_spx',
  'air_shipments_smu',
  'air_shipments_ra',
  'air_shipments_sg_outgoing'
);
```
If any are missing, configure the corresponding Google Sheet in the app first (Sheets sync creates tables on-demand).

---

## Task 1: Migration — Generated Columns on `air_shipments_compileaircgk`

**Files:**
- Create: `apps/backend/src/database/migrations/20260503000001-pnl-generated-columns-compile.ts`

- [ ] **Step 1: Write the migration file**

```typescript
// apps/backend/src/database/migrations/20260503000001-pnl-generated-columns-compile.ts
import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlGeneratedColumnsCompile20260503000001 implements MigrationInterface {
  name = 'PnlGeneratedColumnsCompile20260503000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS awb             TEXT      GENERATED ALWAYS AS (extra_fields->>'awb') STORED,
        ADD COLUMN IF NOT EXISTS to_number       TEXT      GENERATED ALWAYS AS (extra_fields->>'to_number') STORED,
        ADD COLUMN IF NOT EXISTS gross_weight    NUMERIC   GENERATED ALWAYS AS ((extra_fields->>'gross_weight')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS amount_revenue  NUMERIC   GENERATED ALWAYS AS ((extra_fields->>'amount_revenue')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS packing_kayu    NUMERIC   GENERATED ALWAYS AS (
          COALESCE((extra_fields->>'additional_amount_packing_kayu')::NUMERIC, 0)
        ) STORED,
        ADD COLUMN IF NOT EXISTS completed_time  TIMESTAMP GENERATED ALWAYS AS (
          (extra_fields->>'completed_time')::TIMESTAMP
        ) STORED,
        ADD COLUMN IF NOT EXISTS origin_station  TEXT      GENERATED ALWAYS AS (extra_fields->>'origin_station') STORED,
        ADD COLUMN IF NOT EXISTS dest_station    TEXT      GENERATED ALWAYS AS (extra_fields->>'destination_station') STORED,
        ADD COLUMN IF NOT EXISTS cycle_period    TEXT      GENERATED ALWAYS AS (
          TO_CHAR((extra_fields->>'completed_time')::TIMESTAMP, 'YYYY-MM') ||
          CASE WHEN EXTRACT(DAY FROM (extra_fields->>'completed_time')::TIMESTAMP) <= 15
               THEN '-1H' ELSE '-2H' END
        ) STORED
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_awb            ON air_shipments_compileaircgk(awb)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_to_number      ON air_shipments_compileaircgk(to_number)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle          ON air_shipments_compileaircgk(cycle_period)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle_awb      ON air_shipments_compileaircgk(cycle_period, awb)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_completed_time ON air_shipments_compileaircgk(completed_time)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_completed_time`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle_awb`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_to_number`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_awb`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS awb,
        DROP COLUMN IF EXISTS to_number,
        DROP COLUMN IF EXISTS gross_weight,
        DROP COLUMN IF EXISTS amount_revenue,
        DROP COLUMN IF EXISTS packing_kayu,
        DROP COLUMN IF EXISTS completed_time,
        DROP COLUMN IF EXISTS origin_station,
        DROP COLUMN IF EXISTS dest_station,
        DROP COLUMN IF EXISTS cycle_period
    `)
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend && npm run migration:run
```
Expected: `migration PnlGeneratedColumnsCompile20260503000001 has been executed successfully`

- [ ] **Step 3: Verify columns exist**

```bash
cd apps/backend && npm run typeorm -- query "SELECT column_name, generation_expression FROM information_schema.columns WHERE table_name='air_shipments_compileaircgk' AND column_name IN ('awb','cycle_period','gross_weight') LIMIT 5;"
```
Expected: 3 rows returned with non-null `generation_expression`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/migrations/20260503000001-pnl-generated-columns-compile.ts
git commit -m "feat(pnl): add generated columns + indexes to compileaircgk"
```

---

## Task 2: Migration — Generated Columns on Pricing Tables

**Files:**
- Create: `apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts`

- [ ] **Step 1: Write the migration file**

```typescript
// apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts
import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlGeneratedColumnsPricing20260503000002 implements MigrationInterface {
  name = 'PnlGeneratedColumnsPricing20260503000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // smu_rate_cgk_spx
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu_rate_cgk_spx
        ADD COLUMN IF NOT EXISTS awb      TEXT GENERATED ALWAYS AS (extra_fields->>'awb') STORED,
        ADD COLUMN IF NOT EXISTS account  TEXT GENERATED ALWAYS AS (extra_fields->>'account') STORED,
        ADD COLUMN IF NOT EXISTS airlines TEXT GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
        ADD COLUMN IF NOT EXISTS via      TEXT GENERATED ALWAYS AS (extra_fields->>'via') STORED,
        ADD COLUMN IF NOT EXISTS dest     TEXT GENERATED ALWAYS AS (extra_fields->>'dest') STORED,
        ADD COLUMN IF NOT EXISTS ra_name  TEXT GENERATED ALWAYS AS (extra_fields->>'ra') STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_smurate_awb     ON air_shipments_smu_rate_cgk_spx(awb)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_smurate_lookup         ON air_shipments_smu_rate_cgk_spx(account, airlines, via, dest)`)

    // air_shipments_smu (cost dim)
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        ADD COLUMN IF NOT EXISTS vendor                TEXT    GENERATED ALWAYS AS (extra_fields->>'vendor') STORED,
        ADD COLUMN IF NOT EXISTS airlines              TEXT    GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
        ADD COLUMN IF NOT EXISTS origin                TEXT    GENERATED ALWAYS AS (extra_fields->>'origin') STORED,
        ADD COLUMN IF NOT EXISTS destination           TEXT    GENERATED ALWAYS AS (extra_fields->>'destination') STORED,
        ADD COLUMN IF NOT EXISTS total_cost_smu_per_kg NUMERIC GENERATED ALWAYS AS ((extra_fields->>'total_cost_smu_per_kg')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS admin_smu             NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin_smu')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS sg_out                TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_out') STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_smu_lookup ON air_shipments_smu(vendor, airlines, origin, destination)`)

    // air_shipments_ra
    await queryRunner.query(`
      ALTER TABLE air_shipments_ra
        ADD COLUMN IF NOT EXISTS ra_name_lower TEXT    GENERATED ALWAYS AS (LOWER(extra_fields->>'ra_name')) STORED,
        ADD COLUMN IF NOT EXISTS rate          NUMERIC GENERATED ALWAYS AS ((extra_fields->>'rate')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS admin         NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS ppn           NUMERIC GENERATED ALWAYS AS ((extra_fields->>'ppn')::NUMERIC) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_name_lower ON air_shipments_ra(ra_name_lower)`)

    // air_shipments_sg_outgoing
    await queryRunner.query(`
      ALTER TABLE air_shipments_sg_outgoing
        ADD COLUMN IF NOT EXISTS sg_outgoing_name TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_outgoing_name') STORED,
        ADD COLUMN IF NOT EXISTS rate             NUMERIC GENERATED ALWAYS AS ((extra_fields->>'rate')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS admin            NUMERIC GENERATED ALWAYS AS ((extra_fields->>'admin')::NUMERIC) STORED,
        ADD COLUMN IF NOT EXISTS ppn              NUMERIC GENERATED ALWAYS AS ((extra_fields->>'ppn')::NUMERIC) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_outgoing_name ON air_shipments_sg_outgoing(sg_outgoing_name)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sg_outgoing_name`)
    await queryRunner.query(`ALTER TABLE air_shipments_sg_outgoing DROP COLUMN IF EXISTS sg_outgoing_name, DROP COLUMN IF EXISTS rate, DROP COLUMN IF EXISTS admin, DROP COLUMN IF EXISTS ppn`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ra_name_lower`)
    await queryRunner.query(`ALTER TABLE air_shipments_ra DROP COLUMN IF EXISTS ra_name_lower, DROP COLUMN IF EXISTS rate, DROP COLUMN IF EXISTS admin, DROP COLUMN IF EXISTS ppn`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_smu_lookup`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu DROP COLUMN IF EXISTS vendor, DROP COLUMN IF EXISTS airlines, DROP COLUMN IF EXISTS origin, DROP COLUMN IF EXISTS destination, DROP COLUMN IF EXISTS total_cost_smu_per_kg, DROP COLUMN IF EXISTS admin_smu, DROP COLUMN IF EXISTS sg_out`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_smurate_lookup`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_smurate_awb`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu_rate_cgk_spx DROP COLUMN IF EXISTS awb, DROP COLUMN IF EXISTS account, DROP COLUMN IF EXISTS airlines, DROP COLUMN IF EXISTS via, DROP COLUMN IF EXISTS dest, DROP COLUMN IF EXISTS ra_name`)
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend && npm run migration:run
```
Expected: `migration PnlGeneratedColumnsPricing20260503000002 has been executed successfully`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/database/migrations/20260503000002-pnl-generated-columns-pricing.ts
git commit -m "feat(pnl): add generated columns + indexes to pricing dimension tables"
```

---

## Task 3: Migration — Create `v_pnl_to` View

**Files:**
- Create: `apps/backend/src/database/migrations/20260503000003-pnl-view.ts`

- [ ] **Step 1: Write the migration** (note: `awb_cost` CTE uses `a` for its internal awb_totals join; outer SELECT joins `awb_cost ac` and uses `ac.sum_gw_per_awb`. The `JOIN awb_totals at` in the outer FROM is redundant but harmless)

```typescript
// apps/backend/src/database/migrations/20260503000003-pnl-view.ts
import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlView20260503000003 implements MigrationInterface {
  name = 'PnlView20260503000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_pnl_to AS
      WITH
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb
        FROM air_shipments_compileaircgk
        GROUP BY awb
      ),
      booking AS (
        SELECT awb, account AS vendor, airlines, via, dest, ra_name
        FROM air_shipments_smu_rate_cgk_spx
      ),
      smu_price AS (
        SELECT
          b.awb,
          s.total_cost_smu_per_kg AS smu_rate_per_kg,
          s.admin_smu,
          s.sg_out                AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON  s.vendor      = b.vendor
          AND s.airlines    = b.airlines
          AND s.origin      = b.via
          AND s.destination = b.dest
      ),
      ra_price AS (
        SELECT
          b.awb,
          r.rate  AS ra_rate,
          r.admin AS ra_admin,
          r.ppn   AS ra_ppn,
          b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r
          ON r.ra_name_lower = LOWER(b.ra_name)
      ),
      sg_price AS (
        SELECT
          sp.awb,
          sg.rate  AS sg_rate,
          sg.admin AS sg_admin,
          sg.ppn   AS sg_ppn,
          sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name = sp.sg_out_name
      ),
      awb_cost AS (
        SELECT
          a.awb,
          a.sum_gw_per_awb,
          -- SMU: NULL when lookup fails (data quality issue)
          CASE
            WHEN sp.smu_rate_per_kg IS NULL THEN NULL
            ELSE a.sum_gw_per_awb * sp.smu_rate_per_kg + COALESCE(sp.admin_smu, 0)
          END AS cost_smu,
          -- RA: 0 if no RA assigned or "Include*" bundled, NULL if lookup failed
          CASE
            WHEN b.ra_name IS NULL OR b.ra_name = ''           THEN 0
            WHEN LOWER(rp.ra_name) LIKE 'include%'             THEN 0
            WHEN rp.ra_rate IS NULL                            THEN NULL
            ELSE a.sum_gw_per_awb * rp.ra_rate * (1 + COALESCE(rp.ra_ppn, 0)) + COALESCE(rp.ra_admin, 0)
          END AS cost_ra,
          -- SG Outgoing: 0 if none or "Include*", NULL if lookup failed
          CASE
            WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
            WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
            WHEN sgp.sg_rate IS NULL                           THEN NULL
            ELSE a.sum_gw_per_awb * sgp.sg_rate * (1 + COALESCE(sgp.sg_ppn, 0)) + COALESCE(sgp.sg_admin, 0)
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking  b   ON b.awb   = a.awb
        LEFT JOIN smu_price sp ON sp.awb  = a.awb
        LEFT JOIN ra_price  rp ON rp.awb  = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
      )
      SELECT
        c.to_number,
        c.awb,
        c.completed_time,
        c.cycle_period,
        c.origin_station,
        c.dest_station,
        b.vendor,
        b.airlines                                                            AS airline,

        -- Weight
        c.gross_weight,
        ac.sum_gw_per_awb,
        c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)                        AS weight_share,

        -- Revenue per TO
        c.amount_revenue                                                      AS revenue_freight,
        c.packing_kayu                                                        AS revenue_packing,
        c.amount_revenue + c.packing_kayu                                     AS revenue_total,

        -- AWB-level cost (for drilldown traceability)
        ac.cost_smu                                                           AS cost_smu_awb,
        ac.cost_ra                                                            AS cost_ra_awb,
        ac.cost_sg_out                                                        AS cost_sg_out_awb,
        ac.cost_smu + ac.cost_ra + ac.cost_sg_out                             AS cost_total_awb,

        -- TO-level cost allocated by weight share
        (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
          * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                   AS cost_to,

        -- P&L
        (c.amount_revenue + c.packing_kayu)
          - (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
            * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                 AS gross_profit_to

      FROM air_shipments_compileaircgk c
      JOIN awb_totals at ON at.awb = c.awb
      LEFT JOIN booking  b  ON b.awb  = c.awb
      LEFT JOIN awb_cost ac ON ac.awb = c.awb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_pnl_to`)
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend && npm run migration:run
```
Expected: `migration PnlView20260503000003 has been executed successfully`

- [ ] **Step 3: Smoke test the view against spec sanity check (AWB 126-92225630)**

```bash
cd apps/backend && npm run typeorm -- query "
SELECT awb, SUM(revenue_total) AS rev, MAX(cost_total_awb) AS cost, MAX(cost_total_awb) - SUM(revenue_total) * -1 AS gp
FROM v_pnl_to
WHERE awb = '126-92225630'
GROUP BY awb;
"
```
Expected: `rev ≈ 10118006.92`, `cost ≈ 8359931.54`, computed GP ≈ 1758075.38 (matches spec section 4)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/migrations/20260503000003-pnl-view.ts
git commit -m "feat(pnl): create v_pnl_to view for TO-level P&L computation"
```

---

## Task 4: NestJS PnlModule Scaffold + Summary Endpoint

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl.module.ts`
- Create: `apps/backend/src/modules/pnl/pnl.service.ts`
- Create: `apps/backend/src/modules/pnl/pnl.controller.ts`
- Create: `apps/backend/src/modules/pnl/pnl.service.spec.ts`
- Create: `apps/backend/src/modules/pnl/pnl.controller.spec.ts`

- [ ] **Step 1: Write the failing service test**

```typescript
// apps/backend/src/modules/pnl/pnl.service.spec.ts
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { PnlService } from './pnl.service'

describe('PnlService', () => {
  let service: PnlService
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    const module = await Test.createTestingModule({
      providers: [
        PnlService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile()
    service = module.get(PnlService)
  })

  describe('getSummary', () => {
    it('returns aggregated P&L for a cycle', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '100',
        total_awbs: '10',
        total_revenue: '5000000',
        total_cost: '4000000',
        gross_profit: '1000000',
      }])

      const result = await service.getSummary('2026-04-2H')

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('v_pnl_to'),
        ['2026-04-2H'],
      )
      expect(result).toEqual({
        cyclePeriod: '2026-04-2H',
        totalTos: 100,
        totalAwbs: 10,
        totalRevenue: 5000000,
        totalCost: 4000000,
        grossProfit: 1000000,
        grossMarginPct: 20,
      })
    })
  })

  describe('getCycles', () => {
    it('returns distinct cycle periods ordered desc', async () => {
      dataSource.query.mockResolvedValueOnce([
        { cycle_period: '2026-04-2H' },
        { cycle_period: '2026-04-1H' },
      ])

      const result = await service.getCycles()
      expect(result).toEqual(['2026-04-2H', '2026-04-1H'])
    })
  })
})
```

- [ ] **Step 2: Run the failing test**

```bash
cd apps/backend && npx jest pnl.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './pnl.service'`

- [ ] **Step 3: Write the service implementation**

```typescript
// apps/backend/src/modules/pnl/pnl.service.ts
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

export interface PnlSummary {
  cyclePeriod: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPct: number
}

export interface PnlTrendItem {
  cyclePeriod: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  totalTos: number
}

export interface PnlAwbRow {
  awb: string
  vendor: string | null
  airline: string | null
  toCount: number
  sumGw: number
  totalRevenue: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
}

@Injectable()
export class PnlService {
  constructor(private readonly dataSource: DataSource) {}

  async getCycles(): Promise<string[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT cycle_period
      FROM v_pnl_to
      WHERE cycle_period IS NOT NULL
      ORDER BY cycle_period DESC
    `)
    return rows.map((r: { cycle_period: string }) => r.cycle_period)
  }

  async getSummary(cyclePeriod: string): Promise<PnlSummary> {
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int                           AS total_tos,
        COUNT(DISTINCT awb)::int                AS total_awbs,
        COALESCE(SUM(revenue_total), 0)         AS total_revenue,
        COALESCE(SUM(cost_to), 0)               AS total_cost,
        COALESCE(SUM(gross_profit_to), 0)       AS gross_profit
      FROM v_pnl_to
      WHERE cycle_period = $1
      `,
      [cyclePeriod],
    )
    const row = rows[0]
    const totalRevenue = Number(row.total_revenue)
    const grossProfit = Number(row.gross_profit)
    return {
      cyclePeriod,
      totalTos: Number(row.total_tos),
      totalAwbs: Number(row.total_awbs),
      totalRevenue,
      totalCost: Number(row.total_cost),
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    }
  }

  async getTrend(): Promise<PnlTrendItem[]> {
    const rows = await this.dataSource.query(`
      SELECT
        cycle_period,
        COALESCE(SUM(revenue_total), 0)   AS total_revenue,
        COALESCE(SUM(cost_to), 0)         AS total_cost,
        COALESCE(SUM(gross_profit_to), 0) AS gross_profit,
        COUNT(*)::int                     AS total_tos
      FROM v_pnl_to
      WHERE cycle_period IS NOT NULL
      GROUP BY cycle_period
      ORDER BY cycle_period
    `)
    return rows.map((r: Record<string, string>) => ({
      cyclePeriod: r.cycle_period,
      totalRevenue: Number(r.total_revenue),
      totalCost: Number(r.total_cost),
      grossProfit: Number(r.gross_profit),
      totalTos: Number(r.total_tos),
    }))
  }

  async getAwbDrilldown(
    cyclePeriod: string,
    page: number,
    limit: number,
  ): Promise<{ data: PnlAwbRow[]; total: number }> {
    const offset = (page - 1) * limit
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          awb,
          vendor,
          airline,
          COUNT(*)::int                           AS to_count,
          SUM(gross_weight)                       AS sum_gw,
          COALESCE(SUM(revenue_total), 0)         AS total_revenue,
          MAX(cost_smu_awb)                       AS cost_smu,
          MAX(cost_ra_awb)                        AS cost_ra,
          MAX(cost_sg_out_awb)                    AS cost_sg_out,
          MAX(cost_total_awb)                     AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          (MAX(cost_total_awb) IS NULL)            AS has_null_cost
        FROM v_pnl_to
        WHERE cycle_period = $1
        GROUP BY awb, vendor, airline
        ORDER BY SUM(revenue_total) DESC NULLS LAST
        LIMIT $2 OFFSET $3
        `,
        [cyclePeriod, limit, offset],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to WHERE cycle_period = $1`,
        [cyclePeriod],
      ),
    ])
    const total = Number(countRows[0].total)
    const data: PnlAwbRow[] = rows.map((r: Record<string, unknown>) => {
      const rev = Number(r.total_revenue)
      const gp = Number(r.gross_profit)
      const totalCost = r.total_cost != null ? Number(r.total_cost) : null
      return {
        awb: r.awb as string,
        vendor: r.vendor as string | null,
        airline: r.airline as string | null,
        toCount: Number(r.to_count),
        sumGw: Number(r.sum_gw),
        totalRevenue: rev,
        costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
        costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
        costSgOut: r.cost_sg_out != null ? Number(r.cost_sg_out) : null,
        totalCost,
        grossProfit: gp,
        grossMarginPct: rev > 0 ? (gp / rev) * 100 : null,
        hasNullCost: r.has_null_cost === true || r.has_null_cost === 't',
      }
    })
    return { data, total }
  }

  async getDataQuality(): Promise<PnlDataQualityItem[]> {
    const rows = await this.dataSource.query(`
      SELECT
        to_number,
        awb,
        CASE
          WHEN cost_smu_awb IS NULL AND cost_ra_awb IS NULL AND cost_sg_out_awb IS NULL
            THEN 'all_cost_lookup_failed'
          WHEN cost_smu_awb IS NULL THEN 'smu_lookup_failed'
          WHEN cost_ra_awb IS NULL  THEN 'ra_lookup_failed'
          WHEN cost_sg_out_awb IS NULL THEN 'sg_lookup_failed'
          ELSE 'unknown'
        END AS issue
      FROM v_pnl_to
      WHERE cost_to IS NULL
      ORDER BY awb, to_number
      LIMIT 500
    `)
    return rows.map((r: Record<string, string>) => ({
      toNumber: r.to_number,
      awb: r.awb,
      issue: r.issue,
    }))
  }
}
```

- [ ] **Step 4: Write the failing controller test**

```typescript
// apps/backend/src/modules/pnl/pnl.controller.spec.ts
import { Test } from '@nestjs/testing'
import { PnlController } from './pnl.controller'
import { PnlService } from './pnl.service'

const mockService = {
  getCycles: jest.fn(),
  getSummary: jest.fn(),
  getTrend: jest.fn(),
  getAwbDrilldown: jest.fn(),
  getDataQuality: jest.fn(),
}

describe('PnlController', () => {
  let controller: PnlController

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PnlController],
      providers: [{ provide: PnlService, useValue: mockService }],
    }).compile()
    controller = module.get(PnlController)
    jest.clearAllMocks()
  })

  it('getCycles delegates to service', async () => {
    mockService.getCycles.mockResolvedValueOnce(['2026-04-2H'])
    expect(await controller.getCycles()).toEqual(['2026-04-2H'])
  })

  it('getSummary passes cycle query param', async () => {
    mockService.getSummary.mockResolvedValueOnce({ cyclePeriod: '2026-04-2H' })
    await controller.getSummary('2026-04-2H')
    expect(mockService.getSummary).toHaveBeenCalledWith('2026-04-2H')
  })

  it('getAwbDrilldown defaults page=1 limit=50', async () => {
    mockService.getAwbDrilldown.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getAwbDrilldown('2026-04-2H', 1, 50)
    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith('2026-04-2H', 1, 50)
  })
})
```

- [ ] **Step 5: Write the controller and module**

```typescript
// apps/backend/src/modules/pnl/pnl.controller.ts
import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PnlService } from './pnl.service'

@Controller('pnl')
@UseGuards(JwtAuthGuard)
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('cycles')
  getCycles() {
    return this.pnlService.getCycles()
  }

  @Get('summary')
  getSummary(@Query('cycle') cycle: string) {
    return this.pnlService.getSummary(cycle)
  }

  @Get('trend')
  getTrend() {
    return this.pnlService.getTrend()
  }

  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('cycle') cycle: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.pnlService.getAwbDrilldown(cycle, page, limit)
  }

  @Get('data-quality')
  getDataQuality() {
    return this.pnlService.getDataQuality()
  }
}
```

```typescript
// apps/backend/src/modules/pnl/pnl.module.ts
import { Module } from '@nestjs/common'
import { PnlService } from './pnl.service'
import { PnlController } from './pnl.controller'

@Module({
  controllers: [PnlController],
  providers: [PnlService],
})
export class PnlModule {}
```

- [ ] **Step 6: Run all pnl tests**

```bash
cd apps/backend && npx jest pnl --no-coverage
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/
git commit -m "feat(pnl): add PnlModule with summary, trend, drilldown, and data-quality endpoints"
```

---

## Task 5: Register PnlModule in app.module.ts

**Files:**
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Add PnlModule import**

In `apps/backend/src/app.module.ts`, add after the `AirShipmentsModule` import line:
```typescript
import { PnlModule } from './modules/pnl/pnl.module'
```

And in the `imports` array, add `PnlModule` after `AirShipmentsModule`:
```typescript
AirShipmentsModule,
GeneralParamsModule,
PnlModule,
```

- [ ] **Step 2: Verify backend compiles**

```bash
cd apps/backend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/app.module.ts
git commit -m "feat(pnl): register PnlModule in AppModule"
```

---

## Task 6: Frontend — P&L Page Route + Sidebar Nav

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`
- Modify: `apps/frontend/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create the page scaffold**

```typescript
// apps/frontend/src/app/(dashboard)/pnl/page.tsx
'use client'

export default function PnlPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">P&amp;L Analysis</h1>
        <p className="text-muted-foreground text-sm">Air shipment profit &amp; loss by billing cycle</p>
      </div>
      <p className="text-muted-foreground">Loading…</p>
    </div>
  )
}
```

- [ ] **Step 2: Add sidebar nav entry**

In `apps/frontend/src/components/layout/sidebar.tsx`, add `TrendingUp` to the lucide import line:
```typescript
import {
  LayoutDashboard, Users, Shield, Building2, Mail, Key, ClipboardList, LogOut, Plane, TrendingUp,
} from 'lucide-react'
```

Inside the "Air Shipments" section, after the existing `NavLink` for `/air-shipments`, add:
```tsx
<NavLink
  href="/pnl"
  icon={<TrendingUp size={16} />}
  label="P&L Analysis"
  onClick={onNavClick}
/>
```

Also add it to `MobileDrawer` if it uses the same `Sidebar` component (check — if `MobileDrawer` renders `<Sidebar onNavClick={close} />` it's handled automatically).

- [ ] **Step 3: Verify frontend builds**

```bash
cd apps/frontend && npx next build 2>&1 | tail -20
```
Expected: No TypeScript/build errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(dashboard\)/pnl/page.tsx apps/frontend/src/components/layout/sidebar.tsx
git commit -m "feat(pnl): add P&L page route and sidebar nav entry"
```

---

## Task 7: Frontend — usePnl Hook + KPI Cards

**Files:**
- Create: `apps/frontend/src/features/pnl/hooks/usePnl.ts`
- Create: `apps/frontend/src/features/pnl/components/PnlKpiCards.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`

- [ ] **Step 1: Write the usePnl hook**

```typescript
// apps/frontend/src/features/pnl/hooks/usePnl.ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export interface PnlSummary {
  cyclePeriod: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPct: number
}

export interface PnlTrendItem {
  cyclePeriod: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  totalTos: number
}

export interface PnlAwbRow {
  awb: string
  vendor: string | null
  airline: string | null
  toCount: number
  sumGw: number
  totalRevenue: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
}

export function usePnlCycles() {
  return useQuery<string[]>({
    queryKey: ['pnl', 'cycles'],
    queryFn: () => apiClient.get('/pnl/cycles').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlSummary(cyclePeriod: string | undefined) {
  return useQuery<PnlSummary>({
    queryKey: ['pnl', 'summary', cyclePeriod],
    queryFn: () =>
      apiClient.get('/pnl/summary', { params: { cycle: cyclePeriod } }).then((r) => r.data),
    enabled: !!cyclePeriod,
    staleTime: 60 * 1000,
  })
}

export function usePnlTrend() {
  return useQuery<PnlTrendItem[]>({
    queryKey: ['pnl', 'trend'],
    queryFn: () => apiClient.get('/pnl/trend').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlAwbDrilldown(
  cyclePeriod: string | undefined,
  page: number,
  limit = 50,
) {
  return useQuery<{ data: PnlAwbRow[]; total: number }>({
    queryKey: ['pnl', 'awb-drilldown', cyclePeriod, page, limit],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-drilldown', { params: { cycle: cyclePeriod, page, limit } })
        .then((r) => r.data),
    enabled: !!cyclePeriod,
    staleTime: 60 * 1000,
  })
}

export function usePnlDataQuality() {
  return useQuery<PnlDataQualityItem[]>({
    queryKey: ['pnl', 'data-quality'],
    queryFn: () => apiClient.get('/pnl/data-quality').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Write the KPI cards component**

```typescript
// apps/frontend/src/features/pnl/components/PnlKpiCards.tsx
'use client'

import { PnlSummary } from '../hooks/usePnl'

const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const pct = (n: number) => `${n.toFixed(1)}%`
const num = (n: number) => n.toLocaleString('id-ID')

interface KpiCardProps {
  label: string
  value: string
  sub?: string
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface PnlKpiCardsProps {
  summary: PnlSummary
}

export function PnlKpiCards({ summary }: PnlKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="Total Revenue"   value={fmt.format(summary.totalRevenue)} />
      <KpiCard label="Total Cost"      value={fmt.format(summary.totalCost)} />
      <KpiCard label="Gross Profit"    value={fmt.format(summary.grossProfit)} />
      <KpiCard label="Gross Margin"    value={pct(summary.grossMarginPct)} />
      <KpiCard label="Total TOs"       value={num(summary.totalTos)} />
      <KpiCard label="Total AWBs"      value={num(summary.totalAwbs)} />
    </div>
  )
}
```

- [ ] **Step 3: Wire up page with cycle selector + KPI cards**

```typescript
// apps/frontend/src/app/(dashboard)/pnl/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { usePnlCycles, usePnlSummary } from '@/features/pnl/hooks/usePnl'
import { PnlKpiCards } from '@/features/pnl/components/PnlKpiCards'

export default function PnlPage() {
  const { data: cycles } = usePnlCycles()
  const [cycle, setCycle] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cycles && cycles.length > 0 && !cycle) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  const { data: summary, isLoading } = usePnlSummary(cycle)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Analysis</h1>
          <p className="text-muted-foreground text-sm">Air shipment profit &amp; loss by billing cycle</p>
        </div>
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={cycle ?? ''}
          onChange={(e) => setCycle(e.target.value)}
        >
          {cycles?.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading summary…</p>}
      {summary && <PnlKpiCards summary={summary} />}
    </div>
  )
}
```

- [ ] **Step 4: Start dev server and verify KPI cards render**

```bash
cd apps/frontend && npm run dev
```
Navigate to `http://localhost:3000/pnl` while logged in. Verify:
- Cycle selector shows available cycles
- 6 KPI cards render with IDR-formatted values
- No console errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/ apps/frontend/src/app/\(dashboard\)/pnl/page.tsx
git commit -m "feat(pnl): add cycle selector, KPI cards, and usePnl hooks"
```

---

## Task 8: Frontend — Trend Chart

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlTrendChart.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`

- [ ] **Step 1: Write the trend chart component**

```typescript
// apps/frontend/src/features/pnl/components/PnlTrendChart.tsx
'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { PnlTrendItem } from '../hooks/usePnl'

const fmtIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'IDR' }).format(v)

interface PnlTrendChartProps {
  data: PnlTrendItem[]
}

export function PnlTrendChart({ data }: PnlTrendChartProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-4 text-sm font-medium">Revenue vs Cost vs Profit — All Cycles</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="cyclePeriod" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtIDR} tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={(value: number) => fmtIDR(value)} />
          <Legend />
          <Line type="monotone" dataKey="totalRevenue" name="Revenue"     stroke="#3B82F6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="totalCost"    name="Cost"        stroke="#EF4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="grossProfit"  name="Gross Profit" stroke="#22C55E" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Add trend chart to page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`:
1. Add imports:
```typescript
import { usePnlTrend } from '@/features/pnl/hooks/usePnl'
import { PnlTrendChart } from '@/features/pnl/components/PnlTrendChart'
```
2. Add hook call after `usePnlSummary`:
```typescript
const { data: trendData } = usePnlTrend()
```
3. Add chart below KPI cards in the JSX:
```tsx
{trendData && trendData.length > 0 && <PnlTrendChart data={trendData} />}
```

- [ ] **Step 3: Verify chart renders with 3 lines**

In browser at `/pnl`: trend chart should show Revenue (blue), Cost (red), Gross Profit (green) lines. Hover tooltips show IDR values.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlTrendChart.tsx apps/frontend/src/app/\(dashboard\)/pnl/page.tsx
git commit -m "feat(pnl): add trend chart with Revenue/Cost/Profit lines"
```

---

## Task 9: Frontend — AWB Drilldown Table

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`

- [ ] **Step 1: Write the AWB drilldown table**

```typescript
// apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx
'use client'

import { useState } from 'react'
import { usePnlAwbDrilldown } from '../hooks/usePnl'

const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`)

interface PnlAwbDrilldownProps {
  cyclePeriod: string
}

export function PnlAwbDrilldown({ cyclePeriod }: PnlAwbDrilldownProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePnlAwbDrilldown(cyclePeriod, page)
  const totalPages = data ? Math.ceil(data.total / 50) : 0

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">AWB Drilldown — {cyclePeriod}</p>
        {data && <p className="text-xs text-muted-foreground">{data.total} AWBs</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Airline</th>
              <th className="px-3 py-2 text-right">TOs</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost SMU</th>
              <th className="px-3 py-2 text-right">Cost RA</th>
              <th className="px-3 py-2 text-right">Cost SG</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
              <th className="px-3 py-2 text-right">GP</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {data?.data.map((row) => (
              <tr key={row.awb} className={`border-b hover:bg-muted/50 ${row.hasNullCost ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{row.awb}</td>
                <td className="px-3 py-2">{row.vendor ?? '—'}</td>
                <td className="px-3 py-2">{row.airline ?? '—'}</td>
                <td className="px-3 py-2 text-right">{row.toCount}</td>
                <td className="px-3 py-2 text-right">{fmt.format(row.totalRevenue)}</td>
                <td className="px-3 py-2 text-right">{row.costSmu != null ? fmt.format(row.costSmu) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.costRa != null ? fmt.format(row.costRa) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.costSgOut != null ? fmt.format(row.costSgOut) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.totalCost != null ? fmt.format(row.totalCost) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.grossProfit != null ? fmt.format(row.grossProfit) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{pct(row.grossMarginPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add drilldown to page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`:
1. Add import: `import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'`
2. Add below the trend chart:
```tsx
{cycle && <PnlAwbDrilldown cyclePeriod={cycle} />}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/pnl`. AWB table should:
- Show per-AWB revenue, cost components, and margin
- Highlight rows with amber background when `hasNullCost` is true
- Show NULL in amber text for missing cost components
- Paginate with Previous/Next buttons

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx apps/frontend/src/app/\(dashboard\)/pnl/page.tsx
git commit -m "feat(pnl): add AWB drilldown table with pagination and NULL cost flags"
```

---

## Task 10: Frontend — Data Quality Panel

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlDataQuality.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`

- [ ] **Step 1: Write the data quality panel**

```typescript
// apps/frontend/src/features/pnl/components/PnlDataQuality.tsx
'use client'

import { usePnlDataQuality } from '../hooks/usePnl'
import { AlertTriangle } from 'lucide-react'

const ISSUE_LABELS: Record<string, string> = {
  smu_lookup_failed:       'SMU rate not found',
  ra_lookup_failed:        'RA rate not found',
  sg_lookup_failed:        'SG Outgoing rate not found',
  all_cost_lookup_failed:  'All cost lookups failed',
  unknown:                 'Unknown cost issue',
}

export function PnlDataQuality() {
  const { data, isLoading } = usePnlDataQuality()

  if (isLoading) return null
  if (!data || data.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
        <AlertTriangle size={16} className="text-amber-600" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Data Quality Issues — {data.length} TOs with missing cost data
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              <th className="px-3 py-2 text-left">TO Number</th>
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Issue</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 50).map((row, i) => (
              <tr key={i} className="border-b border-amber-100 dark:border-amber-900">
                <td className="px-3 py-1.5 font-mono text-xs">{row.toNumber ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{row.awb}</td>
                <td className="px-3 py-1.5 text-amber-700 dark:text-amber-300">
                  {ISSUE_LABELS[row.issue] ?? row.issue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 50 && (
          <p className="px-4 py-2 text-xs text-amber-600">Showing first 50 of {data.length} issues</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add data quality panel to page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`:
1. Add import: `import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'`
2. Add at the bottom of the page JSX (after AWB drilldown):
```tsx
<PnlDataQuality />
```

- [ ] **Step 3: Verify in browser**

Navigate to `/pnl`. If there are TOs with NULL cost (lookup failed):
- An amber-bordered panel appears below the AWB table
- Lists TO number, AWB, and human-readable issue description
- If all lookups succeed, panel is hidden

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlDataQuality.tsx apps/frontend/src/app/\(dashboard\)/pnl/page.tsx
git commit -m "feat(pnl): add data quality panel for NULL cost TOs"
```

---

## Verification

End-to-end test against spec sanity check (AWB 126-92225630, spec Section 4):

```bash
# 1. Check view returns correct values for the sample AWB
cd apps/backend && npm run typeorm -- query "
SELECT
  awb,
  SUM(revenue_total)   AS total_revenue,
  MAX(cost_total_awb)  AS total_cost,
  MAX(cost_smu_awb)    AS cost_smu,
  MAX(cost_ra_awb)     AS cost_ra,
  MAX(cost_sg_out_awb) AS cost_sg_out
FROM v_pnl_to
WHERE awb = '126-92225630'
GROUP BY awb;
"
```

Expected (from spec §4):
- `total_revenue ≈ 10,118,006.92`
- `cost_smu ≈ 8,040,864.26`
- `cost_ra ≈ 319,067.28`
- `cost_sg_out = 0`
- `total_cost ≈ 8,359,931.54`
- GP = `total_revenue - total_cost ≈ 1,758,075.38` → margin ≈ 17.38%

```bash
# 2. Backend unit tests
cd apps/backend && npx jest pnl --no-coverage
# Expected: all PASS

# 3. Backend compilation
cd apps/backend && npx tsc --noEmit
# Expected: no errors

# 4. Frontend build
cd apps/frontend && npx next build 2>&1 | tail -10
# Expected: compiled successfully

# 5. API smoke test (requires running backend)
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/pnl/cycles
# Expected: JSON array of cycle strings like ["2026-04-2H", ...]
```

---

## Known Data Quality Issues (from spec §6)

Handle these via the data quality panel — do NOT silently default to 0:
- `MLC` account → no row in `air_shipments_smu` → cost_smu = NULL
- `RA BDL` → no row in `air_shipments_ra` → cost_ra = NULL
- `RA CMU` vs `CMU` naming mismatch → cost_ra = NULL (case mismatch handled by LOWER join, but name prefix mismatch is not)
- `SG GADOM` vs `SG GA-DOM` → cost_sg_out = NULL
- `Power Express` → no row in `air_shipments_sg_outgoing` → cost_sg_out = NULL

These surface in the data quality panel and are action items for the pricing table data owners.
