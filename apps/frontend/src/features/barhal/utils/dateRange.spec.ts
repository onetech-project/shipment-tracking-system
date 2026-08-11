import {
  MAX_RANGE_DAYS,
  earliestStartFor,
  latestEndFor,
  shiftDate,
  withEndDate,
  withStartDate,
} from './dateRange'

describe('shiftDate', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('does not skip or repeat a day across a DST transition', () => {
    // Jakarta has no DST, but the dashboard is also opened from browsers that do; UTC arithmetic
    // is what makes this hold regardless of the viewer's timezone.
    expect(shiftDate('2026-03-29', 1)).toBe('2026-03-30')
    expect(shiftDate('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('latestEndFor / earliestStartFor', () => {
  it('counts both endpoints, so a whole 31-day month is allowed', () => {
    expect(latestEndFor('2026-08-01')).toBe('2026-08-31')
    expect(earliestStartFor('2026-08-31')).toBe('2026-08-01')
  })

  it('stays consistent with MAX_RANGE_DAYS', () => {
    expect(shiftDate('2026-08-01', MAX_RANGE_DAYS - 1)).toBe(latestEndFor('2026-08-01'))
  })
})

describe('withStartDate', () => {
  it('leaves a still-valid end alone', () => {
    expect(withStartDate('2026-08-05', '2026-08-20')).toEqual({ start: '2026-08-05', end: '2026-08-20' })
  })

  it('collapses to a single day when the new start passes the end', () => {
    expect(withStartDate('2026-08-25', '2026-08-10')).toEqual({ start: '2026-08-25', end: '2026-08-25' })
  })

  it('pulls an end that is now more than a month away back to the ceiling', () => {
    expect(withStartDate('2026-08-01', '2026-12-31')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('lets the operator jump months back, dragging the end along', () => {
    // Filter sits on 1–31 Aug and the operator picks 1 May as the new start. That must be allowed,
    // with the end following to 31 May — not refused for being far from the current end.
    expect(withStartDate('2026-05-01', '2026-08-31')).toEqual({ start: '2026-05-01', end: '2026-05-31' })
  })

  it('never moves the side the operator just picked', () => {
    expect(withStartDate('2026-08-25', '2026-08-10').start).toBe('2026-08-25')
    expect(withStartDate('2026-08-01', '2026-12-31').start).toBe('2026-08-01')
  })

  it('passes blanks through untouched — the dashboard treats an empty date as no filter', () => {
    expect(withStartDate('', '2026-08-20')).toEqual({ start: '', end: '2026-08-20' })
    expect(withStartDate('2026-08-05', '')).toEqual({ start: '2026-08-05', end: '' })
  })
})

describe('withEndDate', () => {
  it('leaves a still-valid start alone', () => {
    expect(withEndDate('2026-08-20', '2026-08-05')).toEqual({ start: '2026-08-05', end: '2026-08-20' })
  })

  it('collapses to a single day when the new end precedes the start', () => {
    expect(withEndDate('2026-08-03', '2026-08-15')).toEqual({ start: '2026-08-03', end: '2026-08-03' })
  })

  it('pushes a start that is now more than a month away up to the floor', () => {
    expect(withEndDate('2026-08-31', '2026-01-01')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('never moves the side the operator just picked', () => {
    expect(withEndDate('2026-08-03', '2026-08-15').end).toBe('2026-08-03')
    expect(withEndDate('2026-08-31', '2026-01-01').end).toBe('2026-08-31')
  })

  it('passes blanks through untouched', () => {
    expect(withEndDate('', '2026-08-05')).toEqual({ start: '2026-08-05', end: '' })
    expect(withEndDate('2026-08-20', '')).toEqual({ start: '', end: '2026-08-20' })
  })
})

describe('the two directions agree', () => {
  it('produces a range the backend will accept, whichever side was edited', () => {
    const fromStart = withStartDate('2026-08-01', '2026-12-31')
    const fromEnd = withEndDate('2026-08-31', '2026-01-01')
    for (const range of [fromStart, fromEnd]) {
      expect(range.start <= range.end).toBe(true)
      expect(range.end <= latestEndFor(range.start)).toBe(true)
    }
  })
})
