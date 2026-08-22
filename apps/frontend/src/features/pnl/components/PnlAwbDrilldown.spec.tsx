/**
 * Unit tests for PnlAwbDrilldown. The data hooks are mocked so these tests cover rendering and
 * filter interaction only — the query layer is exercised by the backend suites.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlAwbDrilldown } from './PnlAwbDrilldown'
import { PnlAwbRow, PnlFilter, PnlRouteFilter } from '../hooks/usePnl'

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

describe('PnlAwbDrilldown overhang note', () => {
  beforeEach(() => jest.clearAllMocks())

  const overhangText =
    '2 AWB di halaman ini punya TO di luar filter — umumnya tanggal ATA yang berbeda. Angka barisnya mencakup seluruh TO milik AWB itu, jadi totalnya bisa lebih besar dari cell yang diklik.'

  it('shows the note with the varying-row count when a route filter is active', () => {
    mockRows([
      row({ awb: '1', dateVaries: true }),
      row({ awb: '2', destVaries: true }),
      row({ awb: '3' }),
    ])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }}
        onRouteChange={jest.fn()}
      />,
    )
    expect(screen.getByText(overhangText)).toBeInTheDocument()
  })

  it('does not show the note when no route filter is active, even with varying rows', () => {
    mockRows([row({ awb: '1', dateVaries: true }), row({ awb: '2', destVaries: true })])
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    expect(screen.queryByText(overhangText)).not.toBeInTheDocument()
    expect(screen.queryByText(/punya TO di luar filter/)).not.toBeInTheDocument()
  })

  it('does not show the note when a filter is active but no row varies', () => {
    mockRows([row({ awb: '1' }), row({ awb: '2' })])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }}
        onRouteChange={jest.fn()}
      />,
    )
    expect(screen.queryByText(/punya TO di luar filter/)).not.toBeInTheDocument()
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

  it('passes the route filter through to the drilldown hook', () => {
    const route: PnlRouteFilter = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }
    render(<PnlAwbDrilldown filter={filter} route={route} onRouteChange={jest.fn()} />)
    expect(hooks.usePnlAwbDrilldown).toHaveBeenCalledWith(filter, 1, route)
  })

  it('reports date changes', () => {
    const onRouteChange = jest.fn()
    const route: PnlRouteFilter = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }
    render(<PnlAwbDrilldown filter={filter} route={route} onRouteChange={onRouteChange} />)
    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-05-03' } })
    expect(onRouteChange).toHaveBeenCalledWith({ ...route, dateFrom: '2026-05-03' })

    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-05-10' } })
    expect(onRouteChange).toHaveBeenCalledWith({ ...route, dateTo: '2026-05-10' })
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
      <PnlAwbDrilldown
        filter={filter}
        route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }}
        onRouteChange={onRouteChange}
      />,
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
      <PnlAwbDrilldown
        filter={filter}
        route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }}
        onRouteChange={jest.fn()}
      />,
    )
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument()
  })
})

describe('PnlAwbDrilldown route filter', () => {
  beforeEach(() => jest.clearAllMocks())

  const stations = [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar' },
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ]

  function renderWith(route: PnlRouteFilter, onRouteChange = jest.fn()) {
    hooks.usePnlStations.mockReturnValue({ data: stations })
    mockRows([])
    render(<PnlAwbDrilldown filter={filter} route={route} onRouteChange={onRouteChange} />)
    return onRouteChange
  }

  it('lists every station pair with both stations named as the data stores them', () => {
    renderWith({})
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Jabo → Denpasar')).toBeInTheDocument()
    expect(screen.getByText('Surabaya → Pontianak')).toBeInTheDocument()
    // Not the airport-code form, which belongs to the matrix header.
    expect(screen.queryByText('CGK → Denpasar')).not.toBeInTheDocument()
  })

  it('reports a ticked route back as a pair, appending to the existing selection', () => {
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Denpasar/ }))
    expect(onRouteChange).toHaveBeenCalledWith({
      routes: [
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Jabo', dest: 'Denpasar' },
      ],
    })
  })

  it('shows the currently filtered routes as ticked', () => {
    renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Jabo → Aceh')
  })

  it('drops the routes key entirely when the last route is unticked', () => {
    // An empty array would still serialise as a filter that matches nothing; undefined means
    // "no route filter", which is what unticking everything asks for.
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Aceh/ }))
    expect(onRouteChange).toHaveBeenCalledWith({ routes: undefined })
  })

  it('resets routes and dates together', () => {
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }], dateFrom: '2026-05-01' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })
})

describe('PnlAwbDrilldown vendor filter', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows each active vendor as a chip', () => {
    mockRows([row()])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ vendors: ['ESP', 'Angkasa Kargo'] }}
        onRouteChange={jest.fn()}
      />,
    )

    expect(screen.getByTestId('vendor-chip-ESP')).toHaveTextContent('ESP')
    expect(screen.getByTestId('vendor-chip-Angkasa Kargo')).toHaveTextContent('Angkasa Kargo')
  })

  it('drops one vendor without disturbing the rest of the filter', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ vendors: ['ESP', 'Angkasa Kargo'], dateFrom: '2026-05-01' }}
        onRouteChange={onRouteChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))

    expect(onRouteChange).toHaveBeenCalledWith({
      vendors: ['Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
  })

  // Empty means "no filter": routeToParams drops empty fields, and an empty array would otherwise
  // be serialised as a filter that matches nothing.
  it('removes the key entirely when the last vendor is dropped', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={onRouteChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))

    expect(onRouteChange).toHaveBeenCalledWith({ vendors: undefined })
  })

  // Without this, a drilldown opened from a vendor cell would show no Reset at all, and the hidden
  // vendor filter would survive every route and date edit because both handlers spread ...route.
  it('turns Reset on when only vendors are set, and Reset clears them', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={onRouteChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })

  it('warns that these numbers will not equal the cell that opened them', () => {
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={jest.fn()} />,
    )

    expect(screen.getByTestId('vendor-scope-note')).toHaveTextContent(/weight_share/)
  })

  it('says nothing about vendors when no vendor filter is active', () => {
    mockRows([row()])
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)

    expect(screen.queryByTestId('vendor-scope-note')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('preserves vendor filter through a date edit', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ vendors: ['ESP', 'Angkasa Kargo'], dateFrom: '2026-05-01' }}
        onRouteChange={onRouteChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-05-10' } })

    expect(onRouteChange).toHaveBeenCalledWith({
      vendors: ['ESP', 'Angkasa Kargo'],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-10',
    })
  })
})
