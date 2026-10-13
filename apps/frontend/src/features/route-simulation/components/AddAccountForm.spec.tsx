import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../engine/__fixtures__/source'
import { createState } from '../engine'
import { AddAccountForm } from './AddAccountForm'

const src = fixtureSource()

it('adds the typed vendor on Enter and clears the input', () => {
  const dispatch = jest.fn()
  render(<AddAccountForm source={src} sim={createState(src)} dispatch={dispatch} />)
  const input = screen.getByLabelText('Nama vendor untuk akun baru')
  fireEvent.change(input, { target: { value: 'Garuda Cargo' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'Garuda Cargo' }))
  expect(input).toHaveValue('')
})

it('still dispatches for a duplicate account id, but leaves the text for the user to see the refusal', () => {
  const dispatch = jest.fn()
  const sim = createState(src)
  render(<AddAccountForm source={src} sim={sim} dispatch={dispatch} />)
  const input = screen.getByLabelText('Nama vendor untuk akun baru')
  fireEvent.change(input, { target: { value: 'SILI' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Akun' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'acctAdd', vendor: 'SILI' }))
  expect(input).toHaveValue('SILI')
})
