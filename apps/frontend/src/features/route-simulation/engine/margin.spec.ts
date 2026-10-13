import { fixtureSource, PROTOTYPE_ACCOUNTS } from './__fixtures__/source'
import { buildLanes, createState, laneId } from './state'
import { compareRoutes, espVsPartner, laneMargin, routeDemand, routeHistTon, trancheCofPerDay } from './margin'

const src = fixtureSource()
const base = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }

it('converts percent-per-month COF to rupiah per day', () => {
  expect(trancheCofPerDay({ amount: 300_000_000, cofType: 'percent', cofValue: 1.2, cofUnit: 'month' })).toBeCloseTo(120_000)
  expect(trancheCofPerDay({ amount: 0, cofType: 'nominal', cofValue: 5000, cofUnit: 'day' })).toBe(5000)
})

const UNBOOKED_ACEH = {
  cycle: '2026-07-1H', origin: 'Jabo', dest: 'Aceh', vendor: null, airline: null, awbCount: 3,
  weight: 900, revenue: 1, costAll: 0, laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0,
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

describe('espVsPartner', () => {
  // Jabo|Aceh: rate 21.500; lanes SILI Garuda, PRIME Garuda, ESP Citilink. The fixture's cost is all
  // in SMU, so a costSmu edit sets a lane's whole cost/kg. ESP adds 2% cashback = 430/kg.
  const ACEH = 'Jabo|Aceh'
  const SILI = laneId('SILI', ACEH, 'Garuda Air CGK')
  const PRIME = laneId('PRIME', ACEH, 'Garuda Air CGK')
  const ESP = laneId('ESP', ACEH, 'Citilink CGK')
  const priced = (costs: Record<string, number>, patch: Partial<typeof base> = {}) => {
    const s0 = { ...base, ...patch, laneEdits: Object.fromEntries(Object.entries(costs).map(([id, c]) => [id, { costSmu: c }])) }
    return { ...s0, lanes: buildLanes(src, s0) }
  }

  it('lets the best partner win when it beats ESP even after cashback', () => {
    const c = espVsPartner(priced({ [SILI]: 19000, [PRIME]: 19900, [ESP]: 19500 }), ACEH)
    expect(c.esp!.m.netPerKg).toBeCloseTo(2430)
    expect(c.partners.map((x) => x.account.id)).toEqual(['SILI', 'PRIME'])
    expect(c.bestPartner!.m.netPerKg).toBe(2500)
    expect(c.gap).toBeCloseTo(-70)
    expect(c.winner).toBe('partner')
  })

  it('calls it a tie within half a rupiah per kg, and an ESP win beyond', () => {
    expect(espVsPartner(priced({ [SILI]: 19000, [ESP]: 19430 }), ACEH).winner).toBe('tie')
    expect(espVsPartner(priced({ [SILI]: 19000, [ESP]: 19400 }), ACEH).winner).toBe('esp')
  })

  it('ignores disabled lanes, lanes losing money, and accounts without capital', () => {
    const c = espVsPartner(priced({ [SILI]: 30000, [PRIME]: 19900, [ESP]: 19500 }, {
      accounts: base.accounts.map((a) => (a.id === 'ESP' ? { ...a, tranches: [] } : a)),
    }), ACEH)
    expect(c.esp).toBeNull()
    expect(c.partners.map((x) => x.account.id)).toEqual(['PRIME'])
    expect(c.winner).toBe('partner')
    expect(c.gap).toBe(0)
  })

  it('has no winner when nobody has a workable lane', () => {
    const s0 = { ...base, laneEdits: { [SILI]: { enabled: false as const }, [PRIME]: { enabled: false as const }, [ESP]: { enabled: false as const } } }
    const c = espVsPartner({ ...s0, lanes: buildLanes(src, s0) }, ACEH)
    expect(c).toMatchObject({ esp: null, partners: [], bestPartner: null, winner: null, gap: 0 })
  })

  it('leaves out a lane with no known cost, even though its cost/kg reads as free', () => {
    const zeroed = fixtureSource()
    zeroed.history = zeroed.history.map((h) =>
      h.vendor === 'PRIME' && h.origin === 'Jabo' && h.dest === 'Aceh'
        ? { ...h, laneWeight: 0, laneCostSgOut: 0, laneCostSgIn: 0, laneCostRa: 0, laneCostSmu: 0 }
        : h,
    )
    const s0 = { ...createState(zeroed), accounts: PROTOTYPE_ACCOUNTS }
    const s = { ...s0, lanes: buildLanes(zeroed, s0) }
    const c = espVsPartner(s, ACEH)
    expect(c.partners.map((x) => x.account.id)).not.toContain('PRIME')
    expect(c.partners.map((x) => x.account.id)).toContain('SILI')
  })
})
