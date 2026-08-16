/**
 * Unit tests for PnlGroupComparisonTable. The model is hand-built rather than produced by
 * toComparisonTable, so these tests isolate the renderer from the projection (covered in
 * groupComparison.spec.ts).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlGroupComparisonTable } from './PnlGroupComparisonTable'
import { ComparisonTableModel } from '../utils/groupComparison'

const columns = [
  { id: 'g1', name: 'Kalimantan', routeCount: 3 },
  { id: 'g2', name: 'Sumatera', routeCount: 2 },
]

function baseModel(overrides: Partial<ComparisonTableModel> = {}): ComparisonTableModel {
  return {
    columns,
    rows: [
      {
        date: '2026-05-01',
        revenue: [1000, null],
        cost: [800, null],
        incompleteTos: [0, 0],
        components: {
          costSmu: [500, null],
          costRa: [100, null],
          costSgOut: [150, null],
          costSgIn: [50, null],
        },
      },
      {
        date: '2026-05-02',
        revenue: [0, 2000],
        cost: [0, 1500],
        incompleteTos: [3, 0],
        components: {
          costSmu: [0, 900],
          costRa: [0, 200],
          costSgOut: [0, 300],
          costSgIn: [0, 100],
        },
      },
    ],
    footerRows: [
      {
        label: 'Total',
        revenue: [1000, 2000],
        cost: [800, 1500],
        components: {
          costSmu: [500, 900],
          costRa: [100, 200],
          costSgOut: [150, 300],
          costSgIn: [50, 100],
        },
        incompleteTos: [3, 0],
      },
      {
        label: 'Avg / Day',
        revenue: [66, 133],
        cost: [53, 100],
        components: null,
        incompleteTos: null,
      },
    ],
    ...overrides,
  }
}

it('renders a Revenue and a Cost block header spanning the group columns', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByText('Revenue')).toHaveAttribute('colspan', '2')
  expect(screen.getByText('Cost')).toHaveAttribute('colspan', '2')
  expect(screen.getAllByText('Kalimantan')).toHaveLength(2) // once under each block
})

it('renders a missing cell as an em-dash and a real zero as 0', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  const firstRow = screen.getByTestId('row-2026-05-01')
  expect(within(firstRow).getAllByText('—').length).toBeGreaterThan(0)

  const secondRow = screen.getByTestId('row-2026-05-02')
  expect(within(secondRow).getAllByText('0').length).toBeGreaterThan(0)
})

it('expands a clicked cost cell into the four components for every group', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  const smuRow = screen.getByTestId('detail-2026-05-01-costSmu')
  expect(within(smuRow).getByText('SMU')).toBeInTheDocument()
  expect(within(smuRow).getByText('500')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costRa')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costSgOut')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-01-costSgIn')).toBeInTheDocument()
})

it('collapses again on a second click', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
})

it('keeps several dates open at once', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))

  expect(screen.getByTestId('detail-2026-05-01-costSmu')).toBeInTheDocument()
  expect(screen.getByTestId('detail-2026-05-02-costSmu')).toBeInTheDocument()
})

// Only cost decomposes, so only cost cells are actionable.
it('does not make revenue cells clickable', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.queryByTestId('revenue-2026-05-01-g1')?.tagName).not.toBe('BUTTON')
})

it('marks a cost cell that contains uncosted TOs', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByTestId('cost-2026-05-02-g1')).toHaveAttribute(
    'title',
    expect.stringContaining('3 TO belum ada cost'),
  )
})

it('expands the Total footer row but not Avg / Day', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  expect(screen.getByTestId('cost-__footer__-g1')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('cost-__footer__-g1'))
  expect(screen.getByTestId('detail-__footer__-costSmu')).toBeInTheDocument()

  expect(screen.queryByTestId('cost-Avg / Day-g1')).not.toBeInTheDocument()
})
