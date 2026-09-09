/**
 * The update DTO's job is as much what it omits as what it validates: `category` and `code` are the
 * row's identity, and main.ts runs ValidationPipe with forbidNonWhitelisted, so their absence from
 * this class is what turns an attempt to move a row between categories into a 400 naming the
 * property. That absence is asserted here, since nothing else in the suite would notice one being
 * added back.
 *
 * Every other field is optional — an absent field means "leave this column alone" — so the length
 * and range guards mirroring the database columns are the only thing standing between a widened
 * limit and a 500 at insert time.
 */
import { plainToInstance } from 'class-transformer'
import { validate, validateOrReject } from 'class-validator'
import { UpdateFleetMasterDataDto } from './update-fleet-master-data.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(UpdateFleetMasterDataDto, { ...overrides })

describe('UpdateFleetMasterDataDto', () => {
  // The service treats an empty patch as a no-op that re-reads the row, so it must validate.
  it('accepts an empty patch', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('accepts a patch of every updatable field at once', async () => {
    expect(
      await validate(
        build({
          label: 'MTF',
          sortOrder: 3,
          isActive: false,
          warnDays: 30,
          defaultValidMonths: 12,
          isRequired: true,
        }),
      ),
    ).toHaveLength(0)
  })

  // category and code are deliberately not properties of this class, and that omission is load
  // bearing: main.ts runs ValidationPipe with forbidNonWhitelisted, which is what turns an attempt
  // to move a row between categories into a 400 naming the property rather than a silent no-op.
  // Driven through validate() with the pipe's own options, because plainToInstance alone copies
  // unknown keys straight onto the instance — it is the validator, not the transformer, that
  // rejects them, so asserting on the bare instance would prove nothing.
  it('rejects category and code as non-whitelisted properties', async () => {
    const errors = await validate(build({ category: 'pool', code: 'mtf', label: 'MTF' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    expect(errors.map((e) => e.property).sort()).toEqual(['category', 'code'])
    expect(errors.every((e) => 'whitelistValidation' in (e.constraints ?? {}))).toBe(true)
  })

  // The other half of the same guard: with whitelist alone the pipe strips the identity columns
  // instead of erroring, so the patch that reaches the service carries neither. Either way the row
  // cannot be moved between categories.
  it('strips category and code from the patch the service receives', async () => {
    const dto = build({ category: 'pool', code: 'mtf', label: 'MTF' })
    await validate(dto, { whitelist: true })
    expect({ ...dto }).toEqual({ label: 'MTF' })
  })

  // label is optional but must not be blanked: the column is NOT NULL and a blank label is an
  // unselectable dropdown entry.
  it('rejects an empty label when the field is present', async () => {
    const errors = await validate(build({ label: '' }))
    expect(errors.map((e) => e.property)).toContain('label')
  })

  it('rejects a label longer than the 120-char column', async () => {
    const errors = await validate(build({ label: 'a'.repeat(121) }))
    expect(errors.map((e) => e.property)).toContain('label')
  })

  it('accepts a label at exactly the 120-char column limit', async () => {
    expect(await validate(build({ label: 'a'.repeat(120) }))).toHaveLength(0)
  })

  it('rejects a negative sortOrder', async () => {
    const errors = await validate(build({ sortOrder: -1 }))
    expect(errors.map((e) => e.property)).toContain('sortOrder')
  })

  it('rejects a fractional sortOrder', async () => {
    const errors = await validate(build({ sortOrder: 1.5 }))
    expect(errors.map((e) => e.property)).toContain('sortOrder')
  })

  it('rejects a non-boolean isActive', async () => {
    const errors = await validate(build({ isActive: 'ya' }))
    expect(errors.map((e) => e.property)).toContain('isActive')
  })

  // Deactivating is the spec's alternative to deletion and the thing a refused delete points at,
  // so it must always validate.
  it('accepts deactivating a row', async () => {
    await expect(validateOrReject(build({ isActive: false }))).resolves.toBeUndefined()
  })

  // 0 means "warn on the expiry date itself" — a real threshold, not an absent one.
  it('accepts a warnDays of zero', async () => {
    expect(await validate(build({ warnDays: 0 }))).toHaveLength(0)
  })

  it('rejects a negative warnDays', async () => {
    const errors = await validate(build({ warnDays: -1 }))
    expect(errors.map((e) => e.property)).toContain('warnDays')
  })

  // Without the 365 cap a typo would make every document of this type permanently amber.
  it('rejects a warnDays above the 365 cap', async () => {
    const errors = await validate(build({ warnDays: 366 }))
    expect(errors.map((e) => e.property)).toContain('warnDays')
  })

  it('accepts a warnDays at exactly the 365 cap', async () => {
    expect(await validate(build({ warnDays: 365 }))).toHaveLength(0)
  })

  // Unlike warnDays, zero is not meaningful here: a document valid for no months cannot exist.
  it('rejects a defaultValidMonths of zero', async () => {
    const errors = await validate(build({ defaultValidMonths: 0 }))
    expect(errors.map((e) => e.property)).toContain('defaultValidMonths')
  })

  it('rejects a defaultValidMonths above the 120 cap', async () => {
    const errors = await validate(build({ defaultValidMonths: 121 }))
    expect(errors.map((e) => e.property)).toContain('defaultValidMonths')
  })

  it('accepts a defaultValidMonths at exactly the 120 cap', async () => {
    expect(await validate(build({ defaultValidMonths: 120 }))).toHaveLength(0)
  })

  it('rejects a non-boolean isRequired', async () => {
    const errors = await validate(build({ isRequired: 'wajib' }))
    expect(errors.map((e) => e.property)).toContain('isRequired')
  })
})
