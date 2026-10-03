import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../engine/__fixtures__/source'
import { RouteSimulationView } from './RouteSimulationView'

jest.mock('./ScenarioBar', () => ({ ScenarioBar: () => null }))

beforeEach(() => {
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

it('opens on Setup and switches tabs', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByRole('button', { name: '1 · Setup Histori & Akun' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: '8 · Distribusi Optimal' }))
  expect(screen.getByRole('button', { name: '8 · Distribusi Optimal' })).toHaveAttribute('aria-current', 'page')
})

it('shows the history range in the header', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByText(/Histori Jun 2026 H1 s.d. Agu 2026 H2/)).toBeInTheDocument()
  expect(screen.getByText(/Rata-rata tonase dari 90 hari histori/)).toBeInTheDocument()
})
