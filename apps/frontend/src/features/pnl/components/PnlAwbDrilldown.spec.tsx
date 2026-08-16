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

  it.each([
    { originVaries: true, destVaries: false, dateVaries: false, marked: 'origin' },
    { originVaries: false, destVaries: true, dateVaries: false, marked: 'dest' },
    { originVaries: false, destVaries: false, dateVaries: true, marked: 'date' },
  ] as const)(
    'marks only the $marked cell when only $marked varies',
    ({ originVaries, destVaries, dateVaries, marked }) => {
      mockRows([row({ originVaries, destVaries, dateVaries })])
      const { container } = render(<PnlAwbDrilldown filter={filter} />)
      const cells = Array.from(container.querySelectorAll('tbody tr td'))
      // Expander, AWB, then origin / dest / date, in that order.
      const [originCell, destCell, dateCell] = [cells[2], cells[3], cells[4]]
      const cellsByField = { origin: originCell, dest: destCell, date: dateCell }

      const allMarks = container.querySelectorAll('[data-testid="varies-mark"]')
      expect(allMarks).toHaveLength(1)
      expect(allMarks[0].getAttribute('title')).toContain('berbeda')

      const markedCell = cellsByField[marked]
      expect(markedCell.querySelector('[data-testid="varies-mark"]')).not.toBeNull()

      for (const [field, cell] of Object.entries(cellsByField)) {
        if (field === marked) continue
        expect(cell.querySelector('[data-testid="varies-mark"]')).toBeNull()
      }
    },
  )

  it('renders a dash when the AWB has no origin, dest or date', () => {
    mockRows([row({ origin: null, dest: null, date: null })])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((c) => c.textContent)
    // Expander, AWB, then origin / dest / date.
    expect(cells.slice(2, 5)).toEqual(['—', '—', '—'])
  })
})
