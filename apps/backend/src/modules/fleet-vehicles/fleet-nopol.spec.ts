import { normalizeNopol } from './fleet-nopol'

describe('normalizeNopol', () => {
  it('uppercases and removes every space', () => {
    expect(normalizeNopol('b  9114   kyz')).toBe('B9114KYZ')
  })

  it('leaves an already-normalised plate untouched', () => {
    expect(normalizeNopol('B9114KYZ')).toBe('B9114KYZ')
  })

  it('trims the ends', () => {
    expect(normalizeNopol('  b 9114 kyz  ')).toBe('B9114KYZ')
  })

  // Tabs and newlines reach the field through copy-paste from a spreadsheet.
  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeNopol('b\t9114\nkyz')).toBe('B9114KYZ')
  })

  // Operators type the plate three ways on the same day. All three are the same truck, and the
  // partial unique index only catches that if all three collapse to one string.
  it.each(['B.9114.KYZ', 'B-9114-KYZ', 'b 9114-kyz'])('strips dots and dashes from %s', (raw) => {
    expect(normalizeNopol(raw)).toBe('B9114KYZ')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeNopol('   ')).toBe('')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeNopol(' - . ')).toBe('')
  })
})
