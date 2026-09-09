import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateFleetDriverDto } from './create-fleet-driver.dto'

// Every field is supplied by default, so each test below removes or corrupts exactly one. A
// helper that always fills everything in would leave no test pinning any field as required.
const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetDriverDto, {
    nama: 'Budi Santoso',
    telepon: '08123456789',
    simNomor: 'B1234567',
    simJenisId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    simExpiresAt: '2027-01-31',
    ...overrides,
  })

describe('CreateFleetDriverDto', () => {
  it('accepts a well-formed driver', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // The service only requires a name; everything else is genuinely optional and the API must not
  // demand licence data for a driver who has not handed theirs in yet.
  it('accepts a driver with only a name', async () => {
    const dto = plainToInstance(CreateFleetDriverDto, { nama: 'Budi' })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('rejects a driver with no name', async () => {
    const errors = await validate(build({ nama: undefined }))
    expect(errors.map((e) => e.property)).toContain('nama')
  })

  it('rejects an empty name', async () => {
    const errors = await validate(build({ nama: '' }))
    expect(errors.map((e) => e.property)).toContain('nama')
  })

  // The MaxLength guards mirror the database columns (nama VARCHAR(120), telepon VARCHAR(30),
  // sim_nomor VARCHAR(40)). A widened DTO limit passes validation and then fails as a 500 at
  // insert time, so these over-length rows are the only thing pinning the DTO to the schema.
  it('rejects a name longer than the 120-char column', async () => {
    const errors = await validate(build({ nama: 'a'.repeat(121) }))
    expect(errors.map((e) => e.property)).toContain('nama')
  })

  it('rejects a telepon longer than the 30-char column', async () => {
    const errors = await validate(build({ telepon: '0'.repeat(31) }))
    expect(errors.map((e) => e.property)).toContain('telepon')
  })

  it('rejects a simNomor longer than the 40-char column', async () => {
    const errors = await validate(build({ simNomor: 'a'.repeat(41) }))
    expect(errors.map((e) => e.property)).toContain('simNomor')
  })

  // simJenisId is a FK to fleet_master_data.id. A non-UUID reaches Postgres as an invalid input
  // syntax error rather than a 400 naming the field.
  it('rejects a simJenisId that is not a UUID', async () => {
    const errors = await validate(build({ simJenisId: 'pool-cakung' }))
    expect(errors.map((e) => e.property)).toContain('simJenisId')
  })

  it('rejects a simExpiresAt that is not a date', async () => {
    const errors = await validate(build({ simExpiresAt: 'besok' }))
    expect(errors.map((e) => e.property)).toContain('simExpiresAt')
  })

  it('accepts a calendar-date simExpiresAt', async () => {
    expect(await validate(build({ simExpiresAt: '2027-12-31' }))).toHaveLength(0)
  })
})
