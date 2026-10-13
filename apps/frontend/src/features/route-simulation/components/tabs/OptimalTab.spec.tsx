import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState, evaluatePlan, optimizePlan } from '../../engine'
import { fmtIdr } from '../../utils/format'
import { OptimalTab } from './OptimalTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('summarises why each route runs the way it does', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/rute cukup 1 vendor 1 airlines/)).toBeInTheDocument()
  expect(screen.getByText('Pemakaian modal')).toBeInTheDocument()
  expect(screen.getByText(/Net margin \/ 12 periode/)).toBeInTheDocument()
})

it('flags capital that no lane can use', () => {
  // AURI has never flown, so it owns no lane: its money can only sit idle.
  const auri = { id: 'AURI', name: 'AURI', isEsp: false, enabled: true, tranches: [{ id: 'AURI-1', label: 'Modal AURI', amount: 1e9, cofType: 'percent' as const, cofValue: 1, cofUnit: 'month' as const, cycleDays: 30 }] }
  render(<OptimalTab source={src} sim={{ ...sim, accounts: [...sim.accounts, auri] }} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Modal AURI').closest('tr')).toHaveTextContent('Menganggur')
})

it('jumps to Coba-coba', () => {
  const onOpenSim = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={onOpenSim} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka Coba-coba' }))
  expect(onOpenSim).toHaveBeenCalled()
})

it('explains that there is no capital yet instead of blaming routes and tranches for idling', () => {
  // createState's default accounts each have one tranche of amount 0: no capital anywhere.
  const noCapSim = createState(src)
  render(<OptimalTab source={src} sim={noCapSim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/Belum ada modal\. Isi nominal modal tiap akun di tab 1 · Setup Histori & Akun/)).toBeInTheDocument()
  expect(screen.queryByText('Menganggur')).not.toBeInTheDocument()
  expect(screen.queryByText(/lebih menguntungkan/)).not.toBeInTheDocument()
  expect(screen.getAllByText('Belum ada modal untuk dialokasikan. Isi modal di tab 1.').length).toBeGreaterThan(0)
})

it('applies a new start and horizon only when Run is pressed', () => {
  const dispatch = jest.fn()
  render(<OptimalTab source={src} sim={sim} dispatch={dispatch} onOpenSim={jest.fn()} />)
  expect(screen.getByText('Sep 2026 H1 s.d. Feb 2027 H2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run ulang' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Simulasi mulai'), { target: { value: '2026-10-1H' } })
  const horizon = screen.getByLabelText('Horizon simulasi (periode)')
  fireEvent.change(horizon, { target: { value: '4' } })
  fireEvent.blur(horizon)
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByText('belum diterapkan')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Run perubahan' }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'setSimRange', simStart: '2026-10-1H', horizonPeriods: 4 })
})

it('scales the totals to the horizon, 15 days per period', () => {
  const two = { ...sim, horizonPeriods: 2 }
  render(<OptimalTab source={src} sim={two} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  const net = evaluatePlan(src, two, optimizePlan(src, two)).totals.net
  expect(screen.getByText('Net margin / 2 periode').nextSibling).toHaveTextContent(fmtIdr(net * 30))
})

it('compares the best ESP lane with each partner vendor on every route', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText('Perbandingan ESP vs vendor lain').length).toBeGreaterThan(0)
  expect(screen.getAllByText('ESP sendiri').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Vendor lain').length).toBeGreaterThan(0)
})

it('says when ESP has no workable lane on a route', () => {
  // Jabo|Ambon has only SILI and PRIME lanes.
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText('ESP belum punya lane layak di rute ini (cek centang Ikut dan cost di tab 2).').length).toBeGreaterThan(0)
})

it('shows the daily load the active lanes offer next to the route tonnage', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getAllByText(/Load\/hari \(\d+ vendor\) [\d.]+ kg/).length).toBe(sim.routes.length)
  expect(screen.getAllByText(/^(cukup|kurang [\d.]+ kg|belum ada load)$/).length).toBe(sim.routes.length)
})
