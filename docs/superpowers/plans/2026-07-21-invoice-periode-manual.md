# Periode Invoice Manual Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DATE-derived `invoice_period` in PnL Actual vs Estimate with a periode invoice manually selected by the user at settlement-upload time, stored per-shipment and applied to every row in that upload batch.

**Architecture:** Add 3 nullable columns (`invoice_period_label`, `invoice_period_start`, `invoice_period_end`) to `air_shipments_compileaircgk` via a TypeORM migration that also rebuilds `v_pnl_to` to select `invoice_period_label` directly (dropping the old `parse_flexible_timestamp(extra_fields->>'date')` derivation). The settlement commit endpoint accepts the chosen period alongside the file and writes it into the same bulk `UPDATE ... FROM (VALUES ...)` that already sets `actual_revenue`/`settled_at`. The frontend upload dialog gets a period dropdown (last 4 bi-weekly periods + Custom) that must be filled before the file picker is usable, and sends the period fields with the commit request.

**Tech Stack:** NestJS + TypeORM (raw SQL migrations), PostgreSQL materialized view, Next.js App Router + React Query, plain HTML `<select>`/`<input type="date">` (existing project convention, no date-picker library).

## Global Constraints

- Migration file naming: `YYYYMMDDHHMMSS-<kebab-description>.ts` in `apps/backend/src/database/migrations/`, matching the existing sequence (latest is `20260718000001-pnl-invoice-period.ts`). Use `20260721000001-pnl-invoice-period-manual.ts`.
- Every `v_pnl_to`-rebuilding migration must recreate all 8 indexes (`idx_v_pnl_to_id`, `_cycle`, `_awb`, `_completed_time`, `_cycle_awb`, `_cycle_completed`, `_cycle_ata`, `_cycle_atd`) exactly as in prior migrations — copy verbatim.
- Frontend test files must be named `*.spec.ts`/`*.spec.tsx` (jest.config.ts `testRegex: '.*\\.spec\\.(ts|tsx)$'`) — `*.test.ts` will NOT be picked up.
- Backend tests: `pnl-settlement.service.spec.ts` and `pnl-settlement.controller.spec.ts` already exist — extend them, matching their existing mock style (`dataSource = { query: jest.fn(), transaction: jest.fn() }`, `mockService` object in controller spec).
- No new "upload batch" table — write directly onto `air_shipments_compileaircgk` per existing pattern (spec: Out of scope).
- Old settled rows with `invoice_period_label IS NULL` must render `-`/`—` in the UI — no fallback to the old DATE-derived logic (already true today via `r.invoicePeriod ?? '—'` in `SettlementView.tsx:151`, but must NOT regress).

---

## File Structure

- **Create:** `apps/backend/src/database/migrations/20260721000001-pnl-invoice-period-manual.ts` — adds the 3 columns, rebuilds `v_pnl_to`.
- **Modify:** `apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts` — `commit()` accepts a period param, writes it in the bulk UPDATE.
- **Modify:** `apps/backend/src/modules/pnl-settlement/pnl-settlement.controller.ts` — `commit()` reads/validates 3 new body fields.
- **Modify:** `apps/backend/src/modules/pnl-settlement/pnl-settlement.service.spec.ts`, `pnl-settlement.controller.spec.ts` — new/updated test cases.
- **Create:** `apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.ts` — `getLastInvoicePeriods(n, today)` + `buildCustomPeriod(start, end)` helpers.
- **Create:** `apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.spec.ts` — tests for the helper.
- **Modify:** `apps/frontend/src/features/pnl-settlement/hooks/useSettlement.ts` — `useSettlementCommit()` mutation takes `{ file, periodLabel, periodStart, periodEnd }`.
- **Modify:** `apps/frontend/src/features/pnl-settlement/components/SettlementUploadDialog.tsx` — period dropdown + custom range inputs, gates file picker.

---

### Task 1: Migration — add invoice period columns and rebuild `v_pnl_to`

**Files:**
- Create: `apps/backend/src/database/migrations/20260721000001-pnl-invoice-period-manual.ts`

**Interfaces:**
- Produces: columns `air_shipments_compileaircgk.invoice_period_label TEXT`, `.invoice_period_start DATE`, `.invoice_period_end DATE`. `v_pnl_to.invoice_period` now selects `c.invoice_period_label` directly (same column name/position as before, so `pnl-settlement.service.ts` queries need no column-name changes).

- [ ] **Step 1: Write the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm'

