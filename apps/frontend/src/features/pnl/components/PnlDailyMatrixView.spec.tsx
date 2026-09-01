/**
 * Verifies that a cell click reaches the page: the view is the only hop between PnlMatrixTable
 * and the page-level route state, so this is where the wiring is worth pinning.
 */
import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlDailyMatrixView } from './PnlDailyMatrixView'
import { PnlDailyMatrix, PnlFilter, PnlRoutePair } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlDailyMatrix: jest.fn(), usePnlRoutes: jest.fn() }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../hooks/usePnl')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-07-1H', basis: 'ata_vendor_wh_destination' }

const matrix: PnlDailyMatrix = {
  columns: [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ],
  rows: [
    { date: '2026-07-01', cells: [{ revenue: 100, margin: 10, weight: 1, incompleteTos: 0, issues: [] }, null] },
  ],
  footer: [
    { totalRevenue: 100, totalMargin: 10, totalWeight: 1, avgRevenuePerDay: 100,
      avgMarginPerDay: 10, marginPct: 10, spacePerKg: 10, incompleteTos: 0, issues: [] },
    { totalRevenue: 0, totalMargin: 0, totalWeight: 0, avgRevenuePerDay: 0,
      avgMarginPerDay: 0, marginPct: null, spacePerKg: null, incompleteTos: 0, issues: [] },
  ],
  periodDays: 1,
}

// The DC-pair master the filter is built from. Deliberately wider than the matrix: it carries a
// route that has no shipments in the period, which is exactly the case the em-dash column answers.
const routes = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Manokwari' },
]

function renderView(picks: PnlRoutePair[] = [], onPicksChange = jest.fn(), onCellClick = jest.fn()) {
  return render(
    <PnlDailyMatrixView
      filter={filter}
      picks={picks}
      onPicksChange={onPicksChange}
      onCellClick={onCellClick}
    />,
  )
}

beforeEach(() => {
  hooks.usePnlDailyMatrix.mockReturnValue({
    data: matrix, isLoading: false, isError: false, refetch: jest.fn(),
  })
  hooks.usePnlRoutes.mockReturnValue({ data: routes })
})

describe('PnlDailyMatrixView', () => {
  it('forwards a cell click from either table with its column and date', () => {
    const onCellClick = jest.fn()
    const { container } = renderView([], jest.fn(), onCellClick)

    // Two tables (revenue, margin) × two columns = four clickable body cells.
    const buttons = container.querySelectorAll('tbody button')
    expect(buttons).toHaveLength(4)

    fireEvent.click(buttons[0])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[0], '2026-07-01')

    fireEvent.click(buttons[3])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[1], '2026-07-01')
  })

  // The dropdown lists the DC-pair master, not the matrix columns, so a route that has never
  // flown in this period can still be picked. Origins are named by airport code to match the
  // matrix headers the filter sits above.
  it('offers every route from the master, labelled by airport code', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /all routes/i }))

    expect(screen.getByLabelText('CGK → Tanjung Pinang')).toBeInTheDocument()
    expect(screen.getByLabelText('SUB → Pontianak')).toBeInTheDocument()
    expect(screen.getByLabelText('CGK → Manokwari')).toBeInTheDocument()
  })

  it('reports a ticked route back as its raw pair, not its label', () => {
    const onPicksChange = jest.fn()
    renderView([], onPicksChange)
    fireEvent.click(screen.getByRole('button', { name: /all routes/i }))
    fireEvent.click(screen.getByLabelText('SUB → Pontianak'))

    expect(onPicksChange).toHaveBeenCalledWith([{ origin: 'Surabaya', dest: 'Pontianak' }])
  })

  it('ticks the routes already picked', () => {
    renderView([{ origin: 'Surabaya', dest: 'Pontianak' }])
    // By haspopup, not by name: with one route picked the trigger names itself after that route,
    // which would also match the checkbox's label.
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByLabelText('SUB → Pontianak')).toBeChecked()
    expect(screen.getByLabelText('CGK → Tanjung Pinang')).not.toBeChecked()
  })

  it('shows every column while nothing is picked', () => {
    const { container } = renderView()
    expect(container.querySelectorAll('tbody button')).toHaveLength(4)
  })

  it('narrows both tables to the picked routes', () => {
    const { container } = renderView([{ origin: 'Jabo', dest: 'Tanjung Pinang' }])

    // One column left, in two tables.
    expect(container.querySelectorAll('tbody button')).toHaveLength(2)
    expect(screen.queryByText('Pontianak')).not.toBeInTheDocument()
  })

  // The click has to carry the column the user actually clicked, which after filtering is no
  // longer at its original index — the bug a naive filter would introduce.
  it('forwards the filtered column, not the one at its old index', () => {
    const onCellClick = jest.fn()
    const { container } = renderView([{ origin: 'Surabaya', dest: 'Pontianak' }], jest.fn(), onCellClick)

    fireEvent.click(container.querySelectorAll('tbody button')[0])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[1], '2026-07-01')
  })

  // A picked route with no shipments this period is a real answer — an empty column — not a
  // reason to hide the report.
  it('keeps a picked route with no data as an empty column', () => {
    const { container } = renderView([{ origin: 'Jabo', dest: 'Manokwari' }])

    expect(screen.getAllByText('Manokwari').length).toBeGreaterThan(0)
    expect(screen.queryByText('No route data available.')).not.toBeInTheDocument()
    // Present but empty — an em-dash in every body cell of both tables. Still clickable, like any
    // other cell: the drilldown it opens reporting no AWBs is the same answer the dash gives.
    const cells = [...container.querySelectorAll('tbody button')]
    expect(cells).toHaveLength(2)
    expect(cells.map((c) => c.textContent)).toEqual(['—', '—'])
  })
})
