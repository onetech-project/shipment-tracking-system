/**
 * Unit tests for PnlComparisonTable. The model is hand-built rather than produced by
 * toComparisonTable, so these tests isolate the renderer from the projection (covered in
 * routeComparison.spec.ts).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlComparisonTable } from './PnlComparisonTable'
import { ComparisonTableModel } from '../utils/routeComparison'

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
        date: '2026-05-02',
        revenue: [0, 2000],
        cost: [0, 1500],
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
        components: null,
        warnings: null,
      },
    ],
    ...overrides,
  }
}

it('renders a Revenue and a Cost block header spanning the group columns', () => {
  render(<PnlComparisonTable model={baseModel()} />)

  expect(screen.getByText('Revenue')).toHaveAttribute('colspan', '2')
  expect(screen.getByText('Cost')).toHaveAttribute('colspan', '2')
  expect(screen.getAllByText('Kalimantan')).toHaveLength(2) // once under each block
})

it('renders a missing cell as an em-dash and a real zero as 0', () => {
  render(<PnlComparisonTable model={baseModel()} />)

  const firstRow = screen.getByTestId('row-2026-05-01')
  expect(within(firstRow).getAllByText('—').length).toBeGreaterThan(0)

  const secondRow = screen.getByTestId('row-2026-05-02')
  expect(within(secondRow).getAllByText('0').length).toBeGreaterThan(0)
})

it('expands the cost detail from a chevron on the date, not from a cost cell', () => {
  // The detail rows always covered every column, so the toggle belongs to the row. Leaving it on
  // a cost cell would make one column's cell silently control all of them.
  render(<PnlComparisonTable model={baseModel()} />)
  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
  expect(screen.getByTestId('detail-2026-05-01-costSmu')).toBeInTheDocument()
})

it('expands the detail row into the four components for every group', () => {
  render(<PnlComparisonTable model={baseModel()} />)

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
  render(<PnlComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))

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
  render(<PnlComparisonTable model={baseModel()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))

  expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
})

it('keeps several dates open at once, each showing its own values', () => {
  render(<PnlComparisonTable model={baseModel()} />)

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
  render(<PnlComparisonTable model={baseModel()} onCellClick={onCellClick} />)

  fireEvent.click(screen.getByTestId('revenue-2026-05-01-g1'))
  expect(onCellClick).toHaveBeenLastCalledWith(columns[0], '2026-05-01')

  fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))
  expect(onCellClick).toHaveBeenLastCalledWith(columns[1], '2026-05-02')
})

it('leaves the value cells inert when no handler is given', () => {
  render(<PnlComparisonTable model={baseModel()} />)
  expect(screen.getByTestId('revenue-2026-05-01-g1').tagName).toBe('TD')
})

it('never turns a footer value into a drilldown button', () => {
  // The footer spans the whole period; the Total chevron is the only button it owns.
  render(<PnlComparisonTable model={baseModel()} onCellClick={jest.fn()} />)
  expect(screen.queryByTestId('cost-__footer__-g1')).not.toBeInTheDocument()
})

it('still explains a warning through the clickable cell title', () => {
  render(<PnlComparisonTable model={baseModel()} onCellClick={jest.fn()} />)
  expect(screen.getByTestId('cost-2026-05-02-g1').getAttribute('title')).toBe(
    'Lihat AWB kolom ini pada tanggal ini — 3 TO belum ada cost',
  )
})

it('marks a cost cell that contains uncosted TOs', () => {
  render(<PnlComparisonTable model={baseModel()} />)

  expect(screen.getByTestId('cost-2026-05-02-g1')).toHaveAttribute(
    'title',
    expect.stringContaining('3 TO belum ada cost'),
  )
})

it('expands the Total footer row from its own chevron', () => {
  render(<PnlComparisonTable model={baseModel()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Rincian cost Total' }))
  expect(screen.getByTestId('detail-__footer__-costSmu')).toBeInTheDocument()

  // Avg / Day has no cost breakdown, so it never grows a chevron in the first place.
  expect(screen.queryByRole('button', { name: /Rincian cost Avg/ })).not.toBeInTheDocument()
})

it('paints a warned cost cell amber', () => {
  render(<PnlComparisonTable model={baseModel()} />)
  expect(screen.getByTestId('cost-2026-05-02-g1').closest('td')!.className).toContain(
    'bg-amber-100',
  )
})

it('leaves a clean cost cell untinted', () => {
  render(<PnlComparisonTable model={baseModel()} />)
  expect(screen.getByTestId('cost-2026-05-02-g2').closest('td')!.className).not.toContain(
    'bg-amber-100',
  )
})

// Task 12's guarantee is that both the Revenue and the Cost cell of a warned column/date go
// amber, not just the one with the drilldown affordance. Task 13 moves the testid onto the inner
// button (the amber class stays on the <td>), so the class is reached via .closest('td') — the
// tripwire this test exists for still fires if the tint were ever moved onto the button instead.
it('paints a warned revenue cell amber and leaves a clean one untinted', () => {
  render(<PnlComparisonTable model={baseModel()} onCellClick={jest.fn()} />)
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
  const { container } = render(<PnlComparisonTable model={baseModel()} />)
  const [revenueWarned, revenueClean, costWarned, costClean] = footerRow(container, 'Total')
  expect(revenueWarned.className).toContain('bg-amber-100')
  expect(revenueClean.className).not.toContain('bg-amber-100')
  expect(costWarned.className).toContain('bg-amber-100')
  expect(costClean.className).not.toContain('bg-amber-100')
})
