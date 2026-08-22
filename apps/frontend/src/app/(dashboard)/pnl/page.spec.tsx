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
// onCellClick(column, date) callback a real body-cell click would.
jest.mock('@/features/pnl/components/PnlDailyMatrixView', () => ({
  PnlDailyMatrixView: ({
    onCellClick,
  }: {
    onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
  }) => <button onClick={() => onCellClick?.(CELL_COLUMN, CELL_DATE)}>Fake cell</button>,
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

import PnlPage from './page'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useRouter } from 'next/navigation'
import { usePnlCycles, usePnlSummary } from '@/features/pnl/hooks/usePnl'

// Shared across every describe block below: mocks useAuth/usePermissions from a plain permission
// list (defaulting to a bare read.pnl user) and renders the page. Kept in one place so the Daily
// Report and Route Comparison click-through tests can't drift in how they stub the auth gate.
function renderPage({ permissions = ['read.pnl'] }: { permissions?: string[] } = {}) {
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
  ;(usePermissions as jest.Mock).mockReturnValue({
    hasPermission: (p: string) => permissions.includes(p),
  })
  return render(<PnlPage />)
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
  it('renders the five tabs as a wrapping gapped pill row, with no leftover separators', () => {
    const { container } = renderPage({
      permissions: ['read.pnl', 'read.route_group', 'read.vendor_group'],
    })

    const row = container.querySelector('[data-testid="pnl-view-tabs"]')!
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('gap-2')
    expect(row.className).not.toContain('overflow-hidden')

    const buttons = Array.from(row.querySelectorAll('button'))
    expect(buttons).toHaveLength(5)
    for (const button of buttons) {
      expect(button.className).toContain('rounded-md border')
      expect(button.className).not.toContain('border-l')
    }
  })
})
