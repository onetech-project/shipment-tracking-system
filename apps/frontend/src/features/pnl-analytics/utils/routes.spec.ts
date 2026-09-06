import { RouteContributionRow, concentration, marginStability, routeContribution } from './routes'
import { AnalyticsDailySeries, AnalyticsDailyRow } from '../types'

/** A complete, unflagged contribution row; override only what the case is about. */
const contribRow = (over: Partial<RouteContributionRow>): RouteContributionRow => ({
  routeKey: 'a|b',
  label: 'a → b',
  revenue: 0,
  cost: 0,
  margin: 0,
  marginPct: 0,
  weight: 0,
  incompleteTos: 0,
  costComplete: true,
  sharePct: 0,
  ...over,
})

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 0,
  incompleteTos: 0,
  ...over,
})

const dates = Array.from({ length: 8 }, (_, i) => `2026-05-0${i + 1}`)

/** Eight clean days on Denpasar, plus one Batam day whose cost never landed. */
const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date, i) =>
      row({ date, dest: 'Denpasar', revenue: 1000, costSmu: 600 + i * 10, weight: 100 }),
    ),
    row({ date: '2026-05-01', dest: 'Batam', revenue: 5000, costSmu: 0, weight: 400, incompleteTos: 9 }),
  ],
}

describe('routeContribution', () => {
  it('reports every route with its margin share, ranked by margin', () => {
    const rows = routeContribution(series)
    expect(rows.map((r) => r.routeKey)).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
    expect(rows[0].label).toBe('CGK → Batam')
    const denpasar = rows.find((r) => r.routeKey === 'Jabo|Denpasar')!
    expect(denpasar.revenue).toBe(8000)
    expect(denpasar.cost).toBe(5080) // 600 + 610 + ... + 670
    expect(denpasar.costComplete).toBe(true)
  })

  it('flags a route whose cost never landed instead of dropping it', () => {
    const batam = routeContribution(series).find((r) => r.routeKey === 'Jabo|Batam')!
    // A route with zero attributed cost reads as a flawless 100% margin. It is kept visible and
    // flagged, so the table still shows every route and concentration can exclude it.
    expect(batam.marginPct).toBe(100)
    expect(batam.incompleteTos).toBe(9)
    expect(batam.costComplete).toBe(false)
  })

  it('narrows to the given route keys', () => {
    expect(routeContribution(series, ['Jabo|Denpasar']).map((r) => r.routeKey)).toEqual([
      'Jabo|Denpasar',
    ])
  })

  it('states sharePct as a percentage of total margin, not a fraction', () => {
    const rows = routeContribution(series)
    // Batam 5000 + Denpasar 2920 = 7920 of margin between them.
    expect(rows.find((r) => r.routeKey === 'Jabo|Batam')!.sharePct).toBeCloseTo(63.1313, 3)
    expect(rows.find((r) => r.routeKey === 'Jabo|Denpasar')!.sharePct).toBeCloseTo(36.8687, 3)
  })

  it('flags a route that carries cost but has incomplete TOs', () => {
    // Cost DID land here, so daysWithCost > 0 — only the incompleteTos count condemns it.
    const withCost: AnalyticsDailySeries = {
      dates: ['2026-05-01'],
      rows: [row({ date: '2026-05-01', dest: 'Medan', revenue: 900, costSmu: 400, weight: 50, incompleteTos: 3 })],
    }
    const r = routeContribution(withCost)[0]
    expect(r.cost).toBe(400)
    expect(r.incompleteTos).toBe(3)
    expect(r.costComplete).toBe(false)
  })

  it('flags a route with no cost-bearing day even when no TO is incomplete', () => {
    // incompleteTos is 0, so only the "no day carried any cost" condition can flag this.
    const noCost: AnalyticsDailySeries = {
      dates: ['2026-05-01'],
      rows: [row({ date: '2026-05-01', dest: 'Kupang', revenue: 700, costSmu: 0, weight: 30, incompleteTos: 0 })],
    }
    const r = routeContribution(noCost)[0]
    expect(r.cost).toBe(0)
    expect(r.incompleteTos).toBe(0)
    expect(r.costComplete).toBe(false)
  })

  it('groups by origin AND dest, so a reversed leg is its own route', () => {
    const bothWays: AnalyticsDailySeries = {
      dates: ['2026-05-01'],
      rows: [
        row({ date: '2026-05-01', origin: 'Jabo', dest: 'Medan', revenue: 1000, costSmu: 100, weight: 10 }),
        row({ date: '2026-05-01', origin: 'Medan', dest: 'Jabo', revenue: 400, costSmu: 100, weight: 10 }),
      ],
    }
    const rows = routeContribution(bothWays)
    expect(rows.map((r) => r.routeKey)).toEqual(['Jabo|Medan', 'Medan|Jabo'])
    // ORIGIN_LABELS relabels the origin only, so the return leg's dest stays 'Jabo'.
    expect(rows.map((r) => r.label)).toEqual(['CGK → Medan', 'Medan → Jabo'])
    expect(rows.map((r) => r.revenue)).toEqual([1000, 400])
  })
})

