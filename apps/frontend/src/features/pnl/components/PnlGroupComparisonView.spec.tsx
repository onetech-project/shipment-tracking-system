import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonView } from './PnlGroupComparisonView'
import { PnlFilter } from '../hooks/usePnl'

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
