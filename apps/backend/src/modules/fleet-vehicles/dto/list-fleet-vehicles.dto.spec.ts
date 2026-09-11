import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ListFleetVehiclesDto } from './list-fleet-vehicles.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ListFleetVehiclesDto, { ...overrides })

describe('ListFleetVehiclesDto', () => {
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('accepts a free-text search term', async () => {
    const dto = build({ q: 'B 9114' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.q).toBe('B 9114')
  })

  // ?q[]=a&q[]=b binds q as an array, and the service calls dto.q?.trim() unguarded — without
  // @IsString that reaches the query builder and 500s on a user-supplied parameter.
  it('rejects a repeated q that binds as an array', async () => {
    const errors = await validate(build({ q: ['a', 'b'] }))
    expect(errors.map((e) => e.property)).toContain('q')
  })

  // Query strings arrive as text. Without @Type(() => Number) the service compares '2' to a
  // number and paginates from NaN.
  it('coerces page and pageSize from their query-string form', async () => {
    const dto = build({ page: '3', pageSize: '50' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.page).toBe(3)
    expect(dto.pageSize).toBe(50)
  })

  it('rejects page zero', async () => {
    const errors = await validate(build({ page: '0' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  it('rejects a negative page', async () => {
    const errors = await validate(build({ page: '-1' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  it('rejects a non-numeric page', async () => {
    const errors = await validate(build({ page: 'dua' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  // The service caps pageSize as well, but rejecting it here tells the caller their request was
  // wrong instead of silently serving a different page size than they asked for.
  it('rejects a pageSize above the cap', async () => {
    const errors = await validate(build({ pageSize: '5000' }))
    expect(errors.map((e) => e.property)).toContain('pageSize')
  })

  it('accepts a pageSize exactly at the cap', async () => {
    expect(await validate(build({ pageSize: '100' }))).toHaveLength(0)
  })

  it.each(['crit', 'warn', 'ok', 'none'])('accepts severity %s', async (severity) => {
    expect(await validate(build({ severity }))).toHaveLength(0)
  })

  // An unrecognised severity would fall through every branch in the service and silently return
  // an unfiltered list, which looks like the filter is broken rather than the input.
  it('rejects an unknown severity', async () => {
    const errors = await validate(build({ severity: 'merah' }))
    expect(errors.map((e) => e.property)).toContain('severity')
  })

  it.each(['nopol', '-nopol', 'severity', 'tahun', '-tahun'])(
    'accepts sort %s',
    async (sort) => {
      expect(await validate(build({ sort }))).toHaveLength(0)
    },
  )

  it('rejects an unknown sort key', async () => {
    const errors = await validate(build({ sort: 'merk' }))
    expect(errors.map((e) => e.property)).toContain('sort')
  })

  it.each(['kepemilikanId', 'poolId', 'statusId'])(
    'rejects a %s that is not a UUID',
    async (field) => {
      const errors = await validate(build({ [field]: 'pool-cakung' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  // Checkboxes send 'true'/'false' as text; without coercion 'false' is truthy and the archived
  // rows appear in a list that asked to hide them.
  it('coerces includeArchived from its query-string form', async () => {
    const dto = build({ includeArchived: 'true' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.includeArchived).toBe(true)
  })

  it('coerces the string false to false', async () => {
    const dto = build({ includeArchived: 'false' })
    expect(dto.includeArchived).toBe(false)
  })
})
