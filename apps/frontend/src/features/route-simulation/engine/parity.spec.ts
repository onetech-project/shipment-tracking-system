/**
 * The port must produce exactly the prototype's recommendation for the prototype's own data. The
 * expected values were captured from the HTML in a browser (see plan 2, Task 5 Step 4); if this
 * fails, the port changed behaviour — fix the port, do not re-capture.
 */
import { expected } from './__fixtures__/prototype-parity'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { buildLanes, createState } from './state'
import { optimizePlan } from './optimize'
import { evaluatePlan } from './evaluate'

it('matches the prototype plan, totals and reasons on the seed data', () => {
  const src = fixtureSource()
  const s0 = { ...createState(src), histStart: '2026-06-1H', histEnd: '2026-08-2H', accounts: PROTOTYPE_ACCOUNTS }
  const s = { ...s0, lanes: buildLanes(src, s0) }
  const plan = optimizePlan(src, s)
  const res = evaluatePlan(src, s, plan)
  expect(plan).toEqual(expected.plan.map((p) => ({ ...p })))
  expect(Math.round(res.totals.net)).toBe(expected.net)
  expect(Math.round(res.totals.revenue)).toBe(expected.revenue)
  expect(Math.round(res.totals.cost)).toBe(expected.cost)
  expect(res.perRoute.map((r) => [r.route.key, r.reason])).toEqual(expected.reasons.map((x) => [...x]))
})
