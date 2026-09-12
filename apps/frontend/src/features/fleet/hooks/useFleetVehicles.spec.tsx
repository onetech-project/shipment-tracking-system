import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import { FLEET_VEHICLE_SORTS } from '../types'
import {
  useArchiveFleetVehicle,
  useCreateFleetVehicle,
  useFleetVehicle,
  useFleetVehicles,
  useReplaceVehicleDocuments,
  useRestoreFleetVehicle,
  useUpdateFleetVehicle,
} from './useFleetVehicles'

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

const wireRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  nopol: 'B9114KYZ',
  worstSeverity: 'warn',
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mocked.get.mockResolvedValue({
    data: { rows: [wireRow()], total: 1, page: 1, pageSize: 25 },
  })
})

describe('useFleetVehicles', () => {
  it('reads the vehicle list', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles', expect.anything())
  })

  it('forwards the filters as query params', async () => {
    const { result } = renderHook(
      () => useFleetVehicles({ q: 'canter', severity: 'crit', page: 2, poolId: 'p1' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params).toMatchObject({
      q: 'canter',
      severity: 'crit',
      page: 2,
      poolId: 'p1',
    })
  })

  // The paging and ordering half of the same call. `sort` is the entire point of the
  // FLEET_VEHICLE_SORTS union: dropped on the way out, the table silently serves the backend's
  // default order while the header still shows the column the operator picked.
  it('forwards the paging and sort params', async () => {
    const { result } = renderHook(
      () => useFleetVehicles({ page: 2, pageSize: 50, sort: '-tahun' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params).toMatchObject({
      page: 2,
      pageSize: 50,
      sort: '-tahun',
    })
  })

  it.each(FLEET_VEHICLE_SORTS)('forwards the %s sort verbatim', async (sort) => {
    const { result } = renderHook(() => useFleetVehicles({ sort }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params.sort).toBe(sort)
  })

  // Archived vehicles are hidden by default; asking for them is the only way an operator can
  // find a row to restore.
  it('asks for archived rows when the toggle is on', async () => {
    const { result } = renderHook(() => useFleetVehicles({ includeArchived: true }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params.includeArchived).toBe(true)
  })

  // `|| undefined` rather than sending `includeArchived=false`: the key is absent, not falsy,
  // so the backend's own default decides.
  it('omits includeArchived when the toggle is off', async () => {
    const { result } = renderHook(() => useFleetVehicles({ includeArchived: false }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params.includeArchived).toBeUndefined()
  })

  // An empty search box must not send `q=`; the backend would treat it as a filter and the DTO
  // would carry a meaningless key on every request.
  it('omits an empty search term', async () => {
    const { result } = renderHook(() => useFleetVehicles({ q: '' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params.q).toBeUndefined()
  })

  it('omits filters that are not set', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const params = mocked.get.mock.calls[0][1].params
    expect(params.severity).toBeUndefined()
    expect(params.poolId).toBeUndefined()
  })

  // The filters are part of the cache key, otherwise switching a filter shows the previous
  // filter's rows from cache until the refetch lands.
  //
  // Both renders must share one QueryClient. The default `wrapper` builds a fresh client per
  // render, so two fetches happen whether or not the filters reach the key — with a per-render
  // client this assertion passes even against a queryKey that drops `filters` entirely.
  it('keys the cache by the filters', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const first = renderHook(() => useFleetVehicles({ severity: 'crit' }), { wrapper: shared })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))

    const second = renderHook(() => useFleetVehicles({ severity: 'warn' }), { wrapper: shared })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledTimes(2)
  })

  // The other half of the same invariant: the shared client really does serve from cache, so
  // the two fetches above are attributable to the differing filters and not to a cold cache.
  it('serves an unchanged filter set from cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const first = renderHook(() => useFleetVehicles({ severity: 'crit' }), { wrapper: shared })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))

    const second = renderHook(() => useFleetVehicles({ severity: 'crit' }), { wrapper: shared })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledTimes(1)
  })

  // Frontend and backend deploy separately, so a response from an older backend must still
  // render rather than crashing on a missing array.
  it('defaults a missing documents array to empty', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].documents).toEqual([])
  })

  // normalizeDocument has its own defaults, and nothing else in this file ever sends a document
  // row — without this the whole projection is unpinned and 'none' could drift to 'ok'.
  it('normalizes a document row, defaulting its severity to none', async () => {
    mocked.get.mockResolvedValue({
      data: {
        rows: [wireRow({ documents: [{ docTypeId: 'dt-1', code: 'stnk', label: 'STNK' }] })],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].documents[0]).toEqual({
      docTypeId: 'dt-1',
      code: 'stnk',
      label: 'STNK',
      nomor: null,
      issuedAt: null,
      expiresAt: null,
      daysLeft: null,
      severity: 'none',
    })
  })

  // daysLeft arrives from the backend and must survive the projection untouched — 0 in
  // particular, which `??` keeps but a truthiness check would silently turn into null.
  it('carries a backend-computed daysLeft of zero through unchanged', async () => {
    mocked.get.mockResolvedValue({
      data: {
        rows: [
          wireRow({
            minDaysLeft: 0,
            documents: [{ docTypeId: 'dt-1', daysLeft: 0, severity: 'warn' }],
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].documents[0].daysLeft).toBe(0)
    expect(result.current.data?.rows[0].documents[0].severity).toBe('warn')
    expect(result.current.data?.rows[0].minDaysLeft).toBe(0)
  })

  it('defaults a missing isActive to true', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].isActive).toBe(true)
  })

  it('defaults a missing worstSeverity to none', async () => {
    mocked.get.mockResolvedValue({
      data: { rows: [{ id: 'v1', nopol: 'B 1 A' }], total: 1, page: 1, pageSize: 25 },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].worstSeverity).toBe('none')
  })

  it('passes the envelope totals through', async () => {
    mocked.get.mockResolvedValue({
      data: { rows: [], total: 87, page: 3, pageSize: 25 },
    })
    const { result } = renderHook(() => useFleetVehicles({ page: 3 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ total: 87, page: 3, pageSize: 25 })
  })

  // A backend that answers with a bare array (or nothing) must not crash the table.
  it('survives a response with no rows array', async () => {
    mocked.get.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows).toEqual([])
  })

  // The lease arrives already worked out (spec §5.2). Defaulting it to null rather than to an
  // empty object keeps "no contract" distinguishable from "a contract with no figures".
  it('keeps the computed lease as the backend sent it', async () => {
    mocked.get.mockResolvedValueOnce({
      data: {
        rows: [
          {
            id: 'v1',
            nopol: 'B9114KYZ',
            lease: {
              id: 'lc1',
              leasing: { id: 'ls1', label: 'MTF' },
              nomorKontrak: 'MTF-1',
              cicilanPerBulan: 8750000,
              tenorBulan: 36,
              angsuranMulai: '2026-01-10',
              angsuranTerbayar: 4,
              sisaAngsuran: 32,
              sisaKewajiban: 280000000,
            },
          },
        ],
        total: 1,
      },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].lease).toMatchObject({
      nomorKontrak: 'MTF-1',
      sisaKewajiban: 280000000,
    })
  })

  // A backend that predates the lease field must still render a row, the same way every other
  // optional field on the wire type behaves.
  it('reports no lease when the response carries none', async () => {
    mocked.get.mockResolvedValueOnce({ data: { rows: [{ id: 'v1', nopol: 'B9114KYZ' }], total: 1 } })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].lease).toBeNull()
  })

  // One POST carries all three parts, because the backend writes them in one transaction. Two
  // calls would put a unit in the register whose papers failed to save.
  it('posts the lease and documents alongside the vehicle', async () => {
    mocked.post.mockResolvedValueOnce({ data: { id: 'v1' } })
    const { result } = renderHook(() => useCreateFleetVehicle(), { wrapper })
    result.current.mutate({
      nopol: 'B9114KYZ',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
      },
      documents: [{ docTypeId: 'dt1', expiresAt: '2031-01-10' }],
    })
    await waitFor(() => expect(mocked.post).toHaveBeenCalled())
    expect(mocked.post.mock.calls[0][1]).toMatchObject({
      lease: { nomorKontrak: 'MTF-1' },
      documents: [{ docTypeId: 'dt1' }],
    })
  })
})

