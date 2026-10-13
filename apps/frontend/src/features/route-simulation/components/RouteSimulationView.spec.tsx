import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

it('shows the history range and the simulation range in the header', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  expect(screen.getByText(/Histori Jun 2026 H1 s.d. Agu 2026 H2/)).toBeInTheDocument()
  expect(screen.getByText(/Simulasi mulai Sep 2026 H1, horizon 12 periode/)).toBeInTheDocument()
})

it('runs the estimate from Coba-coba by jumping to tab 8', () => {
  render(<RouteSimulationView source={fixtureSource()} />)
  fireEvent.click(screen.getByRole('button', { name: '9 · Coba-coba' }))
  fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
  expect(screen.getByRole('button', { name: '8 · Distribusi Optimal' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('status')).toHaveTextContent('Estimasi dihitung ulang dengan vendor saat ini (12 periode mulai Sep 2026 H1)')
})

it('restarts the toast timer when the same message fires again', () => {
  jest.useFakeTimers()
  try {
    render(<RouteSimulationView source={fixtureSource()} />)
    fireEvent.click(screen.getByRole('button', { name: '9 · Coba-coba' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => { jest.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByRole('button', { name: '9 · Coba-coba' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
    act(() => { jest.advanceTimersByTime(3000) })
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})
