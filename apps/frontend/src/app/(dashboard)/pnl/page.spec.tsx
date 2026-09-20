/**
 * Pins the click-through wiring between a Daily Report cell and the AWB Drilldown: without it, a
 * clicked cell can silently do nothing (the view stays on Daily Report) or land the drilldown on
 * the wrong route with no visible symptom.
 *
 * This is the first spec in the repo to render a page behind the auth/permission gate, so it
 * mocks exactly what this scenario touches: useAuth, usePermissions, next/navigation, the two PnL
 * hooks page.tsx calls directly, and the child components that are irrelevant to this wiring.
 * Those children have their own specs and each pull in real data hooks that would need a live
 * QueryClient/API to render — stubbing them keeps this test about the page's own state, not theirs.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { routeFromCell } from '@/features/pnl/utils/dailyMatrix'
import { PnlDailyMatrixColumn, PnlRouteFilter } from '@/features/pnl/hooks/usePnl'

jest.mock('@/features/auth/auth.context', () => ({
  useAuth: jest.fn(),
}))
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: jest.fn(),
}))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))
jest.mock('@/features/pnl/hooks/usePnl', () => {
  const actual = jest.requireActual('@/features/pnl/hooks/usePnl')
  return { ...actual, usePnlCycles: jest.fn(), usePnlSummary: jest.fn() }
})

// These sit inside the Estimated view alongside the drilldown but play no part in the
// click-through wiring; stubbing them avoids needing a live QueryClient/API just to mount them.
jest.mock('@/features/pnl/components/PnlKpiCards', () => ({ PnlKpiCards: () => null }))
jest.mock('@/features/pnl/components/PnlDailyMarginChart', () => ({ PnlDailyMarginChart: () => null }))
jest.mock('@/features/pnl/components/PnlBreakdownPanel', () => ({ PnlBreakdownPanel: () => null }))
jest.mock('@/features/pnl/components/PnlDataQuality', () => ({ PnlDataQuality: () => null }))
jest.mock('@/features/pnl/components/PnlFormulaPanel', () => ({ PnlFormulaPanel: () => null }))
jest.mock('@/features/pnl-settlement/components/SettlementView', () => ({ SettlementView: () => null }))

const CELL_COLUMN: PnlDailyMatrixColumn = { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' }
const CELL_DATE = '2026-05-01'

// A minimal stand-in for the real matrix table: one button that fires the same
// onCellClick(column, date) callback a real body-cell click would, plus its OWN group prop echoed
// back so a test can prove the Daily Report's group is not the Estimated tab's.
jest.mock('@/features/pnl/components/PnlDailyMatrixView', () => ({
  PnlDailyMatrixView: ({
    onCellClick,
    groupId,
    onGroupChange,
  }: {
    onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
    groupId: string | undefined
    onGroupChange: (id: string | undefined) => void
  }) => (
    <div>
      <button onClick={() => onCellClick?.(CELL_COLUMN, CELL_DATE)}>Fake cell</button>
      <div data-testid="daily-group">{String(groupId)}</div>
      <button onClick={() => onGroupChange('gDaily')}>Pick daily group</button>
    </div>
  ),
}))

// Renders the scope and group it received as text, plus buttons that drive the same callbacks the
// real filter bar's controls would — the page owns this state, so the mock has to echo it back or
// the lifted state would be unobservable from this spec.
jest.mock('@/features/pnl/components/PnlEstimateFilterBar', () => ({
  PnlEstimateFilterBar: ({
    scope,
    groupId,
    onScopeChange,
    onGroupChange,
  }: {
    scope: Record<string, unknown>
    groupId: string | undefined
    onScopeChange: (next: Record<string, unknown>) => void
    onGroupChange: (id: string | undefined) => void
  }) => (
    <div>
      <div data-testid="filter-bar-scope">{JSON.stringify(scope)}</div>
      <div data-testid="filter-bar-group">{String(groupId)}</div>
      <button onClick={() => onScopeChange({ vendors: ['ESP'] })}>Set vendor scope</button>
      <button onClick={() => onGroupChange('g1')}>Pick group</button>
    </div>
  ),
}))

// Renders the route it received as text so the test can assert on it without reaching into props.
jest.mock('@/features/pnl/components/PnlAwbDrilldown', () => ({
  PnlAwbDrilldown: ({ route }: { route: Record<string, string | undefined> }) => (
    <div data-testid="drilldown-route">{JSON.stringify(route)}</div>
  ),
}))

const COMPARISON_CELL_ROUTE: PnlRouteFilter = {
  routes: [{ origin: 'Jabo', dest: 'Aceh' }],
  dateFrom: '2026-05-01',
  dateTo: '2026-05-01',
}

// A minimal stand-in for the real comparison table: one button that fires the same
// onCellClick(route) callback a real value-cell click would (already projected to a route filter),
// plus a node reporting the `picks` prop it was handed — the page now owns that state (Task 7), so
// this mock has to echo it back or the lifted state would be unobservable from this spec.
jest.mock('@/features/pnl/components/PnlRouteComparisonView', () => ({
  PnlRouteComparisonView: ({
    picks,
    onPicksChange,
    onCellClick,
  }: {
    picks: { kind: string }[]
    onPicksChange?: (next: { kind: string }[]) => void
    onCellClick?: (route: PnlRouteFilter) => void
  }) => (
    <div>
      <div data-testid="route-comparison-view">{`picks:${picks.length}`}</div>
      {/* Drives the page's lifted state the same way a real checkbox click would, so the
          persistence test below can prove the count survives a tab switch rather than just
          observing the untouched initial value. */}
      <button onClick={() => onPicksChange?.([...picks, { kind: 'route' }])}>add-pick</button>
      <button onClick={() => onCellClick?.(COMPARISON_CELL_ROUTE)}>comparison-cell</button>
    </div>
  ),
}))

