import { formatRupiah } from './format-rupiah'

describe('formatRupiah', () => {
  it('groups thousands the Indonesian way', () => {
    // Non-breaking space is what Intl emits after the currency symbol; normalised so the
    // assertion does not depend on which space the runtime picked.
    expect(formatRupiah(8750000).replace(/\s/g, ' ')).toBe('Rp 8.750.000')
  })

  it('drops the decimals operators never type', () => {
    expect(formatRupiah(1500.75)).not.toContain(',')
  })

  it('writes zero as a figure, not a dash', () => {
    expect(formatRupiah(0)).toContain('0')
  })

  // A missing figure and a zero figure mean different things: one is "nothing owed", the other
  // is "we do not know".
  it('writes an em dash for a missing figure', () => {
    expect(formatRupiah(null)).toBe('—')
  })
})
