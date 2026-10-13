import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource, PROTOTYPE_ACCOUNTS } from '../../engine/__fixtures__/source'
import { buildLanes, createState } from '../../engine'
import { SimTab } from './SimTab'

const src = fixtureSource()
const sim0 = { ...createState(src), accounts: PROTOTYPE_ACCOUNTS }
const sim = { ...sim0, lanes: buildLanes(src, sim0) }

it('starts from the recommendation and offers no revert', () => {
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} onRun={jest.fn()} />)
  expect(screen.getByText(/Ini rekomendasi/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pakai rekomendasi' })).toBeDisabled()
})

it('opens a route and edits kg per day', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} onRun={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  const kg = screen.getAllByLabelText(/^Kg per hari /)[0]
  fireEvent.change(kg, { target: { value: '5' } })
  fireEvent.blur(kg)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'simKg', value: 5 }))
})

it('warns when a manual plan breaks a limit', () => {
  const lane = sim.lanes.find((l) => l.vendor === 'PELITA')!
  const manual = { ...sim, sim: { ...sim.sim, kg: { [lane.id]: 1_000_000 } } }
  render(<SimTab source={src} sim={manual} dispatch={jest.fn()} onRun={jest.fn()} />)
  expect(screen.getByText('Peringatan')).toBeInTheDocument()
  expect(screen.getByText(/melanggar batas/)).toBeInTheDocument()
})

it('sets the horizon in days, blank meaning run on', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} onRun={jest.fn()} />)
  const days = screen.getByLabelText('Untuk berapa hari ke depan')
  fireEvent.change(days, { target: { value: '' } })
  fireEvent.blur(days)
  expect(dispatch).toHaveBeenCalledWith({ type: 'simDays', value: null })
})

it('explains an unusable lane as missing an account, not just "akun nonaktif"', () => {
  const noAccount = { ...sim, accounts: sim.accounts.filter((a) => a.id !== 'PELITA') }
  render(<SimTab source={src} sim={noAccount} dispatch={jest.fn()} onRun={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  expect(screen.getAllByText('belum ada akun').length).toBeGreaterThan(0)
  expect(screen.queryByText('akun nonaktif')).not.toBeInTheDocument()
})

it('explains an unusable lane as the account having no capital when it has no tranches', () => {
  const noTranches = { ...sim, accounts: sim.accounts.map((a) => (a.id === 'PELITA' ? { ...a, tranches: [] } : a)) }
  render(<SimTab source={src} sim={noTranches} dispatch={jest.fn()} onRun={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  expect(screen.getAllByText('akun tanpa modal').length).toBeGreaterThan(0)
})

it('still reports "akun nonaktif" when the account itself is switched off', () => {
  const disabled = { ...sim, accounts: sim.accounts.map((a) => (a.id === 'PELITA' ? { ...a, enabled: false } : a)) }
  render(<SimTab source={src} sim={disabled} dispatch={jest.fn()} onRun={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  expect(screen.getAllByText('akun nonaktif').length).toBeGreaterThan(0)
})

it('shows lane cost read-only with its component breakdown', () => {
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} onRun={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Buka semua' }))
  expect(screen.queryAllByLabelText(/^Cost per kg /)).toHaveLength(0)
  expect(screen.getAllByTitle(/^Rincian: SG Out Rp 0 \+ SG In Rp 0 \+ RA Rp 0 \+ SMU Rp [\d.]+$/).length).toBeGreaterThan(0)
})

it('adds a vendor account from Coba-coba', () => {
  const dispatch = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={dispatch} onRun={jest.fn()} />)
  expect(screen.getByText('Tambah vendor')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nama vendor untuk akun baru'), { target: { value: 'AURI' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Akun' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'AURI' }))
})

it('runs the estimate', () => {
  const onRun = jest.fn()
  render(<SimTab source={src} sim={sim} dispatch={jest.fn()} onRun={onRun} />)
  fireEvent.click(screen.getByRole('button', { name: 'Run estimasi →' }))
  expect(onRun).toHaveBeenCalled()
})
