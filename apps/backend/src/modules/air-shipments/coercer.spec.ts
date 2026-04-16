import { coerceValue } from './coercer'

const ctx = { sheet: 'TestSheet', row: 1, col: 'test_col' }

describe('coerceValue()', () => {
  describe('spreadsheet error strings → null', () => {
    const errors = ['#REF!', '#VALUE!', '#N/A', '#NAME?', '#DIV/0!']
    for (const err of errors) {
      it(`coerces "${err}" to null`, () => {
        expect(coerceValue(err, ctx)).toBeNull()
      })
    }
  })

  describe('numeric strings → number', () => {
    it('coerces integer string', () => {
      expect(coerceValue('42', ctx)).toBe(42)
    })

    it('coerces decimal string', () => {
      expect(coerceValue('3.14', ctx)).toBe(3.14)
    })

    it('coerces negative number string', () => {
      expect(coerceValue('-7.5', ctx)).toBe(-7.5)
    })

    it('does not coerce empty string to number', () => {
      expect(coerceValue('', ctx)).toBeNull()
    })
  })

  describe('empty / whitespace-only strings → null', () => {
    it('coerces empty string to null', () => {
      expect(coerceValue('', ctx)).toBeNull()
    })

    it('coerces whitespace-only string to null', () => {
      expect(coerceValue('   ', ctx)).toBeNull()
    })
  })

  describe('boolean strings → boolean', () => {
    it('coerces "true" to true', () => {
      expect(coerceValue('true', ctx)).toBe(true)
    })

    it('coerces "TRUE" to true', () => {
      expect(coerceValue('TRUE', ctx)).toBe(true)
    })

    it('coerces "false" to false', () => {
      expect(coerceValue('false', ctx)).toBe(false)
    })

    it('coerces "FALSE" to false', () => {
      expect(coerceValue('FALSE', ctx)).toBe(false)
    })
  })

  describe('duration strings → integer seconds', () => {
    it('converts "1 day, 4:00:00" to seconds', () => {
      expect(coerceValue('1 day, 4:00:00', ctx)).toBe(1 * 86400 + 4 * 3600)
    })

    it('converts "0 days, 1:30:00" to seconds', () => {
      expect(coerceValue('0 days, 1:30:00', ctx)).toBe(5400)
    })

    it('converts "2 days, 0:00:00" to seconds', () => {
      expect(coerceValue('2 days, 0:00:00', ctx)).toBe(2 * 86400)
    })
  })

  describe('date/datetime strings → Date', () => {
    it('parses ISO 8601 date', () => {
      const result = coerceValue('2026-04-08', ctx)
      expect(result).toBeInstanceOf(Date)
    })

    it('parses dd-mmm-yyyy format', () => {
      const result = coerceValue('08-Apr-2026', ctx)
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getFullYear()).toBe(2026)
    })

    it('parses dd/mm/yyyy hh:mm format', () => {
      const result = coerceValue('08/04/2026 14:30', ctx)
      expect(result).toBeInstanceOf(Date)
    })

    it('returns plain string for unrecognized date-like text', () => {
      expect(coerceValue('not-a-date', ctx)).toBe('not-a-date')
    })
  })

  describe('fallback → plain string', () => {
    it('returns plain string for unrecognized values', () => {
      expect(coerceValue('CGK Airport', ctx)).toBe('CGK Airport')
    })
  })
})
