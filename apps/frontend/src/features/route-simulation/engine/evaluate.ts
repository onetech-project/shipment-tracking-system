import { accountOf, cycleDays, laneOf, routeOf } from './state'
import { laneMargin, routeDemand, trancheCofPerDay } from './margin'
import { planCandidates, trancheBudget, trancheOrder } from './budget'
import { Account, Lane, PlanRow, SimOpts, SimRoute, SimState, SimulationSource, Tranche } from '../types'

export type Reason = 'single' | 'load' | 'modal' | 'idle' | 'none'

export interface EvalRow {
  idx: number
  lane: Lane
  account: Account
  route: SimRoute
  kg: number
  netPerKg: number
  revenueDay: number
  costDay: number
  cashbackDay: number
  netDay: number
}

export type Violation =
  | { type: 'invalid'; row: number }
  | { type: 'modal'; account: Account; tranche: Tranche; runoutDay: number; over: number }
  | { type: 'load'; lane: Lane; over: number }
  | { type: 'tonase'; route: SimRoute; over: number }

export interface TrancheUse {
  account: Account
  tranche: Tranche
  cash: number
  window: number
  budgetDay: number
  spendDay: number
  locked: number
  idle: number
  cofDay: number
  runoutDay: number | null
  refillDay: number
}

export interface RouteResult {
  route: SimRoute
  demand: number
  served: number
  unmet: number
  rows: EvalRow[]
  reason: Reason
  revenue: number
  cost: number
  cashback: number
  net: number
}

export interface AccountResult {
  account: Account
  modal: number
  cash: number
  locked: number
  idle: number
  kg: number
  revenue: number
  cost: number
  gross: number
  cashback: number
  cof: number
  net: number
}

export type Totals = Omit<AccountResult, 'account'>

export interface Evaluation {
  days: number | null
  rows: EvalRow[]
  perRoute: RouteResult[]
  perTranche: TrancheUse[]
  perAccount: AccountResult[]
  totals: Totals
  violations: Violation[]
}

export function evaluatePlan(source: SimulationSource, s: SimState, plan: PlanRow[], opts?: SimOpts): Evaluation {
  const rows: EvalRow[] = []
  const violations: Violation[] = []
  const laneKg: Record<string, number> = {}
  const routeKg: Record<string, number> = {}

  plan.forEach((p, idx) => {
    const lane = laneOf(s, p.lane)
    const account = lane && accountOf(s, lane.vendor)
    const route = lane && routeOf(s, lane.route)
    if (!lane || !lane.enabled || !route || !account || !account.enabled || !account.tranches.length) {
      violations.push({ type: 'invalid', row: idx })
      return
    }
    const kg = Math.max(0, Number(p.kg) || 0)
    const m = laneMargin(s, lane)
    laneKg[lane.id] = (laneKg[lane.id] ?? 0) + kg
    routeKg[route.key] = (routeKg[route.key] ?? 0) + kg
    rows.push({
      idx, lane, account, route, kg, netPerKg: m.netPerKg,
      revenueDay: kg * m.revPerKg, costDay: kg * m.costPerKg, cashbackDay: kg * m.cashbackPerKg, netDay: kg * m.netPerKg,
    })
  })

  const active = s.accounts.filter((a) => a.enabled)
  const perTranche: TrancheUse[] = []
  for (const account of active) {
    let left = rows.filter((r) => r.account.id === account.id).reduce((a, r) => a + r.costDay, 0)
    const order = trancheOrder(account)
    const spend: Record<string, number> = {}
    for (const t of order) {
      const use = Math.min(left, trancheBudget(t, opts).perDay)
      spend[t.id] = use
      left -= use
    }
    if (left > 1 && order.length) spend[order[order.length - 1].id] += left
    for (const tranche of account.tranches) {
      const bud = trancheBudget(tranche, opts)
      const spendDay = spend[tranche.id] ?? 0
      const over = spendDay > bud.perDay + 1
      const locked = Math.min(bud.cash, spendDay * bud.window)
      const runoutDay = over ? Math.floor(bud.cash / spendDay) : null
      if (over) violations.push({ type: 'modal', account, tranche, runoutDay: runoutDay!, over: spendDay * bud.window - bud.cash })
      perTranche.push({
        account, tranche, cash: bud.cash, window: bud.window, budgetDay: bud.perDay, spendDay,
        locked, idle: bud.cash - locked, cofDay: trancheCofPerDay(tranche), runoutDay, refillDay: cycleDays(tranche),
      })
    }
  }

  for (const id of Object.keys(laneKg)) {
    const lane = laneOf(s, id)!
    const load = Number(lane.loadKg) || 0
    if (laneKg[id] > load + 0.5) violations.push({ type: 'load', lane, over: laneKg[id] - load })
  }

  const cands = planCandidates(source, s)
  const perRoute: RouteResult[] = s.routes.map((route) => {
    const mine = rows.filter((r) => r.route.key === route.key)
    const sum = (f: 'revenueDay' | 'costDay' | 'cashbackDay' | 'netDay') => mine.reduce((a, r) => a + r[f], 0)
    const demand = routeDemand(source, s, route.key)
    const served = routeKg[route.key] ?? 0
    if (served > demand + 0.5) violations.push({ type: 'tonase', route, over: served - demand })
    const options = cands
      .filter((c) => c.lane.route === route.key)
      .sort((a, b) => b.m.netPerKg - a.m.netPerKg || a.lane.id.localeCompare(b.lane.id))
    const used = new Set(mine.filter((r) => r.kg >= 1).map((r) => r.lane.id))
    const unmet = Math.max(0, demand - served)
    let reason: Reason
    if (!options.length) reason = 'none'
    else if (!used.size) reason = 'idle'
    else if (used.size === 1 && unmet < 1) reason = 'single'
    else reason = (laneKg[options[0].lane.id] ?? 0) >= Math.min(options[0].load, demand) - 1 ? 'load' : 'modal'
    return {
      route, demand, served, unmet, rows: mine, reason,
      revenue: sum('revenueDay'), cost: sum('costDay'), cashback: sum('cashbackDay'), net: sum('netDay'),
    }
  })

  const perAccount: AccountResult[] = active.map((account) => {
    const mine = rows.filter((r) => r.account.id === account.id)
    const sum = (f: 'kg' | 'revenueDay' | 'costDay' | 'cashbackDay') => mine.reduce((a, r) => a + r[f], 0)
    const tr = perTranche.filter((x) => x.account.id === account.id)
    const tsum = (f: 'cash' | 'locked' | 'idle' | 'cofDay') => tr.reduce((a, x) => a + x[f], 0)
    const revenue = sum('revenueDay')
    const cost = sum('costDay')
    const cashback = sum('cashbackDay')
    const cof = tsum('cofDay')
    return {
      account,
      modal: account.tranches.reduce((a, t) => a + (Number(t.amount) || 0), 0),
      cash: tsum('cash'), locked: tsum('locked'), idle: tsum('idle'), kg: sum('kg'),
      revenue, cost, gross: revenue - cost, cashback, cof, net: revenue - cost + cashback - cof,
    }
  })
  const keys = ['modal', 'cash', 'locked', 'idle', 'kg', 'revenue', 'cost', 'gross', 'cashback', 'cof', 'net'] as const
  const totals = Object.fromEntries(keys.map((k) => [k, perAccount.reduce((a, x) => a + x[k], 0)])) as Totals

  return { days: opts?.days ?? null, rows, perRoute, perTranche, perAccount, totals, violations }
}
