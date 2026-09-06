import {
  completeRevenueShare,
  costComposition,
  dailyOutliers,
  foldAll,
  foldByRoute,
  kpis,
  kpisWithDelta,
  num,
  routeKeysIn,
  sliceSeries,
} from './series'
import { AnalyticsDailyRow, AnalyticsDailySeries, KPI_KEYS } from '../types'

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
    row({
      date: '2026-05-01',
      dest: 'Denpasar',
      revenue: 1000,
      costSmu: 400,
      costRa: 100,
      costSgIn: 50,
      weight: 200,
    }),
    row({ date: '2026-05-01', dest: 'Batam', revenue: 500, costSmu: 300, weight: 100 }),
    row({ date: '2026-05-02', dest: 'Denpasar', revenue: 2000, costSmu: 800, costSgOut: 200, weight: 400, incompleteTos: 3 }),
    // 2026-05-03 carries no rows: a calendar day with no shipments.
  ],
}

describe('num', () => {
  it('coerces anything that is not a finite number to 0', () => {
    // The only defence against an untyped payload: a missing or malformed field must not
    // poison a sum with null, NaN or Infinity.
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('1500')).toBe(0)
    expect(num(NaN)).toBe(0)
    expect(num(Infinity)).toBe(0)
    expect(num(-Infinity)).toBe(0)
  })

  it('passes a finite number through untouched', () => {
    expect(num(1500)).toBe(1500)
    expect(num(-2.5)).toBe(-2.5)
    expect(num(0)).toBe(0)
  })
})

describe('foldAll', () => {
  it('emits one day per calendar date, including days with no rows', () => {
    const days = foldAll(series)
    expect(days.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect(days[2]).toMatchObject({ revenue: 0, cost: 0, weight: 0, incompleteTos: 0 })
  })

  it('sums every route into each day, with cost as the four components', () => {
    const days = foldAll(series)
    // 400 + 300 SMU, 100 RA, 0 SG Out, 50 SG In = 850; 1500 revenue - 850 = 650 margin.
    expect(days[0]).toMatchObject({
      revenue: 1500,
      costSmu: 700,
      costRa: 100,
      costSgOut: 0,
      costSgIn: 50,
      cost: 850,
      margin: 650,
      weight: 300,
    })
  })

  it('carries every cost component into the day total, including SG In', () => {
    const days = foldAll(series)
    expect(days[0].costSgIn).toBe(50)
    expect(days[0].cost).toBe(days[0].costSmu + days[0].costRa + days[0].costSgOut + days[0].costSgIn)
    expect(days[1]).toMatchObject({ costSgOut: 200, costSgIn: 0, cost: 1000, margin: 1000 })
  })

  it('drops a row dated outside the calendar rather than inventing a day for it', () => {
    // The backend derives dates and rows from the same filter, so this should not happen — but an
    // off-calendar row must not surface as an unexplained extra day.
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02'],
      rows: [
        row({ date: '2026-05-01', revenue: 100, weight: 10 }),
        row({ date: '2026-06-15', revenue: 999999, weight: 88888 }),
      ],
    })
    expect(days).toHaveLength(2)
    expect(days.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02'])
    expect(days.reduce((s, d) => s + d.revenue, 0)).toBe(100)
    expect(days.reduce((s, d) => s + d.weight, 0)).toBe(10)
  })
})

