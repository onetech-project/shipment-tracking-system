/**
 * The filter row that used to live inside PnlAwbDrilldown. It now drives the whole Estimated tab —
 * KPI cards, chart, breakdowns and the drilldown — so the behaviour pinned here (what it reports,
 * what it refuses to report, and what it withholds from the dropdown) decides ten queries.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlEstimateFilterBar } from './PnlEstimateFilterBar'
import { PnlFilter, PnlRouteFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlStations: jest.fn() }
})
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: jest.fn() }))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({ useRouteGroups: jest.fn() }))

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const hooks = require('../hooks/usePnl')
const perms = require('@/shared/hooks/use-permissions')
const groupsHook = require('@/features/route-groups/hooks/useRouteGroups')
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'date' }

const STATIONS = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
]

const GROUPS = [
  {
    id: 'g1',
    name: 'Jabo Timur',
    description: null,
    routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
  },
]

function renderBar(
  scope: PnlRouteFilter = {},
  onScopeChange = jest.fn(),
  groupId: string | undefined = undefined,
  onGroupChange = jest.fn(),
) {
  render(
    <PnlEstimateFilterBar
      filter={filter}
      scope={scope}
      onScopeChange={onScopeChange}
      groupId={groupId}
      onGroupChange={onGroupChange}
    />,
  )
  return { onScopeChange, onGroupChange }
}

beforeEach(() => {
  jest.clearAllMocks()
  hooks.usePnlStations.mockReturnValue({ data: STATIONS })
  perms.usePermissions.mockReturnValue({ hasPermission: () => true })
  groupsHook.useRouteGroups.mockReturnValue({ data: GROUPS })
})

describe('PnlEstimateFilterBar routes', () => {
  it('names both stations as the data stores them, not by airport code', () => {
    // Unlike the Daily Report's dropdown: there is no airport-code header here to agree with, and
    // the drilldown table below shows raw station values in its Origin and Destination columns.
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    expect(screen.getByTitle('Jabo → Aceh')).toBeInTheDocument()
    expect(screen.getByTitle('Surabaya → Pontianak')).toBeInTheDocument()
  })

  it('reports a ticked route as a raw pair', () => {
    const { onScopeChange } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    fireEvent.click(screen.getByTitle('Jabo → Aceh'))
    expect(onScopeChange).toHaveBeenCalledWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
  })

  it('drops the routes key entirely when the last route is unticked', () => {
    // Empty means "no filter": routeToParams drops undefined fields, while an empty array would
    // serialise as a filter matching nothing.
    //
    // With exactly one route pre-selected, MultiRouteFilter's trigger takes that route's own
    // label as its accessible name ("Jabo → Aceh"), which the bare /All Routes|routes/i pattern
    // used elsewhere in this file no longer matches at all — while the nested "Clear routes"
    // icon (role="button", named by its title attribute) DOES match it, making that pattern
    // pick the wrong element here. `expanded: false` selects on aria-expanded instead, which
    // only the actual toggle carries, so it resolves to the right button regardless of its label.
    const { onScopeChange } = renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByTitle('Jabo → Aceh'))
    expect(onScopeChange).toHaveBeenCalledWith({ routes: undefined })
  })
})

describe('PnlEstimateFilterBar dates', () => {
  it('reports each date change without disturbing the rest of the scope', () => {
    const scope: PnlRouteFilter = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }
    const { onScopeChange } = renderBar(scope)

    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-05-03' } })
    expect(onScopeChange).toHaveBeenCalledWith({ ...scope, dateFrom: '2026-05-03' })

    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-05-10' } })
    expect(onScopeChange).toHaveBeenCalledWith({ ...scope, dateTo: '2026-05-10' })
  })

  it('bounds both inputs to the active cycle', () => {
    renderBar()
    const from = screen.getByLabelText('Dari') as HTMLInputElement
    const to = screen.getByLabelText('Sampai') as HTMLInputElement
    expect(from.min).toBe('2026-05-01')
    expect(from.max).toBe('2026-05-15')
    expect(to.min).toBe('2026-05-01')
    expect(to.max).toBe('2026-05-15')
  })

  it('caps Dari at Sampai and floors Sampai at Dari when both are set', () => {
    renderBar({ dateFrom: '2026-05-05', dateTo: '2026-05-10' })
    expect((screen.getByLabelText('Dari') as HTMLInputElement).max).toBe('2026-05-10')
    expect((screen.getByLabelText('Sampai') as HTMLInputElement).min).toBe('2026-05-05')
  })

  it('clears a date rather than sending an empty string', () => {
    const { onScopeChange } = renderBar({ dateFrom: '2026-05-05' })
    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '' } })
    expect(onScopeChange).toHaveBeenCalledWith({ dateFrom: undefined })
  })
})

describe('PnlEstimateFilterBar vendors', () => {
  it('shows each active vendor as a removable chip', () => {
    renderBar({ vendors: ['ESP', 'Angkasa Kargo'] })
    expect(screen.getByTestId('vendor-chip-ESP')).toHaveTextContent('ESP')
    expect(screen.getByTestId('vendor-chip-Angkasa Kargo')).toHaveTextContent('Angkasa Kargo')
  })

  it('drops one vendor without disturbing the rest of the scope', () => {
    const { onScopeChange } = renderBar({
      vendors: ['ESP', 'Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))
    expect(onScopeChange).toHaveBeenCalledWith({
      vendors: ['Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
  })

  it('removes the key entirely when the last vendor is dropped', () => {
    const { onScopeChange } = renderBar({ vendors: ['ESP'] })
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))
    expect(onScopeChange).toHaveBeenCalledWith({ vendors: undefined })
  })
})

describe('PnlEstimateFilterBar reset', () => {
  it('stays hidden while nothing is filtered', () => {
    renderBar()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('appears for a vendor-only scope, which is how a Vendor Comparison click arrives', () => {
    renderBar({ vendors: ['ESP'] })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  it('appears for a group-only scope', () => {
    renderBar({}, jest.fn(), 'g1')
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  it('clears the scope and the group together', () => {
    const { onScopeChange, onGroupChange } = renderBar({ vendors: ['ESP'] }, jest.fn(), 'g1')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onScopeChange).toHaveBeenCalledWith({})
    expect(onGroupChange).toHaveBeenCalledWith(undefined)
  })
})

describe('PnlEstimateFilterBar route group', () => {
  it('stops offering a route the chosen group already covers', () => {
    renderBar({}, jest.fn(), 'g1')
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    expect(screen.queryByTitle('Jabo → Aceh')).not.toBeInTheDocument()
    expect(screen.getByTitle('Surabaya → Pontianak')).toBeInTheDocument()
  })

  it('keeps a route ticked before the group was chosen, counting it once', () => {
    // Deliberately not removed from the scope: choosing a different group later must bring it
    // back already ticked. The scope route and the group's route are the SAME pair, and the
    // assertion is anchored on the arrow so a naive picks.length + groupRoutes.length sum (which
    // would read "2 rute" here) cannot hide behind the "(1 rute)" / "1 rute dipilih" substrings
    // that appear earlier in the sentence regardless of how the total is computed.
    renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }, jest.fn(), 'g1')
    expect(screen.getByTestId('filter-summary')).toHaveTextContent(/→\s*1 rute/)
  })

  it('reports a group choice', () => {
    const { onGroupChange } = renderBar()
    fireEvent.change(screen.getByRole('combobox', { name: 'Route Group' }), {
      target: { value: 'g1' },
    })
    expect(onGroupChange).toHaveBeenCalledWith('g1')
  })

  it('says nothing about coverage when no group is chosen', () => {
    renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    expect(screen.queryByTestId('filter-summary')).not.toBeInTheDocument()
  })

  it('hides the group control entirely without read.route_group', () => {
    perms.usePermissions.mockReturnValue({ hasPermission: () => false })
    renderBar()
    expect(screen.queryByRole('combobox', { name: 'Route Group' })).not.toBeInTheDocument()
  })
})
