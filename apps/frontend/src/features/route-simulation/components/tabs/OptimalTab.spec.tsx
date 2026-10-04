import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { OptimalTab } from './OptimalTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('summarises why each route runs the way it does', () => {
  render(<OptimalTab source={src} sim={sim} dispatch={jest.fn()} onOpenSim={jest.fn()} />)
  expect(screen.getByText(/rute cukup 1 vendor 1 airlines/)).toBeInTheDocument()
  expect(screen.getByText('Pemakaian modal')).toBeInTheDocument()
  expect(screen.getByText(/Net margin \/ 30 hari/)).toBeInTheDocument()
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
