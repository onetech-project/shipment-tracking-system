import { toRecapMetrics, emptyRecapMetrics, RecapAggregateRow } from './barhal-recap.builder'

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
