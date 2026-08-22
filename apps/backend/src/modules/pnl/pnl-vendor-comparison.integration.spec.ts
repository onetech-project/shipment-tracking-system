/**
 * Integration test for PnlService.getVendorComparison.
 *
 * pnl.service.spec.ts mocks dataSource.query(), so it can assert what SQL text got sent but cannot
 * tell whether Postgres would accept it — the same gap that let the `v.v.date_ata` double-prefix
 * bug ship behind green tests in the group comparison. This spec runs the real queries, against a
 * real database, through the real service method.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable.
 *
 * Run with:
 *   cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" \
 *     pnpm exec jest pnl-vendor-comparison.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { DataSource, QueryRunner } from 'typeorm'
import { PnlService } from './pnl.service'

const DATABASE_URL_EXPLICIT = !!process.env.DATABASE_URL
const CONNECTION_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/app'

function isDbReachable(url: string): boolean {
  try {
    const u = new URL(url)
    execSync(
      `pg_isready -h ${u.hostname} -p ${u.port || '5432'} -U ${u.username || 'postgres'}`,
      { stdio: 'ignore', timeout: 5000 },
    )
    return true
  } catch {
    return false
  }
}

const DB_AVAILABLE = isDbReachable(CONNECTION_URL)

describe('PnlService.getVendorComparison (integration)', () => {
  if (!DB_AVAILABLE) {
    if (DATABASE_URL_EXPLICIT) {
      it('FAILS LOUDLY — DATABASE_URL is set but pg_isready could not reach Postgres', () => {
        throw new Error(
          `DATABASE_URL=${CONNECTION_URL} is set, but pg_isready could not reach Postgres at it ` +
            `(or the pg_isready binary itself is missing from this host — install postgresql-client ` +
            `to find out which). Fix connectivity, or unset DATABASE_URL to allow this suite to skip.`,
        )
      })
      return
    }
    // eslint-disable-next-line no-console
    console.warn(
      `\n${'='.repeat(78)}\n` +
        `SKIPPED pnl-vendor-comparison.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  const CYCLE = '2026-05-1H'
  const RANGE_START = '2026-05-01'
  const RANGE_END = '2026-05-15'

  let realDataSource: DataSource
  let queryRunner: QueryRunner
  let service: PnlService
  let groupId: string
  // Read from the data rather than hardcoded: vendor names come from a Google Sheet and a literal
  // here would rot the moment the sheet is edited, turning a real regression into a fixture bug.
  let busiestVendor: string

  beforeAll(async () => {
    realDataSource = new DataSource({
      type: 'postgres',
      url: CONNECTION_URL,
      synchronize: false,
      logging: false,
    })
    await realDataSource.initialize()
  })

  afterAll(async () => {
    if (realDataSource?.isInitialized) {
      await realDataSource.destroy()
    }
  })

  beforeEach(async () => {
    queryRunner = realDataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    // Route the service through this exact transactional connection so it sees the uncommitted seed
    // rows below. dataSource.query() on the pooled DataSource could land on another connection.
    service = new PnlService({
      query: (sql: string, params?: unknown[]) => queryRunner.query(sql, params),
    } as unknown as DataSource)

    const [row] = await queryRunner.query(
      `SELECT vendor
       FROM v_pnl_to
       WHERE vendor IS NOT NULL AND vendor <> ''
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL
         AND cycle_ata = $1
       GROUP BY vendor
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      [CYCLE],
    )
    busiestVendor = row?.vendor
    // Sanity: without a vendor that actually has rows this cycle, every assertion below would pass
    // vacuously at 0 == 0.
    expect(busiestVendor).toBeTruthy()

    groupId = randomUUID()
    await queryRunner.query(`INSERT INTO vendor_groups (id, name) VALUES ($1, $2)`, [
      groupId,
      'INT-TEST Vendor Group',
    ])
    await queryRunner.query(
      `INSERT INTO vendor_group_vendors (vendor_group_id, vendor) VALUES ($1, $2)`,
      [groupId, busiestVendor],
    )
  })

  afterEach(async () => {
    // Rolled back, never committed: vendor_groups / vendor_group_vendors are left as found.
    await queryRunner.rollbackTransaction()
    await queryRunner.release()
  })

  const group = () => ({ kind: 'group' as const, id: groupId })

  it('runs in cycle mode without throwing', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)
    expect(result.columns.map((c) => c.id)).toEqual([`vg:${groupId}`])
    expect(result.footer).toHaveLength(1)
  })

  it('runs in range mode without throwing', async () => {
    const result = await service.getVendorComparison(
      [group()],
      undefined,
      RANGE_START,
      RANGE_END,
    )
    expect(result.columns).toHaveLength(1)
  })

  it('runs in the no-filter fallback (WHERE 1=0) without throwing', async () => {
    await expect(service.getVendorComparison([group()])).resolves.toBeDefined()
  })

  it('gives a bare vendor column the same numbers as the group holding only that vendor', async () => {
    const result = await service.getVendorComparison(
      [group(), { kind: 'vendor', name: busiestVendor }],
      CYCLE,
    )

    expect(result.columns.map((c) => c.kind)).toEqual(['group', 'vendor'])
    expect(result.footer[1].totalRevenue).toBeCloseTo(result.footer[0].totalRevenue, 6)
    expect(result.footer[1].totalCost).toBeCloseTo(result.footer[0].totalCost, 6)
    expect(result.footer[1].totalMargin).toBeCloseTo(result.footer[0].totalMargin, 6)
  })

  it('sums TO-grain cost across every route for a vendor without dropping or double-counting a TO', async () => {
    // This proves the row-grouped aggregation is associative — summing every per-route cell back up
    // lands exactly on the ungrouped SUM(cost_to)/SUM(revenue_total)/SUM(cost_smu_awb*weight_share)
    // for the vendor. It does NOT prove weight_share proration is correct: that identity holds
    // whether or not any AWB actually spans more than one route, and would hold just the same under
    // the buggy MAX(cost_smu_awb) GROUP BY awb rollup the Cost by Vendor panel uses, as long as that
    // rollup were re-grouped by route and re-summed the same way. The real proration check — which
    // needs an AWB whose TOs land on more than one route — lives in the guarded test below, because
    // no AWB attributed to any vendor in this cycle currently spans a route.
    const [expected] = await queryRunner.query(
      `SELECT
         COALESCE(SUM(cost_to), 0)                      AS cost,
         COALESCE(SUM(revenue_total), 0)                AS revenue,
         COALESCE(SUM(cost_smu_awb * weight_share)
                  FILTER (WHERE cost_to IS NOT NULL), 0) AS cost_smu
       FROM v_pnl_to
       WHERE cycle_ata = $1 AND vendor = $2
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL`,
      [CYCLE, busiestVendor],
    )
    expect(Number(expected.cost)).toBeGreaterThan(0)

    const result = await service.getVendorComparison([group()], CYCLE)
    const summed = result.rows.reduce(
      (acc, row) => {
        const cell = row.cells[0]
        if (!cell) return acc
        return {
          cost: acc.cost + cell.cost,
          revenue: acc.revenue + cell.revenue,
          costSmu: acc.costSmu + cell.costSmu,
        }
      },
      { cost: 0, revenue: 0, costSmu: 0 },
    )

    expect(summed.cost).toBeCloseTo(Number(expected.cost), 4)
    expect(summed.revenue).toBeCloseTo(Number(expected.revenue), 4)
    expect(summed.costSmu).toBeCloseTo(Number(expected.cost_smu), 4)
  })

  // Real proration check, guarded on the data actually containing a multi-route AWB for the chosen
  // vendor. Unlike the test above, this is not associativity-trivial: it targets one AWB known to
  // have TOs on more than one route, and checks (a) that AWB's own prorated contributions split
  // across its routes and sum back to its single AWB-grain cost_smu_awb value rather than each route
  // getting the whole thing, and (b) that the service's per-route cell for each of those routes
  // matches an independent per-route recompute of the same formula the service uses — which the
  // buggy MAX(cost_smu_awb) GROUP BY awb rollup would inflate for exactly these routes, since it
  // would post this AWB's full cost_smu_awb onto every route it touches instead of a weight_share
  // fraction of it.
  it("splits a multi-route AWB's SMU cost across its routes instead of posting the whole amount to each (guarded)", async () => {
    const [candidate] = await queryRunner.query(
      `SELECT awb, MAX(cost_smu_awb) AS total_cost_smu
       FROM v_pnl_to
       WHERE cycle_ata = $1 AND vendor = $2
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL
         AND cost_smu_awb IS NOT NULL
       GROUP BY awb
       HAVING COUNT(DISTINCT origin_station || ' -> ' || dest_station) > 1
       LIMIT 1`,
      [CYCLE, busiestVendor],
    )

    if (!candidate) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n${'='.repeat(78)}\n` +
          `UNVERIFIED: weight_share proration for vendor "${busiestVendor}" in cycle ${CYCLE} — no ` +
          `AWB attributed to this vendor this cycle has TOs on more than one route, so the ` +
          `split-vs-whole-posting property cannot be exercised against this dataset right now. ` +
          `This test passes vacuously until a qualifying AWB exists.\n` +
          `${'='.repeat(78)}\n`,
      )
      return
    }

    const totalCostSmu = Number(candidate.total_cost_smu)
    expect(totalCostSmu).toBeGreaterThan(0)

    // This AWB's own prorated contribution to each route it touches.
    const perRouteForAwb = await queryRunner.query(
      `SELECT origin_station, dest_station,
         COALESCE(SUM(cost_smu_awb * weight_share)
                  FILTER (WHERE cost_to IS NOT NULL), 0) AS cost_smu
       FROM v_pnl_to
       WHERE cycle_ata = $1 AND vendor = $2 AND awb = $3
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL
       GROUP BY origin_station, dest_station`,
      [CYCLE, busiestVendor, candidate.awb],
    )

    expect(perRouteForAwb.length).toBeGreaterThan(1)
    const summedContribution = perRouteForAwb.reduce(
      (sum: number, r: { cost_smu: string }) => sum + Number(r.cost_smu),
      0,
    )
    // Conservation: the AWB's per-route fractions add back up to its single AWB-grain value.
    expect(summedContribution).toBeCloseTo(totalCostSmu, 4)
    // Split, not whole: no single route carries the entire AWB cost — that is exactly what the
    // buggy per-AWB rollup would do instead.
    for (const r of perRouteForAwb) {
      expect(Number(r.cost_smu)).toBeLessThan(totalCostSmu)
    }

    // Now confirm the service itself produces these per-route splits, not the buggy whole-posting
    // alternative, for every route this AWB touches.
    const result = await service.getVendorComparison([group()], CYCLE)
    for (const r of perRouteForAwb) {
      const row = result.rows.find(
        (row) => row.origin === r.origin_station && row.dest === r.dest_station,
      )
      expect(row).toBeDefined()
      const cell = row!.cells[0]
      expect(cell).toBeTruthy()

      const [independentRoute] = await queryRunner.query(
        `SELECT COALESCE(SUM(cost_smu_awb * weight_share)
                          FILTER (WHERE cost_to IS NOT NULL), 0) AS cost_smu
         FROM v_pnl_to
         WHERE cycle_ata = $1 AND vendor = $2
           AND origin_station = $3 AND dest_station = $4`,
        [CYCLE, busiestVendor, r.origin_station, r.dest_station],
      )

      // Had the service posted this AWB's whole cost_smu_awb onto this route instead of its
      // weight_share fraction, this cell would be inflated above the independent per-route
      // recompute by (totalCostSmu - r.cost_smu) and this equality would fail.
      expect(cell!.costSmu).toBeCloseTo(Number(independentRoute.cost_smu), 4)
    }
  })

  it('sums the four cost components to the cell cost for every non-null cell', async () => {
    const cycleResult = await service.getVendorComparison([group()], CYCLE)
    const rangeResult = await service.getVendorComparison(
      [group()],
      undefined,
      RANGE_START,
      RANGE_END,
    )

    let checkedCells = 0
    for (const result of [cycleResult, rangeResult]) {
      for (const row of result.rows) {
        for (const cell of row.cells) {
          if (!cell) continue
          checkedCells += 1
          expect(cell.costSmu + cell.costRa + cell.costSgOut + cell.costSgIn).toBeCloseTo(
            cell.cost,
            4,
          )
        }
      }
    }
    expect(checkedCells).toBeGreaterThan(0)
  })

  // The response cell does not carry revenue_discount on its own (only revenue, cost and the
  // already-netted margin), so this checks margin against a direct query of the same expression the
  // service's SQL uses (revenue - discount - cost), computed independently over the same filter —
  // and also checks it against SUM(gross_profit_to), the rollup the Cost by Vendor panel uses, to
  // prove the service did not take that NULL-propagating shortcut. gross_profit_to is NULL on any
  // TO with no cost data, so SUM(gross_profit_to) silently drops that TO's revenue and discount too
  // (rather than netting a zero cost against them, which is what "no cost data yet" should mean),
  // understating margin by however much revenue sits on incomplete-cost TOs.
  it('computes margin as revenue minus discount minus cost, not SUM(gross_profit_to)', async () => {
    const [independent] = await queryRunner.query(
      `SELECT
         COALESCE(SUM(revenue_total), 0)
           - COALESCE(SUM(revenue_discount), 0)
           - COALESCE(SUM(cost_to), 0)       AS margin,
         COALESCE(SUM(gross_profit_to), 0)   AS gross_profit_sum
       FROM v_pnl_to
       WHERE cycle_ata = $1 AND vendor = $2
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL`,
      [CYCLE, busiestVendor],
    )
    const independentMargin = Number(independent.margin)
    const grossProfitSum = Number(independent.gross_profit_sum)
    // Sanity: on this data the two ground-truth figures already disagree, or the assertion below
    // would pass even if the service took the shortcut.
    expect(Math.abs(independentMargin - grossProfitSum)).toBeGreaterThan(
      Math.abs(independentMargin) * 0.01,
    )

    const result = await service.getVendorComparison([group()], CYCLE)
    const totalMargin = result.footer[0].totalMargin

    expect(totalMargin).toBeCloseTo(independentMargin, 4)
    expect(Math.abs(totalMargin - grossProfitSum)).toBeGreaterThan(Math.abs(totalMargin) * 0.01)
  })

  it('divides Avg / Route by the routes that have a cell, not by every route', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)
    const footer = result.footer[0]
    const nonNull = result.rows.filter((r) => r.cells[0] !== null).length

    expect(footer.routesWithData).toBe(nonNull)
    expect(nonNull).toBeGreaterThan(0)
    // Strictly fewer than every station pair, or this test proves nothing about the divisor.
    expect(nonNull).toBeLessThan(result.rows.length)
    expect(footer.avgRevenuePerRoute!).toBeCloseTo(footer.totalRevenue / nonNull, 6)
    expect(footer.avgMarginPerRoute!).toBeCloseTo(footer.totalMargin / nonNull, 6)
  })

  it('never emits a station-less row, so nothing can pose as a second footer', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)

    expect(result.rows.every((r) => !!r.origin && !!r.dest)).toBe(true)
    // One footer entry per column, exactly. A station_mapping_missing row leaking through the
    // GROUPING SETS guard would show up as extra issue AWBs on this single entry.
    expect(result.footer).toHaveLength(result.columns.length)
  })

  it('reports coverage below the period total, because most TOs have no vendor', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)

    expect(result.coverage.revenuePeriod).toBeGreaterThan(0)
    expect(result.coverage.revenueInColumns).toBeGreaterThan(0)
    expect(result.coverage.revenueInColumns).toBeLessThan(result.coverage.revenuePeriod)
  })
})
