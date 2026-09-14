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

  // The two MaxLength guards mirror the database columns (code VARCHAR(60), label VARCHAR(120)).
  // A widened DTO limit would pass validation and then blow up as a 500 at insert time, so these
  // over-length rows are the only thing pinning the DTO to the schema. The code case stays a valid
  // slug so it can only fail on maxLength, never on the @Matches shape rule.
  it('rejects a code longer than the 60-char column', async () => {
    const errors = await validate(build({ code: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('code')
  })

  it('rejects a label longer than the 120-char column', async () => {
    const errors = await validate(build({ label: 'a'.repeat(121) }))
    expect(errors.map((e) => e.property)).toContain('label')
  })

  // Fractional days are meaningless for a day-count field and would silently truncate downstream.
  it('rejects a fractional warnDays', async () => {
    const errors = await validate(build({ warnDays: 1.5 }))
    expect(errors.map((e) => e.property)).toContain('warnDays')
  })

  // Without the 365 cap a typo would make every document of this type permanently amber.
  it('rejects a warnDays above the 365 cap', async () => {
    const errors = await validate(build({ warnDays: 99999 }))
    expect(errors.map((e) => e.property)).toContain('warnDays')
  })

  // Unlike warnDays, zero is not meaningful here: a document valid for no months cannot exist.
  it('rejects a defaultValidMonths of zero', async () => {
    const errors = await validate(build({ defaultValidMonths: 0 }))
    expect(errors.map((e) => e.property)).toContain('defaultValidMonths')
  })

  it('rejects a defaultValidMonths above the 120 cap', async () => {
    const errors = await validate(build({ defaultValidMonths: 9999 }))
    expect(errors.map((e) => e.property)).toContain('defaultValidMonths')
  })

  // The build() helper always supplies every field, so nothing else notices if the required
  // markers on category and label are dropped — same hole the code test above was added to close.
  it('rejects a row with no category', async () => {
    const errors = await validate(build({ category: undefined }))
    expect(errors.map((e) => e.property)).toContain('category')
  })

  it('rejects a row with no label', async () => {
    const errors = await validate(build({ label: undefined }))
    expect(errors.map((e) => e.property)).toContain('label')
  })
})
