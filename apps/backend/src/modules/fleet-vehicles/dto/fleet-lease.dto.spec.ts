import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { FleetLeaseDto } from './fleet-lease.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(FleetLeaseDto, {
    leasingId: '3f2504e0-4f89-41d3-9a0c-0305e82c3401',
    nomorKontrak: 'MTF-2024-03-11872',
    cicilanPerBulan: 8750000,
    tenorBulan: 36,
    angsuranMulai: '2026-01-10',
    angsuranTerbayar: 4,
    ...overrides,
  })

describe('FleetLeaseDto', () => {
  it('accepts a fully specified contract', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // Requirement §2: every lease field is mandatory except the paid count, which the backend
  // derives when it is left blank.
  it.each(['leasingId', 'nomorKontrak', 'cicilanPerBulan', 'tenorBulan', 'angsuranMulai'])(
    'rejects a contract missing %s',
    async (field) => {
      const errors = await validate(build({ [field]: undefined }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  it('accepts a contract with no angsuranTerbayar', async () => {
    expect(await validate(build({ angsuranTerbayar: undefined }))).toHaveLength(0)
  })

  it('rejects a leasingId that is not a UUID', async () => {
    const errors = await validate(build({ leasingId: 'mtf' }))
    expect(errors.map((e) => e.property)).toContain('leasingId')
  })

  it('rejects a nomorKontrak longer than the 60-char column', async () => {
    const errors = await validate(build({ nomorKontrak: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('nomorKontrak')
  })

  // Requirement §2 spells out "bilangan bulat tanpa pemisah ribuan". A negative instalment is a
  // typo, and money owed is never negative.
  it('rejects a negative cicilanPerBulan', async () => {
    const errors = await validate(build({ cicilanPerBulan: -1 }))
    expect(errors.map((e) => e.property)).toContain('cicilanPerBulan')
  })

  it('rejects a non-numeric cicilanPerBulan', async () => {
    const errors = await validate(build({ cicilanPerBulan: 'delapan juta' }))
    expect(errors.map((e) => e.property)).toContain('cicilanPerBulan')
  })

  // A zero tenor would make sisaAngsuran zero for a contract that plainly has instalments left,
  // so the floor is 1 rather than 0.
  it('rejects a tenor of zero', async () => {
    const errors = await validate(build({ tenorBulan: 0 }))
    expect(errors.map((e) => e.property)).toContain('tenorBulan')
  })

  it('rejects a fractional tenor', async () => {
    const errors = await validate(build({ tenorBulan: 12.5 }))
    expect(errors.map((e) => e.property)).toContain('tenorBulan')
  })

  it('rejects an angsuranMulai that is not a date', async () => {
    const errors = await validate(build({ angsuranMulai: '10 Januari' }))
    expect(errors.map((e) => e.property)).toContain('angsuranMulai')
  })

  it('rejects a negative angsuranTerbayar', async () => {
    const errors = await validate(build({ angsuranTerbayar: -1 }))
    expect(errors.map((e) => e.property)).toContain('angsuranTerbayar')
  })

  it('accepts an angsuranTerbayar of zero', async () => {
    expect(await validate(build({ angsuranTerbayar: 0 }))).toHaveLength(0)
  })

  // A count of instalments, so it is whole or it is a typo. Without this case @IsInt could be
  // relaxed to @IsNumber and every other test here would still pass.
  it('rejects a fractional angsuranTerbayar', async () => {
    const errors = await validate(build({ angsuranTerbayar: 4.5 }))
    expect(errors.map((e) => e.property)).toContain('angsuranTerbayar')
  })
})
