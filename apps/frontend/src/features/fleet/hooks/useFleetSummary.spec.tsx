import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import { useFleetSummary } from './useFleetSummary'

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

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useFleetSummary', () => {
  it('reads the summary', async () => {
    mocked.get.mockResolvedValue({
      data: {
        totalUnit: 8,
        dokumenKedaluwarsa: 2,
        jatuhTempo30Hari: 1,
        cicilanPerBulan: 13750000,
        sisaKewajiban: 177500000,
      },
    })
    const { result } = renderHook(() => useFleetSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/summary')
    expect(result.current.data?.totalUnit).toBe(8)
  })

  it('zeroes a figure the backend did not send', async () => {
    mocked.get.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useFleetSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      totalUnit: 0,
      dokumenKedaluwarsa: 0,
      jatuhTempo30Hari: 0,
      cicilanPerBulan: 0,
      sisaKewajiban: 0,
    })
  })
})
