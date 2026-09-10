import { normalizeNopol } from './fleet-nopol'

describe('normalizeNopol', () => {
  it('uppercases and collapses runs of whitespace to one space', () => {
    expect(normalizeNopol('b  9114   kyz')).toBe('B 9114 KYZ')
  })

  it('leaves an already-normalised plate untouched', () => {
    expect(normalizeNopol('B 9114 KYZ')).toBe('B 9114 KYZ')
  })

  it('trims the ends', () => {
    expect(normalizeNopol('  b 9114 kyz  ')).toBe('B 9114 KYZ')
  })

  // Tabs and newlines reach the field through copy-paste from a spreadsheet. Collapsing only
  // literal spaces would let "B\t9114" past the unique index as a different plate.
  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeNopol('b\t9114\nkyz')).toBe('B 9114 KYZ')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeNopol('   ')).toBe('')
  })
})
