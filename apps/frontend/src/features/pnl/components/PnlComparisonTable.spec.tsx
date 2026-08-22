/**
 * Unit tests for PnlComparisonTable. The model is hand-built rather than produced by
 * toRouteComparisonTable, so these tests isolate the renderer from the projection (covered in
 * routeComparison.spec.ts).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { PnlComparisonTable } from './PnlComparisonTable'
import { ComparisonTableModel } from '../utils/comparison'
import { PnlRouteComparisonColumn } from '../hooks/usePnl'

// Matches what PnlRouteComparisonView actually passes, so the existing tests below keep
// exercising the route tab's real header/hint text rather than a stand-in.
const firstColumnHeader = 'Date'
const cellHint = 'Lihat AWB kolom ini pada tanggal ini'

// Task 13 turns the footer cost cell into a plain <td> (no button), so locating it by row label
// and cell position — the same style PnlMatrixTable.spec.tsx uses — survives that rework, unlike a
// button data-testid would.
function footerRow(container: HTMLElement, label: string): HTMLTableCellElement[] {
  const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tfoot tr'))
  const row = rows.find((r) => r.querySelector('td')?.textContent === label)
  if (!row) throw new Error(`no tfoot row labelled ${label}`)
  return Array.from(row.querySelectorAll<HTMLTableCellElement>('td')).slice(1) // drop the label cell
}

const columns = [
  {
    id: 'g1',
    name: 'Kalimantan',
    routeCount: 3,
    kind: 'group' as const,
    routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
  },
  {
    id: 'g2',
    name: 'Sumatera',
    routeCount: 2,
    kind: 'group' as const,
    routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Medan' }],
  },
]

function baseModel(
  overrides: Partial<ComparisonTableModel<PnlRouteComparisonColumn>> = {},
): ComparisonTableModel<PnlRouteComparisonColumn> {
  return {
    columns,
    rows: [
      {
        // Revenue/cost stay null for g2 here so the em-dash coverage below is untouched, but the
        // cost *components* are non-null and distinct per group — this is the date the expand
        // tests use, and a regression that only rendered the clicked group's values must be
        // visible even though the top-level g2 cost cell itself is blank.
        rowKey: '2026-05-01',
        rowLabel: '1-May-2026',
        revenue: [1000, null],
        cost: [800, null],
        margin: [200, null],
        warnings: [
          { issues: [], incompleteTos: 0 },
          { issues: [], incompleteTos: 0 },
        ],
        components: {
          costSmu: [500, 260],
          costRa: [100, 140],
          costSgOut: [150, 180],
          costSgIn: [50, 70],
        },
      },
      {
        rowKey: '2026-05-02',
        rowLabel: '2-May-2026',
        revenue: [0, 2000],
        cost: [0, 1500],
        margin: [0, 500],
        warnings: [
          { issues: [], incompleteTos: 3 },
          { issues: [], incompleteTos: 0 },
        ],
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
        margin: [200, 500],
        components: {
          costSmu: [500, 900],
          costRa: [100, 200],
          costSgOut: [150, 300],
          costSgIn: [50, 100],
        },
        warnings: [
          { issues: [], incompleteTos: 3 },
          { issues: [], incompleteTos: 0 },
        ],
      },
      {
        label: 'Avg / Day',
        revenue: [66, 133],
        cost: [53, 100],
        margin: [13, 33],
        components: null,
        warnings: null,
      },
    ],
    ...overrides,
  }
}

it('renders a Revenue and a Cost block header spanning the group columns', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  expect(screen.getByText('Revenue')).toHaveAttribute('colspan', '2')
  expect(screen.getByText('Cost')).toHaveAttribute('colspan', '2')
  expect(screen.getByText('Margin')).toHaveAttribute('colspan', '2')
  expect(screen.getAllByText('Kalimantan')).toHaveLength(3) // once under each block
})

it('renders a missing cell as an em-dash and a real zero as 0', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  const firstRow = screen.getByTestId('row-2026-05-01')
  expect(within(firstRow).getAllByText('—').length).toBeGreaterThan(0)

  const secondRow = screen.getByTestId('row-2026-05-02')
  expect(within(secondRow).getAllByText('0').length).toBeGreaterThan(0)
})

it('expands the cost detail from a chevron on the date, not from a cost cell', () => {
  // The detail rows always covered every column, so the toggle belongs to the row. Leaving it on
  // a cost cell would make one column's cell silently control all of them.
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
  expect(screen.getByTestId('detail-2026-05-01-costSmu')).toBeInTheDocument()
})

it('expands the detail row into the four components for every group', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))

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
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))

  for (const key of ['costSmu', 'costRa', 'costSgOut', 'costSgIn']) {
    const row = screen.getByTestId(`detail-2026-05-01-${key}`)
    const cells = row.querySelectorAll('td')
    // label, 2 blank Revenue-block cells, 2 filled Cost-block cells, 2 blank Margin-block cells
    expect(cells).toHaveLength(7)
    expect(cells[1]).toHaveTextContent('')
    expect(cells[2]).toHaveTextContent('')
    expect(cells[3]).not.toHaveTextContent('')
    expect(cells[4]).not.toHaveTextContent('')
    expect(cells[5]).toHaveTextContent('')
    expect(cells[6]).toHaveTextContent('')
  }
})

it('collapses again on a second click', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
})

it('keeps several dates open at once, each showing its own values', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 2-May-2026' }))

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

it('reports the column and date behind a clicked revenue or cost cell', () => {
  const onCellClick = jest.fn()
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} onCellClick={onCellClick} />)

  fireEvent.click(screen.getByTestId('revenue-2026-05-01-g1'))
  expect(onCellClick).toHaveBeenLastCalledWith(columns[0], '2026-05-01')

  fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))
  expect(onCellClick).toHaveBeenLastCalledWith(columns[1], '2026-05-02')
})

it('leaves the value cells inert when no handler is given', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  expect(screen.getByTestId('revenue-2026-05-01-g1').tagName).toBe('TD')
})

it('never turns a footer value into a drilldown button', () => {
  // The footer spans the whole period; the Total chevron is the only button it owns.
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} onCellClick={jest.fn()} />)
  expect(screen.queryByTestId('cost-__footer__-g1')).not.toBeInTheDocument()
})

it('still explains a warning through the clickable cell title', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} onCellClick={jest.fn()} />)
  expect(screen.getByTestId('cost-2026-05-02-g1').getAttribute('title')).toBe(
    'Lihat AWB kolom ini pada tanggal ini — 3 TO belum ada cost',
  )
})

it('marks a cost cell that contains uncosted TOs', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  expect(screen.getByTestId('cost-2026-05-02-g1')).toHaveAttribute(
    'title',
    expect.stringContaining('3 TO belum ada cost'),
  )
})

it('expands the Total footer row from its own chevron', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost Total' }))
  expect(screen.getByTestId('detail-__footer__-costSmu')).toBeInTheDocument()

  // Avg / Day has no cost breakdown, so it never grows a chevron in the first place.
  expect(screen.queryByRole('button', { name: /Rincian cost Avg/ })).not.toBeInTheDocument()
})

it('paints a warned cost cell amber', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  expect(screen.getByTestId('cost-2026-05-02-g1').closest('td')!.className).toContain(
    'bg-amber-100',
  )
})

it('leaves a clean cost cell untinted', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  expect(screen.getByTestId('cost-2026-05-02-g2').closest('td')!.className).not.toContain(
    'bg-amber-100',
  )
})

// Task 12's guarantee is that both the Revenue and the Cost cell of a warned column/date go
// amber, not just the one with the drilldown affordance. Task 13 moves the testid onto the inner
// button (the amber class stays on the <td>), so the class is reached via .closest('td') — the
// tripwire this test exists for still fires if the tint were ever moved onto the button instead.
it('paints a warned revenue cell amber and leaves a clean one untinted', () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} onCellClick={jest.fn()} />)
  expect(screen.getByTestId('revenue-2026-05-02-g1').closest('td')!.className).toContain(
    'bg-amber-100',
  )
  expect(screen.getByTestId('revenue-2026-05-02-g2').closest('td')!.className).not.toContain(
    'bg-amber-100',
  )
})

// The Total footer row's fixture already carries one warned column (g1) and one clean column
// (g2) in warnings[0]/warnings[1] — same values the body-cost test above exercises for the same
// date, so this checks the footer gets the same amber treatment on both blocks, not just the body.
it('paints both blocks of the Total footer row amber for a warned column, and leaves a clean column untinted', () => {
  const { container } = render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)
  const [revenueWarned, revenueClean, costWarned, costClean] = footerRow(container, 'Total')
  expect(revenueWarned.className).toContain('bg-amber-100')
  expect(revenueClean.className).not.toContain('bg-amber-100')
  expect(costWarned.className).toContain('bg-amber-100')
  expect(costClean.className).not.toContain('bg-amber-100')
})

it('renders a Margin block and keeps every row 1 + 3N cells wide', async () => {
  render(<PnlComparisonTable model={baseModel()} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  expect(screen.getByRole('columnheader', { name: 'Margin' })).toBeInTheDocument()
  expect(screen.getByTestId('margin-2026-05-01-g1')).toHaveTextContent('200')

  // Two columns in the fixture, so every row is 1 + 3*2 = 7 cells.
  const bodyRow = screen.getByTestId('row-2026-05-01')
  expect(bodyRow.querySelectorAll('td')).toHaveLength(7)

  // Expand the Total footer row and check a detail row is padded to the same width.
  await userEvent.click(screen.getByRole('button', { name: 'Rincian cost Total' }))
  const detail = screen.getByTestId('detail-__footer__-costSmu')
  expect(detail.querySelectorAll('td')).toHaveLength(7)
})

it('colours a negative margin red and lets a warning tint win over it', () => {
  const model = baseModel()
  // g1 on 2026-05-01 carries no warning (issues: [], incompleteTos: 0), so red should show cleanly.
  model.rows[0].margin = [-50, null]
  // g1 on 2026-05-02 carries a real warning (incompleteTos: 3) alongside a negative margin — the
  // tint must win so an unreliable number never reads as a confident loss.
  model.rows[1].margin = [-30, 500]

  render(<PnlComparisonTable model={model} firstColumnHeader={firstColumnHeader} cellHint={cellHint} />)

  expect(screen.getByTestId('margin-2026-05-01-g1').className).toContain('text-red')

  const warnedNegativeCell = screen.getByTestId('margin-2026-05-02-g1').closest('td')!
  expect(warnedNegativeCell.className).toContain('bg-amber-100')
  expect(warnedNegativeCell.className).not.toContain('text-red')
})

it('labels the first column from a prop and hands the row key to the click handler', async () => {
  const onCellClick = jest.fn()

  render(
    <PnlComparisonTable
      model={baseModel()} // the spec's existing helper
      firstColumnHeader="Route"
      cellHint="Lihat AWB kolom ini pada rute ini"
      onCellClick={onCellClick}
    />,
  )

  expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument()

  const cell = screen.getByTestId('revenue-2026-05-01-g1')
  expect(cell).toHaveAttribute('title', expect.stringContaining('pada rute ini'))

  await userEvent.click(cell)
  // Second argument is the opaque rowKey, not a date the renderer understands.
  expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }), '2026-05-01')
})
