import { formatDate, formatDateTime } from './dateFormat'

describe('formatDate', () => {
  it('formats a plain YYYY-MM-DD date', () => {
    expect(formatDate('2026-08-06')).toBe('06-Aug-2026')
  })

  it('zero-pads single-digit days', () => {
    expect(formatDate('2026-01-02')).toBe('02-Jan-2026')
  })

  it('formats the date part of an ISO timestamp', () => {
    // Dibangun dari komponen waktu lokal agar test tidak tergantung timezone runner.
    const local = new Date(2026, 11, 25, 10, 30).toISOString()
    expect(formatDate(local)).toBe('25-Dec-2026')
  })

  it('returns an em dash for empty input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('returns an em dash for unparseable input', () => {
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats an ISO timestamp down to the minute', () => {
    // Dibangun dari komponen waktu lokal agar test tidak tergantung timezone runner.
    const local = new Date(2026, 7, 6, 14, 5).toISOString()
    expect(formatDateTime(local)).toBe('06-Aug-2026 14:05')
  })

  it('zero-pads hours and minutes', () => {
    const local = new Date(2026, 0, 2, 3, 7).toISOString()
    expect(formatDateTime(local)).toBe('02-Jan-2026 03:07')
  })

  it('returns an em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })

  it('returns an em dash for unparseable input', () => {
    expect(formatDateTime('not a date')).toBe('—')
  })
})
