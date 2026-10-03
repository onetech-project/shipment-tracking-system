import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { planCandidates, trancheBudget, trancheOrder } from './budget'

const t = { id: 'x', label: 'x', amount: 600, cofType: 'percent' as const, cofValue: 1, cofUnit: 'month' as const, cycleDays: 30 }

it('spreads the cash over the payment cycle, or over a shorter horizon', () => {
  expect(trancheBudget(t)).toEqual({ cash: 600, window: 30, perDay: 20 })
  expect(trancheBudget(t, { days: 10, cash: {} })).toEqual({ cash: 600, window: 10, perDay: 60 })
  expect(trancheBudget(t, { days: 90, cash: {} }).window).toBe(30)
  expect(trancheBudget(t, { days: null, cash: { x: 300 } }).perDay).toBe(10)
})

it('spends the cheapest money first', () => {
  const esp = PROTOTYPE_ACCOUNTS.find((a) => a.id === 'ESP')!
  expect(trancheOrder(esp).map((x) => x.id)).toEqual(['ESP-1', 'ESP-2', 'ESP-3'])
})

it('keeps only usable, profitable, costed lanes on routes with demand', () => {
  const src = fixtureSource()
  const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
  const c = planCandidates(src, s)
  expect(c.length).toBeGreaterThan(0)
  expect(c.every((x) => x.m.netPerKg > 0 && x.m.costPerKg > 0 && x.load > 0 && x.demand > 0)).toBe(true)
  const off = { ...s, accounts: s.accounts.map((a) => (a.id === 'SILI' ? { ...a, enabled: false } : a)) }
  expect(planCandidates(src, off).some((x) => x.lane.vendor === 'SILI')).toBe(false)
})
