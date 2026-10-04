import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { HistoryTab } from './HistoryTab'

// Spread the real module (matches the repo's convention for partial-mocking a module, e.g.
// PnlAwbDrilldown.spec.tsx): historyPdf.ts also exports the pure `unitVal`/`Unit` helpers that
// HistoryTab uses directly to render every cell, and a mock lacking them makes rendering throw.
// jspdf itself stays unloaded here because exportHistoryPdf (the only thing that imports it) is
// the one export we override below, so its body — and the dynamic import() inside it — never runs.
jest.mock('../../utils/historyPdf', () => ({ ...jest.requireActual('../../utils/historyPdf'), exportHistoryPdf: jest.fn(() => Promise.resolve()) }))
import { exportHistoryPdf } from '../../utils/historyPdf'

const src = fixtureSource()

it('renders group subtotals and one grand total', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getByText('Subtotal Sumatera')).toBeInTheDocument()
  expect(screen.getAllByText('Grand Total')).toHaveLength(1)
})

it('asks for a vendor when every vendor is unticked', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  for (const cb of screen.getAllByRole('checkbox', { name: /^(ESP|PELITA|PRIME|SILI)$/ })) fireEvent.click(cb)
  expect(screen.getByText('Pilih minimal satu vendor.')).toBeInTheDocument()
})

it('exports the same filter it shows', () => {
  render(<HistoryTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
  expect(exportHistoryPdf).toHaveBeenCalledWith(expect.objectContaining({ periods: src.cycles }))
})
