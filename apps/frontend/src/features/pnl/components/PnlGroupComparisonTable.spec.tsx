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
        // Revenue/cost stay null for g2 here so the em-dash coverage below is untouched, but the
        // cost *components* are non-null and distinct per group — this is the date the expand
        // tests use, and a regression that only rendered the clicked group's values must be
        // visible even though the top-level g2 cost cell itself is blank.
        date: '2026-05-01',
        revenue: [1000, null],
        cost: [800, null],
        incompleteTos: [0, 0],
        components: {
          costSmu: [500, 260],
          costRa: [100, 140],
          costSgOut: [150, 180],
          costSgIn: [50, 70],
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
  // Both groups' values, asserted individually — a regression that only rendered the clicked
  // group's value (e.g. components[key][0] for every column) would still pass a check for group 1
  // alone, since 500 is correct there too.
  expect(within(smuRow).getByText('500')).toBeInTheDocument()
  expect(within(smuRow).getByText('260')).toBeInTheDocument()

  const raRow = screen.getByTestId('detail-2026-05-01-costRa')
  expect(within(raRow).getByText('100')).toBeInTheDocument()
  expect(within(raRow).getByText('140')).toBeInTheDocument()

  const sgOutRow = screen.getByTestId('detail-2026-05-01-costSgOut')
  expect(within(sgOutRow).getByText('150')).toBeInTheDocument()
  expect(within(sgOutRow).getByText('180')).toBeInTheDocument()

  const sgInRow = screen.getByTestId('detail-2026-05-01-costSgIn')
  expect(within(sgInRow).getByText('50')).toBeInTheDocument()
  expect(within(sgInRow).getByText('70')).toBeInTheDocument()
})

it('leaves the Revenue-block cells of an expanded detail row empty', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  for (const key of ['costSmu', 'costRa', 'costSgOut', 'costSgIn']) {
    const row = screen.getByTestId(`detail-2026-05-01-${key}`)
    const cells = row.querySelectorAll('td')
    // label, 2 blank Revenue-block cells, 2 filled Cost-block cells
    expect(cells).toHaveLength(5)
    expect(cells[1]).toHaveTextContent('')
    expect(cells[2]).toHaveTextContent('')
    expect(cells[3]).not.toHaveTextContent('')
    expect(cells[4]).not.toHaveTextContent('')
  }
})

it('collapses again on a second click', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
})

it('keeps several dates open at once, each showing its own values', () => {
  render(<PnlGroupComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByTestId('cost-2026-05-01-g1'))
  fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))

  // Each open date's detail row must carry that date's own components, not the other date's —
  // a regression that rendered detail rows from a fixed row (e.g. always rows[0]) would still
  // satisfy plain testid-existence checks for both dates.
  const firstSmuRow = screen.getByTestId('detail-2026-05-01-costSmu')
  expect(within(firstSmuRow).getByText('500')).toBeInTheDocument()
  expect(within(firstSmuRow).getByText('260')).toBeInTheDocument()

  const secondSmuRow = screen.getByTestId('detail-2026-05-02-costSmu')
  expect(within(secondSmuRow).getByText('900')).toBeInTheDocument()
  expect(within(secondSmuRow).getByText('0')).toBeInTheDocument()
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
