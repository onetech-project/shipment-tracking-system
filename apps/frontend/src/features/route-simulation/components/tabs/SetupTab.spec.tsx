import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { SetupTab } from './SetupTab'

const src = fixtureSource()

it('edits a tranche amount through the reducer on blur', () => {
  const dispatch = jest.fn()
  render(<SetupTab source={src} sim={createState(src)} dispatch={dispatch} />)
  const input = screen.getAllByLabelText('Nominal modal')[0]
  fireEvent.change(input, { target: { value: '5000000' } })
  fireEvent.blur(input)
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'trSet', field: 'amount', value: 5000000 }))
})

it('suggests vendors that are not accounts yet but accepts any name', () => {
  const dispatch = jest.fn()
  const { container } = render(<SetupTab source={src} sim={createState(src)} dispatch={dispatch} />)
  expect(Array.from(container.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toEqual(['AURI'])
  const input = screen.getByLabelText('Nama vendor untuk akun baru')
  fireEvent.change(input, { target: { value: '  Garuda Cargo  ' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Akun' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'Garuda Cargo' }))
  expect(input).toHaveValue('')
})

it('has no history range picker', () => {
  render(<SetupTab source={src} sim={createState(src)} dispatch={jest.fn()} />)
  expect(screen.queryByText('Rentang histori')).not.toBeInTheDocument()
  expect(screen.queryByText('Histori mulai')).not.toBeInTheDocument()
})

it('shows the daily allowance hint per tranche', () => {
  const sim = createState(src)
  sim.accounts[0].tranches[0].amount = 3_000_000
  render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getAllByText(/boleh dipakai Rp 100\.000 \/ hari/)[0]).toBeInTheDocument()
})

it('refreshes the label input after loading a scenario that reuses the same tranche id', () => {
  const sim = createState(src)
  const { rerender } = render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  const loaded = {
    ...sim,
    accounts: sim.accounts.map((a, ai) =>
      ai === 0 ? { ...a, tranches: a.tranches.map((t, ti) => (ti === 0 ? { ...t, label: 'Label baru' } : t)) } : a,
    ),
  }
  rerender(<SetupTab source={src} sim={loaded} dispatch={jest.fn()} />)
  const input = screen.getAllByLabelText('Label modal')[0] as HTMLInputElement
  expect(input.value).toBe('Label baru')
})
