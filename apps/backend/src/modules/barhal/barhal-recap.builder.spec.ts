import {
  toRecapMetrics,
  emptyRecapMetrics,
  enumerateDates,
  daysInRange,
  densifyPerTanggal,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
} from './barhal-recap.builder'

function aggregateRow(overrides: Partial<RecapAggregateRow> = {}): RecapAggregateRow {
  return {
    total_to: 3,
    total_koli: 2,
    awb_count: 2,
    missing_chwt: 0,
    weight_before: '30',
    chwt: '25',
    weight_increase: '6',
    add_revenue: '500',
    ...overrides,
  }
}

describe('toRecapMetrics', () => {
  it('marks a group completed when every packed AWB has a chWt', () => {
    expect(toRecapMetrics(aggregateRow()).status).toBe('completed')
  })

  it('marks a group incomplete when no AWB has been packed into a Koli yet', () => {
    expect(toRecapMetrics(aggregateRow({ awb_count: 0, total_koli: 0 })).status).toBe('incomplete')
  })

  it('marks a group incomplete when a packed AWB is missing its chWt', () => {
    expect(toRecapMetrics(aggregateRow({ missing_chwt: 1 })).status).toBe('incomplete')
  })

  it('ignores barhal TOs that are not packed into a Koli when deciding status', () => {
    // 10 barhal TOs on this date but only 2 AWBs packed: chWt is the only check, so still completed
    expect(toRecapMetrics(aggregateRow({ total_to: 10 })).status).toBe('completed')
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
  it('is all zeroes and incomplete', () => {
    expect(emptyRecapMetrics()).toEqual({
      totalTo: 0,
      totalKoli: 0,
      weightBefore: 0,
      weightAfter: 0,
      chwt: 0,
      variance: 0,
      variancePercent: 0,
      addRevenue: 0,
      status: 'incomplete',
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
  it('fills dates with no activity with a zeroed incomplete row', () => {
    const rows = [{ date: '2026-08-02', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerTanggal(rows, '2026-08-01', '2026-08-03')
    expect(result.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(result[0]).toEqual({ date: '2026-08-01', ...emptyRecapMetrics() })
    expect(result[1].status).toBe('completed')
    expect(result[2].status).toBe('incomplete')
  })

  it('keeps a date that has TOs but no Koli instead of zeroing its totalTo', () => {
    const rows = [
      {
        date: '2026-08-01',
        ...toRecapMetrics(
          aggregateRow({
            total_to: 5,
            total_koli: 0,
            awb_count: 0,
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
    expect(result[0].status).toBe('incomplete')
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
