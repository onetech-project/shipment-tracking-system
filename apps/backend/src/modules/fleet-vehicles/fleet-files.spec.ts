import { buildDriverSimKey, buildVehicleFileKey, isSafeExternalUrl } from './fleet-files'

describe('buildVehicleFileKey', () => {
  it('lays the key out by vehicle and slot', () => {
    const key = buildVehicleFileKey('11111111-1111-1111-1111-111111111111', 'stnk', 'image/png')
    expect(key).toMatch(
      /^fleet\/11111111-1111-1111-1111-111111111111\/stnk\/[0-9a-f-]{36}\.png$/,
    )
  })

  // The extension comes from the verified MIME type, never from the submitted filename.
  it('names the extension after the mime type', () => {
    expect(buildVehicleFileKey('v', 'bpkb', 'application/pdf')).toMatch(/\.pdf$/)
    expect(buildVehicleFileKey('v', 'bpkb', 'image/jpeg')).toMatch(/\.jpg$/)
  })

  it('refuses a mime type outside the allow-list', () => {
    expect(() => buildVehicleFileKey('v', 'stnk', 'image/svg+xml')).toThrow(/mime/i)
  })

  // Two uploads into the same slot must not collide, because the old object is deleted only after
  // the row has been repointed — reusing the key would delete the file that just replaced it.
  it('gives every upload its own key', () => {
    const a = buildVehicleFileKey('v', 'stnk', 'image/png')
    const b = buildVehicleFileKey('v', 'stnk', 'image/png')
    expect(a).not.toBe(b)
  })

  // A slot code reaches the key, and master data lets an admin type one. Anything that could
  // climb out of the prefix is refused rather than sanitised, so a surprising code is a visible
  // error instead of a silently rewritten path.
  it('refuses a slot code that is not a plain identifier', () => {
    expect(() => buildVehicleFileKey('v', '../../etc', 'image/png')).toThrow(/slot/i)
    expect(() => buildVehicleFileKey('v', 'a/b', 'image/png')).toThrow(/slot/i)
    expect(() => buildVehicleFileKey('v', '', 'image/png')).toThrow(/slot/i)
  })
})

describe('buildDriverSimKey', () => {
  it('lays the key out under the driver', () => {
    const key = buildDriverSimKey('22222222-2222-2222-2222-222222222222', 'application/pdf')
    expect(key).toMatch(
      /^fleet\/drivers\/22222222-2222-2222-2222-222222222222\/sim\/[0-9a-f-]{36}\.pdf$/,
    )
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('https://arsip.example/stnk.pdf')).toBe(true)
    expect(isSafeExternalUrl('http://arsip.example/stnk.pdf')).toBe(true)
  })

  // The prototype rendered f.url into an anchor with no scheme check (line 802), so a stored
  // javascript: URL executed on click. This is the check that closes it.
  it('refuses every other scheme', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('refuses something that is not a URL at all', () => {
    expect(isSafeExternalUrl('arsip.example/stnk.pdf')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
  })
})