describe('foldByRoute', () => {
  it('sums only the selected routes and ignores the rest', () => {
    const days = foldByRoute(series, ['Jabo|Denpasar'])
    // 400 SMU + 100 RA + 50 SG In = 550.
    expect(days[0]).toMatchObject({ revenue: 1000, cost: 550, weight: 200 })
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
    expect(k.cost).toBe(1850)
    expect(k.margin).toBe(1650)
    expect(k.weight).toBe(700)
    expect(k.revenuePerDay).toBeCloseTo(3500 / 3, 6)
    expect(k.marginPerKg).toBeCloseTo(1650 / 700, 6)
    expect(k.marginPct).toBeCloseTo((1650 / 3500) * 100, 6)
  })

  it('divides per-day figures by the calendar length and per-kg figures by the tonnage', () => {
    const k = kpis(foldAll(series))
    // Per-day divides by 3 calendar days, not by the 2 days that actually shipped.
    expect(k.weightPerDay).toBeCloseTo(700 / 3, 6)
    expect(k.costPerDay).toBeCloseTo(1850 / 3, 6)
    expect(k.marginPerDay).toBeCloseTo(1650 / 3, 6)
    expect(k.revenuePerKg).toBeCloseTo(3500 / 700, 6)
    expect(k.costPerKg).toBeCloseTo(1850 / 700, 6)
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

  it('emits an entry for every KPI, each carrying its own key’s numbers', () => {
    // A partial KpiSet is not a type error at the call site but throws in every KPI card that
    // reads `set.<key>.value`, so the whole set is pinned here rather than one sampled key.
    const curr = kpis(foldAll(series))
    const prev = kpis(foldByRoute(series, ['Jabo|Denpasar']))
    const set = kpisWithDelta(curr, prev)
    expect(Object.keys(set).sort()).toEqual([...KPI_KEYS].sort())
    for (const k of KPI_KEYS) {
      expect(set[k]).toBeDefined()
      // Each entry must be its OWN key's figure, not a repeat of some other key's delta.
      expect(set[k].value).toBe(curr[k])
      expect(set[k].prev).toBe(prev[k])
    }
    // The fixture's KPI values are all distinct, so a set that repeated one key everywhere
    // would collapse this to a single entry.
    expect(new Set(KPI_KEYS.map((k) => set[k].value)).size).toBe(KPI_KEYS.length)
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
    // Four weighted days, so the median is the mean of the middle pair: (100 + 110) / 2 = 105.
    expect(out[0].median).toBe(105)
    expect(out[0].weight).toBe(5000)
    expect(out[0].ratio).toBeCloseTo(5000 / 105, 6)
    // 5000 of the period's 5300 kg.
    expect(out[0].sharePct).toBeCloseTo((5000 / 5300) * 100, 6)
    expect(out[0].ratio).toBeGreaterThan(5)
  })

  it('lists several outliers heaviest first', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
      rows: [
        row({ date: '2026-05-01', weight: 100 }),
        row({ date: '2026-05-02', weight: 110 }),
        row({ date: '2026-05-03', weight: 90 }),
        row({ date: '2026-05-04', weight: 3000 }),
        row({ date: '2026-05-05', weight: 5000 }),
      ],
    })
    const out = dailyOutliers(days)
    // Descending by weight, which is the reverse of the calendar order they appear in.
    expect(out.map((o) => o.date)).toEqual(['2026-05-05', '2026-05-04'])
    expect(out.map((o) => o.weight)).toEqual([5000, 3000])
    // Five weighted days, so the median is the middle one: 110. Total tonnage is 8300.
    expect(out[0].median).toBe(110)
    expect(out[0].ratio).toBeCloseTo(5000 / 110, 6)
    expect(out[1].ratio).toBeCloseTo(3000 / 110, 6)
    expect(out[0].sharePct).toBeCloseTo((5000 / 8300) * 100, 6)
    expect(out[1].sharePct).toBeCloseTo((3000 / 8300) * 100, 6)
  })

  it('compares against five times the median by default, and against a caller-supplied factor', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
      rows: [
        row({ date: '2026-05-01', weight: 100 }),
        row({ date: '2026-05-02', weight: 110 }),
        row({ date: '2026-05-03', weight: 90 }),
        // 400 sits between 3x and 5x the median of 110: loud enough for a caller who asks for a
        // tighter factor, not loud enough for the default.
        row({ date: '2026-05-04', weight: 400 }),
        row({ date: '2026-05-05', weight: 5000 }),
      ],
    })
    expect(dailyOutliers(days).map((o) => o.date)).toEqual(['2026-05-05'])
    expect(dailyOutliers(days, {}).map((o) => o.date)).toEqual(['2026-05-05'])
    expect(dailyOutliers(days, { factor: 3 }).map((o) => o.date)).toEqual([
      '2026-05-05',
      '2026-05-04',
    ])
    // A factor loose enough that nothing clears it silences the panel entirely.
    expect(dailyOutliers(days, { factor: 50 })).toEqual([])
  })

  it('reports nothing below four days with weight — too few to have a meaningful median', () => {
    const twoDays = foldAll({
      dates: ['2026-05-01', '2026-05-02'],
      rows: [row({ date: '2026-05-01', weight: 10 }), row({ date: '2026-05-02', weight: 9000 })],
    })
    expect(dailyOutliers(twoDays)).toEqual([])

    // Three is still below the threshold: the boundary is four, not "more than two".
    const threeDays = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03'],
      rows: [
        row({ date: '2026-05-01', weight: 10 }),
        row({ date: '2026-05-02', weight: 12 }),
        row({ date: '2026-05-03', weight: 9000 }),
      ],
    })
    expect(dailyOutliers(threeDays)).toEqual([])

    // Zero-weight days do not count toward the four, even when the calendar is long.
    const paddedCalendar = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
      rows: [
        row({ date: '2026-05-01', weight: 10 }),
        row({ date: '2026-05-02', weight: 12 }),
        row({ date: '2026-05-03', weight: 9000 }),
      ],
    })
    expect(dailyOutliers(paddedCalendar)).toEqual([])
  })
})

describe('costComposition', () => {
  it('splits total cost into the four components with shares and per-kg figures', () => {
    const c = costComposition(foldAll(series))
    // 1500 SMU + 100 RA + 200 SG Out + 50 SG In.
    expect(c.total).toBe(1850)
    expect(c.totalPerKg).toBeCloseTo(1850 / 700, 6)
    const smu = c.components.find((x) => x.key === 'smu')!
    expect(smu.value).toBe(1500)
    expect(smu.pct).toBeCloseTo((1500 / 1850) * 100, 6)
    expect(smu.perKg).toBeCloseTo(1500 / 700, 6)
    // Every component is listed even at zero, so the stacked bar keeps a stable legend.
    expect(c.components.map((x) => x.key)).toEqual(['smu', 'ra', 'sgOut', 'sgIn'])
  })

  it('accounts for every component, including SG In', () => {
    const c = costComposition(foldAll(series))
    expect(c.components.map((x) => x.value)).toEqual([1500, 100, 200, 50])
    const sgIn = c.components.find((x) => x.key === 'sgIn')!
    expect(sgIn.value).toBe(50)
    expect(sgIn.pct).toBeCloseTo((50 / 1850) * 100, 6)
    expect(sgIn.perKg).toBeCloseTo(50 / 700, 6)
    // The shares are shares of the whole, so they must close.
    expect(c.components.reduce((s, x) => s + x.value, 0)).toBe(c.total)
    expect(c.components.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6)
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

  it('treats each bound as optional', () => {
    const days = foldAll(series)
    // No bounds at all is the whole series, not nothing.
    expect(sliceSeries(days).map((d) => d.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ])
    expect(sliceSeries(days, '2026-05-02').map((d) => d.date)).toEqual([
      '2026-05-02',
      '2026-05-03',
    ])
    expect(sliceSeries(days, undefined, '2026-05-02').map((d) => d.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
    ])
  })
})
