/**
 * Integration test for the non-AWB row exclusion in the v_pnl_to definition.
 *
 * The Compile Air CGK sheet reuses the AWB column as a status marker: cancelled shipments carry
 * "VOID" (any casing, sometimes with trailing whitespace), reweighed ones carry "OVERWEIGHT" /
 * "OVER WEIGHT", and a few rows carry the TO number by mistake. Those are not AWBs, so every
 * one of them collapsed into a single fake AWB inside the view: their gross weights summed into
 * one sum_gw_per_awb, their revenue landed in the P&L with no matching cost, and COUNT(DISTINCT
 * awb) counted "VOID" as a shipment. They must not reach the P&L at all.
 *
 * Rows that simply have no AWB yet (NULL or blank) are a different case — the shipment is real,
 * the number just hasn't been filled in — so those stay.
 *
 * Only the real view can prove this: the rule lives in SQL, and pnl.service.spec.ts mocks
 * dataSource.query(). This spec seeds fixture rows, refreshes the materialized view inside the
 * transaction, asserts what survives, then rolls the whole thing back.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable.
 *
 * Run with:
 *   cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" \
 *     pnpm exec jest pnl-awb-exclusion.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource, QueryRunner } from 'typeorm'

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

// Marks every fixture row so the assertions can find them without colliding with real data.
const TAG = 'INTTEST-AWBFILTER'

// [to_number suffix, awb value, should it survive into v_pnl_to?]
const FIXTURES: Array<[string, string | null, boolean]> = [
  ['REAL', '126-99900001', true],
  ['REAL-CR', '126-99900002\r', true], // trailing carriage return: real AWBs arrive this way
  ['NULL', null, true], // no AWB yet — real shipment, number not filled in
  ['EMPTY', '', true],
  ['BLANK', '   ', true],
  ['VOID-UPPER', 'VOID', false],
  ['VOID-LOWER', 'void', false],
  ['VOID-MIXED', 'Void', false],
  ['VOID-TRAIL', 'VOID ', false],
  ['OVERWEIGHT', 'OVERWEIGHT', false],
  ['OVER-WEIGHT', 'OVER WEIGHT', false],
  ['OVER-WEIGHT-LOWER', 'over weight', false],
  ['OVERWEIGHT-LOWER', 'overweight', false],
  ['TO-NUMBER', 'TO202605305ZHRQ', false],
]

describe('v_pnl_to non-AWB exclusion (integration)', () => {
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
        `SKIPPED pnl-awb-exclusion.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  let realDataSource: DataSource
  let queryRunner: QueryRunner

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
    if (realDataSource?.isInitialized) await realDataSource.destroy()
  })

  beforeEach(async () => {
    queryRunner = realDataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    for (const [suffix, awb] of FIXTURES) {
      const extra: Record<string, unknown> = {
        to_number: `${TAG}-${suffix}`,
        gross_weight: 10,
        amount_revenue: 1000000,
        additional_amount_packing_kayu: 0,
        completed_time: '02-May-2026 22:08',
        ata_vendor_wh_destination: '03-May-2026 13:26',
        atd_origin: '2026-05-02 13:26',
        origin_station: 'Jabo',
        destination_station: 'Balikpapan',
      }
      // Distinguish "key absent" (NULL awb) from an explicitly blank one — the view must keep both.
      if (awb !== null) extra.awb = awb
      await queryRunner.query(`INSERT INTO air_shipments_compileaircgk (extra_fields) VALUES ($1)`, [
        JSON.stringify(extra),
      ])
    }
    // Plain (non-CONCURRENT) refresh: CONCURRENTLY is not allowed inside a transaction, and this
    // one must see the uncommitted fixture rows above. Rolled back with everything else.
    await queryRunner.query(`REFRESH MATERIALIZED VIEW v_pnl_to`)
  })

  afterEach(async () => {
    // Never committed: air_shipments_compileaircgk and the view are left exactly as found.
    await queryRunner.rollbackTransaction()
    await queryRunner.release()
  })

  const survivors = async (): Promise<string[]> => {
    const rows = await queryRunner.query(
      `SELECT to_number FROM v_pnl_to WHERE to_number LIKE $1 ORDER BY to_number`,
      [`${TAG}-%`],
    )
    return rows.map((r: { to_number: string }) => r.to_number)
  }

  it('keeps rows with a real AWB and rows with no AWB yet', async () => {
    const kept = await survivors()
    const expected = FIXTURES.filter(([, , keep]) => keep)
      .map(([suffix]) => `${TAG}-${suffix}`)
      .sort()
    expect(kept.sort()).toEqual(expected)
  })

  it('drops every placeholder AWB — VOID and OVERWEIGHT in any casing, and TO numbers', async () => {
    const kept = new Set(await survivors())
    for (const [suffix, , keep] of FIXTURES) {
      if (keep) continue
      expect(kept.has(`${TAG}-${suffix}`)).toBe(false)
    }
  })

  it('leaves no non-AWB rows anywhere in the view, fixtures aside', async () => {
    const [row] = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM v_pnl_to
       WHERE awb IS NOT NULL
         AND BTRIM(awb, E' \\t\\r\\n') <> ''
         AND BTRIM(awb, E' \\t\\r\\n') !~ '^[0-9][0-9-]*$'`,
    )
    expect(row.n).toBe(0)
  })

  it('excludes placeholder revenue from the cycle summary', async () => {
    const [row] = await queryRunner.query(
      `SELECT COALESCE(SUM(revenue_total), 0)::float8 AS revenue
       FROM v_pnl_to WHERE to_number LIKE $1`,
      [`${TAG}-%`],
    )
    // 5 surviving fixtures × 1,000,000 revenue each; the 9 placeholders contribute nothing.
    expect(row.revenue).toBe(5_000_000)
  })
})
