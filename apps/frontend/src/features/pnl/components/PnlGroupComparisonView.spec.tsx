import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonView } from './PnlGroupComparisonView'
import { PnlFilter, PnlGroupComparison } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => ({
  ...jest.requireActual('../hooks/usePnl'),
  usePnlGroupComparison: jest.fn(),
}))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(),
}))

import { usePnlGroupComparison } from '../hooks/usePnl'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

const route = (dest: string) => ({ origin: 'Jabo', originLabel: 'CGK', dest })

beforeEach(() => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'Kalimantan', description: null, routes: [route('Balikpapan'), route('Batam')] },
      { id: 'g2', name: 'Sumatera', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  ;(usePnlGroupComparison as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
})

it('asks the user to pick a group before showing any table', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByText(/pilih minimal satu group/i)).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('lists every group as a checkbox with its route count', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByLabelText(/Kalimantan/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Sumatera/)).toBeInTheDocument()
})

// The columns are independent by design, so a shared route lands in both and the columns do not
// sum to a period total. Saying so stops the table being read as a partition.
it('warns when the selected groups share a route', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/Kalimantan/))
  fireEvent.click(screen.getByLabelText(/Sumatera/))

  expect(screen.getByText(/CGK → Batam/)).toBeInTheDocument()
  expect(screen.getByText(/Kalimantan, Sumatera/)).toBeInTheDocument()
})

it('does not warn when the selected groups are disjoint', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'A', description: null, routes: [route('Aceh')] },
      { id: 'g2', name: 'B', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/A/))
  fireEvent.click(screen.getByLabelText(/B/))

  expect(screen.queryByText(/berbagi/i)).not.toBeInTheDocument()
})

it('tells the user when no groups exist yet', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({ data: [], isLoading: false })
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByText(/belum ada route group/i)).toBeInTheDocument()
})

// Finding 1: GET /route-groups is guarded by read.route_group, so a user without it gets a 403,
// not an empty list. Before this branch existed, `data` stayed undefined and fell into the
// "no groups exist yet" empty state above — a false claim, next to a dead link into a page that
// immediately redirects such a user back to /dashboard.
it('tells the user loading Route Groups failed, distinct from the empty-groups message', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: jest.fn(),
  })
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.queryByText(/belum ada route group/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /buat satu dulu/i })).not.toBeInTheDocument()
  expect(screen.getByText(/failed to load route groups/i)).toBeInTheDocument()
})

// A realistic backend payload: two columns, two date rows (one row has a null cell for a group
// with no shipments that day), and a footer with both a Total and an Avg / Day entry. This is the
// only test that lets data flow through toComparisonTable into the real PnlGroupComparisonTable —
// every other test in this file mocks usePnlGroupComparison with data: undefined.
const comparisonData: PnlGroupComparison = {
  columns: [
    { id: 'g1', name: 'Kalimantan', routeCount: 2 },
    { id: 'g2', name: 'Sumatera', routeCount: 1 },
  ],
  rows: [
    {
      date: '2026-05-01',
      cells: [
        {
          revenue: 1500000,
          cost: 900000,
          costSmu: 400000,
          costRa: 300000,
          costSgOut: 100000,
          costSgIn: 100000,
          incompleteTos: 0,
        },
        null,
      ],
    },
    {
      date: '2026-05-02',
      cells: [
        {
          revenue: 2000000,
          cost: 1000000,
          costSmu: 500000,
          costRa: 300000,
          costSgOut: 100000,
          costSgIn: 100000,
          incompleteTos: 1,
        },
        {
          revenue: 800000,
          cost: 400000,
          costSmu: 200000,
          costRa: 100000,
          costSgOut: 50000,
          costSgIn: 50000,
          incompleteTos: 0,
        },
      ],
    },
  ],
  footer: [
    {
      totalRevenue: 3500000,
      totalCost: 1900000,
      totalCostSmu: 900000,
      totalCostRa: 600000,
      totalCostSgOut: 200000,
      totalCostSgIn: 200000,
      avgRevenuePerDay: 1750000,
      avgCostPerDay: 950000,
      incompleteTos: 1,
    },
    {
      totalRevenue: 800000,
      totalCost: 400000,
      totalCostSmu: 200000,
      totalCostRa: 100000,
      totalCostSgOut: 50000,
      totalCostSgIn: 50000,
      avgRevenuePerDay: 800000,
      avgCostPerDay: 400000,
      incompleteTos: 0,
    },
  ],
  periodDays: 2,
}

it('renders the comparison table from a real payload via toComparisonTable', () => {
  ;(usePnlGroupComparison as jest.Mock).mockReturnValue({
    data: comparisonData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  render(<PnlGroupComparisonView filter={filter} />)

  // Selecting groups only drives the mocked hook's arguments here — its return value is fixed
  // above — but the table only renders once selectedIds is non-empty.
  fireEvent.click(screen.getByLabelText(/Kalimantan/))
  fireEvent.click(screen.getByLabelText(/Sumatera/))

  const table = screen.getByRole('table')
  // Each group name must appear twice: once as the Revenue block header, once as the Cost block
  // header. A prop-shape regression (e.g. passing raw data instead of toComparisonTable(data))
  // would either throw or leave these headers empty.
  expect(within(table).getAllByText('Kalimantan')).toHaveLength(2)
  expect(within(table).getAllByText('Sumatera')).toHaveLength(2)

  // A known body value from the payload, formatted by the real table component.
  expect(screen.getByTestId('revenue-2026-05-01-g1')).toHaveTextContent('1.500.000')
  // The null cell for g2 on 2026-05-01 renders as the missing-value marker, not a blank or a 0.
  expect(screen.getByTestId('revenue-2026-05-01-g2')).toHaveTextContent('—')

  // The footer carries both rows the projection always produces.
  expect(within(table).getByText('Total')).toBeInTheDocument()
  expect(within(table).getByText('Avg / Day')).toBeInTheDocument()
  expect(screen.getByText('1.750.000')).toBeInTheDocument() // g1 avgRevenuePerDay
})

// Finding 2: Revenue here is SUM(revenue_total), gross — revenue_discount is never subtracted —
// while Daily Report's Margin does subtract it. Revenue sits right beside Cost in this table, so
// without a caption the obvious (wrong) reading is to subtract one column from the other.
it('captions the table to say Revenue is gross and not meant to be subtracted from Cost', () => {
  ;(usePnlGroupComparison as jest.Mock).mockReturnValue({
    data: comparisonData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/Kalimantan/))

  expect(screen.getByText(/bruto/i)).toBeInTheDocument()
  expect(screen.getByText(/tidak dimaksudkan untuk dikurangkan/i)).toBeInTheDocument()
})

it('sends selected group ids to usePnlGroupComparison in click order, moving a reselected group to the end', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  const latestSelectedIds = () => {
    const calls = (usePnlGroupComparison as jest.Mock).mock.calls
    return calls[calls.length - 1][1]
  }

  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // g1
  fireEvent.click(screen.getByLabelText(/Sumatera/)) // g2
  expect(latestSelectedIds()).toEqual(['g1', 'g2'])

  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // deselect g1
  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // reselect g1 -> appended, not resorted
  expect(latestSelectedIds()).toEqual(['g2', 'g1'])
})
