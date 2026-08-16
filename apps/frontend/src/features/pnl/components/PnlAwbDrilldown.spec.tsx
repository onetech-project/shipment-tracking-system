/**
 * Unit tests for PnlAwbDrilldown. The data hooks are mocked so these tests cover rendering and
 * filter interaction only — the query layer is exercised by the backend suites.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlAwbDrilldown } from './PnlAwbDrilldown'
import { PnlAwbRow, PnlFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return {
    ...actual,
    usePnlAwbDrilldown: jest.fn(),
    usePnlAwbTos: jest.fn(() => ({ data: [], isLoading: false })),
    usePnlStations: jest.fn(() => ({ data: [] })),
  }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../hooks/usePnl')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

function row(overrides: Partial<PnlAwbRow> = {}): PnlAwbRow {
  return {
    awb: '888-1', vendor: 'ESP', airline: 'Citilink CGK',
    origin: 'Jabo', dest: 'Tanjung Pinang', date: '2026-05-01',
    originVaries: false, destVaries: false, dateVaries: false,
    toCount: 1, sumGw: 10, chwt: 12, totalRevenue: 100, totalDiscount: 1.5,
    costSmu: 10, costRa: 5, costSgOut: 5, costSgIn: 1,
    totalCost: 21, grossProfit: 77.5, grossMarginPct: 77.5,
    hasNullCost: false, issue: null,
    ...overrides,
  }
}

function mockRows(rows: PnlAwbRow[]) {
  hooks.usePnlAwbDrilldown.mockReturnValue({
    data: { data: rows, total: rows.length },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
}

describe('PnlAwbDrilldown route columns', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders origin, destination and the date for each AWB', () => {
    mockRows([row()])
    render(<PnlAwbDrilldown filter={filter} />)
    expect(screen.getByText('Jabo')).toBeInTheDocument()
    expect(screen.getByText('Tanjung Pinang')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
  })

  it('places origin, destination and date in that column order after the AWB cell', () => {
    mockRows([row()])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td'))
    // Expander, AWB, then origin / dest / date, in that order.
    expect(cells[2].textContent).toBe('Jabo')
    expect(cells[3].textContent).toBe('Tanjung Pinang')
    expect(cells[4].textContent).toBe('2026-05-01')
  })

  it('titles the date column with the active date basis', () => {
    mockRows([row()])
    const { rerender } = render(<PnlAwbDrilldown filter={filter} />)
    expect(screen.getByRole('columnheader', { name: 'ATA Vendor WH dest' })).toBeInTheDocument()

    rerender(<PnlAwbDrilldown filter={{ ...filter, basis: 'atd_origin' }} />)
    expect(screen.getByRole('columnheader', { name: 'ATD origin' })).toBeInTheDocument()
  })

  it('marks a field whose TOs disagree and leaves uniform fields unmarked', () => {
    mockRows([row({ destVaries: true })])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const marks = container.querySelectorAll('[data-testid="varies-mark"]')
    expect(marks).toHaveLength(1)
    expect(marks[0].getAttribute('title')).toContain('berbeda')
  })

  it('renders a dash when the AWB has no origin, dest or date', () => {
    mockRows([row({ origin: null, dest: null, date: null })])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((c) => c.textContent)
    // Expander, AWB, then origin / dest / date.
    expect(cells.slice(2, 5)).toEqual(['—', '—', '—'])
  })
})
