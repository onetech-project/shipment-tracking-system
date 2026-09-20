/**
 * Integration test for the P&L Estimated tab's cross-panel reconciliation.
 *
 * Fourteen prior tasks built a scope filter (route / route-group / date window) that narrows
 * every panel of the P&L Estimated tab. Their unit tests assert what SQL text got sent to
 * dataSource.query() — they cannot tell whether Postgres would accept that SQL, and they cannot
 * prove the panels agree with each other once it runs. This spec runs the real queries, against a
 * real database, through the real PnlService methods, and checks that the KPI cards, the daily
 * chart, the cost breakdown, and the AWB drilldown reconcile with each other ON THE SAME DATA —
 * never against a hardcoded rupiah figure, which would rot the moment the data drifts.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable, so this file still passes
 * on a machine without Postgres.
 *
 * Run with:
 *   cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" \
 *     pnpm exec jest pnl-scope.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource } from 'typeorm'
import { PnlService, PnlRouteFilter } from './pnl.service'

// Set explicitly (vs. falling back to the local dev default below) signals a caller who expects a
// real database — CI, a deploy check, someone debugging a connection. Skipping quietly in that case
// would hide a real failure behind a green-looking (skipped) file.
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

describe('PnL scope reconciliation (integration)', () => {
  if (!DB_AVAILABLE) {
    if (DATABASE_URL_EXPLICIT) {
      // Fail loudly, not skip: DATABASE_URL was set explicitly, so the caller expects a database.
      // pg_isready failing here could mean Postgres really is down, or it could mean this host just
      // doesn't have the postgresql-client package installed while a real database sits reachable —
      // either way that's a real problem the caller needs to see, not a silent skip that leaves this
      // the only SQL-level regression test on the branch quietly not running.
      it('FAILS LOUDLY — DATABASE_URL is set but pg_isready could not reach Postgres', () => {
        throw new Error(
          `DATABASE_URL=${CONNECTION_URL} is set, but pg_isready could not reach Postgres at it ` +
            `(or the pg_isready binary itself is missing from this host — install postgresql-client ` +
            `to find out which). Fix connectivity, or unset DATABASE_URL to allow this suite to skip.`,
        )
      })
      return
    }
    // Loud on purpose: a skipped file must not read like a passed one in scrollback.
    // eslint-disable-next-line no-console
    console.warn(
      `\n${'='.repeat(78)}\n` +
        `SKIPPED pnl-scope.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  const CYCLE = '2026-05-1H'
  const ROUTE = { origin: 'Jabo', dest: 'Denpasar' }

  let dataSource: DataSource
  let service: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: CONNECTION_URL })
    await dataSource.initialize()
    service = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  // Every scope is run twice — unscoped and scoped — because an invariant that only holds when
  // nothing is filtered proves nothing about the filter.
  const SCOPES: { name: string; scope: PnlRouteFilter | undefined }[] = [
    { name: 'unscoped', scope: undefined },
    { name: 'one route', scope: { routes: [ROUTE] } },
    { name: 'a date window', scope: { dateFrom: '2026-05-02', dateTo: '2026-05-08' } },
    { name: 'route and dates', scope: { routes: [ROUTE], dateFrom: '2026-05-02', dateTo: '2026-05-08' } },
  ]

  describe.each(SCOPES)('$name', ({ scope }) => {
    it('has the cost breakdown sum to the Est. Cost card', async () => {
      const [summary, totals] = await Promise.all([
        service.getSummary(CYCLE, undefined, undefined, undefined, scope),
        service.getCostTotals(CYCLE, undefined, undefined, undefined, scope),
      ])
      const breakdown = totals.smu + totals.ra + totals.sgOut + totals.sgIn
      // Floating point over thousands of rows: compare to the nearest rupiah, not bit-for-bit.
      expect(breakdown).toBeCloseTo(summary.totalCost, 0)
    })

    it('has the daily margin chart sum to the same card', async () => {
      const [summary, daily] = await Promise.all([
        service.getSummary(CYCLE, undefined, undefined, undefined, scope),
        service.getDailyMargin(CYCLE, undefined, undefined, undefined, scope),
      ])
      const revenue = daily.reduce((sum, d) => sum + d.revenue, 0)
      // The chart drops rows with no date on the active basis, so it can only ever be <=. An
      // equality here would be wrong; what matters is that it never EXCEEDS the total.
      expect(revenue).toBeLessThanOrEqual(summary.totalRevenue + 1)
    })

    it('has every drilldown row reconcile within itself', async () => {
      const { data } = await service.getAwbDrilldown(
        1, 200, CYCLE, undefined, undefined, undefined, scope,
      )
      expect(data.length).toBeGreaterThan(0)
      for (const row of data) {
        // An AWB nothing could cost has a null cost and a null GP — there is no arithmetic to
        // check on it, and asserting one would be asserting against "unknown".
        if (row.totalCost == null || row.grossProfit == null) continue
        // The defect this whole change set began with: revenue summed per TO, cost taken per
        // whole AWB, so these two differed by the out-of-scope portion of the AWB's cost.
        expect(row.totalRevenue - row.totalCost).toBeCloseTo(row.grossProfit, 0)
        const components =
          (row.costSmu ?? 0) + (row.costRa ?? 0) + (row.costSgOut ?? 0) + (row.costSgIn ?? 0)
        expect(components).toBeCloseTo(row.totalCost, 0)
      }
    })

    it('has the whole drilldown sum to the card above it', async () => {
      const summary = await service.getSummary(CYCLE, undefined, undefined, undefined, scope)
      // One page wide enough to hold the period; assert we actually got them all rather than
      // silently reconciling a prefix.
      const { data, total } = await service.getAwbDrilldown(
        1, 5000, CYCLE, undefined, undefined, undefined, scope,
      )
      expect(data.length).toBe(total)

      const revenue = data.reduce((sum, r) => sum + r.totalRevenue, 0)
      // `?? 0` is right here and not a fudge: an AWB nothing could cost contributes zero to
      // SUM(cost_to) as well, which is exactly what summary.totalCost is.
      const cost = data.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
      expect(revenue).toBeCloseTo(summary.totalRevenue, 0)
      expect(cost).toBeCloseTo(summary.totalCost, 0)
    })
  })

  it('narrows to strictly less than the unscoped period', async () => {
    // Guards against a scope clause that parses, runs, and quietly filters nothing — which every
    // invariant above would happily pass.
    const [all, scoped] = await Promise.all([
      service.getSummary(CYCLE),
      service.getSummary(CYCLE, undefined, undefined, undefined, { routes: [ROUTE] }),
    ])
    expect(scoped.totalTos).toBeGreaterThan(0)
    expect(scoped.totalTos).toBeLessThan(all.totalTos)
  })

  it('accepts a scoped query on every endpoint that takes one', async () => {
    // A smoke test for SQL validity: an ambiguous column reference in the two queries that join a
    // second table (cost-by-ra, cost-by-sg-out) would only ever surface here.
    const scope: PnlRouteFilter = { routes: [ROUTE], dateFrom: '2026-05-02' }
    await expect(
      Promise.all([
        service.getRevenueByRoute(CYCLE, undefined, undefined, undefined, scope),
        service.getProfitByRoute(CYCLE, undefined, undefined, undefined, scope),
        service.getCostByVendor(CYCLE, undefined, undefined, undefined, scope),
        service.getCostByRa(CYCLE, undefined, undefined, undefined, scope),
        service.getCostBySgOut(CYCLE, undefined, undefined, undefined, scope),
        service.getCostBySgIn(CYCLE, undefined, undefined, undefined, scope),
      ]),
    ).resolves.toBeDefined()
  })

  it('accepts a vendor scope on the two queries that join a second table', async () => {
    // Task 4's flagged risk, verified against the database: scopeSql emits unqualified column
    // names, and air_shipments_smu carries its own `vendor` column. getCostByRa and
    // getCostBySgOut join that table, so a vendor scope is the shape that previously raised
    // "column reference \"vendor\" is ambiguous" — a real 500, not a unit-test-visible failure.
    const vendorRows: { vendor: string }[] = await dataSource.query(
      'SELECT DISTINCT vendor FROM v_pnl_to WHERE vendor IS NOT NULL LIMIT 1',
    )
    expect(vendorRows.length).toBeGreaterThan(0)
    const vendorScope: PnlRouteFilter = { vendors: [vendorRows[0].vendor] }
    await expect(
      Promise.all([
        service.getCostByRa(CYCLE, undefined, undefined, undefined, vendorScope),
        service.getCostBySgOut(CYCLE, undefined, undefined, undefined, vendorScope),
      ]),
    ).resolves.toBeDefined()
  })

  it('counts revenue-less TOs that the issue chain labels as a cost problem', async () => {
    const matrix = await service.getDailyMatrix(CYCLE)
    const cells = matrix.rows.flatMap((r) => r.cells).filter((c) => c != null)
    // Shape, not a magic number: this database may or may not currently hold such a TO, and a
    // test that demanded one would fail on a clean dataset for the wrong reason.
    for (const cell of cells) {
      expect(typeof cell!.revenueMissingTos).toBe('number')
      expect(cell!.revenueMissingTos).toBeGreaterThanOrEqual(0)
    }
    for (const f of matrix.footer) {
      expect(typeof f.revenueMissingTos).toBe('number')
    }
  })
})
