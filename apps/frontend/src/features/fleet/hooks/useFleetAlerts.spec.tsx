import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import { useFleetAlerts } from './useFleetAlerts'

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
  kind: 'document',
  vehicleId: 'v1',
  nopol: 'B 9114 KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  pool: 'Pool A',
  subjectId: 'dt-1',
  label: 'KIR',
  expiresAt: '2026-09-20',
  daysLeft: 4,
  severity: 'warn',
  driverName: null,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mocked.get.mockResolvedValue({ data: [wireRow()] })
})

describe('useFleetAlerts', () => {
  it('reads the alert list with no limit by default', async () => {
    const { result } = renderHook(() => useFleetAlerts(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/alerts', { params: { limit: undefined } })
    expect(result.current.data?.[0].label).toBe('KIR')
  })

  it('passes the limit through to the request params', async () => {
    const { result } = renderHook(() => useFleetAlerts(10), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/alerts', { params: { limit: 10 } })
  })

  // Every field the normalizer defaults, asserted together, so a mutation to any single default
  // (severity to 'ok', vehicleId/nopol to '', daysLeft to something other than 0, or a dropped
  // 'kind' default) is caught here rather than by an assertion that only happens to cover one.
  it('defaults every field the backend did not send', async () => {
    mocked.get.mockResolvedValue({
      data: [{ subjectId: 's1', label: 'KIR', expiresAt: '2026-09-20' }],
    })
    const { result } = renderHook(() => useFleetAlerts(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toEqual({
      kind: 'document',
      vehicleId: null,
      nopol: null,
      merk: null,
      tipe: null,
      pool: null,
      subjectId: 's1',
      label: 'KIR',
      expiresAt: '2026-09-20',
      daysLeft: 0,
      // 'warn' not 'ok': the backend only puts a row in this list because it needs attention.
      severity: 'warn',
      driverName: null,
    })
  })

  // expiresAt itself defaults to '' when the backend omits it too — distinct from the case above,
  // which always supplied it.
  it('defaults a missing expiresAt to an empty string', async () => {
    mocked.get.mockResolvedValue({ data: [{ subjectId: 's1', label: 'KIR' }] })
    const { result } = renderHook(() => useFleetAlerts(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].expiresAt).toBe('')
  })

  // react-query itself rejects a queryFn that resolves to `undefined`, so the realistic "nothing
  // to show" wire response is a null body, not an absent one — that is what select's `rows ?? []`
  // guards against.
  it('reads a null response as an empty list', async () => {
    mocked.get.mockResolvedValue({ data: null })
    const { result } = renderHook(() => useFleetAlerts(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  // The limit is part of the cache key, otherwise switching limits serves the previous limit's
  // rows from cache until the refetch lands.
  //
  // Both renders share one QueryClient. A fresh client per render would fetch twice regardless of
  // whether the limit reaches the key, so this assertion would pass even against a queryKey that
  // drops it entirely.
  it('keys the cache by the limit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const first = renderHook(() => useFleetAlerts(10), { wrapper: shared })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))

    const second = renderHook(() => useFleetAlerts(20), { wrapper: shared })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))

    expect(mocked.get).toHaveBeenCalledTimes(2)
  })
})
