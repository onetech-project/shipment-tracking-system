import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { fixtureSource } from '../../engine/__fixtures__/source'
import { createState } from '../../engine'
import { RoutesTab } from './RoutesTab'

const src = fixtureSource()

it('flags a slot that ends before it starts', () => {
  const sim = createState(src)
  sim.routes[0].slots = [{ start: '18:00', end: '06:00' }]
  render(<RoutesTab source={src} sim={sim} dispatch={jest.fn()} />)
  expect(screen.getByText('Jam selesai sebelum jam mulai')).toBeInTheDocument()
})

it('requires origin code, origin and destination to add a route', () => {
  const dispatch = jest.fn()
  render(<RoutesTab source={src} sim={createState(src)} dispatch={dispatch} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Rute' }))
  expect(dispatch).not.toHaveBeenCalled()
  expect(screen.getByText('Kode asal, kota asal, dan tujuan wajib diisi')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Kode asal'), { target: { value: 'cgk' } })
  fireEvent.change(screen.getByLabelText('Kota asal'), { target: { value: 'Jabo' } })
  fireEvent.change(screen.getByLabelText('Tujuan'), { target: { value: 'Manado' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Tambah Rute' }))
  expect(dispatch).toHaveBeenCalledWith({ type: 'routeAdd', route: { origin: 'Jabo', originLabel: 'CGK', dest: 'Manado', rateSpx: 0, overrideTon: 0 } })
})
