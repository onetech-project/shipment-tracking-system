import { normalizeHeader, makeUniqueHeaders } from './normalizer'

describe('normalizeHeader()', () => {
  it('strips newline characters', () => {
    expect(normalizeHeader('Flight\nDate')).toBe('flight_date')
  })

  it('removes non-alphanumeric non-space characters', () => {
    expect(normalizeHeader('Weight (kg)')).toBe('weight_kg')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeHeader('  pieces  ')).toBe('pieces')
  })

  it('collapses multiple spaces into a single underscore', () => {
    expect(normalizeHeader('origin  city')).toBe('origin_city')
  })

  it('converts to lowercase', () => {
    expect(normalizeHeader('FlightDate')).toBe('flightdate')
  })

  it('returns empty string for a blank header', () => {
    expect(normalizeHeader('')).toBe('')
    expect(normalizeHeader('   ')).toBe('')
  })

  it('returns empty string for a header that becomes empty after stripping', () => {
    expect(normalizeHeader('!!!')).toBe('')
  })

  it('handles a header that is already normalized', () => {
    expect(normalizeHeader('to_number')).toBe('tonumber')
  })

  it('handles mixed newline and special chars', () => {
    expect(normalizeHeader('Dep.\nCity (IATA)')).toBe('dep_city_iata')
  })
})

describe('makeUniqueHeaders()', () => {
  it('returns headers unchanged when all are unique', () => {
    expect(makeUniqueHeaders(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('appends _2 to the second occurrence of a duplicate', () => {
    expect(makeUniqueHeaders(['a', 'b', 'a'])).toEqual(['a', 'b', 'a_2'])
  })

  it('appends _3 to the third occurrence of a duplicate', () => {
    expect(makeUniqueHeaders(['a', 'a', 'a'])).toEqual(['a', 'a_2', 'a_3'])
  })

  it('handles multiple independent duplicate groups', () => {
    expect(makeUniqueHeaders(['x', 'y', 'x', 'y'])).toEqual(['x', 'y', 'x_2', 'y_2'])
  })

  it('leaves empty strings unchanged (they will be handled by skipNullCols logic)', () => {
    const result = makeUniqueHeaders(['a', '', 'a', ''])
    expect(result[0]).toBe('a')
    expect(result[2]).toBe('a_2')
  })
})
