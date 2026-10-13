import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { LanesTab } from './LanesTab'

const src = fixtureSource()

it('edits one cost component and shows a column for each part plus the total', () => {
  const dispatch = jest.fn()
  const sim = createState(src)
  const lane = sim.lanes[0]
  render(<LanesTab source={src} sim={sim} dispatch={dispatch} />)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
  expect(headers).toEqual(expect.arrayContaining(['Cost SG Outgoing', 'Cost SG Incoming', 'Cost RA', 'Cost SMU', 'Total Cost / kg']))
  const ra = screen.getAllByLabelText(`Cost RA per kg ${lane.vendor} ${lane.airline}`)[0]
  fireEvent.change(ra, { target: { value: '900' } })
  fireEvent.blur(ra)
  expect(dispatch).toHaveBeenCalledWith({ type: 'laneSet', id: lane.id, field: 'costRa', value: 900 })
})

it('warns on a lane whose vendor has no account', () => {
  const sim = createState(src)
  sim.accounts = sim.accounts.filter((a) => a.id !== 'PELITA')
  render(<LanesTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getAllByText('belum ada akun di tab 1, tidak ikut dihitung').length).toBeGreaterThan(0)
})

it('shows the data value under each editable cost', () => {
  render(<LanesTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getAllByText(/^data Rp /).length).toBeGreaterThan(0)
})

it('describes the lane list as all-history and the total as the sum of four components', () => {
  render(<LanesTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getByText(/diambil dari seluruh histori AWB/)).toBeInTheDocument()
  expect(screen.getByText(/Total Cost = Cost SG Outgoing \+ Cost SG Incoming \+ Cost RA \+ Cost SMU \(otomatis\)/)).toBeInTheDocument()
  expect(screen.getByText(/kg per hari tertinggi dalam satu periode pada rentang histori/)).toBeInTheDocument()
})
