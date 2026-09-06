import { buildAnalyticsContext, scopeLabel, scopeRouteKeys } from './context'
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

const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']

/**
 * Denpasar is clean throughout. Batam's biggest day never had its cost attributed — the exact
 * shape that certifies as 100% covered route-level while most of the revenue is untrustworthy.
 */
const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date) => row({ date, dest: 'Denpasar', revenue: 100, costSmu: 60, weight: 10 })),
    row({ date: '2026-05-02', dest: 'Batam', revenue: 5000, costSmu: 0, weight: 500, incompleteTos: 30 }),
    row({ date: '2026-05-03', dest: 'Batam', revenue: 100, costSmu: 70, weight: 10 }),
  ],
}

const clean: AnalyticsDailySeries = {
  dates,
  rows: dates.map((date) => row({ date, revenue: 100, costSmu: 60, weight: 10 })),
}

describe('scopeRouteKeys', () => {
  it('returns every route for the "all" scope', () => {
    expect(scopeRouteKeys(series, { kind: 'all' }).sort()).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
  })

  it('returns the picked keys for a route scope', () => {
    expect(scopeRouteKeys(series, { kind: 'routes', keys: ['Jabo|Batam'] })).toEqual(['Jabo|Batam'])
  })

  it('uses the supplied group membership for a group scope', () => {
    expect(scopeRouteKeys(series, { kind: 'group', id: 'g1' }, ['Jabo|Denpasar'])).toEqual([
      'Jabo|Denpasar',
    ])
  })
})

describe('scopeLabel', () => {
  it('names the scope in the header', () => {
    expect(scopeLabel({ kind: 'all' })).toBe('All routes')
    expect(scopeLabel({ kind: 'routes', keys: ['a|b'] })).toBe('1 route selected')
    expect(scopeLabel({ kind: 'routes', keys: ['a|b', 'c|d'] })).toBe('2 routes selected')
    expect(scopeLabel({ kind: 'group', id: 'g1' }, 'Bali & Nusa')).toBe('Group: Bali & Nusa')
    expect(scopeLabel({ kind: 'group', id: 'g1' })).toBe('Route group')
  })
})

