import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { LanesTab } from './LanesTab'

const src = fixtureSource()

it('toggles the cost basis between SMU and all-in', () => {
  const dispatch = jest.fn()
  render(<LanesTab source={src} sim={createState(src)} dispatch={dispatch} />)
  fireEvent.click(screen.getByRole('radio', { name: /All-in/ }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'setCostBasis', value: 'all' })
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

it('describes vendor/airline lists as all-history, while cost, load and the data tag use tab 1\'s range', () => {
  render(<LanesTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.getByText(/diambil dari seluruh histori AWB/)).toBeInTheDocument()
  expect(screen.getByText(/cost\/kg, load, dan tag "tidak ada data" memakai rentang histori tab 1/)).toBeInTheDocument()
  expect(screen.getByText(/kg per hari tertinggi dalam satu periode pada rentang histori/)).toBeInTheDocument()
})
