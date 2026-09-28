import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ListFleetAlertsDto } from './list-fleet-alerts.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ListFleetAlertsDto, { ...overrides })

describe('ListFleetAlertsDto', () => {
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // Query strings arrive as text; without the transform the service would slice with a string.
  it('coerces limit from the query string', async () => {
    const dto = build({ limit: '25' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.limit).toBe(25)
  })

  it('refuses a limit below one', async () => {
    const errors = await validate(build({ limit: '0' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })

  // An unbounded limit makes this endpoint a way to pull the whole document table in one request.
  it('refuses a limit above the maximum', async () => {
    const errors = await validate(build({ limit: '500' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })

  it('refuses a limit that is not a number', async () => {
    const errors = await validate(build({ limit: 'semua' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })
})
