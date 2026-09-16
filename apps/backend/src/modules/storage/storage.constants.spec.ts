import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, extensionFor } from './storage.constants'

describe('storage constants', () => {
  it('accepts exactly the four types the spec names', () => {
    expect([...ALLOWED_MIME_TYPES].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
  })

  it('caps an upload at 10 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })

  it('derives the extension from the mime type', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('application/pdf')).toBe('pdf')
  })

  // The extension is derived rather than taken from the submitted filename, so a file called
  // "photo.jpg.exe" cannot dictate what lands in the bucket.
  it('refuses a type it does not know', () => {
    expect(extensionFor('application/x-msdownload')).toBeNull()
    expect(extensionFor('image/svg+xml')).toBeNull()
  })
})
