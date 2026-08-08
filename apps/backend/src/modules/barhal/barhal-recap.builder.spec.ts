import {
  toRecapMetrics,
  emptyRecapMetrics,
  enumerateDates,
  daysInRange,
  densifyPerTanggal,
  densifyPerRute,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
} from './barhal-recap.builder'

function aggregateRow(overrides: Partial<RecapAggregateRow> = {}): RecapAggregateRow {
  return {
    total_to: 3,
    total_koli: 2,
    unpacked_to: 0,
    koli_without_awb: 0,
    missing_chwt: 0,
    weight_before: '30',
    chwt: '25',
    weight_increase: '6',
    add_revenue: '500',
    ...overrides,
  }
}

describe('toRecapMetrics', () => {
  it('marks a group completed when nothing in it is outstanding', () => {
    expect(toRecapMetrics(aggregateRow()).status).toBe('completed')
  })

  it('marks a group incomplete when some of its TOs are not packed into a Koli yet', () => {
    // The case that used to break the drilldown: a date whose Kolis were all finished still read
    // "Completed" while the routes holding its unpacked TOs read "Incomplete" underneath it.
    expect(toRecapMetrics(aggregateRow({ total_to: 10, unpacked_to: 7 })).status).toBe('incomplete')
  })

  it('marks a group incomplete when one of its Kolis has produced no AWB', () => {
    expect(toRecapMetrics(aggregateRow({ koli_without_awb: 1 })).status).toBe('incomplete')
  })

  it('marks a group incomplete when a packed AWB is missing its chWt', () => {
    expect(toRecapMetrics(aggregateRow({ missing_chwt: 1 })).status).toBe('incomplete')
  })

  it('leaves the status unset only when the group saw no activity at all', () => {
    // Every other number is Koli-derived, so total_to and total_koli at zero means the whole row is
    // zero — there is nothing to report on, as opposed to something reported as not yet done.
    const empty = aggregateRow({
      total_to: 0,
      total_koli: 0,
      weight_before: '0',
      chwt: '0',
      weight_increase: '0',
      add_revenue: '0',
    })
    expect(toRecapMetrics(empty).status).toBe('none')
  })

  it('rolls up: a parent is completed only when every child that has work is completed', () => {
    // A parent's counters are the sums of its children's, because a TO belongs to exactly one route
    // and one date, and so does a Koli. Any child with an outstanding item therefore forces the
    // parent incomplete — the guarantee the drilldown UI depends on.
    const children = [
      aggregateRow({ total_to: 4, total_koli: 1 }),
      aggregateRow({ total_to: 6, total_koli: 0, unpacked_to: 6 }),
    ]
    const parent = aggregateRow({
      total_to: 10,
      total_koli: 1,
      unpacked_to: children.reduce((n, c) => n + c.unpacked_to, 0),
      koli_without_awb: children.reduce((n, c) => n + c.koli_without_awb, 0),
      missing_chwt: children.reduce((n, c) => n + c.missing_chwt, 0),
    })

    expect(children.map((c) => toRecapMetrics(c).status)).toEqual(['completed', 'incomplete'])
    expect(toRecapMetrics(parent).status).toBe('incomplete')
  })

  it('derives weightAfter and variance from the Koli weight increase', () => {
    const metrics = toRecapMetrics(aggregateRow())
    expect(metrics.weightBefore).toBe(30)
    expect(metrics.weightAfter).toBe(36)
    expect(metrics.variance).toBe(6)
    expect(metrics.variancePercent).toBeCloseTo(20)
    expect(metrics.chwt).toBe(25)
    expect(metrics.addRevenue).toBe(500)
  })

  it('reports variancePercent as 0 when weightBefore is 0 (no division by zero)', () => {
    const metrics = toRecapMetrics(aggregateRow({ weight_before: '0', weight_increase: '0' }))
    expect(metrics.variancePercent).toBe(0)
  })
})

describe('emptyRecapMetrics', () => {
  it('is all zeroes with no status', () => {
    expect(emptyRecapMetrics()).toEqual({
      totalTo: 0,
      totalKoli: 0,
      weightBefore: 0,
      weightAfter: 0,
      chwt: 0,
      variance: 0,
      variancePercent: 0,
      addRevenue: 0,
      status: 'none',
    })
  })
})

