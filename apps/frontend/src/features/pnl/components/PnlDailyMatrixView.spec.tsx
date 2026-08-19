/**
 * Verifies that a cell click reaches the page: the view is the only hop between PnlMatrixTable
 * and the page-level route state, so this is where the wiring is worth pinning.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlDailyMatrixView } from './PnlDailyMatrixView'
import { PnlDailyMatrix, PnlFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlDailyMatrix: jest.fn() }
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

describe('PnlDailyMatrixView', () => {
  it('forwards a cell click from either table with its column and date', () => {
    hooks.usePnlDailyMatrix.mockReturnValue({
      data: matrix, isLoading: false, isError: false, refetch: jest.fn(),
    })
    const onCellClick = jest.fn()
    const { container } = render(<PnlDailyMatrixView filter={filter} onCellClick={onCellClick} />)

    // Two tables (revenue, margin) × two columns = four clickable body cells.
    const buttons = container.querySelectorAll('tbody button')
    expect(buttons).toHaveLength(4)

    fireEvent.click(buttons[0])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[0], '2026-07-01')

    fireEvent.click(buttons[3])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[1], '2026-07-01')
  })
})
