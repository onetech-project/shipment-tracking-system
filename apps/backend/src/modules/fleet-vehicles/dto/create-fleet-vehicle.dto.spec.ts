import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateFleetVehicleDto } from './create-fleet-vehicle.dto'

// Every field is filled by default so each test removes or corrupts exactly one. A helper that
// always fills everything would leave no test pinning any single field as required.
const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetVehicleDto, {
    nopol: 'B9114KYZ',
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
    lease: {
      leasingId: '3f2504e0-4f89-41d3-9a0c-0305e82c3401',
      nomorKontrak: 'MTF-2024-03-11872',
      cicilanPerBulan: 8750000,
      tenorBulan: 36,
      angsuranMulai: '2026-01-10',
    },
    ...overrides,
  })

describe('CreateFleetVehicleDto', () => {
  it('accepts a fully specified vehicle', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('rejects a vehicle with no plate', async () => {
    const errors = await validate(build({ nopol: undefined }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  it('rejects an empty plate', async () => {
    const errors = await validate(build({ nopol: '' }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  // The MaxLength guards mirror the columns (nopol VARCHAR(20), merk/tipe VARCHAR(60),
  // no_rangka/no_mesin/no_bpkb VARCHAR(60), pemilik_unit VARCHAR(120)). A widened
  // DTO limit passes validation and then fails as a 500 at insert time, so these over-length
  // cases are the only thing pinning the DTO to the schema.
  it('rejects a plate longer than the 20-char column', async () => {
    const errors = await validate(build({ nopol: 'B'.repeat(21) }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  it('rejects a merk longer than the 60-char column', async () => {
    const errors = await validate(build({ merk: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('merk')
  })

  it('rejects a tipe longer than the 60-char column', async () => {
    const errors = await validate(build({ tipe: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('tipe')
  })

  it('rejects a noRangka longer than the 60-char column', async () => {
    const errors = await validate(build({ noRangka: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noRangka')
  })

  it('rejects a noMesin longer than the 60-char column', async () => {
    const errors = await validate(build({ noMesin: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noMesin')
  })

  it('rejects a noBpkb longer than the 60-char column', async () => {
    const errors = await validate(build({ noBpkb: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noBpkb')
  })

  it('rejects a pemilikUnit longer than the 120-char column', async () => {
    const errors = await validate(build({ pemilikUnit: 'a'.repeat(121) }))
    expect(errors.map((e) => e.property)).toContain('pemilikUnit')
  })

  // NOTE: the column is VARCHAR(60) but the DTO caps at 40 — see the task report. This pins the
  // limit that is actually in force so widening or narrowing it cannot pass unnoticed.
  it('rejects a kapasitas longer than the DTO limit', async () => {
    const errors = await validate(build({ kapasitas: 'a'.repeat(41) }))
    expect(errors.map((e) => e.property)).toContain('kapasitas')
  })

  it('accepts a kapasitas exactly at the DTO limit', async () => {
    expect(await validate(build({ kapasitas: 'a'.repeat(40) }))).toHaveLength(0)
  })

  // A four-digit year is what the column holds and what every form offers. Free text here means
  // "2021 (bekas)" reaches the integer column and 500s.
  it('rejects a non-numeric tahun', async () => {
    const errors = await validate(build({ tahun: 'dua ribu' }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a tahun before 1900', async () => {
    const errors = await validate(build({ tahun: 1899 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a tahun beyond 2100', async () => {
    const errors = await validate(build({ tahun: 2101 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a fractional tahun', async () => {
    const errors = await validate(build({ tahun: 2021.5 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  // An odometer cannot run backwards; a negative reading is a typo, not a measurement.
  it('rejects a negative odometer', async () => {
    const errors = await validate(build({ odometer: -1 }))
    expect(errors.map((e) => e.property)).toContain('odometer')
  })

  it('accepts a zero odometer for a brand-new unit', async () => {
    expect(await validate(build({ odometer: 0 }))).toHaveLength(0)
  })

  // catatan is the one free-text field with no length cap, because its column is TEXT. That makes
  // @IsString the only guard: without it a JSON object validates and is handed to the text column.
  it('rejects a catatan that is not a string', async () => {
    const errors = await validate(build({ catatan: { x: 1 } }))
    expect(errors.map((e) => e.property)).toContain('catatan')
  })

  it('accepts a catatan far longer than any VARCHAR field, since the column is TEXT', async () => {
    expect(await validate(build({ catatan: 'a'.repeat(5000) }))).toHaveLength(0)
  })

  // Each of these is a FK to a UUID primary key. A non-UUID reaches Postgres as an invalid
  // input syntax error rather than a 400 naming the field.
  it.each(['jenisArmadaId', 'kepemilikanId', 'poolId', 'statusId', 'driverId'])(
    'rejects a %s that is not a UUID',
    async (field) => {
      const errors = await validate(build({ [field]: 'pool-cakung' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )
  // Requirement §1 and §3: the identity block plus the pool are what make a register row usable.
  // Enforced here rather than only in the form, so an API client cannot write the half-filled
  // rows the form refuses.
  it.each([
    'merk',
    'tipe',
    'jenisArmadaId',
    'tahun',
    'kapasitas',
    'noRangka',
    'noMesin',
    'noBpkb',
    'poolId',
  ])('rejects a vehicle missing %s', async (field) => {
    const errors = await validate(build({ [field]: undefined }))
    expect(errors.map((e) => e.property)).toContain(field)
  })

  it.each(['merk', 'tipe', 'kapasitas', 'noRangka', 'noMesin', 'noBpkb'])(
    'rejects an empty %s',
    async (field) => {
      const errors = await validate(build({ [field]: '   ' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  // Requirement §3 keeps these optional: a unit can be registered before a driver is assigned to
  // it, and the odometer is read at the next service.
  it.each(['driverId', 'statusId', 'odometer', 'catatan'])(
    'accepts a vehicle with no %s',
    async (field) => {
      expect(await validate(build({ [field]: undefined }))).toHaveLength(0)
    },
  )

  // The nested rules only run with both @ValidateNested and @Type. Without them the lease and
  // documents reach the service unvalidated and fail at insert time as a 500.
  it('validates the nested lease', async () => {
    const errors = await validate(build({ lease: { leasingId: 'not-a-uuid' } }))
    expect(errors.map((e) => e.property)).toContain('lease')
  })

  it('accepts a vehicle with no lease at all', async () => {
    expect(await validate(build({ lease: undefined }))).toHaveLength(0)
  })

  // The nested validator walks an array happily and reports nothing when its entries are valid,
  // so @IsObject is the only guard that refuses one. The entry here is deliberately a well-formed
  // contract: a malformed one would fail on its own and prove nothing about @IsObject.
  it('rejects a well-formed lease sent as an array', async () => {
    const errors = await validate(
      build({
        lease: [
          {
            leasingId: '3f2504e0-4f89-41d3-9a0c-0305e82c3401',
            nomorKontrak: 'MTF-2024-03-11872',
            cicilanPerBulan: 8750000,
            tenorBulan: 36,
            angsuranMulai: '2026-01-10',
          },
        ],
      }),
    )
    expect(errors.map((e) => e.property)).toContain('lease')
    expect(errors.find((e) => e.property === 'lease')?.constraints).toHaveProperty('isObject')
  })

  it('validates the nested documents', async () => {
    const errors = await validate(build({ documents: [{ docTypeId: 'not-a-uuid' }] }))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  // The bad entry sits at index 1 on purpose: ValidateNested without `each` still reports the
  // first element, so only a later one proves the rules run against every entry.
  it('validates every document, not just the first', async () => {
    const errors = await validate(
      build({
        documents: [
          { docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3501' },
          { docTypeId: 'not-a-uuid' },
        ],
      }),
    )
    expect(errors.map((e) => e.property)).toContain('documents')
    expect(errors.find((e) => e.property === 'documents')?.children?.map((c) => c.property)).toContain('1')
  })

  it('accepts a valid document list', async () => {
    const errors = await validate(
      build({
        documents: [
          {
            docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3501',
            nomor: 'STNK-1',
            issuedAt: '2026-01-10',
            expiresAt: '2031-01-10',
          },
        ],
      }),
    )
    expect(errors).toHaveLength(0)
  })
})
