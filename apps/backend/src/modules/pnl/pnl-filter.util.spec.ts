import { calendarDatesForFilter, calendarDaysForFilter } from './pnl-filter.util'

describe('calendarDatesForFilter', () => {
  it('returns days 1-15 for a 1H cycle', () => {
    const dates = calendarDatesForFilter('2026-07-1H')
    expect(dates).toHaveLength(15)
    expect(dates[0]).toBe('2026-07-01')
    expect(dates[14]).toBe('2026-07-15')
  })

  it('returns day 16 to month end for a 2H cycle in a 31-day month', () => {
    const dates = calendarDatesForFilter('2026-07-2H')
    expect(dates).toHaveLength(16)
    expect(dates[0]).toBe('2026-07-16')
    expect(dates[15]).toBe('2026-07-31')
  })

  it('returns day 16 to month end for a 2H cycle in a 30-day month', () => {
    const dates = calendarDatesForFilter('2026-06-2H')
    expect(dates).toHaveLength(15)
    expect(dates[14]).toBe('2026-06-30')
  })

  it('handles February in a non-leap year', () => {
    const dates = calendarDatesForFilter('2026-02-2H')
    expect(dates).toHaveLength(13)
    expect(dates[12]).toBe('2026-02-28')
  })

  it('handles February in a leap year', () => {
    const dates = calendarDatesForFilter('2028-02-2H')
    expect(dates).toHaveLength(14)
    expect(dates[13]).toBe('2028-02-29')
  })

  it('returns every date in a range, inclusive of both ends', () => {
    const dates = calendarDatesForFilter(undefined, '2026-07-30', '2026-08-02')
    expect(dates).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('returns a single date when start equals end', () => {
    expect(calendarDatesForFilter(undefined, '2026-07-05', '2026-07-05')).toEqual(['2026-07-05'])
  })

  it('returns empty for an end before the start', () => {
    expect(calendarDatesForFilter(undefined, '2026-07-05', '2026-07-01')).toEqual([])
  })

  it('returns empty when neither cycle nor range is given', () => {
    expect(calendarDatesForFilter()).toEqual([])
  })

  it('returns empty for a malformed cycle string', () => {
    expect(calendarDatesForFilter('not-a-cycle')).toEqual([])
  })
})

describe('calendarDaysForFilter', () => {
  it('counts the dates a 1H cycle spans', () => {
    expect(calendarDaysForFilter('2026-07-1H')).toBe(15)
  })

  it('counts the dates a 2H cycle spans', () => {
    expect(calendarDaysForFilter('2026-07-2H')).toBe(16)
  })

  it('counts the dates a range spans', () => {
    expect(calendarDaysForFilter(undefined, '2026-07-01', '2026-07-10')).toBe(10)
  })

  it('never returns zero, so it is safe as a divisor', () => {
    expect(calendarDaysForFilter()).toBe(1)
    expect(calendarDaysForFilter('not-a-cycle')).toBe(1)
  })
})
