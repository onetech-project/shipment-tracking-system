import { fixtureSource } from './__fixtures__/source'
import { createState } from './state'
import { defaultScope } from './scope'
import { actualDistribution, consolidateHistory, historyDetailByPeriod } from './history'
import { UNBOOKED_LABEL } from './constants'

const src = fixtureSource()
src.history.push({
  cycle: '2026-07-1H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 2,
  weight: 500, revenue: 1, costAll: 0, laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0,
})
const s = createState(src)
const all = new Set(['ESP', 'PELITA', 'PRIME', 'SILI', UNBOOKED_LABEL])

it('counts a route once in the grand total even when it sits in two groups', () => {
  const c = consolidateHistory(src, s, { periods: src.cycles, vendors: all, scope: defaultScope(src, s) })
  const subtotalSum = c.groups.reduce((a, g) => a + g.subtotal.weight, 0)
  expect(c.dupes).toBeGreaterThan(0)
  expect(c.grand.weight).toBeLessThan(subtotalSum)
  expect(c.grand.weight).toBe(src.history.reduce((a, h) => a + h.weight, 0))
})

it('filters unbooked weight through its own vendor label', () => {
  const booked = consolidateHistory(src, s, { periods: src.cycles, vendors: new Set(['ESP', 'PELITA', 'PRIME', 'SILI']), scope: defaultScope(src, s) })
  const withUnbooked = consolidateHistory(src, s, { periods: src.cycles, vendors: all, scope: defaultScope(src, s) })
  expect(withUnbooked.grand.weight - booked.grand.weight).toBe(500)
})

it('breaks history down per cycle and skips empty cycles', () => {
  const d = historyDetailByPeriod(src, s, { periods: ['2026-06-1H', '2030-01-1H'], vendors: all, scope: defaultScope(src, s) })
  expect(d.map((p) => p.cycle)).toEqual(['2026-06-1H'])
})

it('averages actual distribution per day over the history range, unbooked included', () => {
  const rows = actualDistribution(src, s)
  const unbooked = rows.find((r) => r.vendor === UNBOOKED_LABEL)!
  expect(unbooked.kgDay).toBeCloseTo(500 / 90)
})
