import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UploadIntentDto } from './upload-intent.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(UploadIntentDto, {
    filename: 'stnk-b9114kyz.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 524288,
    ...overrides,
  })

describe('UploadIntentDto', () => {
  it('accepts a well-formed intent', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('refuses a mime type outside the allow-list', async () => {
    const errors = await validate(build({ mimeType: 'image/svg+xml' }))
    expect(errors.map((e) => e.property)).toContain('mimeType')
  })

  // 10 MB is the ceiling (spec §4.2). Refused here rather than after the browser has spent five
  // minutes uploading.
  it('refuses a file over the size limit', async () => {
    const errors = await validate(build({ sizeBytes: 10 * 1024 * 1024 + 1 }))
    expect(errors.map((e) => e.property)).toContain('sizeBytes')
  })

  it('refuses a zero-byte file', async () => {
    const errors = await validate(build({ sizeBytes: 0 }))
    expect(errors.map((e) => e.property)).toContain('sizeBytes')
  })

  it('demands a filename', async () => {
    const errors = await validate(build({ filename: '   ' }))
    expect(errors.map((e) => e.property)).toContain('filename')
  })
})