const VENDOR_CELL_ROUTE: PnlRouteFilter = {
  routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
  vendors: ['ESP'],
  dateFrom: '2026-05-01',
  dateTo: '2026-05-15',
}

// Same shape of mock as PnlRouteComparisonView above: renders the `picks` prop it was handed (the
// page owns this state, so the mock has to echo it back or the lifted state would be unobservable
// from this spec) and offers a fake cell that fires onCellClick with a route already projected.
jest.mock('@/features/pnl/components/PnlVendorComparisonView', () => ({
  PnlVendorComparisonView: ({
    picks,
    onPicksChange,
    onCellClick,
  }: {
    picks: { kind: string }[]
    onPicksChange: (next: { kind: string; name: string }[]) => void
    onCellClick?: (route: PnlRouteFilter) => void
  }) => (
    <div data-testid="vendor-comparison-view">
      <span data-testid="vendor-picks">{`picks:${picks.length}`}</span>
      <button onClick={() => onPicksChange([{ kind: 'vendor', name: 'ESP' }])}>pick-vendor</button>
      <button onClick={() => onCellClick?.(VENDOR_CELL_ROUTE)}>vendor-cell</button>
    </div>
  ),
}))

// Same shape of mock as the comparison views above: echoes back the `scope` prop the page owns, so
// the persistence test can prove a chosen scope survives a tab switch.
jest.mock('@/features/pnl-analytics/components/PnlAnalyticsView', () => ({
  PnlAnalyticsView: ({
    scope,
    onScopeChange,
  }: {
    scope: { kind: string }
    onScopeChange: (next: { kind: string; keys: string[] }) => void
  }) => (
    <div data-testid="analytics-view">
      <span data-testid="analytics-scope">{`scope:${scope.kind}`}</span>
      <button onClick={() => onScopeChange({ kind: 'routes', keys: ['Jabo|Denpasar'] })}>
        pick-scope
      </button>
    </div>
  ),
}))

import PnlPage from './page'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { useRouter } from 'next/navigation'
import { usePnlCycles, usePnlSummary } from '@/features/pnl/hooks/usePnl'

// Every other describe block below is indifferent to route groups, so this default (undefined
// data) covers them; the group's own describe block below overrides it with a fixture. Set once
// at import time rather than per-beforeEach: jest.clearAllMocks() resets call history but not a
// mock's return value, so this survives every describe's own clearAllMocks() call.
;(useRouteGroups as jest.Mock).mockReturnValue({ data: undefined })

// Backs usePermissions' hasPermission so a test can change what's granted *between* renders
// (renderPage(...) then setPermissions(...) + rerender(...)) rather than only at initial mount —
// needed to reproduce a permission being revoked live while the user sits on a gated tab, which is
// how this app actually behaves (no re-login required for a role change to take effect).
//
// usePermissions is stubbed with mockImplementation (not mockReturnValue) so it's re-evaluated on
// every render, each time reading currentPermissions fresh — a fixed mockReturnValue object would
// keep returning the same hasPermission function/reference forever, which page.tsx's backstop
// effects depend on to notice anything changed.
let currentPermissions: string[] = []

