/**
 * Follows the mocking pattern of `PnlDailyMatrixView.spec.tsx`: the hooks module is mocked so the
 * container's own decisions — loading, error, empty, permission gate — are what is under test.
 */
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlAnalyticsView } from './PnlAnalyticsView'
import { AnalyticsDailySeries, AnalyticsScope, SlaOverview } from '../types'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'

// jsdom implements no ResizeObserver, and recharts' ResponsiveContainer constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

jest.mock('../hooks/useAnalytics', () => ({
  ...jest.requireActual('../hooks/useAnalytics'),
  useAnalyticsDailySeries: jest.fn(),
  useAnalyticsPrevDailySeries: jest.fn(),
  useAnalyticsJourney: jest.fn(),
  useAnalyticsGwChw: jest.fn(),
  useAnalyticsSla: jest.fn(),
  useAnalyticsOffloaded: jest.fn(),
}))

jest.mock('@/features/pnl/hooks/usePnl', () => ({
  ...jest.requireActual('@/features/pnl/hooks/usePnl'),
  usePnlSummary: jest.fn(),
  usePnlCostTotals: jest.fn(),
  usePnlCostByVendor: jest.fn(),
  usePnlCostByRa: jest.fn(),
  usePnlCostBySgOut: jest.fn(),
  usePnlCostBySgIn: jest.fn(),
  usePnlProfitByRoute: jest.fn(),
  usePnlDataQualitySummary: jest.fn(),
  usePnlAwbDrilldown: jest.fn(),
}))

jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(() => ({ data: [] })),
}))

jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-var-requires */
const analytics = require('../hooks/useAnalytics')
const pnl = require('@/features/pnl/hooks/usePnl')
const perms = require('@/shared/hooks/use-permissions')
/* eslint-enable @typescript-eslint/no-var-requires */

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }

const series: AnalyticsDailySeries = {
  dates: ['2026-05-01', '2026-05-02'],
  rows: [
    {
      date: '2026-05-01',
      origin: 'Jabo',
      dest: 'Denpasar',
      revenue: 1000,
      costSmu: 600,
      costRa: 0,
      costSgOut: 0,
      costSgIn: 0,
      weight: 100,
      incompleteTos: 0,
    },
    {
      date: '2026-05-02',
      origin: 'Jabo',
      dest: 'Denpasar',
      revenue: 1000,
      costSmu: 600,
      costRa: 0,
      costSgOut: 0,
      costSgIn: 0,
      weight: 100,
      incompleteTos: 0,
    },
  ],
}

/** One SLA route that maps onto the series' only route (SLA names the Jakarta hub "Kosambi"). */
const sla: SlaOverview = {
  summary: {
    alerts: {},
    otp: {
      percentage: 80,
      onTimeWeight: 800,
      lateWeight: 200,
      breakdown: [
        { route: 'Kosambi DC - Denpasar DC', percentage: 80, onTimeWeight: 800, lateWeight: 200 },
      ],
    },
  },
}

const q = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...over,
})

/**
 * `permission` is either a blanket boolean or the exact set the account holds — the latter is what
 * distinguishes "gated on read.sla" from "gated on whatever permission happens to be granted".
 */
function setup(over: Record<string, unknown> = {}, permission: boolean | string[] = true) {
  analytics.useAnalyticsDailySeries.mockReturnValue(q({ data: series }))
  analytics.useAnalyticsPrevDailySeries.mockReturnValue(q())
  analytics.useAnalyticsJourney.mockReturnValue(q({ data: [] }))
  analytics.useAnalyticsGwChw.mockReturnValue(q({ data: [] }))
  analytics.useAnalyticsSla.mockReturnValue(q())
  analytics.useAnalyticsOffloaded.mockReturnValue(q())
  pnl.usePnlSummary.mockReturnValue(q())
  pnl.usePnlCostTotals.mockReturnValue(q())
  pnl.usePnlCostByVendor.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostByRa.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostBySgOut.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostBySgIn.mockReturnValue(q({ data: [] }))
  pnl.usePnlProfitByRoute.mockReturnValue(q({ data: [] }))
  pnl.usePnlDataQualitySummary.mockReturnValue(q({ data: [] }))
  pnl.usePnlAwbDrilldown.mockReturnValue(q({ data: { data: [], total: 0 } }))
  perms.usePermissions.mockReturnValue({
    hasPermission: (p: string) =>
      typeof permission === 'boolean' ? permission : permission.includes(p),
    isSuperAdmin: false,
    isAdmin: false,
    isAdminOrAbove: false,
  })
  Object.entries(over).forEach(([k, v]) => {
    if (analytics[k]) analytics[k].mockReturnValue(v)
    if (pnl[k]) pnl[k].mockReturnValue(v)
  })
}

const props = {
  filter,
  scope: { kind: 'all' } as AnalyticsScope,
  onScopeChange: jest.fn(),
}

