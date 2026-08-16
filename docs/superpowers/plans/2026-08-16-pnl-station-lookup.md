# PnL Station Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the missing `origin_station` / `destination_station` in the PnL data by looking up the DC pair in `air_shipments_data`, so June–August rows regain their route *and* their SG Incoming and Surabaya-branch costs.

**Architecture:** One new migration redefines the materialized view `v_pnl_to`. A `station_map` CTE reduces `air_shipments_data` to one row per DC pair (Air only), and a `compile` CTE wraps `air_shipments_compileaircgk` so the resolved stations carry the *original* column names — making the raw generated columns unreachable inside the view. Every consumer (`awb_totals`, the cost branches, the SG Incoming join, the display columns) then reads resolved values without any body change. A new `issue` value surfaces DC pairs that resolve from neither source.

**Tech Stack:** PostgreSQL materialized view via TypeORM migration, NestJS backend, Next.js frontend, Jest with a mocked `DataSource`, `psql` for the live-data reconciliation.

**Spec:** `docs/superpowers/specs/2026-08-16-pnl-station-lookup-design.md`

## Global Constraints

- **No table schema migration.** Only the `v_pnl_to` materialized view definition changes.
- **Precedence is `COALESCE(lookup, sheet)`** — `air_shipments_data` wins; the sheet value fills gaps the master lacks.
- **Air only:** `station_map` filters `WHERE service = 'Air'`. Sea rows are ignored entirely.
- **The view's output shape must not change** — same column names, same order, same count. Only values change, and only where the sheet was empty or disagreed.
- **`station_mapping_missing` must sit BEFORE `sg_in_rate_missing`** in the `issue` CASE chain. An empty station breaks the SG Incoming join, so the reverse order makes the new branch unreachable.
- **Issue ranks after this change:** `no_booking` 1, `smu_rate_missing` 2, `ra_rate_missing` 3, `sgout_name_missing` 4, `revenue_missing` 5, `station_mapping_missing` 6, `sg_in_rate_missing` 7. Both rank maps in `pnl.service.ts` must agree with the view's CASE order.
- **Local DB connection:** `postgres://postgres:postgres@localhost:5432/app`. Local data is CLEAN (0 rows missing a station), so the reconciliation must show *zero* change; the dirty case is exercised by a transactional fixture.
- **Jest needs a heap bump on this machine, focused runs included:**
  - backend: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - frontend: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - An `rtk` hook rewrites jest output into a "PASS (n) FAIL (n)" summary; full output lands in `~/.local/share/rtk/tee/*.log`.
- **There is no ESLint config in this repo.** Use `pnpm exec tsc --noEmit` as the type gate; run no lint command.

## Measured Baseline (verified before this plan was written)

These are the numbers the verification asserts against. All were measured on the local database.

| Fact | Value |
| --- | --- |
| `v_pnl_to` row count | 66,203 |
| Rows with `origin_station IS NULL` | 0 |
| Rows for route `Jabo → Aceh` | 1,019 |
| Those rows with a non-null `cost_sg_in_to` | 1,019 |
| Compile rows for DC pair `Kosambi DC → Aceh DC` | 1,019 |
| `air_shipments_data` rows where `service = 'Air'` | 55 |
| Distinct `(BTRIM(origin_dc), BTRIM(destination_dc))` among those | 55 |
| Compile rows matching a master pair | 67,190 of 67,465 |
| Disagreements between lookup and sheet | 0 |

`REFRESH MATERIALIZED VIEW` (non-concurrent) runs inside a transaction and rolls back cleanly — verified. `REFRESH ... CONCURRENTLY` does not, so the fixture must use the plain form.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/pnl-station-lookup-verify.sql` (new) | Reconciliation the migration must not move; re-runnable on staging/production around deploy |
| `scripts/pnl-station-lookup-dirty-fixture.sql` (new) | Transactional proof that an emptied sheet column is refilled by the lookup and that costs come back |
| `apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts` (new) | Redefines `v_pnl_to`; `down()` restores the previous definition verbatim |
| `apps/backend/src/modules/pnl/pnl.service.ts` | Two rank maps gain `station_mapping_missing` |
| `apps/backend/src/modules/pnl/pnl.service.spec.ts` | Rank mapping tests |
| `apps/frontend/src/features/pnl/utils/issueLabels.ts` | Human label for the new issue |
| `apps/frontend/src/features/pnl/utils/issueLabels.spec.ts` (new) | Label test |

---

### Task 1: Verification harness

**Files:**
- Create: `scripts/pnl-station-lookup-verify.sql`
- Create: `scripts/pnl-station-lookup-dirty-fixture.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: two `psql` scripts. Task 2 runs both before and after the migration.

