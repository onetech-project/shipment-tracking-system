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
import { PnlDailyMatrixColumn } from '@/features/pnl/hooks/usePnl'

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

import PnlPage from './page'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useRouter } from 'next/navigation'
import { usePnlCycles, usePnlSummary } from '@/features/pnl/hooks/usePnl'

describe('PnlPage click-through from Daily Report to Estimated drilldown', () => {
  beforeAll(() => {
    // jsdom implements neither; the click handler calls scrollIntoView inside a rAF callback.
    window.requestAnimationFrame = jest.fn()
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: {
        id: '1',
        username: 'u',
        organizationId: 'o',
        isSuperAdmin: false,
        roles: [],
        permissions: ['read.pnl'],
      },
      loading: false,
    })
    ;(usePermissions as jest.Mock).mockReturnValue({ hasPermission: () => true })
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
    render(<PnlPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fake cell' }))

    expect(screen.getByRole('button', { name: 'Estimated' })).toHaveClass('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify(routeFromCell(CELL_COLUMN, CELL_DATE)),
    )
  })
})
