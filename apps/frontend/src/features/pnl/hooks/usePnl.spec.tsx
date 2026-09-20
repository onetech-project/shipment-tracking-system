/**
 * Pins the HTTP contract of the AWB drilldown's route filter: the exact param names sent to the
 * backend, that empty/undefined fields are dropped rather than sent empty, and that the route
 * takes part in the query key so a route change is not served from a stale cache entry.
 *
 * useQuery is mocked so these assertions read the exact config TanStack Query and the http
 * client would see, without needing a live QueryClient — PnlAwbDrilldown.spec.tsx mocks the hook
 * wholesale, so this is the only place that contract is exercised at all.
 */
import React from 'react'
import { renderHook } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  routeToParams,
  usePnlAwbDrilldown,
  usePnlSummary,
  usePnlDailyMargin,
  usePnlRevenueByRoute,
  usePnlProfitByRoute,
  usePnlCostTotals,
  usePnlCostByVendor,
  usePnlCostByRa,
  usePnlCostBySgOut,
  usePnlCostBySgIn,
  PnlFilter,
  PnlRouteFilter,
  columnsToParam,
  vendorColumnsToParams,
} from './usePnl'

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }))
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(() => Promise.resolve({ data: { data: [], total: 0 } })) },
}))

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }
const FILTER: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'date' }

describe('routeToParams', () => {
  it('sends nothing at all for an untouched filter', () => {
    // An untouched filter must produce the exact request shape the endpoint saw before route
    // filtering existed, not `routes=`.
    expect(routeToParams(undefined)).toEqual({})
    expect(routeToParams({})).toEqual({})
    expect(routeToParams({ routes: [] })).toEqual({})
  })

  it('joins route pairs into one comma-separated param', () => {
    expect(
      routeToParams({
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Tanjung Pinang' },
        ],
      }),
    ).toEqual({ routes: 'Jabo|Denpasar,Surabaya|Tanjung Pinang' })
  })

  it('carries the date window alongside the routes', () => {
    expect(
      routeToParams({ routes: [{ origin: 'Jabo', dest: 'Aceh' }], dateFrom: '2026-05-01', dateTo: '2026-05-01' }),
    ).toEqual({ routes: 'Jabo|Aceh', dateFrom: '2026-05-01', dateTo: '2026-05-01' })
  })
})

describe('usePnlAwbDrilldown HTTP contract', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requests with the route params merged alongside the filter, page and limit', async () => {
    const route: PnlRouteFilter = {
      routes: [{ origin: 'Jabo', dest: 'Tanjung Pinang' }],
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
        routes: 'Jabo|Tanjung Pinang',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
        page: 2,
        limit: 50,
      },
      // `vendor` repeats on the wire; axios's default array serializer would write `vendor[]=`,
      // which qs parses under a key called 'vendor[]' that no handler reads.
      paramsSerializer: { indexes: null },
    })
  })

  it('includes the route in the query key so a route change is not served from a stale cache entry', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})
    const routeA: PnlRouteFilter = { routes: [{ origin: 'Jabo', dest: 'Denpasar' }] }
    const routeB: PnlRouteFilter = { routes: [{ origin: 'Surabaya', dest: 'Pontianak' }] }

    usePnlAwbDrilldown(filter, 1, routeA)
    usePnlAwbDrilldown(filter, 1, routeB)

    const [configA] = (useQuery as jest.Mock).mock.calls[0]
    const [configB] = (useQuery as jest.Mock).mock.calls[1]
    expect(configA.queryKey).toContain(routeA)
    expect(configB.queryKey).toContain(routeB)
    expect(configA.queryKey).not.toEqual(configB.queryKey)
  })
})

