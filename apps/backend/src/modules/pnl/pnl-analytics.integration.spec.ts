/**
 * Integration test for the three /pnl/analytics endpoints.
 *
 * pnl.service.spec.ts mocks dataSource.query(), so it can assert what SQL text got sent but cannot
 * tell whether Postgres would accept it — that gap is how the `v.v.date_ata` double-prefix bug once
 * shipped behind 8 green tests. This spec runs the real queries against a real database.
 *
 * The assertion that matters most is the last one: daily-series is a second, independent path to
 * the same revenue /pnl/summary reports. If the two ever disagree, every number on the Analytics
 * tab is quietly wrong while nothing looks broken.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable.
 *
 * Run with:
 *   cd apps/backend && pnpm exec jest pnl-analytics.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource } from 'typeorm'
import { PnlService } from './pnl.service'

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

describe('PnlService analytics endpoints (integration)', () => {
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
        `SKIPPED pnl-analytics.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  const CYCLE = '2026-05-1H'
  const RANGE_START = '2026-05-01'
  const RANGE_END = '2026-05-15'

  let dataSource: DataSource
  let service: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: CONNECTION_URL,
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    service = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('runs daily-series in cycle mode and lists every calendar day', async () => {
    const result = await service.getAnalyticsDailySeries(CYCLE)
    expect(result.dates).toHaveLength(15)
    // Sanity: the fixture cycle actually has data, or every assertion below is vacuous.
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(result.dates).toContain(row.date)
    }
  })

  it('runs daily-series in range mode and on a non-default basis', async () => {
    await expect(
      service.getAnalyticsDailySeries(undefined, RANGE_START, RANGE_END, 'atd_origin'),
    ).resolves.toBeDefined()
  })

  it('runs journey and gw-chw without throwing', async () => {
    const journey = await service.getAnalyticsJourney(CYCLE)
    const gwChw = await service.getAnalyticsGwChw(CYCLE)
    expect(journey.length).toBeGreaterThan(0)
    expect(gwChw.length).toBeGreaterThan(0)
    // Journey counts only fully-costed AWBs, so every row must carry cost.
    for (const row of journey) expect(row.cost).toBeGreaterThan(0)
  })

  it('keeps chargeable weight per AWB, not per TO', async () => {
    const gwChw = await service.getAnalyticsGwChw(CYCLE)
    const totalChwt = gwChw.reduce((s, r) => s + r.chwt, 0)

    // The naive query — SUM over TO rows — multiplies each AWB's chwt by its TO count. Comparing
    // against it proves the CTE actually collapses to one row per AWB rather than merely looking
    // like it does.
    const [naive] = await dataSource.query(
      `SELECT COALESCE(SUM(chwt_awb), 0) AS chwt FROM v_pnl_to WHERE cycle_ata = $1`,
      [CYCLE],
    )
    const [perAwb] = await dataSource.query(
      `SELECT COALESCE(SUM(chwt), 0) AS chwt
       FROM (SELECT awb, MAX(chwt_awb) AS chwt FROM v_pnl_to WHERE cycle_ata = $1 GROUP BY awb) s`,
      [CYCLE],
    )
    expect(totalChwt).toBeCloseTo(Number(perAwb.chwt), 4)
    // Sanity: some AWB in this cycle really does span multiple TOs, or the two numbers above
    // would agree even with the bug present and this test would prove nothing.
    expect(Number(naive.chwt)).toBeGreaterThan(Number(perAwb.chwt))
  })

  // The invariant most likely to break silently: daily-series is an independent path to the same
  // revenue the Estimated tab shows. If they drift, the whole Analytics tab is wrong with nothing
  // visibly broken.
  it('sums daily-series revenue to the same figure /pnl/summary reports', async () => {
    const [series, summary] = await Promise.all([
      service.getAnalyticsDailySeries(CYCLE),
      service.getSummary(CYCLE),
    ])
    const seriesRevenue = series.rows.reduce((s, r) => s + r.revenue, 0)
    expect(summary.totalRevenue).toBeGreaterThan(0)
    expect(seriesRevenue).toBeCloseTo(summary.totalRevenue, 2)
  })
})
