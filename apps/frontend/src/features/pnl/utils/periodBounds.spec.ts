import { periodBounds } from './periodBounds'

describe('periodBounds', () => {
  it('returns the range endpoints unchanged in range mode', () => {
    const bounds = periodBounds({
      mode: 'range', start: '2026-05-03', end: '2026-05-19', basis: 'atd_origin',
    })
    expect(bounds).toEqual({ min: '2026-05-03', max: '2026-05-19' })
  })

  it('maps a 1H cycle to days 1 through 15', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-05-01', max: '2026-05-15' })
  })

  it('maps a 2H cycle to day 16 through the end of a 31-day month', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-05-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-05-16', max: '2026-05-31' })
  })

  it('maps a 2H cycle to day 16 through the end of a 30-day month', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-04-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-04-16', max: '2026-04-30' })
  })

  it('handles February in a non-leap year', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-02-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-02-16', max: '2026-02-28' })
  })

  it('handles February in a leap year', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2028-02-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2028-02-16', max: '2028-02-29' })
  })

  it('returns empty bounds for a malformed cycle rather than throwing', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: 'nonsense', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '', max: '' })
  })
})
