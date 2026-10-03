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
  })

  describe('UpdateScenarioDto', () => {
    it('requires the revision on update so a stale save can be refused', () => {
      expect(errorsOf(UpdateScenarioDto, { name: 'x' })).toEqual(['revision'])
      expect(errorsOf(UpdateScenarioDto, { revision: 3 })).toEqual([])
    })
  })
})
