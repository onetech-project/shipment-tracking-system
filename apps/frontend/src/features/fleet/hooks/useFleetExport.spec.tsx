import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import { useFleetExport } from './useFleetExport'

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
  // jsdom has neither: the hook needs both to build and clean up the download link.
  URL.createObjectURL = jest.fn(() => 'blob:x')
  URL.revokeObjectURL = jest.fn()
  mocked.get.mockResolvedValue({ data: 'nopol,merk\nB1234KYZ,Canter\n' })
})

describe('useFleetExport', () => {
  it('asks for the CSV as a blob', async () => {
    const { result } = renderHook(() => useFleetExport(), { wrapper })
    await result.current.mutateAsync()

    expect(mocked.get).toHaveBeenCalledWith('/fleet/export.csv', { responseType: 'blob' })
  })

  it('clicks a dated download link', async () => {
    // The anchor is a local variable inside the hook and never escapes it, so its `download`
    // attribute can only be inspected at click time, not after mutateAsync resolves.
    let downloadAttrAtClick: string | undefined
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadAttrAtClick = this.download
      })

    const { result } = renderHook(() => useFleetExport(), { wrapper })
    await result.current.mutateAsync()

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(downloadAttrAtClick).toMatch(/^armada-\d{4}-\d{2}-\d{2}\.csv$/)

    clickSpy.mockRestore()
  })

  // Leaving the object URL alive pins the file in memory for the life of the document.
  it('revokes the object URL', async () => {
    const { result } = renderHook(() => useFleetExport(), { wrapper })
    await result.current.mutateAsync()

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
