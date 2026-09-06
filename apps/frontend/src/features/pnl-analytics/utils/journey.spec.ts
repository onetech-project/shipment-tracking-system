import { bestCombination } from './journey'
import { AnalyticsJourneyRow } from '../types'

const j = (over: Partial<AnalyticsJourneyRow>): AnalyticsJourneyRow => ({
  vendor: 'ESP',
  airline: 'Lion',
  origin: 'Jabo',
  dest: 'Denpasar',
  awbCount: 10,
  gw: 100,
  chwt: 110,
  revenue: 1000,
  cost: 600,
  margin: 400,
  marginPerKg: 4,
  ...over,
})

describe('bestCombination', () => {
  it('picks the highest margin per kg among combinations that carry a real share', () => {
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 800, margin: 2400, marginPerKg: 3 }),
      j({ vendor: 'PT Maju', airline: 'Garuda', gw: 200, margin: 1200, marginPerKg: 6 }),
    ]
    const { byRoute, overall } = bestCombination(rows)
    expect(byRoute).toHaveLength(1)
    const r = byRoute[0]
    expect(r.routeKey).toBe('Jabo|Denpasar')
    expect(r.label).toBe('CGK → Denpasar')
    expect(r.best.vendor).toBe('PT Maju')
    expect(r.floorCleared).toBe(true)
    expect(r.attributedTonnage).toBe(1000)
    expect(r.tonnageOnBest).toBe(200)
    expect(r.optimalPct).toBeCloseTo(20, 6)
    expect(r.actualMarginPerKg).toBeCloseTo(3.6, 6)
    // 800 kg not yet on the best combination × (6 - 3.6) per kg.
    expect(r.upside).toBeCloseTo(1920, 6)
    expect(overall.optimalPct).toBeCloseTo(20, 6)
    expect(overall.upside).toBeCloseTo(1920, 6)
  })

  it('ignores a sliver combination whose margin per kg is unrepresentative', () => {
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 990, margin: 2970, marginPerKg: 3 }),
      // 1% of the route: a single lucky AWB, not a repeatable rate.
      j({ vendor: 'Tiny', airline: 'Garuda', gw: 10, margin: 900, marginPerKg: 90 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.best.vendor).toBe('ESP')
    expect(r.floorCleared).toBe(true)
  })

  it('falls back to the unfiltered set and says the floor did not hold', () => {
    // Twenty-five combinations at 4% each: nothing clears the 5% floor. Having no benchmark at
    // all is worse than a caveated one, so the pool falls back — and says so.
    const rows = Array.from({ length: 25 }, (_, i) =>
      j({ vendor: `V${i}`, gw: 40, margin: 40 * (i + 1), marginPerKg: i + 1 }),
    )
    const r = bestCombination(rows).byRoute[0]
    expect(r.floorCleared).toBe(false)
    expect(r.best.vendor).toBe('V24')
  })

  it('never reports a negative upside', () => {
    // The only combination is already carrying everything, so there is nothing to move.
    const r = bestCombination([j({ gw: 500, margin: 1500, marginPerKg: 3 })]).byRoute[0]
    expect(r.upside).toBe(0)
    expect(r.optimalPct).toBeCloseTo(100, 6)
  })

  it('ranks routes by upside and returns nothing for no rows', () => {
    const rows = [
      j({ dest: 'Denpasar', vendor: 'A', gw: 500, margin: 500, marginPerKg: 1 }),
      j({ dest: 'Denpasar', vendor: 'B', gw: 500, margin: 2500, marginPerKg: 5 }),
      j({ dest: 'Batam', vendor: 'A', gw: 100, margin: 100, marginPerKg: 1 }),
      j({ dest: 'Batam', vendor: 'B', gw: 100, margin: 200, marginPerKg: 2 }),
    ]
    expect(bestCombination(rows).byRoute.map((r) => r.routeKey)).toEqual([
      'Jabo|Denpasar',
      'Jabo|Batam',
    ])
    expect(bestCombination([]).byRoute).toEqual([])
    expect(bestCombination([]).overall.upside).toBe(0)
  })

  it('admits a combination sitting exactly on the share floor', () => {
    // 50 of 1000 kg is 5.0% — the floor is inclusive, so this combination sets the benchmark.
    // Were the comparison strict, the benchmark would fall through to the low-rate bulk carrier.
    const rows = [
      j({ vendor: 'Exact', airline: 'Garuda', gw: 50, margin: 500, marginPerKg: 10 }),
      j({ vendor: 'Bulk', airline: 'Lion', gw: 950, margin: 1900, marginPerKg: 2 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.best.vendor).toBe('Exact')
    expect(r.floorCleared).toBe(true)
    expect(r.optimalPct).toBeCloseTo(5, 6)
  })

  it('clamps the upside to zero when the benchmark rate trails the route average', () => {
    // Both combinations carry half the route, so the floor holds and the winner is ESP at 5/kg —
    // but the route as a whole averages 10/kg, so moving tonnage onto ESP would destroy margin,
    // not create it. An unclamped subtraction would report -2500 here.
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 500, margin: 5000, marginPerKg: 5 }),
      j({ vendor: 'PT Maju', airline: 'Garuda', gw: 500, margin: 5000, marginPerKg: 2 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.best.vendor).toBe('ESP')
    expect(r.actualMarginPerKg).toBeCloseTo(10, 6)
    expect(r.upside).toBe(0)
    expect(bestCombination(rows).overall.upside).toBe(0)
  })

  it('keys tonnage on vendor AND airline, not vendor alone', () => {
    // The same vendor flies both airlines on this route. Only the Garuda tonnage sits on the
    // winning combination; crediting all 500 kg of ESP would understate the upside.
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 300, margin: 600, marginPerKg: 2 }),
      j({ vendor: 'ESP', airline: 'Garuda', gw: 200, margin: 1800, marginPerKg: 9 }),
      j({ vendor: 'Other', airline: 'Lion', gw: 500, margin: 500, marginPerKg: 1 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.best.vendor).toBe('ESP')
    expect(r.best.airline).toBe('Garuda')
    expect(r.tonnageOnBest).toBe(200)
    expect(r.optimalPct).toBeCloseTo(20, 6)
    expect(r.actualMarginPerKg).toBeCloseTo(2.9, 6)
    expect(r.upside).toBeCloseTo(4880, 6)
  })

  it('reports zeroes rather than NaN when a route carries no weight', () => {
    // A route can arrive with all-zero tonnage; an unguarded divide would put NaN on every
    // downstream figure and render as "NaN/kg" in the UI.
    const r = bestCombination([j({ gw: 0, margin: 0, marginPerKg: 0 })]).byRoute[0]
    expect(r.attributedTonnage).toBe(0)
    expect(r.actualMarginPerKg).toBe(0)
    expect(r.optimalPct).toBe(0)
    expect(r.upside).toBe(0)
  })

  it('buckets the placeholder station the backend emits for unknown origins', () => {
    // The backend coalesces NULL and empty stations to the literal '?', and a null vendor or
    // airline reaches the wire type intact. Both are legitimate buckets, not errors.
    const rows = [
      j({ vendor: null, airline: null, origin: '?', dest: '?', gw: 400, margin: 400, marginPerKg: 1 }),
      j({ vendor: 'ESP', airline: 'Lion', origin: '?', dest: '?', gw: 600, margin: 3000, marginPerKg: 5 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.routeKey).toBe('?|?')
    expect(r.label).toBe('? → ?')
    expect(r.attributedTonnage).toBe(1000)
    expect(r.best.vendor).toBe('ESP')
    expect(r.tonnageOnBest).toBe(600)
  })
})