The harness comes first so the migration has something that can fail. The dirty fixture MUST fail against the current view — that is what proves it tests the lookup rather than tautology.

- [ ] **Step 1: Write the reconciliation script**

Create `scripts/pnl-station-lookup-verify.sql`:

```sql
-- Invariants the station-lookup migration must not move.
-- Run before the migration, save the output, run again after, and diff the two.
--   psql "$DATABASE_URL" -f scripts/pnl-station-lookup-verify.sql
-- On clean data (lookup and sheet agree everywhere) every number must be identical.
-- On dirty data (June-August, stations absent) the route/cost lines are EXPECTED to move --
-- that is the fix working; read the row count and the Tanjung Pinang line as the fan-out guard.

\pset pager off

\echo '== 1. row count (fan-out guard: must never grow) =='
SELECT count(*) AS total_rows FROM v_pnl_to;

\echo '== 2. Tanjung Pinang fan-out guard (DC pair is duplicated across Air/Sea in the master) =='
SELECT count(*) AS tanjung_pinang_rows
FROM v_pnl_to WHERE dest_station = 'Tanjung Pinang';

\echo '== 3. totals per route =='
SELECT origin_station, dest_station,
       count(*)                        AS rows,
       count(DISTINCT awb)             AS awbs,
       round(COALESCE(SUM(revenue_total), 0))  AS revenue,
       round(COALESCE(SUM(gross_weight), 0))   AS weight
FROM v_pnl_to
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 4. cost totals (proves awb_totals and the SG Incoming join did not shift) =='
SELECT round(COALESCE(SUM(cost_smu_awb), 0))    AS cost_smu,
       round(COALESCE(SUM(cost_ra_awb), 0))     AS cost_ra,
       round(COALESCE(SUM(cost_sg_out_awb), 0)) AS cost_sg_out,
       round(COALESCE(SUM(cost_sg_in_to), 0))   AS cost_sg_in,
       count(cost_sg_in_to)                     AS rows_with_sg_in
FROM v_pnl_to;

\echo '== 5. issue distribution =='
SELECT COALESCE(issue, '(none)') AS issue, count(*) AS rows
FROM v_pnl_to GROUP BY 1 ORDER BY 1;

\echo '== 6. rows with no station at all =='
SELECT count(*) AS rows_without_station
FROM v_pnl_to WHERE origin_station IS NULL OR dest_station IS NULL;

\echo '== 7. view output shape (names and order must be identical) =='
SELECT ordinal_position, column_name
FROM information_schema.columns
WHERE table_name = 'v_pnl_to' ORDER BY ordinal_position;
```

- [ ] **Step 2: Run it against the current view and save the baseline**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard
psql postgres://postgres:postgres@localhost:5432/app \
  -f scripts/pnl-station-lookup-verify.sql > /tmp/pnl-verify-before.txt
grep -A2 '== 1\.' /tmp/pnl-verify-before.txt
```
Expected: `total_rows` is `66203`. If it is not, stop and report — the rest of this plan's numbers assume this baseline.

- [ ] **Step 3: Write the dirty-data fixture**

Create `scripts/pnl-station-lookup-dirty-fixture.sql`:

```sql
-- Proves the station lookup actually fires, by reproducing the production defect locally.
-- Local data is clean, so we blank the sheet columns for one DC pair inside a transaction,
-- refresh the view, and check what survives. Everything is rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/pnl-station-lookup-dirty-fixture.sql
--
-- BEFORE the migration all three checks FAIL (station lost, SG Incoming cost lost).
-- AFTER the migration all three PASS, because the DC pair resolves from air_shipments_data.
--
-- REFRESH MATERIALIZED VIEW (non-concurrent) is transactional; the CONCURRENTLY form is not,
-- so it must not be used here.

\pset pager off
BEGIN;

