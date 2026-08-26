/**
 * Pins the query keys and the rolling-deploy defaults. useQuery/useMutation/useQueryClient are
 * mocked so the assertions read the exact config TanStack Query would see, without needing a live
 * QueryClient — the same technique usePnl.spec.ts uses for useQuery alone.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  useAvailableVendors,
  useCreateVendorGroup,
  useDeleteVendorGroup,
  useUpdateVendorGroup,
  useVendorGroups,
} from './useVendorGroups'

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}))
jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
}))

beforeEach(() => jest.clearAllMocks())

describe('useVendorGroups', () => {
  it('keys the group list under vendor-groups and respects the enabled flag', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups({ enabled: false })

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.queryKey).toEqual(['vendor-groups'])
    expect(config.enabled).toBe(false)
  })

  // Frontend and backend deploy in parallel, so a group served without its vendors array must
  // still render as a group with no vendors rather than crashing the table's .join().
  it('defaults a missing vendors array to an empty one', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.select([{ id: 'vg1', name: 'Maskapai', description: null }])).toEqual([
      { id: 'vg1', name: 'Maskapai', description: null, vendors: [] },
    ])
  })

  it('requests the group list from the vendor-groups endpoint', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    await config.queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/vendor-groups')
  })

  // A vendor name is a raw value that must reach and return from the API byte-identical to what
  // the picker showed — no trimming, no case folding, anywhere in the select projection.
  it('passes vendor names through untouched, including surrounding case and whitespace', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useVendorGroups()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(
      config.select([
        { id: 'vg1', name: 'Maskapai', description: null, vendors: [' garuda Indonesia ', 'AirAsia'] },
      ]),
    ).toEqual([{ id: 'vg1', name: 'Maskapai', description: null, vendors: [' garuda Indonesia ', 'AirAsia'] }])
  })
})

describe('useAvailableVendors', () => {
  it('keys the vendor list beneath the group list so a write invalidates both', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.queryKey).toEqual(['vendor-groups', 'available-vendors'])
  })

  it('defaults both flags to true when a backend that predates them answers', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    // Silence rather than a warning on every row: a backend that cannot tell us has not told us
    // that anything is wrong.
    expect(config.select([{ vendor: 'GARUDA INDONESIA' }])).toEqual([
      { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: true },
    ])
  })

  it('passes both flags through untouched when the backend does send them', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(
      config.select([{ vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false }]),
    ).toEqual([{ vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false }])
  })

  // A backend that explicitly says `false` must not be papered over by the default -- only a
  // genuinely missing field falls back to true.
  it('respects an explicit false rather than only checking one flag at a time', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    expect(config.select([{ vendor: 'X', hasData: false, inMaster: false }])).toEqual([
      { vendor: 'X', hasData: false, inMaster: false },
    ])
  })

  it('requests the available-vendors endpoint', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useAvailableVendors()

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    await config.queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/vendor-groups/available-vendors')
  })
})

describe('useCreateVendorGroup', () => {
  it('posts the payload untouched to /vendor-groups and invalidates the group list on success', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useCreateVendorGroup()

    const config = (useMutation as jest.Mock).mock.calls[0][0]
    const payload = { name: 'Group A', vendors: [' Garuda Indonesia '] }
    await config.mutationFn(payload)
    expect(apiClient.post).toHaveBeenCalledWith('/vendor-groups', payload)

    config.onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['vendor-groups'] })
  })
})

describe('useUpdateVendorGroup', () => {
  it('patches the given id with the payload and invalidates the group list on success', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useUpdateVendorGroup()

    const config = (useMutation as jest.Mock).mock.calls[0][0]
    const payload = { name: 'Group A', vendors: ['AirAsia'] }
    await config.mutationFn({ id: 'vg1', payload })
    expect(apiClient.patch).toHaveBeenCalledWith('/vendor-groups/vg1', payload)

    config.onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['vendor-groups'] })
  })
})

describe('useDeleteVendorGroup', () => {
  it('deletes the given id and invalidates the group list on success', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useDeleteVendorGroup()

    const config = (useMutation as jest.Mock).mock.calls[0][0]
    await config.mutationFn('vg1')
    expect(apiClient.delete).toHaveBeenCalledWith('/vendor-groups/vg1')

    config.onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['vendor-groups'] })
  })
})
