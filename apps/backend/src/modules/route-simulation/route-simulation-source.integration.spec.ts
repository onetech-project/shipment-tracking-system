/**
 * Real-database check for /route-simulation/source. The unit spec only proves which SQL text is
 * sent; this proves Postgres accepts it and, more importantly, that the history rows reconcile
 * with /pnl/summary for every cycle — the simulation's tonnage and the PnL page must never tell
 * two different stories about the same period.
 *
 * Run with: cd apps/backend && pnpm exec jest route-simulation-source.integration --runInBand
 */
import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource } from 'typeorm'
import { PnlService } from '../pnl/pnl.service'
import { RouteGroupsService } from '../route-groups/route-groups.service'
import { RouteSimulationSourceService } from './route-simulation-source.service'

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

describe('RouteSimulationSourceService (integration)', () => {
  if (!DB_AVAILABLE) {
    if (DATABASE_URL_EXPLICIT) {
      it('FAILS LOUDLY — DATABASE_URL is set but Postgres is unreachable', () => {
        throw new Error(`DATABASE_URL=${CONNECTION_URL} is set, but pg_isready could not reach it.`)
      })
      return
    }
    // eslint-disable-next-line no-console
    console.warn(`\nSKIPPED route-simulation-source.integration.spec.ts — Postgres unreachable at ${CONNECTION_URL}\n`)
    it.skip('SKIPPED — database unreachable', () => {})
    return
  }

  let dataSource: DataSource
  let service: RouteSimulationSourceService
  let pnl: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: CONNECTION_URL, synchronize: false, logging: false })
    await dataSource.initialize()
    // RouteGroupsService's repository is unused by findAll (raw SQL), so a stub is enough.
    const groups = new RouteGroupsService(dataSource, {} as never)
    service = new RouteSimulationSourceService(dataSource, groups)
    pnl = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('returns routes with rates, vendors and history from the dev data', async () => {
    const src = await service.getSource()
    expect(src.cycles.length).toBeGreaterThan(0)
    expect(src.routes.some((r) => r.hasData && r.rateSpx != null)).toBe(true)
    expect(src.history.some((h) => h.vendor === null)).toBe(true) // unbooked TOs are kept
    expect(src.history.some((h) => h.vendor !== null && h.laneWeight > 0)).toBe(true)
  })

  it('reconciles weight-independent totals with /pnl/summary per cycle', async () => {
    const src = await service.getSource()
    for (const cycle of src.cycles) {
      const rows = src.history.filter((h) => h.cycle === cycle)
      const summary = await pnl.getSummary(cycle)
      const revenue = rows.reduce((s, h) => s + h.revenue, 0)
      const cost = rows.reduce((s, h) => s + h.costAll, 0)
      // getSummary has no station filter; any TO with a null station is excluded here, so allow
      // only that gap. On dev it is zero.
      expect(revenue).toBeCloseTo(summary.totalRevenue, -2)
      expect(cost).toBeCloseTo(summary.totalCost, -2)
    }
  })

  it('never reports lane weight above total weight', async () => {
    const src = await service.getSource()
    for (const h of src.history) {
      expect(h.laneWeight).toBeLessThanOrEqual(h.weight + 1e-6)
    }
  })

  it('splits lane cost into four components that add back up to cost_to', async () => {
    const src = await service.getSource()
    const [{ total }] = await dataSource.query(`
      SELECT COALESCE(SUM(cost_to) FILTER (WHERE NOT is_cost_estimated AND cost_to IS NOT NULL), 0) AS total
      FROM v_pnl_to
      WHERE cycle_date IS NOT NULL AND origin_station IS NOT NULL AND dest_station IS NOT NULL
    `)
    const parts = src.history.reduce((s, h) => s + h.laneCostSgOut + h.laneCostSgIn + h.laneCostRa + h.laneCostSmu, 0)
    expect(parts).toBeCloseTo(Number(total), -2)
  })
})