-- Kosambi DC -> Aceh DC: 1,019 compile rows, and Jabo -> Aceh has an SG Incoming rate,
-- so the cost check below is not vacuous.
UPDATE air_shipments_compileaircgk
SET extra_fields = extra_fields - 'origin_station' - 'destination_station'
WHERE extra_fields->>'origin' = 'Kosambi DC'
  AND extra_fields->>'destination' = 'Aceh DC';

REFRESH MATERIALIZED VIEW v_pnl_to;

\echo '== CHECK 1: the route survives the sheet being empty (want rows=1019) =='
SELECT count(*) AS rows,
       CASE WHEN count(*) = 1019 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE origin_station = 'Jabo' AND dest_station = 'Aceh';

\echo '== CHECK 2: no row is left without a station (want 0) =='
SELECT count(*) AS rows_without_station,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE origin_station IS NULL OR dest_station IS NULL;

\echo '== CHECK 3: SG Incoming cost still resolves (want 1019) =='
-- This is the check that catches a consumer still reading the raw column: the sgi join keys on
-- the station, so if base still read the unresolved value this would come back 0.
SELECT count(cost_sg_in_to) AS rows_with_sg_in_cost,
       CASE WHEN count(cost_sg_in_to) = 1019 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE awb IN (
  SELECT awb FROM air_shipments_compileaircgk
  WHERE extra_fields->>'origin' = 'Kosambi DC' AND extra_fields->>'destination' = 'Aceh DC'
) AND origin_station = 'Jabo' AND dest_station = 'Aceh';

ROLLBACK;

\echo '== rolled back; verifying the view is intact (want 66203 rows, 0 without station) =='
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE origin_station IS NULL) AS without_station
FROM v_pnl_to;
```

- [ ] **Step 4: Run the fixture and watch it FAIL**

Run:
```bash
psql postgres://postgres:postgres@localhost:5432/app -v ON_ERROR_STOP=1 \
  -f scripts/pnl-station-lookup-dirty-fixture.sql
