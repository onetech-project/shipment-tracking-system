import { accountOf, cycleDays } from './state'
import { laneMargin, LaneMargin, routeDemand, trancheCofPerDay } from './margin'
import { Account, Lane, SimOpts, SimState, SimulationSource, Tranche } from '../types'

export const simOpts = (s: Pick<SimState, 'sim'>): SimOpts => ({
  days: s.sim.days && s.sim.days > 0 ? Math.round(s.sim.days) : null,
  cash: s.sim.cash ?? {},
})

// Money spent today returns after the payment cycle, so the daily allowance is cash / cycle. When
// only Y days ahead are simulated and Y is shorter than the cycle, the cash may be spent within Y.
export function trancheBudget(t: Tranche, opts?: SimOpts) {
  const own = opts?.cash?.[t.id] != null
  const cash = Math.max(0, Number(own ? opts!.cash[t.id] : t.amount) || 0)
  const window = opts?.days ? Math.min(Math.max(1, opts.days), cycleDays(t)) : cycleDays(t)
  return { cash, window, perDay: cash / window }
}

export const trancheCofRate = (t: Tranche) => (Number(t.amount) > 0 ? trancheCofPerDay(t) / t.amount : 0)

export const trancheOrder = (account: Account) =>
  [...account.tranches].sort(
    (x, y) => trancheCofRate(x) - trancheCofRate(y) || cycleDays(x) - cycleDays(y) || x.id.localeCompare(y.id),
  )

export interface Candidate {
  lane: Lane
  account: Account
  m: LaneMargin
  load: number
  demand: number
}

export function planCandidates(source: SimulationSource, s: SimState): Candidate[] {
  const demand: Record<string, number> = {}
  s.routes.forEach((r) => { demand[r.key] = routeDemand(source, s, r.key) })
  const out: Candidate[] = []
  for (const lane of s.lanes) {
    const account = accountOf(s, lane.vendor)
    if (!account) continue
    const c = { lane, account, m: laneMargin(s, lane), load: Number(lane.loadKg) || 0, demand: demand[lane.route] ?? 0 }
    if (lane.enabled && account.enabled && account.tranches.length && c.m.netPerKg > 0 && c.m.costPerKg > 0 && c.load > 0 && c.demand > 0) out.push(c)
  }
  return out
}
