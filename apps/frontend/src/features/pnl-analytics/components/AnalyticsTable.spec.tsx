import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsTable } from './AnalyticsTable'

interface Row {
  name: string
  weight: number
}

const columns = [
  { key: 'name', header: 'Name', cell: (r: Row) => r.name },
  { key: 'weight', header: 'Weight', align: 'right' as const, cell: (r: Row) => r.weight },
]

describe('AnalyticsTable', () => {
  it('renders a header and one row per item', () => {
    render(<AnalyticsTable columns={columns} rows={[{ name: 'Lion', weight: 10 }]} rowKey={(r) => r.name} />)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('Lion')).toBeInTheDocument()
  })

  // A table whose columns render in a different order than its headers mislabels every number in
  // it, so both header order and cell order are pinned to the `columns` array order.
  it('renders headers and cells in the declared column order', () => {
    render(
      <AnalyticsTable
        columns={columns}
        rows={[{ name: 'Lion', weight: 10 }]}
        rowKey={(r) => r.name}
      />,
    )
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Name',
      'Weight',
    ])
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Lion', '10'])
  })

  // Numeric columns declare `align: 'right'`; losing that silently left-aligns figures readers
  // scan as a column, so the alignment classes are asserted rather than assumed.
  it('right-aligns only the columns that ask for it', () => {
    render(
      <AnalyticsTable
        columns={columns}
        rows={[{ name: 'Lion', weight: 10 }]}
        rowKey={(r) => r.name}
      />,
    )
    const [nameHeader, weightHeader] = screen.getAllByRole('columnheader')
    expect(nameHeader).toHaveClass('text-left')
    expect(weightHeader).toHaveClass('text-right')

    const row = screen.getAllByRole('row')[1]
    const [nameCell, weightCell] = within(row).getAllByRole('cell')
    expect(nameCell).not.toHaveClass('text-right')
    expect(weightCell).toHaveClass('text-right')
    expect(weightCell).toHaveClass('tabular-nums')
  })

  it('applies the per-row className and testid hooks', () => {
    render(
      <AnalyticsTable
        columns={columns}
        rows={[
          { name: 'Lion', weight: 10 },
          { name: 'Tiger', weight: 20 },
        ]}
        rowKey={(r) => r.name}
        rowClassName={(r) => (r.name === 'Lion' ? 'caveat' : undefined)}
        rowTestId={(r) => `row-${r.name}`}
      />,
    )
    expect(screen.getByTestId('row-Lion')).toHaveClass('caveat')
    expect(screen.getByTestId('row-Tiger')).not.toHaveClass('caveat')
  })

  it('shows the empty message instead of a bare header when there are no rows', () => {
    render(
      <AnalyticsTable columns={columns} rows={[]} rowKey={(r) => r.name} empty="No airlines." />,
    )
    expect(screen.getByText('No airlines.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('falls back to a default empty message when none is given', () => {
    render(<AnalyticsTable columns={columns} rows={[]} rowKey={(r) => r.name} />)
    expect(screen.getByText('No rows.')).toBeInTheDocument()
  })
})