describe('enumerateDates', () => {
  it('returns every day of a 31-day month', () => {
    const dates = enumerateDates('2026-08-01', '2026-08-31')
    expect(dates).toHaveLength(31)
    expect(dates[0]).toBe('2026-08-01')
    expect(dates[30]).toBe('2026-08-31')
  })

  it('includes 29 February in a leap year', () => {
    const dates = enumerateDates('2024-02-01', '2024-02-29')
    expect(dates).toHaveLength(29)
    expect(dates).toContain('2024-02-29')
  })

  it('returns a single date when start equals end', () => {
    expect(enumerateDates('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })

  it('crosses month and year boundaries', () => {
    expect(enumerateDates('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ])
  })

  it('returns nothing when end precedes start', () => {
    expect(enumerateDates('2026-08-10', '2026-08-01')).toEqual([])
  })
})

describe('daysInRange', () => {
  it('counts both endpoints', () => {
    expect(daysInRange('2026-08-01', '2026-08-31')).toBe(31)
    expect(daysInRange('2026-08-03', '2026-08-03')).toBe(1)
  })

  it('lets a full leap year through the MAX_RECAP_DAYS ceiling', () => {
    expect(daysInRange('2024-01-01', '2024-12-31')).toBe(366)
    expect(daysInRange('2024-01-01', '2024-12-31')).toBeLessThanOrEqual(MAX_RECAP_DAYS)
    expect(daysInRange('2024-01-01', '2025-01-01')).toBeGreaterThan(MAX_RECAP_DAYS)
  })

  it('returns 0 when end precedes start', () => {
    expect(daysInRange('2026-08-10', '2026-08-01')).toBe(0)
  })
})

describe('densifyPerTanggal', () => {
  it('fills dates with no activity with a zeroed statusless row', () => {
    const rows = [{ date: '2026-08-02', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerTanggal(rows, '2026-08-01', '2026-08-03')
    expect(result.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(result[0]).toEqual({ date: '2026-08-01', ...emptyRecapMetrics() })
    expect(result[1].status).toBe('completed')
    expect(result[2].status).toBe('none')
  })

  it('keeps a date that has TOs but no Koli instead of zeroing its totalTo', () => {
    const rows = [
      {
        date: '2026-08-01',
        ...toRecapMetrics(
          aggregateRow({
            total_to: 5,
            total_koli: 0,
            unpacked_to: 5,
            weight_before: '0',
            weight_increase: '0',
            chwt: '0',
            add_revenue: '0',
          }),
        ),
      },
    ]
    const result = densifyPerTanggal(rows, '2026-08-01', '2026-08-02')
    expect(result[0].totalTo).toBe(5)
    expect(result[0].totalKoli).toBe(0)
    // Unpacked TOs are still activity, so this date is judged — unlike the zero row filled in for
    // 2026-08-02, which reports no status at all.
    expect(result[0].status).toBe('incomplete')
    expect(result[1].status).toBe('none')
  })

  it('returns dates ascending regardless of input order', () => {
    const rows = [
      { date: '2026-08-03', ...emptyRecapMetrics() },
      { date: '2026-08-01', ...emptyRecapMetrics() },
    ]
    expect(densifyPerTanggal(rows, '2026-08-01', '2026-08-03').map((r) => r.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })
})

describe('densifyPerRute', () => {
  const master = [
    { originName: 'Kosambi', destName: 'Badung' },
    { originName: 'Kosambi', destName: 'Makassar' },
    { originName: 'Surabaya', destName: 'Badung' },
  ]

  it('adds every master route that had no activity as a zeroed statusless row', () => {
    const rows = [{ originName: 'Kosambi', destName: 'Badung', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual({ originName: 'Kosambi', destName: 'Makassar', ...emptyRecapMetrics() })
    expect(result[2]).toEqual({ originName: 'Surabaya', destName: 'Badung', ...emptyRecapMetrics() })
  })

  it('keeps the queried numbers for routes that are in both sets', () => {
    const rows = [{ originName: 'Kosambi', destName: 'Badung', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result[0]).toMatchObject({ originName: 'Kosambi', destName: 'Badung', totalTo: 3, status: 'completed' })
  })

  it('keeps a route that only exists in the query result, not in the master list', () => {
    const rows = [{ originName: 'Denpasar', destName: 'Kosambi', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result).toHaveLength(4)
    expect(result.map((r) => `${r.originName}-${r.destName}`)).toContain('Denpasar-Kosambi')
  })

  it('sorts by origin then destination', () => {
    const result = densifyPerRute([], [
      { originName: 'Surabaya', destName: 'Badung' },
      { originName: 'Kosambi', destName: 'Makassar' },
      { originName: 'Kosambi', destName: 'Badung' },
    ])
    expect(result.map((r) => `${r.originName}-${r.destName}`)).toEqual([
      'Kosambi-Badung',
      'Kosambi-Makassar',
      'Surabaya-Badung',
    ])
  })

  it('returns only master routes when the query returned nothing', () => {
    const result = densifyPerRute([], master)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.status === 'none' && r.totalKoli === 0)).toBe(true)
  })
})
