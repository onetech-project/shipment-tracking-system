import { buildFilter, calendarDatesForFilter, calendarDaysForFilter } from './pnl-filter.util'

describe('buildFilter', () => {
  it('range mode includes the whole end day via a half-open upper bound', () => {
    const { where, params } = buildFilter(undefined, undefined, '2026-05-10', '2026-05-15')
    expect(where).toContain("< ($2::DATE + INTERVAL '1 day')")
    expect(where).not.toMatch(/<=\s*\$2::DATE/)
    expect(params).toEqual(['2026-05-10', '2026-05-15'])
  })

  it('range mode still emits the lower bound and the IS NOT NULL guard', () => {
    const { where } = buildFilter(undefined, undefined, '2026-05-10', '2026-05-15')
    expect(where).toContain('date_ata IS NOT NULL')
    expect(where).toContain('date_ata >= $1::DATE')
  })

  it('cycle mode is unaffected: equality on cycleCol bound to a single param', () => {
    const { where, params, cycleCol } = buildFilter('completed_time', '2026-07-1H')
    expect(where).toBe(`${cycleCol} = $1`)
    expect(params).toEqual(['2026-07-1H'])
  })

  it('resolves the date/cycle columns per basis, falling back to ata for unknown basis', () => {
    expect(buildFilter('atd_origin', undefined, '2026-05-10', '2026-05-15')).toMatchObject({
      dateCol: 'date_atd',
      cycleCol: 'cycle_atd',
    })
    expect(buildFilter('completed_time', undefined, '2026-05-10', '2026-05-15')).toMatchObject({
      dateCol: 'date_completed',
      cycleCol: 'cycle_completed',
    })
    expect(buildFilter('some-unknown-basis', undefined, '2026-05-10', '2026-05-15')).toMatchObject(
      { dateCol: 'date_ata', cycleCol: 'cycle_ata' },
    )
    expect(buildFilter(undefined, undefined, '2026-05-10', '2026-05-15')).toMatchObject({
      dateCol: 'date_ata',
      cycleCol: 'cycle_ata',
    })
  })

  it('prefixes columns with the alias when given', () => {
    const { where, dateCol, cycleCol } = buildFilter(
      'ata_vendor_wh_destination',
      undefined,
      '2026-05-10',
      '2026-05-15',
      'v.',
    )
    expect(dateCol).toBe('v.date_ata')
    expect(cycleCol).toBe('v.cycle_ata')
    expect(where).toContain('v.date_ata IS NOT NULL')
    expect(where).toContain('v.date_ata >= $1::DATE')
    expect(where).toContain("v.date_ata < ($2::DATE + INTERVAL '1 day')")
  })

  it('yields the 1=0 no-match clause when neither cycle nor range is given', () => {
    const { where, params } = buildFilter(undefined)
    expect(where).toBe('1=0')
    expect(params).toEqual([])
  })
})

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