// Shared across every describe block below: mocks useAuth/usePermissions from a plain permission
// list (defaulting to a bare read.pnl user) and renders the page. Kept in one place so the Daily
// Report and Route Comparison click-through tests can't drift in how they stub the auth gate.
function renderPage({ permissions = ['read.pnl'] }: { permissions?: string[] } = {}) {
  currentPermissions = permissions
  ;(useAuth as jest.Mock).mockReturnValue({
    user: {
      id: '1',
      username: 'u',
      organizationId: 'o',
      isSuperAdmin: false,
      roles: [],
      permissions,
    },
    loading: false,
  })
  ;(usePermissions as jest.Mock).mockImplementation(() => ({
    hasPermission: (p: string) => currentPermissions.includes(p),
  }))
  return render(<PnlPage />)
}

// Simulates a live permission change (e.g. a role edit taking effect without re-login): mutates
// what currentHasPermission sees. Callers must follow with rerender(<PnlPage />) — mutating this
// alone doesn't trigger React to re-render.
function setPermissions(permissions: string[]) {
  currentPermissions = permissions
}

describe('PnlPage click-through from Daily Report to Estimated drilldown', () => {
  beforeAll(() => {
    // jsdom implements neither; the click handler calls scrollIntoView inside a rAF callback.
    window.requestAnimationFrame = jest.fn()
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() })
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: {
        label: '2026-05-1H',
        totalTos: 0,
        totalAwbs: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPct: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('switches to the Estimated view and passes the clicked cell as the drilldown route', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fake cell' }))

    expect(screen.getByRole('button', { name: 'Estimated' })).toHaveClass('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify(routeFromCell(CELL_COLUMN, CELL_DATE)),
    )
  })

  // Same wiring as the Daily Report cell: without it the click leaves the user on the comparison
  // tab with nothing visibly changed.
  it('switches to Estimated and applies a clicked comparison cell as the drilldown route', () => {
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })
    fireEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))
    fireEvent.click(screen.getByRole('button', { name: 'comparison-cell' }))

    expect(screen.getByText('Estimated').className).toContain('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify({
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
      }),
    )
  })
})

