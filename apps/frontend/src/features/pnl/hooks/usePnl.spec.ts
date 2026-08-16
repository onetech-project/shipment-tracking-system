/**
 * Pins the HTTP contract of the AWB drilldown's route filter: the exact param names sent to the
 * backend, that empty/undefined fields are dropped rather than sent empty, and that the route
 * takes part in the query key so a route change is not served from a stale cache entry.
 *
 * useQuery is mocked so these assertions read the exact config TanStack Query and the http
 * client would see, without needing a live QueryClient — PnlAwbDrilldown.spec.tsx mocks the hook
 * wholesale, so this is the only place that contract is exercised at all.
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { routeToParams, usePnlAwbDrilldown, PnlFilter, PnlRouteFilter } from './usePnl'

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }))
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(() => Promise.resolve({ data: { data: [], total: 0 } })) },
}))

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

describe('routeToParams', () => {
  it('sends the exact param names the backend expects for a populated route', () => {
    const route: PnlRouteFilter = {
      origin: 'Jabo',
      dest: 'Tanjung Pinang',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    }
    expect(routeToParams(route)).toEqual({
      origin: 'Jabo',
      dest: 'Tanjung Pinang',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })

  it('omits empty or undefined fields entirely rather than sending them empty', () => {
    const params = routeToParams({ origin: 'Jabo', dest: '', dateFrom: undefined, dateTo: undefined })
    expect(params).toEqual({ origin: 'Jabo' })
    expect(Object.keys(params)).not.toContain('dest')
    expect(Object.keys(params)).not.toContain('dateFrom')
    expect(Object.keys(params)).not.toContain('dateTo')
  })

  it('returns an empty object for an undefined route', () => {
    expect(routeToParams(undefined)).toEqual({})
  })
})

describe('usePnlAwbDrilldown HTTP contract', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requests with the route params merged alongside the filter, page and limit', async () => {
    const route: PnlRouteFilter = {
      origin: 'Jabo',
      dest: 'Tanjung Pinang',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    }
    ;(useQuery as jest.Mock).mockReturnValue({})
    usePnlAwbDrilldown(filter, 2, route, 50)

    const config = (useQuery as jest.Mock).mock.calls[0][0]
    await config.queryFn()

    expect(apiClient.get).toHaveBeenCalledWith('/pnl/awb-drilldown', {
      params: {
        cycle: '2026-05-1H',
        basis: 'ata_vendor_wh_destination',
        origin: 'Jabo',
        dest: 'Tanjung Pinang',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
        page: 2,
        limit: 50,
      },
    })
  })

  it('includes the route in the query key so a route change is not served from a stale cache entry', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})
    const routeA: PnlRouteFilter = { origin: 'Jabo' }
    const routeB: PnlRouteFilter = { origin: 'Surabaya' }

    usePnlAwbDrilldown(filter, 1, routeA)
    usePnlAwbDrilldown(filter, 1, routeB)

    const [configA] = (useQuery as jest.Mock).mock.calls[0]
    const [configB] = (useQuery as jest.Mock).mock.calls[1]
    expect(configA.queryKey).toContain(routeA)
    expect(configB.queryKey).toContain(routeB)
    expect(configA.queryKey).not.toEqual(configB.queryKey)
  })
})