```
Expected against the current view: CHECK 1 `FAIL` (0 rows, not 1019), CHECK 2 `FAIL` (1019 rows without a station), CHECK 3 `FAIL` (0 rows with an SG Incoming cost). The final line must read `66203` and `0` — proving the rollback restored everything.

**If any check PASSES here, stop and report.** The fixture would not be testing the lookup.

- [ ] **Step 5: Commit**

```bash
git add scripts/pnl-station-lookup-verify.sql scripts/pnl-station-lookup-dirty-fixture.sql
git commit -m "test(pnl): add station-lookup reconciliation and dirty-data fixture"
```

---

### Task 2: The migration

**Files:**
- Create: `apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts`

**Interfaces:**
- Consumes: the two scripts from Task 1.
- Produces: `v_pnl_to` with resolved stations and the `station_mapping_missing` issue value.

The previous definition lives in `apps/backend/src/database/migrations/20260721000001-pnl-invoice-period-manual.ts`. Read it first — the new migration's `down()` must restore it exactly, and `up()` is that same SQL with the changes below.

- [ ] **Step 1: Create the migration file**

Create `apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// The Compile Air CGK sheet stopped filling origin_station / destination_station from June 2026,
// which cost those rows more than their route: the SG Incoming rate is looked up BY station, and
// the Surabaya branches of cost_ra / cost_sg_out test the station too. So a blank station meant a
// NULL SG Incoming cost and a wrongly-charged RA/SG Out for Surabaya-origin shipments.
//
// air_shipments_data is the DC-pair master and carries the station for each pair. This migration
// resolves the station once, in a `compile` CTE that lists its columns explicitly and reuses the
// ORIGINAL names — so the raw generated columns become unreachable inside the view and every
// existing consumer picks up the resolved value with no body change.
//
// Body is otherwise identical to 20260721000001-pnl-invoice-period-manual, whose definition down()
// restores verbatim.
export class PnlStationLookup20260816000001 implements MigrationInterface {
  name = 'PnlStationLookup20260816000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(true))
    await this.createIndexes(queryRunner)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(false))
    await this.createIndexes(queryRunner)
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

  private viewSql(withStationLookup: boolean): string {
    // True branch resolves the station from air_shipments_data before anything consumes it.
    // False branch reads air_shipments_compileaircgk directly, exactly as 20260721000001 did.
    const stationCte = withStationLookup
      ? `
      station_map AS (
        SELECT DISTINCT ON (BTRIM(origin_dc), BTRIM(destination_dc))
          BTRIM(origin_dc)      AS origin_dc,
          BTRIM(destination_dc) AS destination_dc,
          NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin_station,
          NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest_station
        FROM air_shipments_data
        WHERE service = 'Air'
        ORDER BY BTRIM(origin_dc), BTRIM(destination_dc)
      ),
      compile AS (
        SELECT
          c.id, c.awb, c.to_number, c.gross_weight, c.amount_revenue, c.packing_kayu,
          c.completed_time, c.cycle_period, c.cycle_completed, c.cycle_ata, c.cycle_atd,
          c.date_completed, c.date_ata, c.date_atd,
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, c.invoice_period_label,
          COALESCE(sm.origin_station, NULLIF(BTRIM(c.origin_station), '')) AS origin_station,
          COALESCE(sm.dest_station,   NULLIF(BTRIM(c.dest_station),   '')) AS dest_station
        FROM air_shipments_compileaircgk c
        LEFT JOIN station_map sm
          ON sm.origin_dc      = BTRIM(c.extra_fields->>'origin')
         AND sm.destination_dc = BTRIM(c.extra_fields->>'destination')
      ),`
      : ``
    const compileSource = withStationLookup ? 'compile' : 'air_shipments_compileaircgk'
    // Root cause first: a blank station is what breaks the SG Incoming join, so it must be tested
    // BEFORE sg_in_rate_missing or it can never be reached.
    const stationIssue = withStationLookup
      ? `          WHEN origin_station IS NULL OR dest_station IS NULL THEN 'station_mapping_missing'\n`
      : ``

    return `
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH${stationCte}
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb, MAX(origin_station) AS origin_station
        FROM ${compileSource} GROUP BY awb
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
          c.invoice_period_label                                AS invoice_period,
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
        FROM ${compileSource} c
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
${stationIssue}          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }
}
```

- [ ] **Step 2: Run the migration**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm run migration:run 2>&1 | tail -20
```
Expected: `PnlStationLookup20260816000001 has been executed successfully.`

- [ ] **Step 3: Run the dirty fixture — it must now PASS**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard
psql postgres://postgres:postgres@localhost:5432/app -v ON_ERROR_STOP=1 \
  -f scripts/pnl-station-lookup-dirty-fixture.sql
```
Expected: CHECK 1 `PASS` (1019), CHECK 2 `PASS` (0), CHECK 3 `PASS` (1019), and the final line `66203 | 0`.

CHECK 3 is the important one — it fails if any consumer still reads an unresolved station.

- [ ] **Step 4: Reconcile against the baseline — nothing may move**

Run:
```bash
psql postgres://postgres:postgres@localhost:5432/app \
  -f scripts/pnl-station-lookup-verify.sql > /tmp/pnl-verify-after.txt
diff /tmp/pnl-verify-before.txt /tmp/pnl-verify-after.txt && echo "IDENTICAL"
```
Expected: `IDENTICAL`, with no diff output. Local data is clean, so resolved and raw stations agree everywhere; any difference means the migration changed behaviour it should not have.

If the diff shows the issue distribution gaining `station_mapping_missing` rows, stop and report — on clean local data that count must be 0.

- [ ] **Step 5: Verify `down()` restores the previous definition**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm run migration:revert 2>&1 | tail -5
cd /home/faris/code/esp/esp-dashboard
psql postgres://postgres:postgres@localhost:5432/app \
  -f scripts/pnl-station-lookup-verify.sql > /tmp/pnl-verify-reverted.txt
diff /tmp/pnl-verify-before.txt /tmp/pnl-verify-reverted.txt && echo "REVERT CLEAN"
cd apps/backend && pnpm run migration:run 2>&1 | tail -3
```
Expected: `REVERT CLEAN`, then the migration re-applies successfully. This proves `down()` is a real rollback path, not decoration.

- [ ] **Step 6: Confirm CONCURRENTLY refresh still works**

Run:
```bash
psql postgres://postgres:postgres@localhost:5432/app \
  -c "REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to" && echo "CONCURRENT REFRESH OK"
```
Expected: `CONCURRENT REFRESH OK`. This is the fan-out guard — a duplicated DC pair would break the unique index on `id` and this command would fail. Both the sync service and the settlement service call it, so it must keep working.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/database/migrations/20260816000001-pnl-station-lookup.ts
git commit -m "feat(pnl): resolve stations from air_shipments_data in v_pnl_to"
```

---

### Task 3: Rank the new issue in the backend

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` (the `ISSUE_RANK` constant, and the `MIN(CASE issue ...)` expression inside `getAwbDrilldown`)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: the `station_mapping_missing` value the view now emits.
- Produces: `ISSUE_RANK.station_mapping_missing === 6`, `ISSUE_RANK.sg_in_rate_missing === 7`, and a drilldown SQL CASE that agrees.

There are TWO rank maps and they must stay in step. Miss the SQL one and a row whose only problem is the station gets `issue_rank` NULL, so no badge appears in the drilldown.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, inside `describe('getAwbDrilldown', …)`:

```ts
    it('maps issue_rank 6 to the station mapping gap and 7 to the SG In rate', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-7', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '6',
            origin: null, dest: null, route_date: '2026-06-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
          {
            awb: '888-8', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '7',
            origin: 'Jabo', dest: 'Aceh', route_date: '2026-06-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '2' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-06-1H')

      expect(data[0].issue).toBe('station_mapping_missing')
      expect(data[1].issue).toBe('sg_in_rate_missing')
    })

    it('ranks the station gap ahead of the SG In rate it causes', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-06-1H')

      const [sql] = dataSource.query.mock.calls[0]
      const normalized = sql.replace(/\s+/g, ' ')
      // A blank station is what breaks the SG Incoming join, so it must rank as the root cause.
      expect(normalized).toContain("WHEN 'station_mapping_missing' THEN 6")
      expect(normalized).toContain("WHEN 'sg_in_rate_missing' THEN 7")
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service --runInBand -t "getAwbDrilldown"`
Expected: FAIL — the first test gets `sg_in_rate_missing` for rank 6 and `null` for rank 7; the second fails on `toContain`.

- [ ] **Step 3: Update the TypeScript rank map**

In `apps/backend/src/modules/pnl/pnl.service.ts`, replace the `ISSUE_RANK` constant:

```ts
const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  // A blank station breaks the SG Incoming join, so it ranks as the cause of the rate miss below
  // it. This order must match the CASE chain in the v_pnl_to definition.
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}
```

- [ ] **Step 4: Update the SQL rank map**

In the same file, inside `getAwbDrilldown`'s data query, replace the `issue_rank` expression:

```sql
          MIN(CASE issue
                WHEN 'no_booking' THEN 1 WHEN 'smu_rate_missing' THEN 2
                WHEN 'ra_rate_missing' THEN 3 WHEN 'sgout_name_missing' THEN 4
                WHEN 'revenue_missing' THEN 5 WHEN 'station_mapping_missing' THEN 6
                WHEN 'sg_in_rate_missing' THEN 7
              END)                                  AS issue_rank
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest src/modules/pnl --runInBand`
Expected: PASS, with two more tests than before.

- [ ] **Step 6: Prove the two maps cannot drift apart**

Mutate `ISSUE_RANK.station_mapping_missing` from `6` to `8` and re-run the focused suite. Expected: the first test fails, because `ISSUE_BY_RANK[6]` no longer resolves. Revert and confirm green again. Report both directions.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): rank the station mapping gap ahead of the SG In rate miss"
```

