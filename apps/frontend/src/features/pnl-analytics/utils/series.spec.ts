import {
  completeRevenueShare,
  costComposition,
  dailyOutliers,
  foldAll,
  foldByRoute,
  kpis,
  kpisWithDelta,
  routeKeysIn,
  sliceSeries,
} from './series'
import { AnalyticsDailyRow, AnalyticsDailySeries } from '../types'

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

const series: AnalyticsDailySeries = {
  dates: ['2026-05-01', '2026-05-02', '2026-05-03'],
  rows: [
    row({ date: '2026-05-01', dest: 'Denpasar', revenue: 1000, costSmu: 400, costRa: 100, weight: 200 }),
    row({ date: '2026-05-01', dest: 'Batam', revenue: 500, costSmu: 300, weight: 100 }),
    row({ date: '2026-05-02', dest: 'Denpasar', revenue: 2000, costSmu: 800, costSgOut: 200, weight: 400, incompleteTos: 3 }),
    // 2026-05-03 carries no rows: a calendar day with no shipments.
  ],
}

describe('foldAll', () => {
  it('emits one day per calendar date, including days with no rows', () => {
    const days = foldAll(series)
    expect(days.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect(days[2]).toMatchObject({ revenue: 0, cost: 0, weight: 0, incompleteTos: 0 })
  })

  it('sums every route into each day, with cost as the four components', () => {
    const days = foldAll(series)
    expect(days[0]).toMatchObject({
      revenue: 1500,
      costSmu: 700,
      costRa: 100,
      cost: 800,
      margin: 700,
      weight: 300,
    })
  })
})

describe('foldByRoute', () => {
  it('sums only the selected routes and ignores the rest', () => {
    const days = foldByRoute(series, ['Jabo|Denpasar'])
    expect(days[0]).toMatchObject({ revenue: 1000, cost: 500, weight: 200 })
    // The Batam row is excluded entirely, not merely zeroed.
    expect(days[0].revenue).not.toBe(1500)
  })

  it('folds every route when given null', () => {
    expect(foldByRoute(series, null)).toEqual(foldAll(series))
  })

  it('returns zeroed days when the selection matches nothing', () => {
    const days = foldByRoute(series, ['Jabo|Nowhere'])
    expect(days).toHaveLength(3)
    expect(days.every((d) => d.revenue === 0 && d.weight === 0)).toBe(true)
  })
})

describe('routeKeysIn', () => {
  it('lists the distinct routes the period carries', () => {
    expect(routeKeysIn(series).sort()).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
  })
})

describe('kpis', () => {
  it('derives per-day and per-kg figures from the folded series', () => {
    const k = kpis(foldAll(series))
    expect(k.days).toBe(3)
    expect(k.revenue).toBe(3500)
    expect(k.cost).toBe(1800)
    expect(k.margin).toBe(1700)
    expect(k.weight).toBe(700)
    expect(k.revenuePerDay).toBeCloseTo(3500 / 3, 6)
    expect(k.marginPerKg).toBeCloseTo(1700 / 700, 6)
    expect(k.marginPct).toBeCloseTo((1700 / 3500) * 100, 6)
  })

  it('reports 0 rather than Infinity when there is no weight', () => {
    const k = kpis([])
    expect(k.revenuePerKg).toBe(0)
    expect(k.marginPct).toBe(0)
  })
})

describe('kpisWithDelta', () => {
  it('computes the percentage change against the baseline', () => {
    const curr = kpis(foldAll(series))
    const prev = kpis(foldByRoute(series, ['Jabo|Denpasar']))
    const set = kpisWithDelta(curr, prev)
    expect(set.revenue.value).toBe(curr.revenue)
    expect(set.revenue.prev).toBe(prev.revenue)
    expect(set.revenue.deltaPct).toBeCloseTo(((curr.revenue - prev.revenue) / prev.revenue) * 100, 6)
  })

  it('reports deltaPct as null, not 0, when there is no usable baseline', () => {
    const curr = kpis(foldAll(series))
    expect(kpisWithDelta(curr, null).revenue.deltaPct).toBeNull()
    // A zero baseline is not a usable one: (x - 0) / 0 is not a percentage change.
    const zero = kpis([])
    expect(kpisWithDelta(curr, zero).revenue.deltaPct).toBeNull()
  })
})

describe('completeRevenueShare', () => {
  it('is the share of revenue falling on days with no incomplete TOs', () => {
    // 1500 of 3500 sits on 2026-05-01, the only day with revenue and incompleteTos === 0.
    expect(completeRevenueShare(foldAll(series))).toBeCloseTo((1500 / 3500) * 100, 6)
  })

  it('is 0 for an empty series rather than NaN', () => {
    expect(completeRevenueShare([])).toBe(0)
  })
})

describe('dailyOutliers', () => {
  it('flags a day whose tonnage dwarfs the median — the signature of a bulk backfill', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04'],
      rows: [
        row({ date: '2026-05-01', weight: 100 }),
        row({ date: '2026-05-02', weight: 110 }),
        row({ date: '2026-05-03', weight: 90 }),
        row({ date: '2026-05-04', weight: 5000 }),
      ],
    })
    const out = dailyOutliers(days)
    expect(out.map((o) => o.date)).toEqual(['2026-05-04'])
    expect(out[0].ratio).toBeGreaterThan(5)
  })

  it('reports nothing below four days with weight — too few to have a meaningful median', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02'],
      rows: [row({ date: '2026-05-01', weight: 10 }), row({ date: '2026-05-02', weight: 9000 })],
    })
    expect(dailyOutliers(days)).toEqual([])
  })
})

describe('costComposition', () => {
  it('splits total cost into the four components with shares and per-kg figures', () => {
    const c = costComposition(foldAll(series))
    expect(c.total).toBe(1800)
    const smu = c.components.find((x) => x.key === 'smu')!
    expect(smu.value).toBe(1500)
    expect(smu.pct).toBeCloseTo((1500 / 1800) * 100, 6)
    expect(smu.perKg).toBeCloseTo(1500 / 700, 6)
    // Every component is listed even at zero, so the stacked bar keeps a stable legend.
    expect(c.components.map((x) => x.key)).toEqual(['smu', 'ra', 'sgOut', 'sgIn'])
  })
})

describe('sliceSeries', () => {
  it('keeps only the days inside the bounds, inclusive', () => {
    const days = foldAll(series)
    expect(sliceSeries(days, '2026-05-02', '2026-05-03').map((d) => d.date)).toEqual([
      '2026-05-02',
      '2026-05-03',
    ])
  })
})
