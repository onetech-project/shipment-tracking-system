import { getLastInvoicePeriods, buildCustomPeriod } from './invoicePeriod'

describe('getLastInvoicePeriods', () => {
  it('returns the 4 most recent bi-weekly periods, newest first, when today is in the 2nd half', () => {
    const today = new Date('2026-07-21T00:00:00Z')
    const result = getLastInvoicePeriods(4, today)
    expect(result).toEqual([
      { label: '2026-07-2H', start: '2026-07-16', end: '2026-07-31' },
      { label: '2026-07-1H', start: '2026-07-01', end: '2026-07-15' },
      { label: '2026-06-2H', start: '2026-06-16', end: '2026-06-30' },
      { label: '2026-06-1H', start: '2026-06-01', end: '2026-06-15' },
    ])
  })

  it('returns the correct end-of-month day for the 2H bucket when today is in the 1st half', () => {
    const today = new Date('2026-07-05T00:00:00Z')
    const result = getLastInvoicePeriods(2, today)
    expect(result).toEqual([
      { label: '2026-07-1H', start: '2026-07-01', end: '2026-07-15' },
      { label: '2026-06-2H', start: '2026-06-16', end: '2026-06-30' },
    ])
  })

  it('rolls over the year boundary', () => {
    const today = new Date('2026-01-10T00:00:00Z')
    const result = getLastInvoicePeriods(2, today)
    expect(result).toEqual([
      { label: '2026-01-1H', start: '2026-01-01', end: '2026-01-15' },
      { label: '2025-12-2H', start: '2025-12-16', end: '2025-12-31' },
    ])
  })
})

describe('buildCustomPeriod', () => {
  it('builds a range label from start and end dates', () => {
    expect(buildCustomPeriod('2026-07-05', '2026-07-22')).toEqual({
      label: '2026-07-05 - 2026-07-22',
      start: '2026-07-05',
      end: '2026-07-22',
    })
  })
})