---

### Task 4: Label the new issue in the frontend

**Files:**
- Modify: `apps/frontend/src/features/pnl/utils/issueLabels.ts`
- Create: `apps/frontend/src/features/pnl/utils/issueLabels.spec.ts`

**Interfaces:**
- Consumes: the `station_mapping_missing` value from the API.
- Produces: a human label for it. No component changes — the Data Quality panel, its summary, and the AWB Drilldown badge all call `issueLabel()` already.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/issueLabels.spec.ts`:

```ts
import { issueLabel } from './issueLabels'

describe('issueLabel', () => {
  it('names the station mapping gap in terms of the fix it needs', () => {
    // The whole point of this issue is telling someone WHICH table to complete, so the label has
    // to name it. A bare "Station missing" would send them back to the Compile sheet instead.
    expect(issueLabel('station_mapping_missing')).toBe(
      'Station mapping missing (DC pair not in air_shipments_data)',
    )
  })

  it('falls back to the raw value for an unknown issue', () => {
    expect(issueLabel('something_new')).toBe('something_new')
  })

  it('renders an em-dash when there is no issue', () => {
    expect(issueLabel(null)).toBe('—')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest issueLabels --runInBand`
Expected: FAIL on the first test — it receives the raw `'station_mapping_missing'` from the fallback branch.

- [ ] **Step 3: Add the label**

In `apps/frontend/src/features/pnl/utils/issueLabels.ts`, add the entry after `sg_in_rate_missing`:

```ts
  station_mapping_missing: 'Station mapping missing (DC pair not in air_shipments_data)',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest issueLabels --runInBand`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/issueLabels.ts apps/frontend/src/features/pnl/utils/issueLabels.spec.ts
git commit -m "feat(pnl): label the station mapping gap in the data quality panel"
```

---

## Final Verification

- [ ] `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand` passes.
- [ ] `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand` passes.
- [ ] `pnpm exec tsc --noEmit` passes in both apps.
- [ ] `diff /tmp/pnl-verify-before.txt /tmp/pnl-verify-after.txt` is empty — the migration moved nothing on clean data.
- [ ] `scripts/pnl-station-lookup-dirty-fixture.sql` reports PASS on all three checks.
- [ ] `REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to` succeeds.
- [ ] `pnpm run migration:revert` followed by `pnpm run migration:run` leaves the reconciliation identical.

## Deployment Note

On staging and production the reconciliation is **expected to move**, unlike locally. Run
`scripts/pnl-station-lookup-verify.sql` before and after deploy and keep both outputs. The
differences that are the fix working:

- routes appearing for June–August rows that previously had none;
- `cost_sg_in` rising as the SG Incoming join starts matching;
- `cost_ra` and `cost_sg_out` falling for Surabaya-origin AWBs, whose zero-cost branch was never
  reached while the station was blank;
- `sg_in_rate_missing` counts falling, possibly replaced by `station_mapping_missing` where the DC
  pair is absent from the master.

The row count and the Tanjung Pinang line must NOT move in either environment. If they grow, a
duplicate DC pair slipped past `station_map` and revenue is being double-counted — revert.

### Run these BEFORE deploying

Both are sections of `scripts/pnl-station-lookup-verify.sql`, and both answer a question the local
database cannot.

**1. Check the master's `service` values.** The lookup is an exact `service = 'Air'` match. If
staging or production stores `'air'`, `'AIR'`, or a value with a trailing space, `station_map`
comes back empty, `COALESCE` falls through to the sheet, and the migration succeeds with **no
error while fixing nothing**. Expect `Air` and `Sea` exactly.

**2. Check the sheet-vs-master disagreement count.** The design lets the master overwrite a
populated sheet value, so this is the one number separating a gap-fill from a silently rewritten
route. It is 0 locally. If staging returns a non-zero count, inspect those rows before deploying —
a DC that moved station would rewrite history for shipments that flew under the old mapping.

### What moves, and in which direction

June–August margins move **both ways**, and finance must be told these are corrections, not
anomalies:

- `cost_sg_in_to` goes NULL → value for every newly resolved row, so `cost_to` and the Total Cost
  KPI **rise** and margin **falls** on non-Surabaya routes;
- Surabaya-origin rows shed a wrongly charged RA, switch SG Out branch, and lose the 5,000 admin
  default, so their margin **rises**.

The most visible symptom is a disagreement disappearing: blank-station rows counted toward the KPI
cards but had no Daily Report column, so the two never reconciled. After deploy they do.

### Settlement is safe

`pnl-settlement` shares this view but only ever writes `actual_revenue`; `actual_cost` is populated
by no code path, and `var_revenue = actual_revenue − revenue_total` touches nothing the station
feeds. Settled rows simply gain a route in the comparison table — **no stored actual is
invalidated.**

### Downtime

The migration DROPs and recreates the materialized view and its 8 indexes, so `v_pnl_to` is
unavailable for the duration and every PnL page errors while it runs. Deploy outside dashboard
hours. `down()` restores the previous definition verbatim and has been exercised end to end.
