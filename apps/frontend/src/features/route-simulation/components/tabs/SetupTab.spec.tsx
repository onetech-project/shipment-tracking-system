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

it('offers only vendors that are not accounts yet', () => {
  const sim = createState(src)
  render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  const options = Array.from((screen.getByLabelText('Vendor untuk akun baru') as HTMLSelectElement).options).map((o) => o.value)
  expect(options).toEqual(['AURI'])
})

it('shows the daily allowance hint per tranche', () => {
  const sim = createState(src)
  sim.accounts[0].tranches[0].amount = 3_000_000
  render(<SetupTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getAllByText(/boleh dipakai Rp 100\.000 \/ hari/)[0]).toBeInTheDocument()
})
