/**
 * Integration test for PnlService.getRouteComparison.
 *
 * pnl.service.spec.ts mocks dataSource.query(), so it can assert what SQL text got sent but
 * cannot tell whether Postgres would actually accept it. That gap is exactly how the `v.v.date_ata`
 * double-prefix bug (buildFilter's dateCol already carries the 'v.' alias; the query prefixed it
 * again) shipped behind 8 green tests: the query was syntactically wrong and nothing ever ran it.
 * This spec runs the real query, against a real database, through the real service method.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable, so this file still passes
 * on a machine without Postgres.
 *
 * Run with:
 *   cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" \
 *     pnpm exec jest pnl-group-comparison.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { DataSource, QueryRunner } from 'typeorm'
import { PnlService } from './pnl.service'

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

describe('PnlService.getRouteComparison (integration)', () => {
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
        `SKIPPED pnl-group-comparison.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  // Real station pairs with known data, from the live view (cycle 2026-05-1H). SHARED_DEST is
  // shared by both groups; A_ONLY_DEST / B_ONLY_DEST each belong to exactly one.
  const SHARED_ORIGIN = 'Jabo'
  const SHARED_DEST = 'Denpasar'
  const A_ONLY_DEST = 'Balikpapan'
  const B_ONLY_DEST = 'Batam'
  const CYCLE = '2026-05-1H'
  const RANGE_START = '2026-05-01'
  const RANGE_END = '2026-05-15'
  const SHARED_ROUTE_DATE = '2026-05-02' // has data on all three routes above

  let realDataSource: DataSource
  let queryRunner: QueryRunner
  let service: PnlService
  let groupA: string
  let groupB: string

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

    // Route the service through this exact transactional connection so it sees the uncommitted
    // seed rows below. dataSource.query() on the pooled DataSource could land on a different
    // connection and see nothing (or worse, block on the row locks this transaction holds).
    service = new PnlService({
      query: (sql: string, params?: unknown[]) => queryRunner.query(sql, params),
    } as unknown as DataSource)

    groupA = randomUUID()
    groupB = randomUUID()
    await queryRunner.query(`INSERT INTO route_groups (id, name) VALUES ($1, $2), ($3, $4)`, [
      groupA,
      'INT-TEST Group A',
      groupB,
      'INT-TEST Group B',
    ])
    // Deliberately overlapping: SHARED_DEST is in both groups; each group also has one route the
    // other doesn't, so a naive "everything sums the same" bug wouldn't be visible without this.
    await queryRunner.query(
      `INSERT INTO route_group_routes (route_group_id, origin_station, dest_station) VALUES
       ($1, $2, $3),
       ($1, $2, $4),
       ($5, $2, $3),
       ($5, $2, $6)`,
      [groupA, SHARED_ORIGIN, SHARED_DEST, A_ONLY_DEST, groupB, B_ONLY_DEST],
    )
  })

  afterEach(async () => {
    // Rolled back, never committed: route_groups / route_group_routes are left exactly as found.
    await queryRunner.rollbackTransaction()
    await queryRunner.release()
  })

  // A group pick, shorthand so the fixture calls below read as picks rather than raw ids.
  const pick = (id: string) => ({ kind: 'group' as const, id })

  // This is the assertion that would have caught the v.v.date_ata bug: it was a SQL syntax error,
  // so any real execution in any filter mode throws. The mocked unit spec cannot see that.
  it('runs in cycle mode without throwing', async () => {
    const result = await service.getRouteComparison([pick(groupA), pick(groupB)], CYCLE)
    expect(result.columns.map((c) => c.id)).toEqual([groupA, groupB])
  })

  it('runs in range mode without throwing', async () => {
    const result = await service.getRouteComparison(
      [pick(groupA), pick(groupB)],
      undefined,
      RANGE_START,
      RANGE_END,
    )
    expect(result.columns.map((c) => c.id)).toEqual([groupA, groupB])
  })

  it('runs in the no-filter fallback (WHERE 1=0) without throwing', async () => {
    await expect(service.getRouteComparison([pick(groupA), pick(groupB)])).resolves.toBeDefined()
  })

  it('gives a bare route column the same numbers as the group that contains it', async () => {
    // groupA and groupB both hold two routes in this fixture, so neither is "the group whose only
    // route is X" on its own. Seed a third, single-route group here (same INSERT shape as
    // beforeEach, rolled back by the same afterEach) so the equality below is meaningful rather
    // than vacuous.
    const groupC = randomUUID()
    await queryRunner.query(`INSERT INTO route_groups (id, name) VALUES ($1, $2)`, [
      groupC,
      'INT-TEST Group C (single route)',
    ])
    await queryRunner.query(
      `INSERT INTO route_group_routes (route_group_id, origin_station, dest_station) VALUES ($1, $2, $3)`,
      [groupC, SHARED_ORIGIN, SHARED_DEST],
    )

    const result = await service.getRouteComparison(
      [pick(groupC), { kind: 'route', origin: SHARED_ORIGIN, dest: SHARED_DEST }],
      CYCLE,
    )

    expect(result.columns.map((c) => c.kind)).toEqual(['group', 'route'])
    expect(result.footer[1].totalRevenue).toBe(result.footer[0].totalRevenue)
    expect(result.footer[1].totalCost).toBe(result.footer[0].totalCost)
  })

  it('counts the shared route revenue in both groups columns', async () => {
    // Net, matching what the comparison cells report.
    const revenueOf = async (dest: string): Promise<number> => {
      const [row] = await queryRunner.query(
        `SELECT COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0) AS rev
         FROM v_pnl_to
         WHERE origin_station = $1 AND dest_station = $2 AND date_ata::date = $3::date`,
        [SHARED_ORIGIN, dest, SHARED_ROUTE_DATE],
      )
      return Number(row.rev)
    }
    const sharedRev = await revenueOf(SHARED_DEST)
    const aOnlyRev = await revenueOf(A_ONLY_DEST)
    const bOnlyRev = await revenueOf(B_ONLY_DEST)
    // Sanity: the fixture routes actually have data on this date, or the assertions below would
    // pass vacuously at 0 == 0.
    expect(sharedRev).toBeGreaterThan(0)
    expect(aOnlyRev).toBeGreaterThan(0)
    expect(bOnlyRev).toBeGreaterThan(0)

    const result = await service.getRouteComparison([pick(groupA), pick(groupB)], CYCLE)
    const row = result.rows.find((r) => r.date === SHARED_ROUTE_DATE)!

    // Group A = shared route + A-only route; Group B = shared route + B-only route. If the shared
    // route were only counted in one column, one of these two equalities would fail.
    expect(row.cells[0]!.revenue).toBeCloseTo(sharedRev + aOnlyRev, 6)
    expect(row.cells[1]!.revenue).toBeCloseTo(sharedRev + bOnlyRev, 6)
  })

  it('sums the four cost components to the cell cost for every non-null cell', async () => {
    const cycleResult = await service.getRouteComparison([pick(groupA), pick(groupB)], CYCLE)
    const rangeResult = await service.getRouteComparison(
      [pick(groupA), pick(groupB)],
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
    // Sanity: the fixture actually produced non-null cells to check, or the loop above proved
    // nothing.
    expect(checkedCells).toBeGreaterThan(0)
  })

  // The response cell does not carry revenue_discount on its own (only revenue, cost and the
  // already-netted margin), so this checks margin against a direct query of the same expression
  // the service's SQL uses, rather than reconstructing it from response fields alone.
  it('keeps margin consistent with net revenue minus cost, for every non-null cell', async () => {
    const cycleResult = await service.getRouteComparison([pick(groupA), pick(groupB)], CYCLE)
    const rangeResult = await service.getRouteComparison(
      [pick(groupA), pick(groupB)],
      undefined,
      RANGE_START,
      RANGE_END,
    )

    // Gross revenue and discount straight from the view, so the expected net figure is computed
    // from the source rather than from the value under test.
    const grossAndDiscountOf = async (
      origin: string,
      dest: string,
      date: string,
    ): Promise<{ gross: number; discount: number }> => {
      const [row] = await queryRunner.query(
        `SELECT COALESCE(SUM(revenue_total), 0) AS g, COALESCE(SUM(revenue_discount), 0) AS d
         FROM v_pnl_to
         WHERE origin_station = $1 AND dest_station = $2 AND date_ata::date = $3::date`,
        [origin, dest, date],
      )
      return { gross: Number(row.g), discount: Number(row.d) }
    }

    let checkedCells = 0
    for (const result of [cycleResult, rangeResult]) {
      for (const row of result.rows) {
        for (let ci = 0; ci < result.columns.length; ci++) {
          const cell = row.cells[ci]
          if (!cell) continue
          const routes = result.columns[ci].routes
          let gross = 0
          let discount = 0
          for (const r of routes) {
            const g = await grossAndDiscountOf(r.origin, r.dest, row.date)
            gross += g.gross
            discount += g.discount
          }
          // The cell reports revenue net, computed from the view's own gross and discount.
          expect(cell.revenue).toBeCloseTo(gross - discount, 4)
          // And because revenue is net, margin is simply revenue − cost.
          expect(cell.margin).toBeCloseTo(cell.revenue - cell.cost, 4)
          checkedCells += 1
        }
      }
    }
    // Sanity: the fixture actually produced non-null cells to check, or the loop above proved
    // nothing.
    expect(checkedCells).toBeGreaterThan(0)
  })
})
