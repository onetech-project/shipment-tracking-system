/**
 * Unit tests for PnlAwbDrilldown. The data hooks are mocked so these tests cover rendering and
 * filter interaction only — the query layer is exercised by the backend suites.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    expect(screen.getByText('Jabo')).toBeInTheDocument()
    expect(screen.getByText('Tanjung Pinang')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
  })

  it('places origin, destination and date in that column order after the AWB cell', () => {
    mockRows([row()])
    const { container } = render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td'))
    // Expander, AWB, then origin / dest / date, in that order.
    expect(cells[2].textContent).toBe('Jabo')
    expect(cells[3].textContent).toBe('Tanjung Pinang')
    expect(cells[4].textContent).toBe('2026-05-01')
  })

  it('titles the date column with the active date basis', () => {
    mockRows([row()])
    const { rerender } = render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    expect(screen.getByRole('columnheader', { name: 'ATA Vendor WH dest' })).toBeInTheDocument()

    rerender(<PnlAwbDrilldown filter={{ ...filter, basis: 'atd_origin' }} route={{}} onRouteChange={jest.fn()} />)
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
      const { container } = render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
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
    const { container } = render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((c) => c.textContent)
    // Expander, AWB, then origin / dest / date.
    expect(cells.slice(2, 5)).toEqual(['—', '—', '—'])
  })
})

describe('PnlAwbDrilldown filter section', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hooks.usePnlStations.mockReturnValue({
      data: [
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
      ],
    })
    mockRows([row()])
  })

  it('offers every distinct origin once', () => {
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const origin = screen.getByLabelText('Origin') as HTMLSelectElement
    expect(Array.from(origin.options).map((o) => o.value)).toEqual(['', 'Jabo', 'Surabaya'])
  })

  it('lists every destination until an origin narrows it', () => {
    const { rerender } = render(
      <PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />,
    )
    const all = screen.getByLabelText('Destination') as HTMLSelectElement
    expect(Array.from(all.options).map((o) => o.value)).toEqual(['', 'Aceh', 'Pontianak', 'Tanjung Pinang'])

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ origin: 'Surabaya' }} onRouteChange={jest.fn()} />,
    )
    const narrowed = screen.getByLabelText('Destination') as HTMLSelectElement
    expect(Array.from(narrowed.options).map((o) => o.value)).toEqual(['', 'Pontianak'])
  })

  it('reports an origin choice and clears a destination that no longer belongs to it', () => {
    const onRouteChange = jest.fn()
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ origin: 'Jabo', dest: 'Aceh' }}
        onRouteChange={onRouteChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'Surabaya' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: 'Surabaya', dest: undefined })
  })

  it('converts a cleared field back to undefined, not an empty string', () => {
    const onRouteChange = jest.fn()
    render(<PnlAwbDrilldown filter={filter} route={{ origin: 'Jabo' }} onRouteChange={onRouteChange} />)
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: '' } })
    const [reported] = onRouteChange.mock.calls[0]
    expect(reported.origin).toBeUndefined()
  })

  it('keeps a destination that still applies when the origin is widened back to Semua', () => {
    const onRouteChange = jest.fn()
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ origin: 'Jabo', dest: 'Aceh' }}
        onRouteChange={onRouteChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: '' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: undefined, dest: 'Aceh' })
  })

  it('passes the route filter through to the drilldown hook', () => {
    render(<PnlAwbDrilldown filter={filter} route={{ origin: 'Jabo' }} onRouteChange={jest.fn()} />)
    expect(hooks.usePnlAwbDrilldown).toHaveBeenCalledWith(filter, 1, { origin: 'Jabo' })
  })

  it('reports date changes', () => {
    const onRouteChange = jest.fn()
    render(<PnlAwbDrilldown filter={filter} route={{ origin: 'Jabo' }} onRouteChange={onRouteChange} />)
    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-05-03' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: 'Jabo', dateFrom: '2026-05-03' })

    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-05-10' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: 'Jabo', dateTo: '2026-05-10' })
  })

  it('bounds the date inputs to the active cycle', () => {
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const from = screen.getByLabelText('Dari') as HTMLInputElement
    const to = screen.getByLabelText('Sampai') as HTMLInputElement
    expect(from.min).toBe('2026-05-01')
    expect(from.max).toBe('2026-05-15')
    expect(to.min).toBe('2026-05-01')
    expect(to.max).toBe('2026-05-15')
  })

  it('caps Dari at Sampai and floors Sampai at Dari when both are set', () => {
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ dateFrom: '2026-05-05', dateTo: '2026-05-10' }}
        onRouteChange={jest.fn()}
      />,
    )
    const from = screen.getByLabelText('Dari') as HTMLInputElement
    const to = screen.getByLabelText('Sampai') as HTMLInputElement
    expect(from.max).toBe('2026-05-10')
    expect(to.min).toBe('2026-05-05')
  })

  it('shows Reset only while a filter is active, and clears everything', () => {
    const onRouteChange = jest.fn()
    const { rerender } = render(
      <PnlAwbDrilldown filter={filter} route={{}} onRouteChange={onRouteChange} />,
    )
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ dest: 'Aceh' }} onRouteChange={onRouteChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })

  it('resets to page 1 when the route filter changes', () => {
    hooks.usePnlAwbDrilldown.mockReturnValue({
      data: { data: [row()], total: 60 },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    const { rerender } = render(
      <PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText('Page 2 / 2')).toBeInTheDocument()

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ origin: 'Jabo' }} onRouteChange={jest.fn()} />,
    )
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument()
  })
})
