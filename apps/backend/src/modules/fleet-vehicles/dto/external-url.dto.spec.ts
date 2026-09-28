import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ExternalUrlDto } from './external-url.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ExternalUrlDto, { url: 'https://arsip.example/stnk.pdf', ...overrides })

describe('ExternalUrlDto', () => {
  it('accepts an https link', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('accepts an http link', async () => {
    expect(await validate(build({ url: 'http://arsip.example/stnk.pdf' }))).toHaveLength(0)
  })

  // The prototype put f.url into an anchor with no scheme check, which made this a working XSS
  // payload (spec §4.3). It is refused at the DTO so it can never reach a row.
  it('refuses a javascript: URL', async () => {
    const errors = await validate(build({ url: 'javascript:alert(1)' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })

  it('refuses a data: URL', async () => {
    const errors = await validate(build({ url: 'data:text/html,<script>alert(1)</script>' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })

  it('refuses something that is not a URL', async () => {
    const errors = await validate(build({ url: 'arsip.example/stnk.pdf' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })
})
