import { solveLP } from './lp'
import { planCandidates, simOpts, trancheBudget } from './budget'
import { laneOf } from './state'
import { PlanRow, SimOpts, SimState, SimulationSource } from '../types'

// Variables: kg/day per lane. Constraints: lane load, route tonnage, account daily capital.
// Objective: largest daily margin. Floors to whole kg, then greedily refills the rounding slack
// from the highest margin/kg down.
export function optimizePlan(source: SimulationSource, s: SimState, opts?: SimOpts): PlanRow[] {
  const cands = planCandidates(source, s)
  if (!cands.length) return []
  const A: number[][] = []
  const b: number[] = []
  const row = (fn: (c: (typeof cands)[number], j: number) => number) => cands.map(fn)
  cands.forEach((c, i) => { A.push(row((_, j) => (i === j ? 1 : 0))); b.push(c.load) })
  for (const r of s.routes) {
    const first = cands.find((c) => c.lane.route === r.key)
    if (!first) continue
    A.push(row((c) => (c.lane.route === r.key ? 1 : 0)))
    b.push(first.demand)
  }
  const SCALE = 10000 // brings rupiah rows to the same magnitude as kg rows
  const budget: Record<string, number> = {}
  for (const a of s.accounts) {
    if (!cands.some((c) => c.account.id === a.id)) continue
    budget[a.id] = a.tranches.reduce((sum, t) => sum + trancheBudget(t, opts).perDay, 0)
    A.push(row((c) => (c.account.id === a.id ? c.m.costPerKg / SCALE : 0)))
    b.push(budget[a.id] / SCALE)
  }
  const { x } = solveLP(cands.map((c) => c.m.netPerKg), A, b)
  const kg = x.map((v) => Math.floor(v + 1e-6))
  const room: Record<string, number> = {}
  cands.forEach((c, i) => {
    if (!(c.lane.route in room)) room[c.lane.route] = c.demand
    room[c.lane.route] -= kg[i]
    budget[c.account.id] -= kg[i] * c.m.costPerKg
  })
  cands
    .map((_, i) => i)
    .sort((i, j) => cands[j].m.netPerKg - cands[i].m.netPerKg || i - j)
    .forEach((i) => {
      const c = cands[i]
      const add = Math.floor(Math.min(room[c.lane.route], c.load - kg[i], budget[c.account.id] / c.m.costPerKg) + 1e-6)
      if (add < 1) return
      kg[i] += add
      room[c.lane.route] -= add
      budget[c.account.id] -= add * c.m.costPerKg
    })
  const acctIdx = (id: string) => s.accounts.findIndex((a) => a.id === id)
  const routeIdx = (key: string) => s.routes.findIndex((r) => r.key === key)
  return cands
    .map((c, i) => ({ lane: c.lane.id, kg: kg[i] }))
    .filter((p) => p.kg >= 1)
    .sort((p, q) => {
      const lp = laneOf(s, p.lane)!
      const lq = laneOf(s, q.lane)!
      return routeIdx(lp.route) - routeIdx(lq.route) || acctIdx(lp.vendor) - acctIdx(lq.vendor) || lp.id.localeCompare(lq.id)
    })
}

export function simPlan(source: SimulationSource, s: SimState): PlanRow[] {
  if (!s.sim.kg) return optimizePlan(source, s, simOpts(s))
  return Object.keys(s.sim.kg)
    .filter((id) => laneOf(s, id))
    .map((id) => ({ lane: id, kg: s.sim.kg![id] }))
}
