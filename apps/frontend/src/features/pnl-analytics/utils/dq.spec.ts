import { COVERAGE_MIN, dqReport } from './dq'
import { SeriesDay } from '../types'

const day = (over: Partial<SeriesDay>): SeriesDay => ({
  date: '2026-05-01',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: 0,
  margin: 0,
  weight: 0,
  ...over,
})

// Every route carries cost, so the route-level measure certifies this period as 100% covered —
// while 85% of its revenue sits on a day whose TO rows never completed. This is the exact shape
// of a real artifact period, and the reason the gate is day-level.
const artifactSeries: SeriesDay[] = [
  day({ date: '2026-05-01', revenue: 150, cost: 100 }),
  day({ date: '2026-05-02', revenue: 850, cost: 0, incompleteTos: 40 }),
]

const healthySeries: SeriesDay[] = [
  day({ date: '2026-05-01', revenue: 500, cost: 400 }),
  day({ date: '2026-05-02', revenue: 500, cost: 380 }),
]

const profitByRoute = [{ route: 'Jabo → Denpasar', totalRevenue: 1000, avgCostPerKg: 12 }]

describe('dqReport', () => {
  it('gates on the day-level measure, not route coverage', () => {
    const bad = dqReport({ profitByRoute, series: artifactSeries })
    // Route-level coverage calls this period fully covered...
    expect(bad.routeCoveragePct).toBe(100)
    // ...while the measure that gates says only 15% of revenue is trustworthy.
    expect(bad.completeDaysPct).toBeCloseTo(15, 6)
    expect(bad.coveragePct).toBeCloseTo(15, 6)
    expect(bad.coverageOk).toBe(false)
    expect(bad.level).toBe('bad')
    // The day counts are the operator-facing "why": 1 of 2 days is clean, and it is the small one.
    expect(bad.totalDays).toBe(2)
    expect(bad.cleanDays).toBe(1)

    const good = dqReport({ profitByRoute, series: healthySeries })
    expect(good.coveragePct).toBe(100)
    expect(good.coverageOk).toBe(true)
    // Counts clean days, not dirty ones — both of these days completed.
    expect(good.totalDays).toBe(2)
    expect(good.cleanDays).toBe(2)
  })

  it('falls back to route coverage when no series is supplied', () => {
    const report = dqReport({
      profitByRoute: [
        { route: 'Jabo → Denpasar', totalRevenue: 900, avgCostPerKg: 12 },
        { route: 'Jabo → Batam', totalRevenue: 100, avgCostPerKg: 0 },
      ],
    })
    expect(report.completeDaysPct).toBeNull()
    expect(report.coveragePct).toBeCloseTo(90, 6)
    expect(report.routesWithoutCost).toEqual(['Jabo → Batam'])
    expect(report.revenueWithoutCost).toBe(100)
  })

  it('reports the two cost sources as not comparable rather than as agreeing', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costTotals: { smu: 500, ra: 100, sgOut: 100, sgIn: 80 },
      summary: { totalCost: 0 },
    })
    // A zero summary total gives no percentage to compare against — null, and not agreeing.
    expect(report.costSourceDelta.comparable).toBe(false)
    expect(report.costSourceDelta.deltaPct).toBeNull()
    expect(report.costSourceDelta.agrees).toBe(false)
    expect(report.level).toBe('bad')
  })

  it('treats two empty cost sources as agreeing', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costTotals: { smu: 0, ra: 0, sgOut: 0, sgIn: 0 },
      summary: { totalCost: 0 },
    })
    expect(report.costSourceDelta.agrees).toBe(true)
    expect(report.level).toBe('ok')
  })

  it('warns when vendor or RA attribution is thin, or an SLA route will not map', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costByVendor: [
        { vendor: 'ESP', totalWeight: 800 },
        { vendor: '—', totalWeight: 200 },
      ],
    })
    expect(report.vendorAttributedPct).toBeCloseTo(80, 6)
    expect(report.level).toBe('warn')

    const unmapped = dqReport({
      profitByRoute,
      series: healthySeries,
      sla: {
        summary: {
          alerts: {},
          otp: {
            percentage: 90,
            onTimeWeight: 9,
            lateWeight: 1,
            breakdown: [{ route: 'nonsense', percentage: 90, onTimeWeight: 9, lateWeight: 1 }],
          },
        },
      },
    })
    expect(unmapped.unmappedSlaRoutes).toEqual(['nonsense'])
    expect(unmapped.level).toBe('warn')
  })

  // The guard that suppresses the absent-breakdown case must not also suppress the real signal.
  // No plan test exercises the costByRa side at all, so pin it here: rows that are genuinely thin
  // still have to warn.
  it('still warns on thin RA attribution when costByRa rows are actually supplied', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costByRa: [
        { name: 'RA Jakarta', totalWeight: 800 },
        { name: '—', totalWeight: 200 },
      ],
    })
    expect(report.raAttributedPct).toBeCloseTo(80, 6)
    expect(report.level).toBe('warn')

    // ...while an absent breakdown is not a quality signal at all: 0% here means "no data",
    // not "poorly attributed", so it must stay 'ok'.
    const absent = dqReport({ profitByRoute, series: healthySeries })
    expect(absent.raAttributedPct).toBe(0)
    expect(absent.vendorAttributedPct).toBe(0)
    expect(absent.level).toBe('ok')
  })

  it('pins the coverage threshold', () => {
    expect(COVERAGE_MIN).toBe(95)
  })

  // The gate is inclusive: a period sitting exactly on the threshold passes. Without this, `>=`
  // could silently become `>` and every test above would still be green.
  it('accepts a period sitting exactly on the threshold', () => {
    const exactly95: SeriesDay[] = [
      day({ date: '2026-05-01', revenue: 950, cost: 800 }),
      day({ date: '2026-05-02', revenue: 50, cost: 0, incompleteTos: 3 }),
    ]
    const report = dqReport({ profitByRoute, series: exactly95 })
    expect(report.coveragePct).toBeCloseTo(COVERAGE_MIN, 6)
    expect(report.coverageOk).toBe(true)
    expect(report.level).toBe('ok')

    // ...and a hair under it does not.
    const justUnder: SeriesDay[] = [
      day({ date: '2026-05-01', revenue: 949, cost: 800 }),
      day({ date: '2026-05-02', revenue: 51, cost: 0, incompleteTos: 3 }),
    ]
    const under = dqReport({ profitByRoute, series: justUnder })
    expect(under.coverageOk).toBe(false)
    expect(under.level).toBe('bad')
  })
})