// Finding 1: without this gate, a user who cannot read route groups still saw the tab button and,
// behind it, a false "no groups exist, go create one" message linking to a page that immediately
// redirects them away. The tab button is the only way `view` can become 'routes' in this page, so
// hiding it is what actually keeps such a user off the view — not just a cosmetic omission.
describe('PnlPage Route Comparison tab gating', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() })
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: {
        label: '2026-05-1H',
        totalTos: 0,
        totalAwbs: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPct: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('hides the Route Comparison tab for a user without read.route_group', () => {
    renderPage({ permissions: ['read.pnl'] })

    expect(screen.queryByRole('button', { name: 'Route Comparison' })).not.toBeInTheDocument()
  })

  it('shows the Route Comparison tab for a user with read.route_group', () => {
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })

    expect(screen.getByRole('button', { name: 'Route Comparison' })).toBeInTheDocument()
  })

  // The tabs are rendered by a ternary, so switching away from Route Comparison unmounts it. Before
  // this state was lifted to the page, that meant the view's own `picks` reset to empty on
  // remount — so this test drives a pick through the mock (rather than only checking the untouched
  // initial value) to actually prove the count survives the round trip.
  it('keeps the comparison picks when the user leaves the tab and comes back', () => {
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))
    expect(screen.getByTestId('route-comparison-view')).toHaveTextContent('picks:0')

    fireEvent.click(screen.getByRole('button', { name: 'add-pick' }))
    expect(screen.getByTestId('route-comparison-view')).toHaveTextContent('picks:1')

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))

    expect(screen.getByTestId('route-comparison-view')).toHaveTextContent('picks:1')
  })

  // The tab button is gated on read.route_group, but nothing else stops `view` from staying
  // 'routes' once set — this is the backstop effect in page.tsx (around line 118) that resets it.
  // Reproduces a role change taking effect live (no re-login) while the user is already parked on
  // the tab, which the button-click gate alone can never exercise.
  it('resets to Estimated when read.route_group is revoked while on the Route Comparison tab', () => {
    const { rerender } = renderPage({ permissions: ['read.pnl', 'read.route_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))
    expect(screen.getByRole('button', { name: 'Route Comparison' })).toHaveClass('bg-primary')

    setPermissions(['read.pnl'])
    rerender(<PnlPage />)

    expect(screen.getByRole('button', { name: 'Estimated' })).toHaveClass('bg-primary')
  })
})

describe('PnlPage Vendor Comparison tab', () => {
  beforeAll(() => {
    window.requestAnimationFrame = jest.fn()
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() })
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: {
        label: '2026-05-1H',
        totalTos: 0,
        totalAwbs: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPct: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('hides the tab from a user without read.vendor_group', () => {
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })

    expect(screen.queryByRole('button', { name: 'Vendor Comparison' })).not.toBeInTheDocument()
  })

  it('shows the tab to a user with read.vendor_group', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    expect(screen.getByRole('button', { name: 'Vendor Comparison' })).toBeInTheDocument()
  })

  it('keeps the vendor picks when the user leaves the tab and comes back', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))
    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:0')

    // Drive the page's lifted state through the mock, then leave and return.
    fireEvent.click(screen.getByRole('button', { name: 'pick-vendor' }))
    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:1')

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))

    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:1')
  })

  // Same backstop as the route tab's (page.tsx, around line 127): the tab button is gated on
  // read.vendor_group, but nothing else stops `view` from staying 'vendors' once set. Reproduces a
  // role change taking effect live (no re-login) while the user is already parked on the tab.
  it('resets to Estimated when read.vendor_group is revoked while on the Vendor Comparison tab', () => {
    const { rerender } = renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))
    expect(screen.getByRole('button', { name: 'Vendor Comparison' })).toHaveClass('bg-primary')

    setPermissions(['read.pnl'])
    rerender(<PnlPage />)

    expect(screen.getByRole('button', { name: 'Estimated' })).toHaveClass('bg-primary')
  })

  it('switches to Estimated and applies a clicked vendor cell as the drilldown route', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))
    fireEvent.click(screen.getByRole('button', { name: 'vendor-cell' }))

    expect(screen.getByText('Estimated').className).toContain('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify(VENDOR_CELL_ROUTE),
    )
  })

  // flex-wrap alone would leave the first button of the wrapped row drawing a border-l against
  // nothing, with no border-t between the two rows. The row is a gapped pill row instead.
  it('renders the six tabs as a wrapping gapped pill row, with no leftover separators', () => {
    const { container } = renderPage({
      permissions: ['read.pnl', 'read.route_group', 'read.vendor_group'],
    })

    const row = container.querySelector('[data-testid="pnl-view-tabs"]')!
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('gap-2')
    expect(row.className).not.toContain('overflow-hidden')

    const buttons = Array.from(row.querySelectorAll('button'))
    expect(buttons).toHaveLength(6)
    for (const button of buttons) {
      expect(button.className).toContain('rounded-md border')
      expect(button.className).not.toContain('border-l')
    }
  })

  // The tab needs only read.pnl — the page's own gate. Unlike Route/Vendor Comparison it is not
  // hidden from anyone who can reach the page at all.
  it('shows the Analytics tab to a user holding only read.pnl', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))

    expect(screen.getByTestId('analytics-view')).toBeInTheDocument()
    // VIEW_SUBTITLE is typed Record<PnlView, string>, so a missing entry fails tsc — but nothing
    // pins the text, and a wrong subtitle describes the tab the user is not on.
    expect(
      screen.getByText('Data health, trends, cost structure and route economics for the selected period'),
    ).toBeInTheDocument()
  })

  it('keeps the analytics scope when the user leaves the tab and comes back', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))
    // The tab opens unscoped — every route the period carries. Pinned here because without it a
    // default of any other kind would make the assertion below pass for the wrong reason.
    expect(screen.getByTestId('analytics-scope')).toHaveTextContent('scope:all')

    fireEvent.click(screen.getByRole('button', { name: 'pick-scope' }))
    expect(screen.getByTestId('analytics-scope')).toHaveTextContent('scope:routes')

    // The tab is rendered by a ternary, so leaving unmounts the view outright: only state lifted
    // to the page survives this round trip.
    fireEvent.click(screen.getByRole('button', { name: 'Estimated' }))
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))

    expect(screen.getByTestId('analytics-scope')).toHaveTextContent('scope:routes')
  })
})

