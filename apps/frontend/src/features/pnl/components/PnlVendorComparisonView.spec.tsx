import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlFilter, PnlVendorComparison, PnlVendorPick } from '../hooks/usePnl'
import { PnlVendorComparisonView } from './PnlVendorComparisonView'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlVendorComparison: jest.fn() }
})
jest.mock('@/features/vendor-groups/hooks/useVendorGroups', () => ({
  useVendorGroups: jest.fn(),
  useAvailableVendors: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pnlHooks = require('../hooks/usePnl')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vendorHooks = require('@/features/vendor-groups/hooks/useVendorGroups')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

function comparison(over: Partial<PnlVendorComparison> = {}): PnlVendorComparison {
  return {
    columns: [
      { id: 'vg:g1', name: 'Group A', kind: 'group', vendors: ['ESP'], vendorCount: 1 },
    ],
    rows: [
      {
        origin: 'Jabo',
        originLabel: 'CGK',
        dest: 'Denpasar',
        cells: [
          {
            revenue: 1000, cost: 600, margin: 385,
            costSmu: 400, costRa: 100, costSgOut: 50, costSgIn: 50,
            incompleteTos: 0, issues: [],
          },
        ],
      },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', cells: [null] },
    ],
    footer: [
      {
        totalRevenue: 1000, totalCost: 600, totalMargin: 385,
        totalCostSmu: 400, totalCostRa: 100, totalCostSgOut: 50, totalCostSgIn: 50,
        routesWithData: 1,
        avgRevenuePerRoute: 1000, avgCostPerRoute: 600, avgMarginPerRoute: 385,
        incompleteTos: 0, issues: [],
      },
    ],
    coverage: { revenueInColumns: 3020, revenuePeriod: 10000 },
    ...over,
  }
}

interface RenderOptions {
  picks?: PnlVendorPick[]
  onPicksChange?: jest.Mock
  // Deliberately NOT defaulted via destructuring: `{ groups = X } = {}` resolves to X whenever the
  // caller passes `groups: undefined` explicitly, not only when the key is omitted — which is
  // exactly the cold-cache case the pruning tests below need to express. Presence is checked with
  // `in` instead, mirroring PnlRouteComparisonView.spec.tsx's `if ('groups' in props)`.
  groups?: { id: string; name: string; description: string | null; vendors: string[] }[] | undefined
  availableVendors?: { vendor: string; hasData: boolean; inMaster: boolean }[]
  data?: PnlVendorComparison | undefined
  onCellClick?: jest.Mock
}

function renderView(options: RenderOptions = {}) {
  const picks = options.picks ?? []
  const onPicksChange = options.onPicksChange ?? jest.fn()
  const groups = 'groups' in options
    ? options.groups
    : [{ id: 'g1', name: 'Group A', description: null, vendors: ['ESP'] }]
  const availableVendors = options.availableVendors ?? [
    { vendor: 'ESP', hasData: true, inMaster: true },
    { vendor: 'Angkasa Kargo', hasData: false, inMaster: true },
  ]
  const data = 'data' in options ? options.data : comparison()
  const onCellClick = options.onCellClick

  vendorHooks.useVendorGroups.mockReturnValue({
    data: groups,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  vendorHooks.useAvailableVendors.mockReturnValue({
    data: availableVendors,
  })
  pnlHooks.usePnlVendorComparison.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  return render(
    <PnlVendorComparisonView
      filter={filter}
      picks={picks}
      onPicksChange={onPicksChange}
      onCellClick={onCellClick}
    />,
  )
}

describe('PnlVendorComparisonView', () => {
  beforeEach(() => jest.clearAllMocks())

  it('states what share of period revenue the columns cover, permanently', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    expect(
      screen.getByText(/Kolom di bawah mencakup 30% revenue periode ini/),
    ).toBeInTheDocument()
  })

  it('falls back to a number-free sentence when an older backend sent no coverage', () => {
    const stale = comparison()
    delete (stale as Partial<PnlVendorComparison>).coverage
    renderView({ picks: [{ kind: 'group', id: 'g1' }], data: stale })

    expect(screen.getByText(/hanya mencakup TO yang punya vendor/)).toBeInTheDocument()
  })

  it('names the Avg / Route divisor per column, because it differs per column', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    expect(screen.getByText(/Group A = 1 rute/)).toBeInTheDocument()
  })

  it('lists all three reasons the columns do not add up to the period', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    const note = screen.getByTestId('vendor-comparison-gap-note')
    expect(note).toHaveTextContent('no_booking')
    expect(note).toHaveTextContent('smu_rate_missing')
    expect(note).toHaveTextContent('station_mapping_missing')
  })

  // Item 5 of the task brief: clicking a cell opens an AWB drilldown whose totals will not equal
  // the cell, by design (MAX(cost_*_awb) rollup per matched AWB vs. this cell's weight_share
  // prorata for one station pair). Not in the brief's own test code, so it is added here.
  it('warns that the AWB drilldown will not reconcile to the cell', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    const note = screen.getByTestId('vendor-comparison-drilldown-note')
    expect(note).toHaveTextContent(/MAX\(cost_.*_awb\)/)
    expect(note).toHaveTextContent(/weight_share/)
  })

  it('warns when two selected columns share a vendor', () => {
    renderView({
      picks: [{ kind: 'group', id: 'g1' }, { kind: 'vendor', name: 'ESP' }],
      data: comparison({
        columns: [
          { id: 'vg:g1', name: 'Group A', kind: 'group', vendors: ['ESP'], vendorCount: 1 },
          { id: 'v:ESP', name: 'ESP', kind: 'vendor', vendors: ['ESP'], vendorCount: 1 },
        ],
      }),
    })

    expect(
      screen.getByText(/Group A, ESP sama-sama memuat vendor ESP/),
    ).toBeInTheDocument()
  })

  it('asks for a pick before it renders any table', () => {
    renderView({ picks: [], data: undefined })

    expect(
      screen.getByText('Pilih minimal satu vendor group atau vendor untuk melihat perbandingan.'),
    ).toBeInTheDocument()
  })

  it('toggles a group pick without disturbing the order of the others', () => {
    const onPicksChange = jest.fn()
    renderView({
      picks: [{ kind: 'vendor', name: 'ESP' }],
      onPicksChange,
      groups: [{ id: 'g1', name: 'Group A', description: null, vendors: ['ESP'] }],
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Group A (1 vendor)' }))
    expect(onPicksChange).toHaveBeenCalledWith([
      { kind: 'vendor', name: 'ESP' },
      { kind: 'group', id: 'g1' },
    ])
  })

  it('prunes a pick for a group that no longer exists, but only once the list has loaded', async () => {
    const onPicksChange = jest.fn()

    // groups undefined = cold react-query cache, the normal state after >5 minutes on another tab.
    // Pruning here would delete the very picks the lifted state exists to preserve.
    renderView({ groups: undefined, picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
    expect(onPicksChange).not.toHaveBeenCalled()

    renderView({ picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
    await waitFor(() => expect(onPicksChange).toHaveBeenCalledWith([]))
  })

  // A vendor name can vanish from the sheet at any time, and nothing distinguishes "deleted" from
  // "not synced yet". An empty column is honest and the user can remove it themselves.
  it('never prunes a raw vendor pick, even one with no data', async () => {
    const onPicksChange = jest.fn()
    renderView({ picks: [{ kind: 'vendor', name: 'Sudah Hilang' }], onPicksChange })

    await waitFor(() => expect(pnlHooks.usePnlVendorComparison).toHaveBeenCalled())
    expect(onPicksChange).not.toHaveBeenCalled()
  })

  it('hands a clicked cell to the caller as a period-wide, vendor-scoped route filter', () => {
    const onCellClick = jest.fn()
    renderView({ picks: [{ kind: 'group', id: 'g1' }], onCellClick })

    fireEvent.click(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1'))

    expect(onCellClick).toHaveBeenCalledWith({
      routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      vendors: ['ESP'],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  // An empty group column carries `vendors: []`, which routeToParams drops entirely — the
  // drilldown would open with no vendor predicate and list every vendor's AWBs on that route,
  // the exact opposite of what the clicked column means.
  it('does not open a drilldown from a column whose group has no vendors', () => {
    const onCellClick = jest.fn()
    renderView({
      picks: [{ kind: 'group', id: 'g1' }],
      onCellClick,
      data: comparison({
        columns: [{ id: 'vg:g1', name: 'Group Kosong', kind: 'group', vendors: [], vendorCount: 0 }],
      }),
    })

    fireEvent.click(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1'))
    expect(onCellClick).not.toHaveBeenCalled()
  })

  it('labels the first column Route and hints at routes, not dates', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }], onCellClick: jest.fn() })

    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument()
    expect(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1')).toHaveAttribute(
      'title',
      expect.stringContaining('pada rute ini'),
    )
  })

  // Without the client-side cap the server answers a 13-column request with a 400, which lands in
  // the view's generic isError branch as "Failed to load the comparison." plus a Retry button that
  // will fail identically forever — the user is never told what they actually did wrong.
  it('refuses a thirteenth column and says why', () => {
    const onPicksChange = jest.fn()
    const twelve: PnlVendorPick[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'vendor' as const,
      name: `Vendor ${i}`,
    }))

    renderView({ picks: twelve, onPicksChange })

    expect(screen.getByText(/Maksimum 12 kolom/)).toBeInTheDocument()

    // The group checkbox is still rendered, but ticking it must not add a thirteenth pick.
    fireEvent.click(screen.getByRole('checkbox', { name: /Group A/ }))
    expect(onPicksChange).not.toHaveBeenCalled()
  })

  // Second half of the cap: the "All" shortcut in the vendor multi-select can hand over more names
  // than fit at once, not just one at a time via a checkbox. Without the `.slice(0, MAX)` in
  // setVendorNames this would call onPicksChange with 13 picks.
  it('caps the vendor multi-select too, dropping what would be a thirteenth column', () => {
    const onPicksChange = jest.fn()
    const twelve: PnlVendorPick[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'vendor' as const,
      name: `Vendor ${i}`,
    }))
    const availableVendors = [
      ...Array.from({ length: 12 }, (_, i) => ({
        vendor: `Vendor ${i}`,
        hasData: true,
        inMaster: true,
      })),
      { vendor: 'ESP', hasData: true, inMaster: true },
    ]

    renderView({ picks: twelve, onPicksChange, availableVendors })

    fireEvent.click(screen.getByRole('button', { name: /12 vendors/ }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(onPicksChange).toHaveBeenCalledTimes(1)
    const [result] = onPicksChange.mock.calls[0]
    expect(result).toHaveLength(12)
    expect(result).not.toEqual(expect.arrayContaining([{ kind: 'vendor', name: 'ESP' }]))
  })
})
