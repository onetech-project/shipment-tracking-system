import { act, renderHook } from '@testing-library/react'
import { FleetMasterRow } from '../../types'
import { useVehicleBerkas } from './useVehicleBerkas'

const slot = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 's1',
  category: 'jenis_berkas',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 10,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: true,
  ...over,
})

const DOC = slot({})
const PHOTO = slot({ id: 's-foto', code: 'foto_depan', label: 'Foto Depan', isRequired: false })

// A 6 MB fixture would mean allocating 6 MB in jsdom. Overriding the property is cheaper, and
// size is all the hook reads.
const fileOf = (name: string, type: string, size: number): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const setup = (upload: jest.Mock = jest.fn(async () => undefined)) => {
  const view = renderHook(() => useVehicleBerkas({ upload }))
  return { view, upload }
}

beforeEach(() => {
  // jsdom implements neither, and the hook calls both.
  global.URL.createObjectURL = jest.fn(() => 'blob:preview')
  global.URL.revokeObjectURL = jest.fn()
})

describe('pick', () => {
  it('refuses a pdf on a photo slot and keeps the slot empty', () => {
    const { view } = setup()
    let message: string | null = null
    act(() => {
      message = view.result.current.pick(PHOTO, fileOf('a.pdf', 'application/pdf', 1024))
    })
    expect(message).toMatch(/jpg, png, atau webp/i)
    expect(view.result.current.slotState('s-foto').status).toBe('idle')
  })

  it('accepts a pdf on a document slot', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    expect(view.result.current.slotState('s1').status).toBe('picked')
  })

  it('refuses a photo above 5 MB but allows the same size as a document', () => {
    const { view } = setup()
    let photoMessage: string | null = null
    act(() => {
      photoMessage = view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 6 * 1024 * 1024))
    })
    expect(photoMessage).toMatch(/5 MB/)

    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 6 * 1024 * 1024))
    })
    expect(view.result.current.slotState('s1').status).toBe('picked')
  })

  it('refuses anything above 10 MB even on a document slot', () => {
    const { view } = setup()
    let message: string | null = null
    act(() => {
      message = view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 11 * 1024 * 1024))
    })
    expect(message).toMatch(/10 MB/)
    expect(view.result.current.slotState('s1').status).toBe('idle')
  })

  it('makes a preview URL for a photo and none for a document', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    const photo = view.result.current.slotState('s-foto')
    const doc = view.result.current.slotState('s1')
    expect(photo.status === 'picked' && photo.previewUrl).toBe('blob:preview')
    expect(doc.status === 'picked' && doc.previewUrl).toBeNull()
  })

  // Five replacements must not leave four live blobs behind for the lifetime of the tab.
  it('revokes the old preview when a photo slot is picked again', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    act(() => {
      view.result.current.pick(PHOTO, fileOf('b.jpg', 'image/jpeg', 1024))
    })
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('revokes the preview when a slot is cleared', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    act(() => {
      view.result.current.clear('s-foto')
    })
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(view.result.current.slotState('s-foto').status).toBe('idle')
  })
})

describe('uploadAll', () => {
  it('uploads every picked slot and reports no failures', async () => {
    const { view, upload } = setup()
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })

    let failures: { slotLabel: string; message: string }[] = []
    await act(async () => {
      failures = await view.result.current.uploadAll('veh-1')
    })

    expect(failures).toEqual([])
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenCalledWith({
      vehicleId: 'veh-1',
      slotId: 's1',
      file: expect.any(File),
    })
  })

  // An operator who picked five files is better served by four uploads than by none.
  it('carries on after a failure and names the slot that failed', async () => {
    const upload = jest
      .fn()
      .mockRejectedValueOnce(new Error('koneksi terputus'))
      .mockResolvedValueOnce(undefined)
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })

    let failures: { slotLabel: string; message: string }[] = []
    await act(async () => {
      failures = await view.result.current.uploadAll('veh-1')
    })

    expect(upload).toHaveBeenCalledTimes(2)
    expect(failures).toEqual([{ slotLabel: 'STNK', message: 'koneksi terputus' }])
  })

  it('keeps the File on a failed slot so a retry needs no second pick', async () => {
    const upload = jest.fn().mockRejectedValue(new Error('gagal'))
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })

    const state = view.result.current.slotState('s1')
    expect(state.status).toBe('failed')
    expect(state.status === 'failed' && state.file.name).toBe('stnk.pdf')
  })

  it('empties a slot and revokes its preview once it has landed', async () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })

    expect(view.result.current.slotState('s-foto').status).toBe('idle')
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  // The retry path: only slots still holding a file are sent, so a second click after a partial
  // failure does not re-upload what already landed.
  it('sends only the slots still holding a file on a second run', async () => {
    const upload = jest.fn().mockRejectedValueOnce(new Error('gagal')).mockResolvedValue(undefined)
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })
    upload.mockClear()

    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith({
      vehicleId: 'veh-1',
      slotId: 's1',
      file: expect.any(File),
    })
  })

  it('counts pending slots for the caller', () => {
    const { view } = setup()
    expect(view.result.current.pendingCount).toBe(0)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    expect(view.result.current.pendingCount).toBe(1)
  })
})