// Replaces the DATE-derived invoice_period (20260718000001) with a value the user picks manually
// at settlement-upload time. Adds invoice_period_label/_start/_end to the fact table, populated by
// the commit endpoint alongside actual_revenue/settled_at. v_pnl_to now selects
// invoice_period_label directly — the parse_flexible_timestamp(extra_fields->>'date') derivation
// is removed entirely (not kept as a fallback): rows settled before this migration keep
// invoice_period_label NULL and show up as NULL in v_pnl_to.invoice_period until re-settled.
//
// Body mirrors 20260718000001-pnl-invoice-period (deduped booking CTE); only the invoice_period
// source changes. down() re-emits the DATE-derived version from that migration verbatim.
export class PnlInvoicePeriodManual20260721000001 implements MigrationInterface {
  name = 'PnlInvoicePeriodManual20260721000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS invoice_period_label TEXT,
        ADD COLUMN IF NOT EXISTS invoice_period_start  DATE,
        ADD COLUMN IF NOT EXISTS invoice_period_end    DATE
    `)

    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(true))
    await this.createIndexes(queryRunner)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(false))
    await this.createIndexes(queryRunner)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS invoice_period_label,
        DROP COLUMN IF EXISTS invoice_period_start,
        DROP COLUMN IF EXISTS invoice_period_end
    `)
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_completed ON v_pnl_to(cycle_completed)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_ata ON v_pnl_to(cycle_ata)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_atd ON v_pnl_to(cycle_atd)`)
  }

  private viewSql(withManualPeriod: boolean): string {
    const invoiceBase = withManualPeriod
      ? `c.invoice_period_label                             AS invoice_period,`
      : `parse_flexible_timestamp(c.extra_fields->>'date')     AS invoice_date,`
    const invoiceOut = withManualPeriod
      ? ``
      : `CASE WHEN invoice_date IS NULL THEN NULL
             ELSE to_char(invoice_date, 'YYYY-MM')
                  || CASE WHEN EXTRACT(DAY FROM invoice_date) <= 15 THEN '-1H' ELSE '-2H' END
        END                                                                 AS invoice_period,`

    return `
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb, MAX(origin_station) AS origin_station
        FROM air_shipments_compileaircgk GROUP BY awb
      ),
      booking AS (
        SELECT DISTINCT ON (awb)
          awb, account AS vendor, airlines, via, dest, ra_name, chwt
        FROM air_shipments_smu_rate_cgk_spx
        ORDER BY awb,
          (NULLIF(BTRIM(account), '') IS NOT NULL
           AND NULLIF(BTRIM(via),  '') IS NOT NULL
           AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
          updated_at DESC NULLS LAST
      ),
      smu_price AS (
        SELECT
          b.awb,
          s.freight_rate, s.sc_per_kg, s.fbc_per_kg, s.myc_per_kg, s.other_per_kg,
          s.admin_smu, s.ppn_pct, s.komisi_pct,
          s.sg_out AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest
      ),
      ra_price AS (
        SELECT b.awb, r.rate AS ra_rate, r.admin AS ra_admin, r.ppn AS ra_ppn, b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r
          ON r.ra_name_norm = LOWER(REGEXP_REPLACE(COALESCE(b.ra_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND r.ra_name_norm <> ''
      ),
      sg_price AS (
        SELECT sp.awb, sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn, sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name_norm = LOWER(REGEXP_REPLACE(COALESCE(sp.sg_out_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND sg.sg_outgoing_name_norm <> ''
      ),
      awb_cost AS (
        SELECT
          a.awb, a.sum_gw_per_awb, a.origin_station,
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          CASE WHEN sp.freight_rate IS NULL THEN NULL
               ELSE (
                      ( ( sp.freight_rate
                          + COALESCE(sp.sc_per_kg, 0)
                          + COALESCE(sp.fbc_per_kg, 0)
                          + COALESCE(sp.myc_per_kg, 0)
                          + COALESCE(sp.other_per_kg, 0)
                        ) * COALESCE(b.chwt, a.sum_gw_per_awb)
                        + COALESCE(sp.admin_smu, 0)
                      ) * (1 + COALESCE(sp.ppn_pct, 0) / 100.0)
                      - (sp.freight_rate * COALESCE(b.chwt, a.sum_gw_per_awb))
                        * (COALESCE(sp.komisi_pct, 0) / 100.0)
                    )
          END AS cost_smu,
          CASE WHEN a.origin_station = 'Surabaya'  THEN 0
               WHEN b.ra_name IS NULL OR b.ra_name = '' THEN 0
               WHEN LOWER(rp.ra_name) LIKE 'include%'  THEN 0
               WHEN rp.ra_rate IS NULL                 THEN NULL
               ELSE (COALESCE(b.chwt, a.sum_gw_per_awb) * rp.ra_rate + COALESCE(rp.ra_admin, 0))
                    * (1 + COALESCE(rp.ra_ppn, 0) / 100.0)
          END AS cost_ra,
          CASE WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
               WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
               WHEN sgp.sg_rate IS NULL                           THEN NULL
               WHEN a.origin_station = 'Surabaya'
                 THEN (COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate + COALESCE(sgp.sg_admin, 0))
                      * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0)
               ELSE COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate
                      * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0) + COALESCE(sgp.sg_admin, 0)
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking   b   ON b.awb   = a.awb
        LEFT JOIN smu_price sp  ON sp.awb  = a.awb
        LEFT JOIN ra_price  rp  ON rp.awb  = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
      ),
      base AS (
        SELECT
          c.id,
          c.to_number, c.awb, c.completed_time, c.cycle_period,
          c.cycle_completed, c.cycle_ata, c.cycle_atd, c.date_completed, c.date_ata, c.date_atd,
          ${invoiceBase}
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, b.chwt AS chwt_awb,
          c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
          c.gross_weight, ac.sum_gw_per_awb,
          c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)        AS weight_share,
          c.amount_revenue                                     AS revenue_freight,
          c.packing_kayu                                       AS revenue_packing,
          c.amount_revenue + c.packing_kayu                    AS revenue_total,
          COALESCE(c.amount_revenue, 0) * 0.015                AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          sgi.sg_inc,
          COALESCE(sgi.admin, CASE WHEN c.origin_station = 'Surabaya' THEN 0 ELSE 5000 END)
                                                               AS sg_in_admin
        FROM air_shipments_compileaircgk c
        LEFT JOIN booking  b  ON b.awb  = c.awb
        LEFT JOIN awb_cost ac ON ac.awb = c.awb
        LEFT JOIN air_shipments_sg_incoming sgi
          ON sgi.origin = c.origin_station
         AND sgi.destination = c.dest_station
      )
      SELECT
        id, to_number, awb, completed_time, cycle_period,
        cycle_completed, cycle_ata, cycle_atd, date_completed, date_ata, date_atd,
        invoice_period,
        ${invoiceOut}
        lt_number, actual_revenue, actual_cost,
        (settled_at IS NOT NULL)                          AS is_settled,
        (actual_revenue - revenue_total)                  AS var_revenue,
        chwt_awb,
        origin_station, dest_station, vendor, airline,
        gross_weight, sum_gw_per_awb, weight_share,
        revenue_freight, revenue_packing, revenue_total, revenue_discount,
        cost_smu_awb, cost_ra_awb, cost_sg_out_awb, cost_total_awb,
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to,
        CASE
          WHEN vendor          IS NULL THEN 'no_booking'
          WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'
          WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'
          WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'
          WHEN revenue_total   IS NULL THEN 'revenue_missing'
          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }
}
```

Note: unlike prior migrations where `${invoiceOut}` sits inline in the outer SELECT column list, here the outer SELECT always lists a bare `invoice_period,` column (works for both directions because `base`'s CTE column is always named `invoice_period` — either directly from `c.invoice_period_label` when `withManualPeriod` is true, or computed via the `CASE` in `invoiceOut` when false, aliased `AS invoice_period`). This avoids duplicating the outer-select branching that existed in the previous migration.

- [ ] **Step 2: Run the migration against a local/dev database and verify**

```bash
cd apps/backend
npm run migration:run
```
Expected: migration runs without error; `\d air_shipments_compileaircgk` (via `psql`) shows the 3 new columns; `SELECT invoice_period FROM v_pnl_to LIMIT 1;` returns without error (value will be `NULL` for all rows until Task 2/3 ship and a settlement is committed).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/database/migrations/20260721000001-pnl-invoice-period-manual.ts
git commit -m "feat(pnl): store manual invoice periode instead of deriving from DATE"
```

---

### Task 2: Backend service — write period fields on commit

**Files:**
- Modify: `apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts:84-123`
- Test: `apps/backend/src/modules/pnl-settlement/pnl-settlement.service.spec.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (migration from Task 1 must already be applied to the dev DB for this to be exercised end-to-end, but the service test mocks `DataSource` so it doesn't need the real DB).
- Produces: `PnlSettlementService.commit(buffer: Buffer, period: InvoicePeriodInput): Promise<SettlementCommitResult>` — new required 2nd parameter. `InvoicePeriodInput` exported from this file: `{ label: string; start: string; end: string }` (ISO `YYYY-MM-DD` date strings). Consumed by Task 3 (controller).

- [ ] **Step 1: Write the failing test**

Add to `pnl-settlement.service.spec.ts`, inside `describe('commit', ...)`:

```typescript
    it('stamps the chosen invoice period on every row in the batch', async () => {
      const manager = { query: jest.fn().mockResolvedValue([[], 2]) }
      dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<void>) => cb(manager))
      dataSource.query.mockResolvedValue(undefined)

      const buf = detailWorkbook([
        { lt: 'LT1', to: 'TO1', amount: 100 },
        { lt: 'LT2', to: 'TO2', amount: 200 },
      ])
      const period = { label: '2026-07-2H', start: '2026-07-16', end: '2026-07-31' }
      await service.commit(buf, period)

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('invoice_period_label = v.period_label'),
        expect.arrayContaining([
          'LT1', 'TO1', 100, '2026-07-2H', '2026-07-16', '2026-07-31',
          'LT2', 'TO2', 200, '2026-07-2H', '2026-07-16', '2026-07-31',
        ]),
      )
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest pnl-settlement.service.spec.ts -t "stamps the chosen invoice period"`
Expected: FAIL — `service.commit` currently takes 1 argument, and the UPDATE SQL doesn't reference `invoice_period_label`.

- [ ] **Step 3: Implement**

In `pnl-settlement.service.ts`, add the exported type near the top (after `SettlementCommitResult`):

```typescript
export interface InvoicePeriodInput {
  label: string
  start: string
  end: string
}
```

Replace the `commit` method body:

```typescript
  async commit(buffer: Buffer, period: InvoicePeriodInput): Promise<SettlementCommitResult> {
    const parsed = parseSettlementWorkbook(buffer)
    let updated = 0

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK)
        const params: unknown[] = []
        const values = chunk
          .map((r, j) => {
            const b = j * 6
            params.push(r.ltNumber, r.toNumber, r.actualRevenue, period.label, period.start, period.end)
            return `($${b + 1}, $${b + 2}, $${b + 3}::numeric, $${b + 4}, $${b + 5}::date, $${b + 6}::date)`
          })
          .join(', ')
        // Settle only revenue for now (actual_cost stays NULL until vendor invoices land).
        // The chosen invoice period applies to every row in this upload batch.
        const res = await manager.query(
          `
          UPDATE air_shipments_compileaircgk c
          SET actual_revenue = v.rev, settled_at = NOW(),
              invoice_period_label = v.period_label,
              invoice_period_start = v.period_start,
              invoice_period_end = v.period_end
          FROM (VALUES ${values}) AS v(lt, to_num, rev, period_label, period_start, period_end)
          WHERE c.lt_number = v.lt AND c.to_number = v.to_num
          `,
          params,
        )
        // node-postgres returns [rows, rowCount] via TypeORM as an array; rowCount is on result[1].
        updated += Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0
      }
    })

    // v_pnl_to reads actual_revenue from the fact table, so refresh after settling.
    await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to')

    return {
      totalParsed: parsed.rows.length,
      updated,
      unmatched: parsed.rows.length - updated,
      errorRows: parsed.errors.length,
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest pnl-settlement.service.spec.ts`
Expected: PASS (both the new test and the pre-existing `commit` test — the pre-existing one at line 92-115 must be updated too, since `commit(buf)` now needs a 2nd arg; update its call site to `service.commit(buf, { label: '2026-07-2H', start: '2026-07-16', end: '2026-07-31' })` and its assertion's `expect.arrayContaining` to include the 3 period values per row, matching the new param layout).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/pnl-settlement/pnl-settlement.service.ts apps/backend/src/modules/pnl-settlement/pnl-settlement.service.spec.ts
git commit -m "feat(pnl): write chosen invoice period into settlement commit UPDATE"
```

---

### Task 3: Backend controller — accept and validate period fields

**Files:**
- Modify: `apps/backend/src/modules/pnl-settlement/pnl-settlement.controller.ts:46-51, 92-98`
- Test: `apps/backend/src/modules/pnl-settlement/pnl-settlement.controller.spec.ts`

**Interfaces:**
- Consumes: `PnlSettlementService.commit(buffer, period)` from Task 2, `InvoicePeriodInput` type from `pnl-settlement.service.ts`.
- Produces: `POST /pnl-settlement/commit` now requires multipart body fields `periodLabel`, `periodStart`, `periodEnd` in addition to `file`. Returns `400 BadRequestException` with a clear message if missing or if `periodStart > periodEnd`.

- [ ] **Step 1: Write the failing tests**

Add to `pnl-settlement.controller.spec.ts`:

```typescript
  it('commit forwards the file buffer and period to the service', async () => {
    mockService.commit.mockResolvedValueOnce({ updated: 1 })
    await controller.commit(fakeFile('inv.csv'), '2026-07-2H', '2026-07-16', '2026-07-31')
    expect(mockService.commit).toHaveBeenCalledWith(
      expect.any(Buffer),
      { label: '2026-07-2H', start: '2026-07-16', end: '2026-07-31' },
    )
  })

  it('rejects commit missing periodLabel', () => {
    expect(() =>
      controller.commit(fakeFile('inv.csv'), undefined, '2026-07-16', '2026-07-31'),
    ).toThrow(BadRequestException)
  })

  it('rejects commit where periodStart is after periodEnd', () => {
    expect(() =>
      controller.commit(fakeFile('inv.csv'), '2026-07-2H', '2026-07-31', '2026-07-16'),
    ).toThrow(BadRequestException)
  })
```

Update the existing `'commit forwards the file buffer to the service'` test (line 41-45) — it now needs the 3 extra args too; either delete it (superseded by the test above) or update its call. Delete it since the new test covers the same path plus the period assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest pnl-settlement.controller.spec.ts`
Expected: FAIL — `controller.commit` currently accepts only `(file)`, TypeScript arity mismatch / runtime `undefined` args ignored, and no validation exists yet.

- [ ] **Step 3: Implement**

In `pnl-settlement.controller.ts`, add `Body` to the NestJS import list:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
```

Replace the `commit` method:

```typescript
  @Post('commit')
  @Authorize(Permission.CREATE_PNL_SETTLEMENT)
  @UseInterceptors(uploadInterceptor)
  commit(
    @UploadedFile() file: UploadedInvoiceFile | undefined,
    @Body('periodLabel') periodLabel?: string,
    @Body('periodStart') periodStart?: string,
    @Body('periodEnd') periodEnd?: string,
  ) {
    return this.service.commit(validateFile(file), validatePeriod(periodLabel, periodStart, periodEnd))
  }
```

Add the validator function near `validateFile` at the bottom of the file:

```typescript
function validatePeriod(label?: string, start?: string, end?: string) {
  if (!label || !start || !end) {
    throw new BadRequestException('Periode invoice wajib dipilih sebelum commit.')
  }
  if (start > end) {
    throw new BadRequestException('Tanggal awal periode invoice tidak boleh setelah tanggal akhir.')
  }
  return { label, start, end }
}
```

(String comparison works here because both are `YYYY-MM-DD` ISO date strings, which sort lexicographically the same as chronologically.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest pnl-settlement.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/pnl-settlement/pnl-settlement.controller.ts apps/backend/src/modules/pnl-settlement/pnl-settlement.controller.spec.ts
git commit -m "feat(pnl): validate invoice periode fields on settlement commit"
```

---

### Task 4: Frontend — invoice period helper (last-4 periods + custom label)

**Files:**
- Create: `apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.ts`
- Test: `apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.spec.ts`

**Interfaces:**
- Produces:
  - `interface InvoicePeriodOption { label: string; start: string; end: string }` — `start`/`end` are `YYYY-MM-DD`.
  - `getLastInvoicePeriods(count: number, today: Date): InvoicePeriodOption[]` — returns `count` most recent bi-weekly periods (including the one `today` falls in), newest first, in the same `YYYY-MM-1H`/`YYYY-MM-2H` label format as the old backend derivation.
  - `buildCustomPeriod(start: string, end: string): InvoicePeriodOption` — `{ label: `${start} - ${end}`, start, end }`.
  Consumed by Task 6 (`SettlementUploadDialog.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
import { getLastInvoicePeriods, buildCustomPeriod } from './invoicePeriod'

describe('getLastInvoicePeriods', () => {
  it('returns the 4 most recent bi-weekly periods, newest first, when today is in the 2nd half', () => {
    const today = new Date('2026-07-21T00:00:00Z')
    const result = getLastInvoicePeriods(4, today)
    expect(result).toEqual([
      { label: '2026-07-2H', start: '2026-07-16', end: '2026-07-31' },
      { label: '2026-07-1H', start: '2026-07-01', end: '2026-07-15' },
      { label: '2026-06-2H', start: '2026-06-16', end: '2026-06-30' },
      { label: '2026-06-1H', start: '2026-06-01', end: '2026-06-15' },
    ])
  })

  it('returns the correct end-of-month day for the 2H bucket when today is in the 1st half', () => {
    const today = new Date('2026-07-05T00:00:00Z')
    const result = getLastInvoicePeriods(2, today)
    expect(result).toEqual([
      { label: '2026-07-1H', start: '2026-07-01', end: '2026-07-15' },
      { label: '2026-06-2H', start: '2026-06-16', end: '2026-06-30' },
    ])
  })

  it('rolls over the year boundary', () => {
    const today = new Date('2026-01-10T00:00:00Z')
    const result = getLastInvoicePeriods(2, today)
    expect(result).toEqual([
      { label: '2026-01-1H', start: '2026-01-01', end: '2026-01-15' },
      { label: '2025-12-2H', start: '2025-12-16', end: '2025-12-31' },
    ])
  })
})

describe('buildCustomPeriod', () => {
  it('builds a range label from start and end dates', () => {
    expect(buildCustomPeriod('2026-07-05', '2026-07-22')).toEqual({
      label: '2026-07-05 - 2026-07-22',
      start: '2026-07-05',
      end: '2026-07-22',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx jest invoicePeriod.spec.ts`
Expected: FAIL — `Cannot find module './invoicePeriod'`

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface InvoicePeriodOption {
  label: string
  start: string
  end: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number): string {
  // month is 1-indexed here; JS Date month is 0-indexed.
  return `${year}-${pad(month)}-${pad(day)}`
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of next month = last day of this month (month is 1-indexed here).
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function periodFor(year: number, month: number, half: 1 | 2): InvoicePeriodOption {
  const label = `${year}-${pad(month)}-${half}H`
  return half === 1
    ? { label, start: isoDate(year, month, 1), end: isoDate(year, month, 15) }
    : { label, start: isoDate(year, month, 16), end: isoDate(year, month, lastDayOfMonth(year, month)) }
}

/** Returns the `count` most recent bi-weekly invoice periods (newest first), including the one `today` falls in. */
export function getLastInvoicePeriods(count: number, today: Date): InvoicePeriodOption[] {
  let year = today.getUTCFullYear()
  let month = today.getUTCMonth() + 1
  let half: 1 | 2 = today.getUTCDate() <= 15 ? 1 : 2

  const periods: InvoicePeriodOption[] = []
  for (let i = 0; i < count; i++) {
    periods.push(periodFor(year, month, half))
    if (half === 2) {
      half = 1
    } else {
      half = 2
      month -= 1
      if (month === 0) {
        month = 12
        year -= 1
      }
    }
  }
  return periods
}

export function buildCustomPeriod(start: string, end: string): InvoicePeriodOption {
  return { label: `${start} - ${end}`, start, end }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx jest invoicePeriod.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.ts apps/frontend/src/features/pnl-settlement/utils/invoicePeriod.spec.ts
git commit -m "feat(pnl): add invoice periode calculation helper"
```

---

### Task 5: Frontend — send period fields in the commit mutation

**Files:**
- Modify: `apps/frontend/src/features/pnl-settlement/hooks/useSettlement.ts:113-131`

**Interfaces:**
- Consumes: nothing from Task 4 directly (this task just changes the mutation's input shape; the dialog in Task 6 supplies `InvoicePeriodOption` values from the Task 4 helper).
- Produces: `useSettlementCommit()` mutation function now has signature `mutationFn: (input: { file: File; periodLabel: string; periodStart: string; periodEnd: string }) => Promise<SettlementCommitResult>`. Consumed by Task 6.

- [ ] **Step 1: Implement**

Replace `useSettlementCommit` in `useSettlement.ts`:

```typescript
export interface SettlementCommitInput {
  file: File
  periodLabel: string
  periodStart: string
  periodEnd: string
}

export function useSettlementCommit() {
  const qc = useQueryClient()
  return useMutation<SettlementCommitResult, unknown, SettlementCommitInput>({
    mutationFn: ({ file, periodLabel, periodStart, periodEnd }: SettlementCommitInput) => {
      const form = new FormData()
      form.append('file', file)
      form.append('periodLabel', periodLabel)
      form.append('periodStart', periodStart)
      form.append('periodEnd', periodEnd)
      return apiClient
        .post('/pnl-settlement/commit', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data)
    },
    onSuccess: () => {
      // Settling changes v_pnl_to, so both estimate and settlement views are stale.
      qc.invalidateQueries({ queryKey: ['pnl'] })
      qc.invalidateQueries({ queryKey: ['pnl-settlement'] })
    },
  })
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npm run type-check`
Expected: fails at this point only inside `SettlementUploadDialog.tsx` (its call to `commitMut.mutateAsync(file)` no longer matches the new signature) — that's expected and fixed in Task 6. Confirm no *other* file references `useSettlementCommit`/`SettlementCommitResult` in a way that breaks (`grep -rn "useSettlementCommit" apps/frontend/src` should show only the dialog).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/pnl-settlement/hooks/useSettlement.ts
git commit -m "feat(pnl): send invoice periode fields with settlement commit request"
```

(Committed even though the dialog caller is momentarily broken — Task 6 fixes it next and is a separate reviewable unit. If you prefer a single always-green history, squash Tasks 5 and 6 into one commit instead.)

---

### Task 6: Frontend — periode dropdown in the upload dialog

**Files:**
- Modify: `apps/frontend/src/features/pnl-settlement/components/SettlementUploadDialog.tsx`

**Interfaces:**
- Consumes: `getLastInvoicePeriods`, `buildCustomPeriod`, `InvoicePeriodOption` from `../utils/invoicePeriod` (Task 4); `useSettlementCommit`'s new `SettlementCommitInput` shape (Task 5).
- Produces: nothing consumed by later tasks — this is the terminal UI piece.

- [ ] **Step 1: Implement**

Replace the full contents of `SettlementUploadDialog.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  useSettlementPreview,
  useSettlementCommit,
  SettlementPreview,
} from '../hooks/useSettlement'
import { getLastInvoicePeriods, buildCustomPeriod, InvoicePeriodOption } from '../utils/invoicePeriod'
import { num } from '@/features/pnl/utils/format'

const ALLOWED = /\.(xlsx|xls|csv)$/i
const MAX_BYTES = 50 * 1024 * 1024
const CUSTOM_VALUE = '__custom__'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettlementUploadDialog({ open, onClose }: Props) {
  const periodOptions = useMemo(() => getLastInvoicePeriods(4, new Date()), [])
  const [periodChoice, setPeriodChoice] = useState<string>('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SettlementPreview | null>(null)
  const previewMut = useSettlementPreview()
  const commitMut = useSettlementCommit()

  const isCustom = periodChoice === CUSTOM_VALUE
  const selectedPeriod: InvoicePeriodOption | null = isCustom
    ? customStart && customEnd && customStart <= customEnd
      ? buildCustomPeriod(customStart, customEnd)
      : null
    : periodOptions.find((p) => p.label === periodChoice) ?? null

  function reset() {
    setPeriodChoice('')
    setCustomStart('')
    setCustomEnd('')
    setFile(null)
    setClientError(null)
    setPreview(null)
    previewMut.reset()
    commitMut.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  function pickFile(f: File | null) {
    setPreview(null)
    setClientError(null)
    commitMut.reset()
    if (f && !ALLOWED.test(f.name)) {
      setFile(null)
      setClientError('Format tidak didukung — gunakan .xlsx, .xls, atau .csv.')
      return
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null)
      setClientError('Ukuran file melebihi 50 MB.')
      return
    }
    setFile(f)
  }

  async function runPreview() {
    if (!file) return
    const res = await previewMut.mutateAsync(file)
    setPreview(res)
  }

  async function runCommit() {
    if (!file || !selectedPeriod) return
    await commitMut.mutateAsync({
      file,
      periodLabel: selectedPeriod.label,
      periodStart: selectedPeriod.start,
      periodEnd: selectedPeriod.end,
    })
  }

  const committed = commitMut.data

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload Invoice — Settle Actual Revenue</DialogTitle>
          <DialogDescription>
            File invoice (.xlsx/.csv) dicocokkan per TO via LT + TO Number. Estimasi tidak diubah.
          </DialogDescription>
        </DialogHeader>

        {!committed ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Periode Invoice</label>
              <select
                className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                value={periodChoice}
                onChange={(e) => {
                  setPeriodChoice(e.target.value)
                  setCustomStart('')
                  setCustomEnd('')
                }}
              >
                <option value="" disabled>Pilih periode…</option>
                {periodOptions.map((p) => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
                <option value={CUSTOM_VALUE}>Custom</option>
              </select>
              {isCustom && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <span className="text-muted-foreground text-sm">—</span>
                  <input
                    type="date"
                    className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              )}
              {isCustom && customStart && customEnd && customStart > customEnd && (
                <p className="text-sm text-destructive">Tanggal awal tidak boleh setelah tanggal akhir.</p>
              )}
            </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!selectedPeriod}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm disabled:opacity-50"
            />
            {!selectedPeriod && (
              <p className="text-xs text-muted-foreground">Pilih Periode Invoice terlebih dahulu.</p>
            )}
            {clientError && <p className="text-sm text-destructive">{clientError}</p>}
            {previewMut.isError && (
              <p className="text-sm text-destructive">Gagal mem-preview file. Coba lagi.</p>
            )}

            {preview && (
              <div className="rounded-md border bg-card p-3 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Baris ter-parse</span>
                  <span className="text-right font-medium">{num(preview.totalParsed)}</span>
                  <span className="text-muted-foreground">Cocok di sistem</span>
                  <span className="text-right font-medium text-green-600">{num(preview.matched)}</span>
                  <span className="text-muted-foreground">Tidak cocok</span>
                  <span className="text-right font-medium text-amber-600">{num(preview.unmatched)}</span>
                  <span className="text-muted-foreground">Baris error</span>
                  <span className="text-right font-medium text-destructive">{num(preview.errorRows)}</span>
                  <span className="text-muted-foreground">Duplikat</span>
                  <span className="text-right font-medium">{num(preview.duplicateRows)}</span>
                </div>
                {preview.unmatched > 0 && preview.unmatchedSample.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Contoh tidak cocok: {preview.unmatchedSample.slice(0, 5).map((u) => u.toNumber).join(', ')}
                    {preview.unmatched > 5 ? '…' : ''}
                  </p>
                )}
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">{w}</p>
                ))}
                {preview.matched === 0 && (
                  <p className="text-xs text-destructive">
                    Tidak ada baris yang cocok — periksa kolom LT/TO Number pada file.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border bg-card p-4 text-sm space-y-1">
            <p className="font-medium text-green-600">Settle berhasil.</p>
            <p>{num(committed.updated)} TO ter-update dengan actual revenue.</p>
            {committed.unmatched > 0 && (
              <p className="text-amber-600">{num(committed.unmatched)} baris tidak cocok (dilewati).</p>
            )}
            {committed.errorRows > 0 && (
              <p className="text-destructive">{num(committed.errorRows)} baris error (dilewati).</p>
            )}
          </div>
        )}

        <DialogFooter>
          {!committed ? (
            <>
              <Button variant="outline" onClick={handleClose}>Batal</Button>
              {!preview ? (
                <Button onClick={runPreview} disabled={!file || previewMut.isPending}>
                  {previewMut.isPending ? 'Memproses…' : 'Preview'}
                </Button>
              ) : (
                <Button onClick={runCommit} disabled={preview.matched === 0 || !selectedPeriod || commitMut.isPending}>
                  {commitMut.isPending ? 'Menyimpan…' : `Settle ${num(preview.matched)} TO`}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleClose}>Selesai</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npm run type-check`
Expected: PASS, no errors.

- [ ] **Step 3: Manual verification in the browser**

Run: `cd apps/frontend && npm run dev` (and ensure the backend from Task 1-3 is running with the migration applied). Open the PnL page → Actual vs Estimate tab → click the settlement upload trigger (opens `SettlementUploadDialog`).
Verify:
- File picker is disabled until a Periode Invoice option is chosen.
- Selecting one of the 4 preset periods enables the file picker.
- Selecting "Custom" reveals two date inputs; file picker stays disabled until both are filled with `start <= end`.
- Upload a settlement file, preview, then commit — the success panel shows as before.
- After commit, reload the "Actual vs Estimate" comparison table and confirm the "Periode Invoice" column (`SettlementView.tsx:151`) now shows the label you picked (e.g. `2026-07-2H`) for the rows just settled, and still shows `—` for any previously-settled rows that predate this feature.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl-settlement/components/SettlementUploadDialog.tsx
git commit -m "feat(pnl): add invoice periode dropdown to settlement upload dialog"
```

---

## Post-plan verification

- [ ] Run the full backend test suite: `cd apps/backend && npm test` — expect all suites green, including the modified `pnl-settlement.*.spec.ts`.
- [ ] Run the full frontend test suite: `cd apps/frontend && npx jest` — expect `invoicePeriod.spec.ts` green (only frontend test file touched by this plan).
- [ ] Run `cd apps/frontend && npm run type-check` and `cd apps/backend && npm run build` — both clean.