describe('PnlAnalyticsView', () => {
  it('renders every section once the series has loaded', () => {
    setup()
    render(<PnlAnalyticsView {...props} />)
    for (const id of [
      'health',
      'summary',
      'trend',
      'time-patterns',
      'cost-structure',
      'airline',
      'ra',
      'sg',
      'vendor',
      'journey',
      'routes',
      'weight-gap',
      'ops',
      'appendix',
    ]) {
      expect(document.getElementById(id)).toBeInTheDocument()
    }
  })

  it('gives the nav one anchor per section, all of which resolve', () => {
    setup()
    render(<PnlAnalyticsView {...props} />)
    const links = Array.from(
      screen.getByTestId('analytics-nav').querySelectorAll('a'),
    ) as HTMLAnchorElement[]
    expect(links).toHaveLength(14)
    // A nav entry pointing at an id no section renders is a dead link with no visible symptom.
    for (const a of links) {
      expect(document.getElementById(a.getAttribute('href')!.slice(1))).toBeInTheDocument()
    }
  })

  it('shows a loading state instead of empty sections while the series is in flight', () => {
    setup({ useAnalyticsDailySeries: q({ isLoading: true }) })
    render(<PnlAnalyticsView {...props} />)
    expect(screen.getByTestId('analytics-loading')).toBeInTheDocument()
    expect(document.getElementById('summary')).not.toBeInTheDocument()
  })

  it('offers a retry when the series failed', () => {
    const refetch = jest.fn()
    setup({ useAnalyticsDailySeries: q({ isError: true, refetch }) })
    render(<PnlAnalyticsView {...props} />)
    screen.getByRole('button', { name: /retry/i }).click()
    expect(refetch).toHaveBeenCalled()
  })

  it('says the period is empty rather than rendering zeroed sections', () => {
    setup({ useAnalyticsDailySeries: q({ data: { dates: [], rows: [] } }) })
    render(<PnlAnalyticsView {...props} />)
    expect(screen.getByTestId('analytics-empty')).toBeInTheDocument()
  })

  it('never requests SLA data for a user without the permission', () => {
    setup({}, false)
    render(<PnlAnalyticsView {...props} />)
    // `enabled: false` is the gate: the request is not merely hidden, it is never sent.
    expect(analytics.useAnalyticsSla).toHaveBeenCalledWith(filter, false)
    expect(analytics.useAnalyticsOffloaded).toHaveBeenCalledWith(filter, false)
    expect(screen.getByTestId('analytics-ops-permission')).toBeInTheDocument()
  })

  it('requests SLA data when the permission is held', () => {
    setup({}, true)
    render(<PnlAnalyticsView {...props} />)
    expect(analytics.useAnalyticsSla).toHaveBeenCalledWith(filter, true)
  })
  // --- wiring the container is the ONLY place that decides ------------------------------------

  it('asks the drilldown for the same page size the appendix paginates by', () => {
    // A limit that disagrees between request and pager silently mis-reports the page count:
    // the appendix would claim more (or fewer) pages than the API will ever serve.
    setup({ usePnlAwbDrilldown: q({ data: { data: [], total: 120 } }) })
    render(<PnlAnalyticsView {...props} />)
    // The first request must be page 1: opening a period part-way through the AWB list shows the
    // reader rows they never asked for, and pays for a request nobody reads.
    expect(pnl.usePnlAwbDrilldown.mock.calls[0]).toEqual([filter, 1, undefined, 50])
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it('does not claim a range fallback while a cycle is selected', () => {
    setup()
    render(<PnlAnalyticsView {...props} />)
    expect(screen.queryAllByText(/custom date range is active/i)).toHaveLength(0)
  })

  it('marks period-aggregate sections as range fallbacks in custom-range mode', () => {
    setup()
    const ranged: PnlFilter = {
      mode: 'range',
      start: '2026-05-01',
      end: '2026-05-02',
      basis: 'atd_origin',
    }
    render(<PnlAnalyticsView {...props} filter={ranged} />)
    expect(screen.queryAllByText(/custom date range is active/i).length).toBeGreaterThan(0)
  })

  it('leaves the SLA scope empty while the viewer is on all routes', () => {
    // Passing the full route list instead of [] makes slaView recompute OTP from mapped routes
    // only, which silently drops the API's own headline for every unmapped route.
    setup({ useAnalyticsSla: q({ data: sla }) })
    render(<PnlAnalyticsView {...props} />)
    expect(screen.getByTestId('analytics-ops-otp')).not.toHaveTextContent(
      /recomputed over the routes in scope/i,
    )
  })

  it('offers the picker exactly the routes the loaded period carries', () => {
    // An empty route list is not a harmless default: the reader cannot narrow to a route at all,
    // and the control gives no hint that anything is missing.
    setup()
    render(<PnlAnalyticsView {...props} />)
    const trigger = screen.getByRole('button', { name: /all routes/i, expanded: false })
    fireEvent.click(trigger)
    // Scoped to the picker: the same label also appears in the Routes table further down.
    const picker = within(trigger.closest('div')!)
    expect(picker.getByLabelText('CGK → Denpasar')).toBeInTheDocument()
    expect(picker.queryByText('No routes')).not.toBeInTheDocument()
  })
  it('re-requests the drilldown when the appendix is paged', () => {
    // The page number must reach the query. Hardcoded, the pager moves and the rows never change.
    setup({ usePnlAwbDrilldown: q({ data: { data: [], total: 120 } }) })
    render(<PnlAnalyticsView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    const last = pnl.usePnlAwbDrilldown.mock.calls.at(-1)
    expect(last).toEqual([filter, 2, undefined, 50])
  })

  it('gates the Operations section on read.sla specifically, not on any held permission', () => {
    // An account with other P&L permissions but not read.sla must still send no SLA request.
    setup({}, ['read.pnl', 'read.route_group'])
    render(<PnlAnalyticsView {...props} />)
    expect(analytics.useAnalyticsSla).toHaveBeenCalledWith(filter, false)
    expect(analytics.useAnalyticsOffloaded).toHaveBeenCalledWith(filter, false)
    expect(screen.getByTestId('analytics-ops-permission')).toBeInTheDocument()
  })
})
