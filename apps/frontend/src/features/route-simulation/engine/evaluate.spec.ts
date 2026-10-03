import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState } from './state'
import { optimizePlan } from './optimize'
import { evaluatePlan } from './evaluate'

const src = fixtureSource()
const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('produces no violations for the optimal plan', () => {
  const res = evaluatePlan(src, s, optimizePlan(src, s))
  expect(res.violations).toEqual([])
  expect(res.totals.net).toBeCloseTo(res.totals.revenue - res.totals.cost + res.totals.cashback - res.totals.cof)
})

it('flags load, tonnage, and capital overruns on a manual plan', () => {
  const lane = s.lanes.find((l) => l.vendor === 'PELITA')!
  const res = evaluatePlan(src, s, [{ lane: lane.id, kg: 1_000_000 }])
  const types = res.violations.map((v) => v.type).sort()
  expect(types).toEqual(['load', 'modal', 'tonase'])
  const modal = res.violations.find((v) => v.type === 'modal')!
  expect(modal.type === 'modal' && modal.runoutDay).toBe(0)
})

it('spends the cheapest tranche first and parks the overflow on the last', () => {
  const esp = s.lanes.find((l) => l.vendor === 'ESP')!
  const res = evaluatePlan(src, s, [{ lane: esp.id, kg: 2000 }])
  const espTr = res.perTranche.filter((x) => x.account.id === 'ESP')
  expect(espTr.find((x) => x.tranche.id === 'ESP-1')!.spendDay).toBeGreaterThan(0)
})

it('explains every route', () => {
  const res = evaluatePlan(src, s, optimizePlan(src, s))
  expect(res.perRoute.every((r) => ['single', 'load', 'modal', 'idle', 'none'].includes(r.reason))).toBe(true)
})

it('rejects a row pointing at a disabled lane', () => {
  const lane = s.lanes[0]
  const off = { ...s, lanes: s.lanes.map((l) => (l.id === lane.id ? { ...l, enabled: false } : l)) }
  expect(evaluatePlan(src, off, [{ lane: lane.id, kg: 1 }]).violations).toEqual([{ type: 'invalid', row: 0 }])
})