describe('concentration', () => {
  it('excludes flagged routes and says how many were left out', () => {
    const c = concentration(routeContribution(series))
    expect(c.routesCounted).toBe(1)
    expect(c.routesExcluded).toBe(1)
    // With the artifact excluded, the one real route carries all the margin.
    expect(c.top1Pct).toBeCloseTo(100, 6)
    expect(c.hhi).toBeCloseTo(1, 6)
  })

  it('is zeroed, not NaN, when every route is excluded', () => {
    const c = concentration([
      { routeKey: 'a|b', label: 'a → b', revenue: 0, cost: 0, margin: 10, marginPct: 0, weight: 0, incompleteTos: 1, costComplete: false, sharePct: 0 },
    ])
    expect(c).toMatchObject({ routesCounted: 0, routesExcluded: 1, top1Pct: 0, top3Pct: 0, hhi: 0 })
  })

  it('measures share on absolute margin, so a loss-making route still counts as exposure', () => {
    const c = concentration([
      { routeKey: 'a|b', label: 'a → b', revenue: 0, cost: 0, margin: -100, marginPct: 0, weight: 0, incompleteTos: 0, costComplete: true, sharePct: 0 },
      { routeKey: 'c|d', label: 'c → d', revenue: 0, cost: 0, margin: 100, marginPct: 0, weight: 0, incompleteTos: 0, costComplete: true, sharePct: 0 },
    ])
    expect(c.routesCounted).toBe(2)
    expect(c.hhi).toBeCloseTo(0.5, 6)
  })

  it('ranks by descending absolute margin, so top1 is the largest route', () => {
    // Deliberately supplied smallest-first: only a descending sort puts 60 on top.
    const c = concentration([
      contribRow({ routeKey: 'a|b', margin: 10 }),
      contribRow({ routeKey: 'c|d', margin: 30 }),
      contribRow({ routeKey: 'e|f', margin: 60 }),
    ])
    expect(c.top1Pct).toBeCloseTo(60, 6)
  })

  it('sums the three largest routes into top3Pct, not fewer', () => {
    // Four routes of 40/30/20/10: the top three are 90%, top one alone would be 40%.
    const c = concentration([
      contribRow({ routeKey: 'a|b', margin: 40 }),
      contribRow({ routeKey: 'c|d', margin: 30 }),
      contribRow({ routeKey: 'e|f', margin: 20 }),
      contribRow({ routeKey: 'g|h', margin: 10 }),
    ])
    expect(c.top1Pct).toBeCloseTo(40, 6)
    expect(c.top3Pct).toBeCloseTo(90, 6)
    expect(c.routesCounted).toBe(4)
  })

  it('is zeroed, not NaN, when the counted routes carry no margin at all', () => {
    // Total absolute margin is 0, so every share divides by zero.
    const c = concentration([
      contribRow({ routeKey: 'a|b', margin: 0 }),
      contribRow({ routeKey: 'c|d', margin: 0 }),
    ])
    expect(c.routesCounted).toBe(2)
    expect(c.top1Pct).toBe(0)
    expect(c.top3Pct).toBe(0)
    expect(c.hhi).toBe(0)
  })

  it('is zeroed, not NaN, for an empty or missing contribution list', () => {
    expect(concentration([])).toMatchObject({ top1Pct: 0, top3Pct: 0, hhi: 0, routesCounted: 0, routesExcluded: 0 })
    expect(concentration(undefined)).toMatchObject({ top1Pct: 0, top3Pct: 0, hhi: 0, routesCounted: 0 })
  })
})