describe('buildAnalyticsContext', () => {
  it('scopes the series but never the health gate', () => {
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'routes', keys: ['Jabo|Denpasar'] },
    })
    // The scoped series carries only Denpasar.
    expect(ctx.kpi.revenue).toBe(400)
    // The gate is computed over every route, so picking a clean route cannot hide a broken period.
    expect(ctx.dq.coverageOk).toBe(false)
    expect(ctx.coverageOk).toBe(false)
    expect(ctx.dq.completeDaysPct).toBeLessThan(20)
  })

  it('kills every KPI delta when the baseline period is itself incomplete', () => {
    const ctx = buildAnalyticsContext({ series: clean, prevSeries: series, scope: { kind: 'all' } })
    expect(ctx.baselineIncomplete).toBe(true)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeNull()
    expect(ctx.kpiDelta.marginPct.deltaPct).toBeNull()
    // The current-period values themselves are untouched — only the comparison is withdrawn.
    expect(ctx.kpiDelta.revenue.value).toBe(ctx.kpi.revenue)
  })

  it('computes deltas normally against a healthy baseline', () => {
    const richer: AnalyticsDailySeries = {
      dates,
      rows: dates.map((date) => row({ date, revenue: 200, costSmu: 120, weight: 20 })),
    }
    const ctx = buildAnalyticsContext({ series: richer, prevSeries: clean, scope: { kind: 'all' } })
    expect(ctx.baselineIncomplete).toBe(false)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeCloseTo(100, 6)
  })

  it('leaves deltas absent, not zero, when there is no baseline at all', () => {
    const ctx = buildAnalyticsContext({ series: clean, prevSeries: undefined, scope: { kind: 'all' } })
    expect(ctx.prevKpi).toBeNull()
    expect(ctx.kpiDelta.revenue.deltaPct).toBeNull()
    expect(ctx.baselineIncomplete).toBe(false)
  })

  it('names the outlier date rather than only reporting bad coverage', () => {
    const ctx = buildAnalyticsContext({ series, prevSeries: clean, scope: { kind: 'all' } })
    expect(ctx.outliers.map((o) => o.date)).toEqual(['2026-05-02'])
  })

  it('flags the two notes from the scope and range it was given', () => {
    const all = buildAnalyticsContext({ series, prevSeries: clean, scope: { kind: 'all' } })
    expect(all.scoped).toBe(false)
    expect(all.ranged).toBe(false)

    const narrowed = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'routes', keys: ['Jabo|Batam'] },
      ranged: true,
    })
    expect(narrowed.scoped).toBe(true)
    expect(narrowed.ranged).toBe(true)
  })

  // --- coverage beyond the plan's own cases ---

  it('scans for outliers over every route even when the viewer has narrowed to a clean one', () => {
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'routes', keys: ['Jabo|Denpasar'] },
    })
    // The scoped series is a flat 10kg/day and holds no outlier of its own...
    expect(ctx.series.map((d) => d.weight)).toEqual([10, 10, 10, 10])
    // ...but the backfill on Batam is still named.
    expect(ctx.outliers.map((o) => o.date)).toEqual(['2026-05-02'])
    // The unscoped series is exposed alongside the scoped one, carrying every route.
    expect(ctx.unscopedSeries.map((d) => d.weight)).toEqual([10, 510, 20, 10])
    expect(ctx.routeKeys).toEqual(['Jabo|Denpasar'])
  })

  it('folds the baseline to the same scope as the current period', () => {
    // Three distinguishable per-route revenues, so a mis-scoped fold cannot coincide.
    const prev: AnalyticsDailySeries = {
      dates,
      rows: [
        ...dates.map((date) => row({ date, dest: 'Denpasar', revenue: 200, costSmu: 60, weight: 10 })),
        ...dates.map((date) => row({ date, dest: 'Batam', revenue: 1000, costSmu: 300, weight: 50 })),
        ...dates.map((date) => row({ date, dest: 'Medan', revenue: 3000, costSmu: 900, weight: 90 })),
      ],
    }
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: prev,
      scope: { kind: 'routes', keys: ['Jabo|Denpasar'] },
    })
    expect(ctx.baselineIncomplete).toBe(false)
    // Denpasar only: 4 × 200, not the 16800 an unscoped fold would report.
    expect(ctx.prevKpi?.revenue).toBe(800)
    expect(ctx.kpiDelta.revenue.prev).toBe(800)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeCloseTo(-50, 6)
  })

  it('trusts a baseline sitting exactly on the coverage threshold', () => {
    // 95 of 100 revenue on clean days — exactly COVERAGE_MIN, the boundary itself.
    const onThreshold: AnalyticsDailySeries = {
      dates,
      rows: [
        row({ date: '2026-05-01', revenue: 95, costSmu: 50, weight: 10 }),
        row({ date: '2026-05-02', revenue: 5, costSmu: 0, weight: 1, incompleteTos: 4 }),
      ],
    }
    const ctx = buildAnalyticsContext({
      series: clean,
      prevSeries: onThreshold,
      scope: { kind: 'all' },
    })
    expect(ctx.baselineIncomplete).toBe(false)
    expect(ctx.kpiDelta.revenue.prev).toBe(100)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeCloseTo(300, 6)

    // One rupiah of revenue moved onto the incomplete day drops it below the threshold, and the
    // comparison is withdrawn entirely.
    const belowThreshold: AnalyticsDailySeries = {
      dates,
      rows: [
        row({ date: '2026-05-01', revenue: 94, costSmu: 50, weight: 10 }),
        row({ date: '2026-05-02', revenue: 6, costSmu: 0, weight: 1, incompleteTos: 4 }),
      ],
    }
    const below = buildAnalyticsContext({
      series: clean,
      prevSeries: belowThreshold,
      scope: { kind: 'all' },
    })
    expect(below.baselineIncomplete).toBe(true)
    expect(below.kpiDelta.revenue.deltaPct).toBeNull()
  })

  it('resolves a group scope through the membership it was handed, not the series', () => {
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'group', id: 'g1' },
      groupRoutes: ['Jabo|Batam'],
      groupName: 'Sumatra',
    })
    expect(ctx.scopeLabel).toBe('Group: Sumatra')
    expect(ctx.routeKeys).toEqual(['Jabo|Batam'])
    expect(ctx.scoped).toBe(true)
    expect(ctx.kpi.revenue).toBe(5100)

    // A group whose membership was not resolved folds to nothing, rather than silently widening
    // back out to every route.
    const unresolved = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'group', id: 'g2' },
    })
    expect(unresolved.routeKeys).toEqual([])
    expect(unresolved.scopeLabel).toBe('Route group')
    expect(unresolved.kpi.revenue).toBe(0)
  })

  it('defaults the campaign set but yields to a caller-supplied one', () => {
    const ctx = buildAnalyticsContext({ series, prevSeries: clean, scope: { kind: 'all' } })
    expect(ctx.campaigns.length).toBeGreaterThan(0)

    const custom = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'all' },
      campaigns: [{ label: 'Payday', rule: { type: 'dayOfMonth', day: 25 } }],
    })
    expect(custom.campaigns.map((c) => c.label)).toEqual(['Payday'])
  })

  it('passes the caller-supplied data-health inputs through to the report', () => {
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'all' },
      dq: { dataQuality: [{ issue: 'missing awb', rows: 3, awbs: 2 }] },
    })
    expect(ctx.dq.backendIssues).toEqual([{ issue: 'missing awb', rows: 3, awbs: 2 }])
    // ...without letting them displace the unscoped series the gate is computed from.
    expect(ctx.dq.totalDays).toBe(4)
    expect(ctx.dq.coverageOk).toBe(false)
  })

  it('never lets a caller-supplied series displace the unscoped one the gate is computed from', () => {
    // The type forbids `series` on the dq input, but nothing stops a dynamically-built object at
    // runtime — and a clean one-day series smuggled in here would certify the broken period.
    const smuggled = { series: [{ date: '2026-05-01', revenue: 100, incompleteTos: 0 }] }
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'all' },
      dq: smuggled as never,
    })
    expect(ctx.dq.totalDays).toBe(4)
    expect(ctx.dq.coverageOk).toBe(false)
    expect(ctx.coverageOk).toBe(false)
  })
})
