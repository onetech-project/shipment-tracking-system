import { apiErrorMessage, uploadErrorMessage } from './api-error'

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
    // Nothing validates the `message?: string` cast the helper makes, so a non-string value can
    // reach it whatever its origin; it has to fall back rather than hand a non-string to JSX.
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

describe('uploadErrorMessage', () => {
  it('prefers the backend message on an axios-shaped rejection', () => {
    const err = {
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: { data: { message: 'Slot Foto Depan hanya menerima foto (jpg, png, atau webp).' } },
    }
    expect(uploadErrorMessage(err, 'fallback')).toBe(
      'Slot Foto Depan hanya menerima foto (jpg, png, atau webp).',
    )
  })

  // The PUT to object storage is a bare fetch, so useFleetVehicleFiles raises this itself. It is
  // the one upload error whose own message is meant for an operator.
  it('keeps the message of a plain Error, which no axios call produced', () => {
    expect(uploadErrorMessage(new Error('Gagal mengunggah berkas (403)'), 'fallback')).toBe(
      'Gagal mengunggah berkas (403)',
    )
  })

  it('falls back for an axios error that never reached the server', () => {
    // No response means the request died in transport; "Network Error" is not worth showing.
    expect(
      uploadErrorMessage({ isAxiosError: true, message: 'Network Error' }, 'fallback'),
    ).toBe('fallback')
  })

  it('falls back when the backend answered without a usable message', () => {
    const err = { isAxiosError: true, message: 'Request failed', response: { data: {} } }
    expect(uploadErrorMessage(err, 'fallback')).toBe('fallback')
  })

  it('falls back for a non-Error rejection', () => {
    expect(uploadErrorMessage('boom', 'fallback')).toBe('fallback')
    expect(uploadErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
