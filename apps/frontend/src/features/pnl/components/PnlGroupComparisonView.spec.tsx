import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonView } from './PnlGroupComparisonView'
import { PnlColumnPick, PnlFilter, PnlGroupComparison, PnlRouteFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => ({
  ...jest.requireActual('../hooks/usePnl'),
  usePnlGroupComparison: jest.fn(),
}))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(),
  useAvailableRoutes: jest.fn(),
}))

import * as hooks from '../hooks/usePnl'
import { usePnlGroupComparison } from '../hooks/usePnl'
import { useRouteGroups, useAvailableRoutes } from '@/features/route-groups/hooks/useRouteGroups'

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

const route = (dest: string) => ({ origin: 'Jabo', originLabel: 'CGK', dest })

function renderView(props: { onCellClick?: (route: PnlRouteFilter) => void } = {}) {
  render(<PnlGroupComparisonView filter={filter} {...props} />)
}

beforeEach(() => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'Kalimantan', description: null, routes: [route('Balikpapan'), route('Batam')] },
      { id: 'g2', name: 'Sumatera', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  ;(useAvailableRoutes as jest.Mock).mockReturnValue({
    data: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar', hasData: true }],
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

it('passes a clicked cell up as a route filter for that column and date', () => {
  ;(usePnlGroupComparison as jest.Mock).mockImplementation((_filter: PnlFilter, picks: PnlColumnPick[]) => {
    if (picks.length === 0) {
      return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() }
    }
    const columns = picks.map((p) =>
      p.kind === 'group'
        ? {
            id: p.id,
            name: 'Kalimantan',
            routeCount: 1,
            kind: 'group' as const,
            routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
          }
        : { id: `r:${p.origin}|${p.dest}`, name: `CGK → ${p.dest}`, routeCount: 1, kind: 'route' as const, routes: [route(p.dest)] },
    )
    const data: PnlGroupComparison = {
      columns,
      rows: [{ date: '2026-05-01', cells: columns.map(() => ({
        revenue: 1000,
        cost: 800,
        costSmu: 500,
        costRa: 100,
        costSgOut: 150,
        costSgIn: 50,
        incompleteTos: 0,
        issues: [],
      })) }],
      footer: [
        {
          totalRevenue: 1000, totalCost: 800, totalCostSmu: 500, totalCostRa: 100,
          totalCostSgOut: 150, totalCostSgIn: 50, avgRevenuePerDay: 1000, avgCostPerDay: 800,
          incompleteTos: 0, issues: [],
        },
        {
          totalRevenue: 0, totalCost: 0, totalCostSmu: 0, totalCostRa: 0,
          totalCostSgOut: 0, totalCostSgIn: 0, avgRevenuePerDay: 0, avgCostPerDay: 0,
          incompleteTos: 0, issues: [],
        },
      ],
      periodDays: 1,
    }
    return { data, isLoading: false, isError: false, refetch: jest.fn() }
  })
  const onCellClick = jest.fn()
  renderView({ onCellClick })
  fireEvent.click(screen.getByRole('checkbox', { name: /Kalimantan/ }))
  fireEvent.click(screen.getByTestId('revenue-2026-05-01-g1'))
  expect(onCellClick).toHaveBeenCalledWith({
    routes: [{ origin: 'Jabo', dest: 'Aceh' }],
    dateFrom: '2026-05-01',
    dateTo: '2026-05-01',
  })
})

// The columns are independent by design, so a shared route lands in both and the columns do not
// sum to a period total. Saying so stops the table being read as a partition. Overlap is driven by
// the response's columns (not the client-side selection), so the mock below reads its `picks`
// argument and only returns overlapping columns once picks actually warrant it — making the
// clicks below load-bearing rather than vestigial. The overlap itself comes from a bare-route pick
// (Jabo → Balikpapan) that duplicates a member of the Kalimantan group but has no entry of its own
// in the saved-groups fixture: a reverted implementation reading `selectedGroups` (built from that
// fixture) would only ever see one selected group here and could never produce this warning.
it('warns when a picked group and a picked route share a route', () => {
  ;(useAvailableRoutes as jest.Mock).mockReturnValue({
    data: [
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar', hasData: true },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Balikpapan', hasData: true },
    ],
  })
  ;(usePnlGroupComparison as jest.Mock).mockImplementation((_filter: PnlFilter, picks: PnlColumnPick[]) => {
    if (picks.length === 0) {
      return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() }
    }
    const columns = picks.map((p) =>
      p.kind === 'group'
        ? {
            id: p.id,
            name: 'Kalimantan',
            routeCount: 2,
            kind: 'group' as const,
            routes: [route('Balikpapan'), route('Batam')],
          }
        : {
            id: `r:${p.origin}|${p.dest}`,
            name: `CGK → ${p.dest}`,
            routeCount: 1,
            kind: 'route' as const,
            routes: [route(p.dest)],
          },
    )
    return { data: { columns, rows: [], footer: [], periodDays: 0 }, isLoading: false, isError: false, refetch: jest.fn() }
  })
  render(<PnlGroupComparisonView filter={filter} />)

  // Before the route pick there is only one column, so no overlap is possible yet.
  fireEvent.click(screen.getByLabelText(/Kalimantan/))
  expect(screen.queryByText(/berbagi/i)).not.toBeInTheDocument()

  // Once a column is picked, the Total row's own chevron is also an aria-expanded=false button,
  // so the route picker's toggle must be found by its position (right after the "Rute" label)
  // rather than by being the only expanded:false button on the page.
  fireEvent.click(screen.getByText('Rute').nextElementSibling!.querySelector('button')!)
  fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Balikpapan/ }))

  // The table also renders a "CGK → Balikpapan" column header, so the warning text must be
  // matched by its full sentence rather than the bare route label.
  expect(screen.getByText(/berbagi rute CGK → Balikpapan/)).toBeInTheDocument()
  expect(screen.getByText(/Kalimantan, CGK → Balikpapan berbagi/)).toBeInTheDocument()
})

