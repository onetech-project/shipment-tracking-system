import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ReplaceFleetVehicleDocumentsDto } from './replace-fleet-vehicle-documents.dto'

const build = (documents: unknown) =>
  plainToInstance(ReplaceFleetVehicleDocumentsDto, { documents })

const doc = (overrides: Record<string, unknown> = {}) => ({
  docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  nomor: 'JKT-II/1234',
  issuedAt: '2026-03-10',
  expiresAt: '2027-03-09',
  ...overrides,
})

describe('ReplaceFleetVehicleDocumentsDto', () => {
  it('accepts a well-formed document set', async () => {
    expect(await validate(build([doc()]))).toHaveLength(0)
  })

  // An empty set is a legitimate submission: it retires every live document and leaves the
  // vehicle with none.
  it('accepts an empty set', async () => {
    expect(await validate(build([]))).toHaveLength(0)
  })

  it('rejects a payload with no documents key', async () => {
    const errors = await validate(plainToInstance(ReplaceFleetVehicleDocumentsDto, {}))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  it('rejects documents that is not an array', async () => {
    const errors = await validate(build(doc()))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  // Without @ValidateNested + @Type the array is accepted as-is and every rule below is skipped,
  // which is the classic silent hole in a nested DTO.
  it('rejects an entry with no docTypeId', async () => {
    const errors = await validate(build([doc({ docTypeId: undefined })]))
    expect(errors).toHaveLength(1)
    expect(errors[0].children?.[0].children?.map((c) => c.property)).toContain('docTypeId')
  })

  it('rejects an entry whose docTypeId is not a UUID', async () => {
    const errors = await validate(build([doc({ docTypeId: 'kir' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects an entry whose expiresAt is not a date', async () => {
    const errors = await validate(build([doc({ expiresAt: 'besok' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects an entry whose issuedAt is not a date', async () => {
    const errors = await validate(build([doc({ issuedAt: 'kemarin' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects a nomor longer than the 80-char column', async () => {
    const errors = await validate(build([doc({ nomor: 'a'.repeat(81) })]))
    expect(errors).toHaveLength(1)
  })

  // A document whose number is not to hand yet still needs its expiry recorded — that expiry is
  // the whole point of the register.
  it('accepts an entry carrying only a doc type and an expiry', async () => {
    const errors = await validate(
      build([{ docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', expiresAt: '2027-03-09' }]),
    )
    expect(errors).toHaveLength(0)
  })

  it('accepts an entry with no dates at all', async () => {
    const errors = await validate(
      build([{ docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }]),
    )
    expect(errors).toHaveLength(0)
  })
})