describe('PnlPage estimated scope', () => {
  beforeAll(() => {
    // jsdom implements neither; the click handler calls scrollIntoView inside a rAF callback.
    window.requestAnimationFrame = jest.fn()
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() })
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: { label: '2026-05-1H' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    // Matches the 'g1' id the mocked filter bar's "Pick group" button reports below — the fixture
    // that lets the group-folding test prove estimateGroupId actually resolves to a real route.
    ;(useRouteGroups as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Test Group',
          description: null,
          routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
        },
      ],
    })
  })

  it('renders the filter bar above the drilldown', () => {
    renderPage()
    const bar = screen.getByTestId('filter-bar-scope')
    const drilldown = screen.getByTestId('drilldown-route')
    // Node.compareDocumentPosition: 4 means "follows". The filter narrows the cards and the chart
    // now, so it has to be met before them, not after.
    expect(bar.compareDocumentPosition(drilldown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hands the same scope to the filter bar and the drilldown', () => {
    renderPage()
    fireEvent.click(screen.getByText('Set vendor scope'))

    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('ESP')
  })

  // Every other test here only checks the mocked filter bar's and drilldown's rendered text, which
  // both mocks reflect back whatever `scope` prop they were given regardless of usePnlSummary. That
  // proves the scope reaches those two components, but not that it reaches the KPI cards' data
  // source. usePnlSummary is itself mocked, so its call arguments are the only way to observe what
  // the page actually passed it — without this assertion, deleting the second argument at the call
  // site would leave every other test in this block green.
  it('passes the estimate scope to usePnlSummary, so the KPI cards follow the filter', () => {
    renderPage()
    fireEvent.click(screen.getByText('Set vendor scope'))

    expect(usePnlSummary).toHaveBeenLastCalledWith(
      { mode: 'cycle', cycle: '2026-05-1H', basis: 'date' },
      { vendors: ['ESP'] },
    )
  })

  it('clears the group when a cell click replaces the scope', () => {
    renderPage()
    fireEvent.click(screen.getByText('Pick group'))
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('g1')

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByText('Fake cell'))

    // A cell click REPLACES the scope; leaving the old group on would silently widen it.
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('undefined')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('Tanjung Pinang')
  })

  it('keeps routes but drops dates when the period changes', () => {
    renderPage()
    fireEvent.click(screen.getByText('Set vendor scope'))
    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')

    // Switching the DATE BASIS is a period change that (unlike Custom Range with no dates typed
    // in) leaves `filter` defined, so the Estimated tab — and the filter bar mock inside it —
    // stays mounted to observe.
    fireEvent.change(screen.getByTitle('Date field used to assign the billing cycle / filter the range'), {
      target: { value: 'atd_origin' },
    })

    // Only a date carries the old period; a vendor, a route and a group do not — the same reason
    // routePicks and vendorPicks survive a period change.
    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')
  })

  it('drops a date that belonged to the old period', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByText('Fake cell'))
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('2026-05-01')

    fireEvent.change(screen.getByTitle('Date field used to assign the billing cycle / filter the range'), {
      target: { value: 'atd_origin' },
    })
    expect(screen.getByTestId('drilldown-route')).not.toHaveTextContent('2026-05-01')
  })

  it('gives the two tabs their own group, so one cannot move the other', () => {
    renderPage()
    fireEvent.click(screen.getByText('Pick group'))

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    expect(screen.getByTestId('daily-group')).toHaveTextContent('undefined')

    fireEvent.click(screen.getByText('Pick daily group'))
    expect(screen.getByTestId('daily-group')).toHaveTextContent('gDaily')

    fireEvent.click(screen.getByRole('button', { name: 'Estimated' }))
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('g1')
  })

  // The test above only proves the filter bar mock echoes back the groupId prop it was handed —
  // that passes even if estimateGroupId is write-only and never reaches a real query, which is
  // exactly how the Critical shipped: the page kept the group id but never folded it into the
  // scope usePnlSummary (and every other panel) actually consumes. This asserts against a real
  // call argument instead of a mock's echo.
  it('folds the chosen group into the scope the KPI cards query', () => {
    renderPage()
    fireEvent.click(screen.getByText('Pick group'))

    expect(usePnlSummary).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }),
    )
  })
})
