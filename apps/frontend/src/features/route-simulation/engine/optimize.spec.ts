import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { createState, laneOf } from './state'
import { optimizePlan, simPlan } from './optimize'
import { routeDemand } from './margin'
import { trancheBudget } from './budget'

const src = fixtureSource()
const s = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('returns whole kg that respect load, tonnage and daily capital', () => {
  const plan = optimizePlan(src, s)
  expect(plan.length).toBeGreaterThan(0)
  const byRoute: Record<string, number> = {}
  const spend: Record<string, number> = {}
  for (const p of plan) {
    const lane = laneOf(s, p.lane)!
    expect(Number.isInteger(p.kg)).toBe(true)
    expect(p.kg).toBeLessThanOrEqual(lane.loadKg)
    byRoute[lane.route] = (byRoute[lane.route] ?? 0) + p.kg
    spend[lane.vendor] = (spend[lane.vendor] ?? 0) + p.kg * lane.costPerKg
  }
  for (const [key, kg] of Object.entries(byRoute)) expect(kg).toBeLessThanOrEqual(routeDemand(src, s, key) + 1e-6)
  for (const a of s.accounts) {
    const budget = a.tranches.reduce((x, t) => x + trancheBudget(t).perDay, 0)
    expect(spend[a.id] ?? 0).toBeLessThanOrEqual(budget + 1)
  }
})

it('gives nothing to an account with no capital', () => {
  const broke = { ...s, accounts: s.accounts.map((a) => (a.id === 'SILI' ? { ...a, tranches: a.tranches.map((t) => ({ ...t, amount: 0 })) } : a)) }
  expect(optimizePlan(src, broke).some((p) => laneOf(s, p.lane)!.vendor === 'SILI')).toBe(false)
})

it('uses the manual kg in Coba-coba when present, dropping lanes that no longer exist', () => {
  const lane = s.lanes[0].id
  const manual = { ...s, sim: { ...s.sim, kg: { [lane]: 7, 'gone~x~y': 3 } } }
  expect(simPlan(src, manual)).toEqual([{ lane, kg: 7 }])
})
