import { currentMonthRange } from './monthRange'

describe('currentMonthRange', () => {
  it('spans the first to the last day of a 31-day month', () => {
    expect(currentMonthRange(new Date(2026, 7, 3))).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('spans the first to the last day of a 30-day month', () => {
    expect(currentMonthRange(new Date(2026, 3, 15))).toEqual({ start: '2026-04-01', end: '2026-04-30' })
  })

  it('handles February in a leap year', () => {
    expect(currentMonthRange(new Date(2024, 1, 10))).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('handles February in a non-leap year', () => {
    expect(currentMonthRange(new Date(2026, 1, 10))).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('zero-pads single-digit months', () => {
    expect(currentMonthRange(new Date(2026, 0, 1))).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
})
