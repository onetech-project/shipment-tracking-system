import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ConfirmUploadDto } from './confirm-upload.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ConfirmUploadDto, {
    storageKey: 'fleet/11111111-1111-1111-1111-111111111111/stnk/abc.pdf',
    originalName: 'stnk-b9114kyz.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 524288,
    ...overrides,
  })

describe('ConfirmUploadDto', () => {
  it('accepts a well-formed confirmation', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('demands a storage key', async () => {
    const errors = await validate(build({ storageKey: '' }))
    expect(errors.map((e) => e.property)).toContain('storageKey')
  })

  it('holds the mime type to the same allow-list as the intent', async () => {
    const errors = await validate(build({ mimeType: 'text/html' }))
    expect(errors.map((e) => e.property)).toContain('mimeType')
  })
})
