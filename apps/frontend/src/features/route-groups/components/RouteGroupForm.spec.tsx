/**
 * Unit tests for RouteGroupForm. These pin the two rules the form actually owns: the client-side
 * mirror of the DTO's ArrayMinSize(1) on routes, and sending `description: null` (not undefined)
 * when the field is cleared — undefined would tell the backend to leave the existing value alone,
 * making it impossible for a user to ever clear a description on update.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RouteGroupForm } from './RouteGroupForm'
import { AvailableRoute, RouteGroup } from '../types'

const routes: AvailableRoute[] = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', hasData: true },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Batam', hasData: true },
]

it('rejects submission when no route is selected', async () => {
  const onSubmit = jest.fn()
  render(<RouteGroupForm routes={routes} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Test Group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Pick at least one route')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('sends description: null rather than undefined when the description is cleared', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const initial: RouteGroup = {
    id: 'rg-1',
    name: 'Existing Group',
    description: 'Some existing description',
    routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
  }
  render(<RouteGroupForm initial={initial} routes={routes} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

  const payload = onSubmit.mock.calls[0][0]
  expect(payload.description).toBeNull()
  expect('description' in payload).toBe(true)
})
