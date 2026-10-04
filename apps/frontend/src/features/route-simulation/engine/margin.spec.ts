import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { compareRoutes, laneMargin, routeDemand, routeHistTon, trancheCofPerDay } from './margin'

const src = fixtureSource()
const base = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('converts percent-per-month COF to rupiah per day', () => {
  expect(trancheCofPerDay({ amount: 300_000_000, cofType: 'percent', cofValue: 1.2, cofUnit: 'month' })).toBeCloseTo(120_000)
  expect(trancheCofPerDay({ amount: 0, cofType: 'nominal', cofValue: 5000, cofUnit: 'day' })).toBe(5000)
})

const UNBOOKED_ACEH = {
  cycle: '2026-07-1H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 3,
  weight: 900, revenue: 1, costAll: 0, costSmu: 0, laneWeightAll: 0, laneCostAll: 0, laneWeightSmu: 0, laneCostSmu: 0,
}

it('averages route tonnage per day over the history range and counts unbooked weight', () => {
  const withUnbooked = fixtureSource()
  withUnbooked.history.push(UNBOOKED_ACEH)
  const s = createState(withUnbooked)
  expect(routeHistTon(withUnbooked, s, 'Jabo|Aceh') - routeHistTon(src, createState(src), 'Jabo|Aceh')).toBeCloseTo(900 / 90)
})

it('lets an override replace history tonnage', () => {
  const s = { ...base, routes: base.routes.map((r) => (r.key === 'Jabo|Aceh' ? { ...r, overrideTon: 123 } : r)) }
  expect(routeDemand(src, s, 'Jabo|Aceh')).toBe(123)
})

it('adds the 2% cashback only on ESP accounts', () => {
  const esp = base.lanes.find((l) => l.vendor === 'ESP' && l.route === 'Jabo|Aceh')!
  const sili = base.lanes.find((l) => l.vendor === 'SILI' && l.route === 'Jabo|Aceh')!
  expect(laneMargin(base, esp).cashbackPerKg).toBeCloseTo(21500 * 0.02)
  expect(laneMargin(base, sili).cashbackPerKg).toBe(0)
})

it('ranks lanes inside a route by margin/kg and measures the gap to the best', () => {
  const aceh = compareRoutes(src, base).find((x) => x.route.key === 'Jabo|Aceh')!
  expect(aceh.lanes[0].isBest).toBe(true)
  expect(aceh.lanes[0].deltaKg).toBe(0)
  expect(aceh.lanes.every((l, i, a) => i === 0 || a[i - 1].marginKg >= l.marginKg)).toBe(true)
  expect(aceh.vendors[0].account.id).toBe(aceh.lanes[0].lane.vendor)
})
