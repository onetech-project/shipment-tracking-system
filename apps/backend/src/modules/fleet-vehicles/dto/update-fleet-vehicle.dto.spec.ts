import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateFleetVehicleDto } from './update-fleet-vehicle.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(UpdateFleetVehicleDto, { ...overrides })

describe('UpdateFleetVehicleDto', () => {
  // PartialType relaxes every rule to optional, so an empty patch is a legitimate no-op.
  it('accepts an empty patch', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // The pipe's own options, because whitelist/forbidNonWhitelisted is what turns "this class
  // declares no properties" into a 400 on every PATCH. Without this case an emptied DTO would
  // still look green: validate() with no options ignores unknown keys entirely.
  it('accepts a patch of every inherited field under the pipe options', async () => {
    const errors = await validate(
      build({
        nopol: 'B 9114 KYZ',
        merk: 'Mitsubishi',
        tipe: 'Canter',
        tahun: 2021,
        kapasitas: '8 ton',
        noRangka: 'MHMFE74P5MK000111',
        noMesin: '4D34T-000111',
        noBpkb: 'M-01234567',
        pemilikUnit: 'PT Sumber Jaya',
        odometer: 120000,
        catatan: 'Servis rutin tiap 10.000 km',
        jenisArmadaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        kepemilikanId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
        poolId: '3f2504e0-4f89-41d3-9a0c-0305e82c3303',
        statusId: '3f2504e0-4f89-41d3-9a0c-0305e82c3304',
        driverId: '3f2504e0-4f89-41d3-9a0c-0305e82c3305',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    )
    expect(errors).toHaveLength(0)
  })

  it('accepts a single-field patch', async () => {
    expect(await validate(build({ odometer: 130500 }))).toHaveLength(0)
  })

  // The rules are inherited, not merely the property names: each of these is the same guard the
  // create DTO applies, and a PartialType that dropped the decorators would let them all through.
  it('rejects a plate longer than the 20-char column', async () => {
    const errors = await validate(build({ nopol: 'B'.repeat(21) }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  // nopol is @IsNotEmpty on create; PartialType keeps that rule, so a present-but-blank plate is
  // still refused while an absent one is fine.
  it('rejects a blanked plate while allowing an absent one', async () => {
    const errors = await validate(build({ nopol: '' }))
    expect(errors.map((e) => e.property)).toContain('nopol')
    expect(await validate(build({ merk: 'Hino' }))).toHaveLength(0)
  })

  it.each([
    ['merk', 'a'.repeat(61)],
    ['tipe', 'a'.repeat(61)],
    ['noRangka', 'a'.repeat(61)],
    ['noMesin', 'a'.repeat(61)],
    ['noBpkb', 'a'.repeat(61)],
    ['pemilikUnit', 'a'.repeat(121)],
    ['kapasitas', 'a'.repeat(41)],
  ])('rejects an over-length %s', async (field, value) => {
    const errors = await validate(build({ [field]: value }))
    expect(errors.map((e) => e.property)).toContain(field)
  })

  it('rejects a non-string catatan', async () => {
    const errors = await validate(build({ catatan: { x: 1 } }))
    expect(errors.map((e) => e.property)).toContain('catatan')
  })

  it.each([1899, 2101, 2021.5, 'dua ribu'])('rejects a tahun of %p', async (tahun) => {
    const errors = await validate(build({ tahun }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a negative odometer', async () => {
    const errors = await validate(build({ odometer: -1 }))
    expect(errors.map((e) => e.property)).toContain('odometer')
  })

  it.each(['jenisArmadaId', 'kepemilikanId', 'poolId', 'statusId', 'driverId'])(
    'rejects a %s that is not a UUID',
    async (field) => {
      const errors = await validate(build({ [field]: 'pool-cakung' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  // isActive is deliberately not a property of this class: archiving goes through
  // POST :id/archive and :id/restore so the partial unique index on the plate is checked before
  // the flag flips. forbidNonWhitelisted is what turns a blind patch of it into a 400, and
  // nothing else in the suite would notice the field being added back.
  it('rejects isActive as a non-whitelisted property', async () => {
    const errors = await validate(build({ isActive: false }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    expect(errors.map((e) => e.property)).toEqual(['isActive'])
    expect(errors[0].constraints).toHaveProperty('whitelistValidation')
  })

  // The other half of the same guard: with whitelist alone the pipe strips isActive instead of
  // erroring, so the patch reaching the service never carries it either way.
  it('strips isActive from the patch the service receives', async () => {
    const dto = build({ isActive: false, merk: 'Hino' })
    await validate(dto, { whitelist: true })
    expect({ ...dto }).toEqual({ merk: 'Hino' })
  })
})