describe('useFleetVehicle', () => {
  it('reads a single vehicle by id', async () => {
    mocked.get.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useFleetVehicle('v1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles/v1')
  })

  // The detail query is used by the edit dialog, which mounts before a row is chosen.
  it('stays idle without an id', () => {
    const { result } = renderHook(() => useFleetVehicle(undefined), { wrapper })
    expect(mocked.get).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('mutations', () => {
  it('creates a vehicle', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useCreateFleetVehicle(), { wrapper })
    await result.current.mutateAsync({ nopol: 'B 1 A' })
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles', { nopol: 'B 1 A' })
  })

  it('updates a vehicle', async () => {
    mocked.patch.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useUpdateFleetVehicle(), { wrapper })
    await result.current.mutateAsync({ id: 'v1', payload: { merk: 'Hino' } })
    expect(mocked.patch).toHaveBeenCalledWith('/fleet/vehicles/v1', { merk: 'Hino' })
  })

  // A POST to the archive route, not a DELETE: the row survives and can be restored.
  it('archives through the archive route', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useArchiveFleetVehicle(), { wrapper })
    await result.current.mutateAsync('v1')
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles/v1/archive')
  })

  it('restores through the restore route', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useRestoreFleetVehicle(), { wrapper })
    await result.current.mutateAsync('v1')
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles/v1/restore')
  })

  // The whole set goes in one PUT so the backend can swap it in a single transaction; sending
  // documents one at a time would leave the vehicle half-updated if one call failed.
  it('replaces the document set in one PUT', async () => {
    mocked.put.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useReplaceVehicleDocuments(), { wrapper })
    await result.current.mutateAsync({
      id: 'v1',
      documents: [{ docTypeId: 'dt-1', expiresAt: '2027-01-01' }],
    })
    expect(mocked.put).toHaveBeenCalledWith('/fleet/vehicles/v1/documents', {
      documents: [{ docTypeId: 'dt-1', expiresAt: '2027-01-01' }],
    })
  })

  // Without the invalidation the table keeps showing the pre-edit row until something else
  // triggers a refetch, which reads as "my change did not save".
  it.each([
    ['create', () => useCreateFleetVehicle(), { nopol: 'B 1 A' } as never],
    ['update', () => useUpdateFleetVehicle(), { id: 'v1', payload: {} } as never],
    ['archive', () => useArchiveFleetVehicle(), 'v1' as never],
    ['restore', () => useRestoreFleetVehicle(), 'v1' as never],
    ['documents', () => useReplaceVehicleDocuments(), { id: 'v1', documents: [] } as never],
  ])('invalidates the vehicles cache after %s', async (_name, hook, arg) => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    mocked.patch.mockResolvedValue({ data: wireRow() })
    mocked.put.mockResolvedValue({ data: wireRow() })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = jest.spyOn(client, 'invalidateQueries')
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => hook(), { wrapper: localWrapper })
    await result.current.mutateAsync(arg)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['fleet', 'vehicles'] })
  })
})