describe('marginStability', () => {
  it('returns the coefficient of variation of daily margin per kg', () => {
    const s = marginStability(series, 'Jabo|Denpasar')!
    expect(s.days).toBe(8)
    expect(s.cv).toBeGreaterThan(0)
    expect(s.cv).toBeLessThan(0.1) // 600..670 against a 1000 revenue is a steady route
  })

  it('returns null below five usable days rather than a number nobody should read', () => {
    const short: AnalyticsDailySeries = {
      dates: dates.slice(0, 4),
      rows: dates
        .slice(0, 4)
        .map((date) => row({ date, revenue: 1000, costSmu: 600, weight: 100 })),
    }
    expect(marginStability(short, 'Jabo|Denpasar')).toBeNull()
  })

  it('excludes days with incomplete cost from the count', () => {
    // Eight days, three of them incomplete: only five remain, which is exactly the floor.
    const mixed: AnalyticsDailySeries = {
      dates,
      rows: dates.map((date, i) =>
        row({
          date,
          revenue: 1000,
          costSmu: 600,
          weight: 100,
          incompleteTos: i < 3 ? 2 : 0,
        }),
      ),
    }
    expect(marginStability(mixed, 'Jabo|Denpasar')!.days).toBe(5)
  })

  it('returns null for a route the period never carried', () => {
    expect(marginStability(series, 'Jabo|Nowhere')).toBeNull()
  })

  it('excludes zero-weight days, whose margin per kg is undefined', () => {
    // Eight days with cost, but three carry no weight: only five are usable, and a margin per kg
    // of 0 from a weightless day would drag the mean and understate the variation.
    const mixed: AnalyticsDailySeries = {
      dates,
      rows: dates.map((date, i) =>
        row({ date, revenue: 1000, costSmu: 600, weight: i < 3 ? 0 : 100 }),
      ),
    }
    const s = marginStability(mixed, 'Jabo|Denpasar')!
    expect(s.days).toBe(5)
    expect(s.mean).toBeCloseTo(4, 6) // (1000 - 600) / 100
    expect(s.cv).toBeCloseTo(0, 6)
  })

  it('counts exactly five usable days as enough, and four as too few', () => {
    const build = (usable: number): AnalyticsDailySeries => ({
      dates,
      rows: dates.map((date, i) =>
        row({ date, revenue: 1000, costSmu: 600, weight: 100, incompleteTos: i < 8 - usable ? 1 : 0 }),
      ),
    })
    expect(marginStability(build(5), 'Jabo|Denpasar')!.days).toBe(5)
    expect(marginStability(build(4), 'Jabo|Denpasar')).toBeNull()
  })

  it('reports the mean margin per kg alongside the variation', () => {
    const s = marginStability(series, 'Jabo|Denpasar')!
    // Daily margin per kg runs (1000 - (600 + i*10)) / 100 = 4.00 down to 3.30, mean 3.65.
    expect(s.mean).toBeCloseTo(3.65, 6)
    expect(s.cv).toBeCloseTo(Math.sqrt(0.0525) / 3.65, 6)
  })
})