describe('columnsToParam', () => {
  it('prefixes each pick by kind and keeps the pick order', () => {
    expect(
      columnsToParam([
        { kind: 'group', id: 'abc' },
        { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
      ]),
    ).toBe('g:abc,r:Jabo|Denpasar')
  })

  it('is empty for no picks', () => {
    expect(columnsToParam([])).toBe('')
  })
})

describe('vendorColumnsToParams', () => {
  it('emits one descriptor per pick, splitting on the first colon only', () => {
    expect(
      vendorColumnsToParams([
        { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
        { kind: 'vendor', name: 'PT Kargo, Tbk' },
        { kind: 'vendor', name: 'Vendor: Utama' },
      ]),
    ).toEqual([
      'vg:11111111-1111-4111-8111-111111111111',
      'v:PT Kargo, Tbk',
      'v:Vendor: Utama',
    ])
  })

  it('returns an array, not a joined string — the param repeats on the wire', () => {
    expect(Array.isArray(vendorColumnsToParams([{ kind: 'vendor', name: 'ESP' }]))).toBe(true)
  })
})

describe('routeToParams', () => {
  it('sends vendors as an array under the singular `vendor` key the endpoint reads', () => {
    expect(routeToParams({ vendors: ['ESP', 'Angkasa'] })).toEqual({
      vendor: ['ESP', 'Angkasa'],
    })
  })

  it('omits the key entirely when no vendor is selected', () => {
    expect(routeToParams({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })).toEqual({
      routes: 'Jabo|Aceh',
    })
    expect(routeToParams({ vendors: [] })).toEqual({})
  })
})

// Renders the real hook against a real QueryClient and reads the cache it populated. Comparing two
// key arrays the test itself built would assert only that two different literals differ — it would
// pass with the scope never reaching the hook at all.
describe('scoped query keys', () => {
  // This file mocks '@tanstack/react-query' wholesale (see top of file) so the AWB-drilldown
  // tests above can call hooks as plain functions and inspect the config passed to a stub
  // useQuery. That mock has no QueryClient/QueryClientProvider export at all, so this block
  // reaches for jest.requireActual to get the real ones, and points the mocked `useQuery`
  // binding at the real implementation for the duration of one render — via
  // mockImplementation, not jest.isolateModules, because isolateModules would re-require
  // 'react' into a second copy separate from the one @testing-library/react already loaded,
  // and React refuses to run hooks across two React instances (null dispatcher).
  // mockReset() below returns useQuery to the bare stub the other describes depend on.
  const real = jest.requireActual('@tanstack/react-query')

  afterEach(() => {
    ;(useQuery as jest.Mock).mockReset()
  })

  function keysAfter(scope?: PnlRouteFilter): unknown[][] {
    ;(useQuery as jest.Mock).mockImplementation(real.useQuery)
    const client = new real.QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <real.QueryClientProvider client={client}>{children}</real.QueryClientProvider>
    )
    renderHook(() => usePnlSummary(FILTER, scope), { wrapper })
    return client.getQueryCache().getAll().map((q: { queryKey: unknown[] }) => q.queryKey)
  }

  it('puts the scope in the key, so changing the filter refetches', () => {
    // Without this, react-query serves the previous filter's cached answer and the page silently
    // shows numbers for a filter the user has already changed.
    const scoped = keysAfter({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    const unscoped = keysAfter(undefined)

    expect(scoped).toHaveLength(1)
    expect(unscoped).toHaveLength(1)
    expect(scoped[0]).not.toEqual(unscoped[0])
    // And the scope is what differs, not merely something.
    expect(JSON.stringify(scoped[0])).toContain('Jabo')
  })

  it('sends the scope through to the request params, not only into the key', () => {
    // A mutant that keeps scope in queryKey but drops ...routeToParams(scope) from params would
    // pass the test above (the key still changes) while the backend never sees the filter at all.
    keysAfter({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    expect(apiClient.get).toHaveBeenCalledWith(
      '/pnl/summary',
      expect.objectContaining({ params: expect.objectContaining({ routes: 'Jabo|Aceh' }) }),
    )
  })
})

// Only usePnlSummary (above) had any assertion on what reaches the wire. Every other scoped hook
// carries `...routeToParams(scope)` and `paramsSerializer: { indexes: null }` in its request, but
// nothing proved it — a prior audit found that deleting paramsSerializer from usePnlCostByVendor
// passed the entire frontend pnl suite. The serializer assertion below is why this block exists:
// without paramsSerializer: { indexes: null }, axios serialises the repeated `vendor` param as
// `vendor[]=ESP`, qs parses that under a key literally named 'vendor[]' that no backend handler
// reads, and the vendor filter vanishes from the response with no error or warning anywhere.
describe.each([
  {
    name: 'usePnlDailyMargin',
    path: '/pnl/daily-margin',
    run: (scope?: PnlRouteFilter) => usePnlDailyMargin(FILTER, scope),
  },
  {
    name: 'usePnlRevenueByRoute',
    path: '/pnl/breakdown/revenue-by-route',
    run: (scope?: PnlRouteFilter) => usePnlRevenueByRoute(FILTER, scope),
  },
  {
    name: 'usePnlProfitByRoute',
    path: '/pnl/breakdown/profit-by-route',
    run: (scope?: PnlRouteFilter) => usePnlProfitByRoute(FILTER, scope),
  },
  {
    name: 'usePnlCostTotals',
    path: '/pnl/breakdown/cost-totals',
    run: (scope?: PnlRouteFilter) => usePnlCostTotals(FILTER, true, scope),
  },
  {
    name: 'usePnlCostByVendor',
    path: '/pnl/breakdown/cost-by-vendor',
    run: (scope?: PnlRouteFilter) => usePnlCostByVendor(FILTER, true, scope),
  },
  {
    name: 'usePnlCostByRa',
    path: '/pnl/breakdown/cost-by-ra',
    run: (scope?: PnlRouteFilter) => usePnlCostByRa(FILTER, true, scope),
  },
  {
    name: 'usePnlCostBySgOut',
    path: '/pnl/breakdown/cost-by-sg-out',
    run: (scope?: PnlRouteFilter) => usePnlCostBySgOut(FILTER, true, scope),
  },
  {
    name: 'usePnlCostBySgIn',
    path: '/pnl/breakdown/cost-by-sg-in',
    run: (scope?: PnlRouteFilter) => usePnlCostBySgIn(FILTER, true, scope),
  },
])('$name wire contract', ({ path, run }) => {
  // Same harness as 'scoped query keys' above: this file mocks '@tanstack/react-query' wholesale
  // for the plain-function-call tests elsewhere in the file, so a real render needs the actual
  // QueryClient/QueryClientProvider via requireActual, with the mocked useQuery binding pointed at
  // the real implementation for the duration of one render, reset afterward.
  const real = jest.requireActual('@tanstack/react-query')

  afterEach(() => {
    ;(useQuery as jest.Mock).mockReset()
  })

  it('sends the serialised scope to the wire behind paramsSerializer: { indexes: null }', () => {
    ;(useQuery as jest.Mock).mockImplementation(real.useQuery)
    const client = new real.QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <real.QueryClientProvider client={client}>{children}</real.QueryClientProvider>
    )
    const scope: PnlRouteFilter = {
      routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      vendors: ['ESP'],
    }

    renderHook(() => run(scope), { wrapper })

    expect(apiClient.get).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        params: expect.objectContaining({ routes: 'Jabo|Aceh', vendor: ['ESP'] }),
        paramsSerializer: { indexes: null },
      }),
    )
  })
})

describe('routeToParams as the scope serialiser', () => {
  it('drops every empty field, so an untouched filter sends the old request shape', () => {
    expect(routeToParams({})).toEqual({})
    expect(routeToParams({ routes: [], vendors: [] })).toEqual({})
    expect(routeToParams(undefined)).toEqual({})
  })

  it('joins route pairs on the pipe and the comma', () => {
    expect(
      routeToParams({
        routes: [
          { origin: 'Jabo', dest: 'Aceh' },
          { origin: 'Surabaya', dest: 'Batam' },
        ],
      }),
    ).toEqual({ routes: 'Jabo|Aceh,Surabaya|Batam' })
  })

  it('sends vendors under the singular key, as an array the serialiser repeats', () => {
    expect(routeToParams({ vendors: ['ESP'] })).toEqual({ vendor: ['ESP'] })
  })
})
