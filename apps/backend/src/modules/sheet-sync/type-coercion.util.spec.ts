/**
 * T009 - Unit tests for type-coercion.util.ts
 */
import { coerceValue } from './type-coercion.util'

describe('coerceValue', () => {
  describe('null / empty', () => {
    it('returns null for null input', () => expect(coerceValue(null)).toBeNull())
    it('returns null for undefined input', () => expect(coerceValue(undefined)).toBeNull())
    it('returns empty string for empty string', () => expect(coerceValue('')).toBeNull())
  })

  describe('boolean coercion', () => {
    it('coerces "true" to true', () => expect(coerceValue('true')).toBe(true))
    it('coerces "TRUE" to true', () => expect(coerceValue('TRUE')).toBe(true))
    it('coerces "True" to true', () => expect(coerceValue('True')).toBe(true))
    it('coerces "false" to false', () => expect(coerceValue('false')).toBe(false))
    it('coerces "FALSE" to false', () => expect(coerceValue('FALSE')).toBe(false))
  })

  describe('integer coercion', () => {
    it('coerces "42" to 42', () => expect(coerceValue('42')).toBe(42))
    it('coerces "-10" to -10', () => expect(coerceValue('-10')).toBe(-10))
    it('coerces "0" to 0', () => expect(coerceValue('0')).toBe(0))
  })

  describe('float coercion', () => {
    it('coerces "3.14" to 3.14', () => expect(coerceValue('3.14')).toBeCloseTo(3.14))
    it('coerces "-1.5" to -1.5', () => expect(coerceValue('-1.5')).toBeCloseTo(-1.5))
    it('coerces "1e3" to 1000', () => expect(coerceValue('1e3')).toBe(1000))
  })

  describe('ISO 8601 date coercion', () => {
    it('coerces "2026-04-04" to a Date', () => {
      const result = coerceValue('2026-04-04')
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getFullYear()).toBe(2026)
    })
    it('coerces "2026-04-04T10:30:00.000Z" to a Date', () => {
      const result = coerceValue('2026-04-04T10:30:00.000Z')
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('string fallback', () => {
    it('returns plain string unchanged', () => expect(coerceValue('hello')).toBe('hello'))
    it('returns non-ISO date string unchanged', () =>
      expect(coerceValue('April 4 2026')).toBe('April 4 2026'))
    it('returns string with mixed chars unchanged', () =>
      expect(coerceValue('ABC-123')).toBe('ABC-123'))
  })
})
