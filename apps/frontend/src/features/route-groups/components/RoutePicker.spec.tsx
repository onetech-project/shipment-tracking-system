/**
 * Unit tests for RoutePicker. The route list is passed in rather than fetched, so these tests
 * isolate the picker from the data layer.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RoutePicker } from './RoutePicker'
import { AvailableRoute } from '../types'

const routes: AvailableRoute[] = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', hasData: true },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Batam', hasData: true },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak', hasData: true },
  { origin: 'Medan', originLabel: 'Medan', dest: 'Batam', hasData: false },
]

it('groups the routes under their origin label', () => {
  render(<RoutePicker routes={routes} value={[]} onChange={jest.fn()} />)

  expect(screen.getByText('CGK')).toBeInTheDocument()
  expect(screen.getByText('SUB')).toBeInTheDocument()
  expect(screen.getByText('Medan')).toBeInTheDocument()
})

it('checks the routes already in value', () => {
  render(
    <RoutePicker routes={routes} value={[{ origin: 'Jabo', dest: 'Batam' }]} onChange={jest.fn()} />,
  )

  expect(screen.getByLabelText('CGK → Aceh')).not.toBeChecked()
  expect(screen.getByLabelText('CGK → Batam')).toBeChecked()
})

it('adds a route on tick', () => {
  const onChange = jest.fn()
  render(<RoutePicker routes={routes} value={[]} onChange={onChange} />)

  fireEvent.click(screen.getByLabelText('SUB → Pontianak'))

  expect(onChange).toHaveBeenCalledWith([{ origin: 'Surabaya', dest: 'Pontianak' }])
})

it('removes a route on untick', () => {
  const onChange = jest.fn()
  render(
    <RoutePicker
      routes={routes}
      value={[
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Jabo', dest: 'Batam' },
      ]}
      onChange={onChange}
    />,
  )

  fireEvent.click(screen.getByLabelText('CGK → Aceh'))

  expect(onChange).toHaveBeenCalledWith([{ origin: 'Jabo', dest: 'Batam' }])
})

// Selecting one of these is legitimate, but it will render as an all-em-dash column, so the
// picker says so rather than letting the admin find out in the comparison table.
it('marks a route that has never carried a shipment', () => {
  render(<RoutePicker routes={routes} value={[]} onChange={jest.fn()} />)

  expect(screen.getByTitle('Belum ada shipment di rute ini')).toBeInTheDocument()
})
