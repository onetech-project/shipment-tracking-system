import { formatTanggal } from './format-date'

describe('formatTanggal', () => {
  // Reshaping, not arithmetic: the three parts come straight out of the string the backend sent.
  // Nothing here reads the browser clock, so two operators in different timezones read the same
  // date off the same row.
  it('writes an ISO date the way an Indonesian operator reads it', () => {
    expect(formatTanggal('2026-09-15')).toBe('15 Sep 2026')
  })

  it('keeps the leading zero off the day', () => {
    expect(formatTanggal('2026-01-05')).toBe('5 Jan 2026')
  })

  it.each([
    ['2026-01-01', '1 Jan 2026'],
    ['2026-12-31', '31 Des 2026'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatTanggal(iso)).toBe(expected)
  })

  // An em-dash, not an empty cell: a blank reads as a rendering hole, and this table has a lot of
  // legitimately empty document cells.
  it('shows an em-dash for a missing date', () => {
    expect(formatTanggal(null)).toBe('—')
  })

  it('shows an em-dash for an unparseable date', () => {
    expect(formatTanggal('kemarin')).toBe('—')
  })

  // A date-time would otherwise render as "15 Sep 2026" only by luck of the slice; pinned so a
  // backend that starts sending timestamps does not produce garbage.
  it('reads the date out of a timestamp', () => {
    expect(formatTanggal('2026-09-15T00:00:00.000Z')).toBe('15 Sep 2026')
  })
})
