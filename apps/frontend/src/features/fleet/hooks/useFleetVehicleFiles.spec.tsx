import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import {
  useDeleteVehicleFile,
  useSetExternalUrl,
  useUploadVehicleFile,
  useVehicleFiles,
} from './useFleetVehicleFiles'

jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

const mocked = apiClient as unknown as Record<string, jest.Mock>

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const wireFile = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  slotId: 's1',
  slotCode: 'stnk',
  slotLabel: 'STNK',
  originalName: 'stnk.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 524288,
  externalUrl: null,
  uploadedAt: '2026-09-01T00:00:00Z',
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mocked.get.mockResolvedValue({ data: [wireFile()] })
  global.fetch = jest.fn()
})

describe('useVehicleFiles', () => {
  it('reads a vehicle files', async () => {
    const { result } = renderHook(() => useVehicleFiles('v1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles/v1/files')
    expect(result.current.data?.[0].slotCode).toBe('stnk')
  })

  it('does not fire without a vehicle id', () => {
    renderHook(() => useVehicleFiles(undefined), { wrapper })
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it('defaults a field the backend did not send', async () => {
    mocked.get.mockResolvedValue({ data: [{ id: 'f1', slotId: 's1' }] })
    const { result } = renderHook(() => useVehicleFiles('v1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].sizeBytes).toBeNull()
    expect(result.current.data?.[0].slotLabel).toBe('')
    // null rather than '': a slot card branches on externalUrl to decide whether it holds a link
    // or an uploaded file, and an empty string is falsy in a way that reads the same as absent
    // right up until someone renders it as an href.
    expect(result.current.data?.[0].externalUrl).toBeNull()
    expect(result.current.data?.[0].originalName).toBeNull()
    expect(result.current.data?.[0].mimeType).toBeNull()
    expect(result.current.data?.[0].uploadedAt).toBe('')
  })
})

describe('useUploadVehicleFile', () => {
  const file = new File(['contents'], 'stnk.pdf', { type: 'application/pdf' })

  // The order is the contract: a confirm sent before the PUT completes records a file that is
  // not in the bucket, which is exactly what the backend HEAD refuses.
  it('runs intent, then PUT, then confirm, in that order', async () => {
    const order: string[] = []
    mocked.post.mockImplementation((url: string) => {
      if (url.includes('upload-intent')) {
        order.push('intent')
        return Promise.resolve({ data: { uploadUrl: 'https://signed/put', storageKey: 'k' } })
      }
      order.push('confirm')
      return Promise.resolve({ data: {} })
    })
    ;(global.fetch as jest.Mock).mockImplementation(() => {
      order.push('put')
      return Promise.resolve({ ok: true })
    })

    const { result } = renderHook(() => useUploadVehicleFile(), { wrapper })
    await result.current.mutateAsync({ vehicleId: 'v1', slotId: 's1', file })

    expect(order).toEqual(['intent', 'put', 'confirm'])
    expect(mocked.post).toHaveBeenNthCalledWith(
      1,
      '/fleet/vehicles/v1/files/s1/upload-intent',
      { filename: 'stnk.pdf', mimeType: 'application/pdf', sizeBytes: file.size },
    )
    expect(global.fetch).toHaveBeenCalledWith(
      'https://signed/put',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(mocked.post).toHaveBeenNthCalledWith(
      2,
      '/fleet/vehicles/v1/files/s1/confirm',
      { storageKey: 'k', originalName: 'stnk.pdf', mimeType: 'application/pdf', sizeBytes: file.size },
    )
  })

  it('sends the PUT with the file body and its content type', async () => {
    mocked.post.mockResolvedValueOnce({ data: { uploadUrl: 'https://signed/put', storageKey: 'k' } })
    mocked.post.mockResolvedValueOnce({ data: {} })
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useUploadVehicleFile(), { wrapper })
    await result.current.mutateAsync({ vehicleId: 'v1', slotId: 's1', file })

    expect(global.fetch).toHaveBeenCalledWith('https://signed/put', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    })
  })

  // A failed PUT must not be confirmed: confirming would claim an upload that did not happen.
  it('does not confirm when the PUT fails', async () => {
    mocked.post.mockResolvedValueOnce({ data: { uploadUrl: 'https://signed/put', storageKey: 'k' } })
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 })

    const { result } = renderHook(() => useUploadVehicleFile(), { wrapper })
    await expect(
      result.current.mutateAsync({ vehicleId: 'v1', slotId: 's1', file }),
    ).rejects.toThrow()

    expect(mocked.post).toHaveBeenCalledTimes(1)
    expect(mocked.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/confirm'),
      expect.anything(),
    )
  })

  it('invalidates the vehicle queries on success', async () => {
    mocked.post.mockResolvedValueOnce({ data: { uploadUrl: 'https://signed/put', storageKey: 'k' } })
    mocked.post.mockResolvedValueOnce({ data: {} })
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUploadVehicleFile(), { wrapper: localWrapper })
    await result.current.mutateAsync({ vehicleId: 'v1', slotId: 's1', file })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['fleet', 'vehicles'] }),
    )
  })
})

describe('useDeleteVehicleFile', () => {
  it('deletes by file id and invalidates', async () => {
    mocked.delete.mockResolvedValue({ data: undefined })
    const { result } = renderHook(() => useDeleteVehicleFile(), { wrapper })
    await result.current.mutateAsync({ vehicleId: 'v1', fileId: 'f1' })
    expect(mocked.delete).toHaveBeenCalledWith('/fleet/vehicles/v1/files/f1')
  })
})

describe('useSetExternalUrl', () => {
  it('posts the link to the slot', async () => {
    mocked.post.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useSetExternalUrl(), { wrapper })
    await result.current.mutateAsync({
      vehicleId: 'v1',
      slotId: 's1',
      url: 'https://arsip.example/a.pdf',
    })
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles/v1/files/s1/external-url', {
      url: 'https://arsip.example/a.pdf',
    })
  })
})
