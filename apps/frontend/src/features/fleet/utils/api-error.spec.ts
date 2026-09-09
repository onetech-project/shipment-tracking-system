import { apiErrorMessage } from './api-error'

describe('apiErrorMessage', () => {
  it('returns the backend message from an axios-shaped error', () => {
    const err = { response: { data: { message: 'Nama sopir sudah terdaftar.' } } }
    expect(apiErrorMessage(err, 'fallback')).toBe('Nama sopir sudah terdaftar.')
  })

  it('falls back for a plain Error, whose own message is not the backend message', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toBe('fallback')
  })

  it('falls back for null', () => {
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('falls back for undefined', () => {
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('falls back when response.data.message is present but not a string', () => {
    // Nest returns an array of messages for a class-validator failure; rendering it as text
    // would print a comma-joined blob, so it is treated as absent.
    const err = { response: { data: { message: ['nama should not be empty'] } } }
    expect(apiErrorMessage(err, 'fallback')).toBe('fallback')
  })

  it('falls back when response.data.message is an empty string', () => {
    expect(apiErrorMessage({ response: { data: { message: '' } } }, 'fallback')).toBe('fallback')
  })

  it('falls back when the error has a response but no data', () => {
    expect(apiErrorMessage({ response: {} }, 'fallback')).toBe('fallback')
  })

  it('returns the given fallback verbatim rather than a hardcoded one', () => {
    expect(apiErrorMessage(null, 'Gagal menghapus sopir.')).toBe('Gagal menghapus sopir.')
  })
})
