import { quoteIdentifier } from '../src/quoteIdentifier'

describe('quoteIdentifier', () => {
  it('quotes simple identifiers', () => {
    expect(quoteIdentifier('to_number')).toBe('"to_number"')
  })

  it('escapes embedded double quotes', () => {
    expect(quoteIdentifier('weird"name')).toBe('"weird""name"')
  })
})
