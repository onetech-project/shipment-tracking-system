import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DownloadUrlQueryDto } from './download-url-query.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(DownloadUrlQueryDto, { ...overrides })

describe('DownloadUrlQueryDto', () => {
  // No query at all is the existing download behaviour, which must keep working untouched.
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it.each(['inline', 'attachment'])('accepts %s', async (disposition) => {
    expect(await validate(build({ disposition }))).toHaveLength(0)
  })

  // This value is interpolated into a header that gets signed. A free-form string here would let
  // a client write its own Content-Disposition into a URL our credentials vouch for.
  it('refuses a disposition outside the list', async () => {
    const errors = await validate(build({ disposition: 'attachment; filename="x.html"' }))
    expect(errors.map((e) => e.property)).toContain('disposition')
  })

  it('refuses a disposition that is not a string', async () => {
    const errors = await validate(build({ disposition: 1 }))
    expect(errors.map((e) => e.property)).toContain('disposition')
  })
})
