/**
 * Unit tests for PnlMatrixTable.
 *
 * The model is hand-built here rather than produced via toRevenueTable/toMarginTable, so these
 * tests isolate the renderer from the projection logic (which is covered in dailyMatrix.spec.ts).
 */
import React from 'react'
import { render } from '@testing-library/react'
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
  it('renders a null cell as empty while a 0 cell in the same row renders 0', () => {
    const { container } = render(<PnlMatrixTable title="t" model={baseModel()} />)
    const [nullCell, zeroCell] = bodyCells(container)
    expect(nullCell.textContent).toBe('')
    expect(zeroCell.textContent).toBe('0')
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
