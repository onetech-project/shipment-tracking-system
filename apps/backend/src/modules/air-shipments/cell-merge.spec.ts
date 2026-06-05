import { mergeRenderedCell, mergeRangeValues } from './cell-merge'

describe('mergeRenderedCell()', () => {
  describe('recovers numeric precision lost to display format', () => {
    it('prefers the unformatted number over a rounded, thousands-separated string', () => {
      // The bug: "Other Charges" 2838.27 renders as "2,838" under FORMATTED_VALUE.
      expect(mergeRenderedCell('2,838', 2838.27)).toBe(2838.27)
    })

    it('keeps full precision for plain integers too', () => {
      expect(mergeRenderedCell('39,072', 39072)).toBe(39072)
    })

    it('recovers a number even when the formatted cell is missing (ragged row)', () => {
      expect(mergeRenderedCell(undefined, 555)).toBe(555)
    })

    it('keeps zero', () => {
      expect(mergeRenderedCell('0', 0)).toBe(0)
    })

    it('keeps negatives', () => {
      expect(mergeRenderedCell('(1,234)', -1234)).toBe(-1234)
    })
  })

  describe('preserves percent semantics', () => {
    it('keeps the formatted "%" string instead of the underlying fraction', () => {
      // Pipeline expects "11%" → 11 (then /100). Unformatted 0.11 would break it.
      expect(mergeRenderedCell('11%', 0.11)).toBe('11%')
    })

    it('keeps fractional percents', () => {
      expect(mergeRenderedCell('1.1%', 0.011)).toBe('1.1%')
    })
  })

  describe('falls through to the formatted rendering for non-numbers', () => {
    it('keeps dates (FORMATTED_STRING)', () => {
      expect(mergeRenderedCell('04-May-2026', '04-May-2026')).toBe('04-May-2026')
    })

    it('keeps text', () => {
      expect(mergeRenderedCell('RA AVIA CGK', 'RA AVIA CGK')).toBe('RA AVIA CGK')
    })

    it('keeps AWB-like text that is not a number', () => {
      expect(mergeRenderedCell('126-92893150', '126-92893150')).toBe('126-92893150')
    })

    it('keeps spreadsheet error strings for the coercer to null out', () => {
      expect(mergeRenderedCell('#N/A', '#N/A')).toBe('#N/A')
    })

    it('returns empty string for a doubly-empty cell', () => {
      expect(mergeRenderedCell(undefined, undefined)).toBe('')
      expect(mergeRenderedCell('', undefined)).toBe('')
    })
  })
})

describe('mergeRangeValues()', () => {
  it('merges cell-by-cell across a grid', () => {
    const formatted = [
      ['awb', 'freight', 'other', 'ppn'],
      ['126-92893150', '39,072', '2,838', '1.1%'],
    ]
    const unformatted = [
      ['awb', 'freight', 'other', 'ppn'],
      ['126-92893150', 39072, 2838.27, 0.011],
    ]
    expect(mergeRangeValues(formatted, unformatted)).toEqual([
      ['awb', 'freight', 'other', 'ppn'],
      ['126-92893150', 39072, 2838.27, '1.1%'],
    ])
  })

  it('handles ragged rows where one grid trims trailing empties', () => {
    const formatted = [['a', '1,000']]
    const unformatted = [['a', 1000, 7]]
    expect(mergeRangeValues(formatted, unformatted)).toEqual([['a', 1000, 7]])
  })

  it('handles a row missing entirely from one grid', () => {
    const formatted = [['a']]
    const unformatted = [['a'], ['b', 2]]
    expect(mergeRangeValues(formatted, unformatted)).toEqual([['a'], ['b', 2]])
  })
})