// Disjoint saved groups must stay silent even once their real routes flow through the response,
// not merely because the mock never returns any columns. The mock derives columns from `picks` the
// same way the "warns" test does, so this test would catch overlap logic that fires on selection
// alone rather than on the (still disjoint) routes the picks resolve to.
it('does not warn when the selected groups are disjoint', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({
    data: [
      { id: 'g1', name: 'A', description: null, routes: [route('Aceh')] },
      { id: 'g2', name: 'B', description: null, routes: [route('Batam')] },
    ],
    isLoading: false,
  })
  const routesById: Record<string, ReturnType<typeof route>[]> = { g1: [route('Aceh')], g2: [route('Batam')] }
  const namesById: Record<string, string> = { g1: 'A', g2: 'B' }
  ;(usePnlGroupComparison as jest.Mock).mockImplementation((_filter: PnlFilter, picks: PnlColumnPick[]) => {
    if (picks.length === 0) {
      return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() }
    }
    const columns = picks.flatMap((p) =>
      p.kind === 'group'
        ? [{ id: p.id, name: namesById[p.id], routeCount: 1, kind: 'group' as const, routes: routesById[p.id] }]
        : [],
    )
    return { data: { columns, rows: [], footer: [], periodDays: 0 }, isLoading: false, isError: false, refetch: jest.fn() }
  })
  render(<PnlGroupComparisonView filter={filter} />)

  fireEvent.click(screen.getByLabelText(/A/))
  fireEvent.click(screen.getByLabelText(/B/))

  expect(screen.queryByText(/berbagi/i)).not.toBeInTheDocument()
})

it('tells the user when no groups and no routes exist yet', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({ data: [], isLoading: false })
  ;(useAvailableRoutes as jest.Mock).mockReturnValue({ data: [] })
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.getByText(/belum ada route group/i)).toBeInTheDocument()
})

// A user with no saved groups can still compare bare routes, so the empty state must only trigger
// when there is genuinely nothing to pick from.
it('still renders the picker when there are no groups but there are routes', () => {
  ;(useRouteGroups as jest.Mock).mockReturnValue({ data: [], isLoading: false })
  render(<PnlGroupComparisonView filter={filter} />)

  expect(screen.queryByText(/belum ada route group/i)).not.toBeInTheDocument()
  expect(screen.getByText('Rute')).toBeInTheDocument()
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
    { id: 'g1', name: 'Kalimantan', routeCount: 2, kind: 'group', routes: [route('Balikpapan'), route('Batam')] },
    { id: 'g2', name: 'Sumatera', routeCount: 1, kind: 'group', routes: [route('Batam')] },
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
          issues: [],
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
          issues: [],
        },
        {
          revenue: 800000,
          cost: 400000,
          costSmu: 200000,
          costRa: 100000,
          costSgOut: 50000,
          costSgIn: 50000,
          incompleteTos: 0,
          issues: [],
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
      issues: [],
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
      issues: [],
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

it('sends selected group picks to usePnlGroupComparison in click order, moving a reselected group to the end', () => {
  render(<PnlGroupComparisonView filter={filter} />)

  const latestPicks = () => {
    const calls = (usePnlGroupComparison as jest.Mock).mock.calls
    return calls[calls.length - 1][1]
  }

  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // g1
  fireEvent.click(screen.getByLabelText(/Sumatera/)) // g2
  expect(latestPicks()).toEqual([
    { kind: 'group', id: 'g1' },
    { kind: 'group', id: 'g2' },
  ])

  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // deselect g1
  fireEvent.click(screen.getByLabelText(/Kalimantan/)) // reselect g1 -> appended, not resorted
  expect(latestPicks()).toEqual([
    { kind: 'group', id: 'g2' },
    { kind: 'group', id: 'g1' },
  ])
})

it('lists bare routes to pick alongside the groups', () => {
  renderView()
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  expect(screen.getByText('Jabo → Denpasar')).toBeInTheDocument()
})

it('sends groups and routes in the order they were picked', () => {
  renderView()
  fireEvent.click(screen.getByRole('checkbox', { name: /Kalimantan/ }))
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Denpasar/ }))

  expect(hooks.usePnlGroupComparison).toHaveBeenLastCalledWith(filter, [
    { kind: 'group', id: 'g1' },
    { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
  ])
})

it('prompts for a pick when nothing is selected', () => {
  renderView()
  expect(screen.getByText('Pilih minimal satu group atau rute untuk melihat perbandingan.')).toBeInTheDocument()
})
