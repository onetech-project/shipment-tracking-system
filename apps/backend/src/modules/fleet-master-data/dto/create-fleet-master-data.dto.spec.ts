import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateFleetMasterDataDto } from './create-fleet-master-data.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetMasterDataDto, {
    category: 'leasing',
    code: 'bca_finance',
    label: 'BCA Finance',
    ...overrides,
  })

describe('CreateFleetMasterDataDto', () => {
  it('accepts a well-formed row', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('rejects a category outside the known eight', async () => {
    const errors = await validate(build({ category: 'warna_favorit' }))
    expect(errors.map((e) => e.property)).toContain('category')
  })

  // The code is a slug the seed migration and future code paths look rows up by, so it is held
  // to a strict shape rather than accepting whatever an admin types.
  it('rejects a code with spaces or uppercase', async () => {
    expect(await validate(build({ code: 'BCA Finance' }))).not.toHaveLength(0)
  })

  it('accepts a code with underscores and digits', async () => {
    expect(await validate(build({ code: 'bca_finance_2' }))).toHaveLength(0)
  })

  // Added beyond the brief's seven: without this, swapping `code`'s @IsNotEmpty for @IsOptional
  // leaves every other test green — nothing else pins down that the slug is mandatory at all.
  it('rejects a row with no code', async () => {
    const errors = await validate(build({ code: undefined }))
    expect(errors.map((e) => e.property)).toContain('code')
  })

  it('rejects an empty label', async () => {
    expect(await validate(build({ label: '' }))).not.toHaveLength(0)
  })

  it('rejects a negative warnDays', async () => {
    expect(await validate(build({ warnDays: -1 }))).not.toHaveLength(0)
  })

  it('accepts warnDays of zero — same-day expiry warning is legitimate', async () => {
    expect(await validate(build({ warnDays: 0 }))).toHaveLength(0)
  })
})
