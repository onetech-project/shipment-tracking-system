import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateScenarioDto, UpdateScenarioDto } from './save-scenario.dto'

const errorsOf = <T extends object>(cls: new () => T, payload: unknown) =>
  validateSync(plainToInstance(cls, payload) as object).map((e) => e.property)

describe('SaveScenarioDto', () => {
  describe('CreateScenarioDto', () => {
    it('accepts a named scenario with an object payload', () => {
      expect(errorsOf(CreateScenarioDto, { name: 'Baseline Okt', payload: { version: 1 } })).toEqual([])
    })

    it('rejects a blank name and a non-object payload', () => {
      expect(errorsOf(CreateScenarioDto, { name: '', payload: [] })).toEqual(['name', 'payload'])
    })

    it('rejects a whitespace-only name', () => {
      expect(errorsOf(CreateScenarioDto, { name: '   ', payload: {} })).toEqual(['name'])
    })

    it('trims the name before validation', () => {
      const instance = plainToInstance(CreateScenarioDto, { name: '  Okt  ', payload: {} })
      expect(validateSync(instance as object)).toEqual([])
      expect(instance.name).toBe('Okt')
    })

    it('rejects a description over 1000 characters', () => {
      expect(errorsOf(CreateScenarioDto, { name: 'Baseline', payload: {}, description: 'x'.repeat(1001) })).toEqual(['description'])
      expect(errorsOf(CreateScenarioDto, { name: 'Baseline', payload: {}, description: 'x'.repeat(1000) })).toEqual([])
    })
  })

  describe('UpdateScenarioDto', () => {
    it('requires the revision on update so a stale save can be refused', () => {
      expect(errorsOf(UpdateScenarioDto, { name: 'x' })).toEqual(['revision'])
      expect(errorsOf(UpdateScenarioDto, { revision: 3 })).toEqual([])
    })

    it('rejects a whitespace-only name', () => {
      expect(errorsOf(UpdateScenarioDto, { revision: 1, name: '   ' })).toEqual(['name'])
    })

    it('rejects a description over 1000 characters', () => {
      expect(errorsOf(UpdateScenarioDto, { revision: 1, description: 'x'.repeat(1001) })).toEqual(['description'])
    })
  })
})
