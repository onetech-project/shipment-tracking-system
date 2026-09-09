import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateFleetDriverDto } from './update-fleet-driver.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(UpdateFleetDriverDto, { ...overrides })

describe('UpdateFleetDriverDto', () => {
  // Unlike the create DTO every field is optional here, so an empty patch is legitimate — the
  // service treats an absent field as "leave this column alone".
  it('accepts an empty patch', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // nama stays optional but must not be blanked: the column is NOT NULL and a driver with an
  // empty name is unusable in every dropdown that lists them.
  it('rejects an empty name when the field is present', async () => {
    const errors = await validate(build({ nama: '' }))
    expect(errors.map((e) => e.property)).toContain('nama')
  })

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

  it('rejects a simJenisId that is not a UUID', async () => {
    const errors = await validate(build({ simJenisId: 'pool-cakung' }))
    expect(errors.map((e) => e.property)).toContain('simJenisId')
  })

  it('rejects a simExpiresAt that is not a date', async () => {
    const errors = await validate(build({ simExpiresAt: 'besok' }))
    expect(errors.map((e) => e.property)).toContain('simExpiresAt')
  })

  it('rejects a non-boolean isActive', async () => {
    const errors = await validate(build({ isActive: 'ya' }))
    expect(errors.map((e) => e.property)).toContain('isActive')
  })

  it('accepts deactivating a driver', async () => {
    expect(await validate(build({ isActive: false }))).toHaveLength(0)
  })
})
