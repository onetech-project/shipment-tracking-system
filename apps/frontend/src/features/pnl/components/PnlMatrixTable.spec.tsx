/**
 * Unit tests for PnlMatrixTable.
 *
 * The model is hand-built here rather than produced via toRevenueTable/toMarginTable, so these
 * tests isolate the renderer from the projection logic (which is covered in dailyMatrix.spec.ts).
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlMatrixTable } from './PnlMatrixTable'
import { MatrixTableModel } from '../utils/dailyMatrix'

const INCOMPLETE_TOOLTIP = (n: number) =>
  `${n} TO belum ada cost — margin di sel ini lebih tinggi dari seharusnya`

const columns = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
]

function baseModel(overrides: Partial<MatrixTableModel> = {}): MatrixTableModel {
  return {
    columns,
    dates: ['2026-07-01'],
    values: [[null, 0]],
    incompleteTos: null,
    footerRows: [{ label: 'Total', values: [10, -5], format: 'number' }],
    highlightNegative: false,
    ...overrides,
  }
}

function bodyCells(container: HTMLElement): HTMLTableCellElement[] {
  return Array.from(container.querySelectorAll<HTMLTableCellElement>('tbody tr td')).slice(1) // drop the date cell
}

function footerRow(container: HTMLElement, rowIndex: number): HTMLTableCellElement[] {
  const rows = container.querySelectorAll('tfoot tr')
  return Array.from(rows[rowIndex].querySelectorAll<HTMLTableCellElement>('td')).slice(1) // drop the label cell
}

describe('PnlMatrixTable', () => {
  // A blank cell and a genuinely zero cell used to look identical at a glance. The em-dash marks
  // "nothing shipped this route that day" as a deliberate reading, matching how num()/pct() and the
  // AWB drilldown already render a missing value.
  it('renders a null cell as an em-dash while a 0 cell in the same row renders 0', () => {
    const { container } = render(<PnlMatrixTable title="t" model={baseModel()} />)
    const [nullCell, zeroCell] = bodyCells(container)
    expect(nullCell.textContent).toBe('—')
    expect(zeroCell.textContent).toBe('0')
  })

  it('marks a null footer value the same way', () => {
    const model = baseModel({
      footerRows: [{ label: '% Margin', values: [null, 12], format: 'percent' }],
    })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [nullFooterCell] = footerRow(container, 0)
    expect(nullFooterCell.textContent).toBe('—')
  })

  it('applies negative styling when highlightNegative is true', () => {
    const model = baseModel({ values: [[-5, 10]], highlightNegative: true })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [negativeCell] = bodyCells(container)
    expect(negativeCell.className).toContain('text-red-700')
  })

  it('does not apply negative styling when highlightNegative is false', () => {
    const model = baseModel({ values: [[-5, 10]], highlightNegative: false })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [negativeCell] = bodyCells(container)
    expect(negativeCell.className).not.toContain('text-red-700')
  })

  it('renders the incomplete-TOs marker and tooltip on a body cell', () => {
    const model = baseModel({
      values: [[100, 200]],
      incompleteTos: [[0, 3]],
    })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [cleanCell, flaggedCell] = bodyCells(container)

    expect(cleanCell.title).toBe('')
    expect(cleanCell.textContent).not.toContain('•')

    expect(flaggedCell.title).toBe(INCOMPLETE_TOOLTIP(3))
    expect(flaggedCell.textContent).toContain('•')
  })

  it('renders the incomplete-TOs marker on the footer Total row when it carries a non-zero count', () => {
    const model = baseModel({
      footerRows: [{ label: 'Total', values: [10, -5], format: 'number', incompleteTos: [0, 5] }],
    })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [cleanFooterCell, flaggedFooterCell] = footerRow(container, 0)

    expect(cleanFooterCell.title).toBe('')
    expect(cleanFooterCell.textContent).not.toContain('•')

    expect(flaggedFooterCell.title).toBe(INCOMPLETE_TOOLTIP(5))
    expect(flaggedFooterCell.textContent).toContain('•')
  })
})

describe('PnlMatrixTable cell clicks', () => {
  it('renders no buttons when onCellClick is absent', () => {
    const { container } = render(<PnlMatrixTable title="t" model={baseModel()} />)
    expect(container.querySelectorAll('tbody button')).toHaveLength(0)
  })

  it('reports the column and date of the clicked cell', () => {
    const onCellClick = jest.fn()
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={onCellClick} />,
    )
    const buttons = container.querySelectorAll('tbody button')
    fireEvent.click(buttons[1])
    expect(onCellClick).toHaveBeenCalledWith(columns[1], '2026-07-01')
  })

  it('makes an empty cell clickable too', () => {
    const onCellClick = jest.fn()
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={onCellClick} />,
    )
    const buttons = container.querySelectorAll('tbody button')
    // values is [[null, 0]] — the first cell is empty and must still be clickable.
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(onCellClick).toHaveBeenCalledWith(columns[0], '2026-07-01')
  })

  it('leaves footer cells and the date column unclickable', () => {
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={jest.fn()} />,
    )
    expect(container.querySelectorAll('tfoot button')).toHaveLength(0)
    const firstBodyCell = container.querySelector('tbody tr td') as HTMLTableCellElement
    expect(firstBodyCell.querySelector('button')).toBeNull()
  })

  it('keeps the incomplete-cost warning reachable on a clickable flagged cell', () => {
    const model = baseModel({
      values: [[100, 200]],
      incompleteTos: [[0, 3]],
    })
    const { container } = render(
      <PnlMatrixTable title="t" model={model} onCellClick={jest.fn()} />,
    )
    const buttons = container.querySelectorAll<HTMLButtonElement>('tbody button')
    expect(buttons[1].title).toContain(INCOMPLETE_TOOLTIP(3))
  })

  it('does not mention incomplete costs on a clickable cell without them', () => {
    const model = baseModel({
      values: [[100, 200]],
      incompleteTos: [[0, 0]],
    })
    const { container } = render(
      <PnlMatrixTable title="t" model={model} onCellClick={jest.fn()} />,
    )
    const buttons = container.querySelectorAll<HTMLButtonElement>('tbody button')
    expect(buttons[0].title).not.toContain('TO belum ada cost')
    expect(buttons[1].title).not.toContain('TO belum ada cost')
  })

  it('reports each row own date, not the first date in the model', () => {
    const onCellClick = jest.fn()
    const model = baseModel({
      dates: ['2026-07-01', '2026-07-02'],
      values: [[1, 2], [3, 4]],
    })
    const { container } = render(
      <PnlMatrixTable title="t" model={model} onCellClick={onCellClick} />,
    )
    const buttons = container.querySelectorAll('tbody button')
    // Second row, first column — must report the second row's date.
    fireEvent.click(buttons[2])
    expect(onCellClick).toHaveBeenCalledWith(columns[0], '2026-07-02')
  })

  it('drops the <td> title once the button covers the cell, so no conflicting tooltip is left in the padding sliver', () => {
    const model = baseModel({ values: [[100, 200]], incompleteTos: [[0, 3]] })
    const { container } = render(
      <PnlMatrixTable title="t" model={model} onCellClick={jest.fn()} />,
    )
    const [cleanCell, flaggedCell] = bodyCells(container)
    expect(cleanCell.title).toBe('')
    expect(flaggedCell.title).toBe('')
  })

  it('gives each clickable cell a distinct accessible name carrying its origin, destination and date', () => {
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={jest.fn()} />,
    )
    const buttons = container.querySelectorAll<HTMLButtonElement>('tbody button')
    expect(buttons[0].getAttribute('aria-label')).toBe('Lihat AWB CGK → Aceh, 1-Jul-2026')
    expect(buttons[1].getAttribute('aria-label')).toBe('Lihat AWB SUB → Pontianak, 1-Jul-2026')
    expect(buttons[0].getAttribute('aria-label')).not.toBe(buttons[1].getAttribute('aria-label'))
  })
})
