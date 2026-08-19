/**
 * Unit test for DeleteRouteGroupDialog. Pins that a rejecting onConfirm surfaces the backend's
 * error message inside the dialog rather than failing silently: without a catch, the rejection
 * goes unhandled and the user is left staring at a dialog that just re-enabled its button with no
 * explanation.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DeleteRouteGroupDialog } from './DeleteRouteGroupDialog'
import { RouteGroup } from '../types'

const group: RouteGroup = {
  id: 'rg-1',
  name: 'Java Routes',
  description: null,
  routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
}

it('shows the backend error message and keeps the dialog open when the delete fails', async () => {
  const onConfirm = jest.fn().mockRejectedValue({
    response: { data: { message: 'This group is still referenced by a saved PnL comparison.' } },
  })
  const onClose = jest.fn()
  render(<DeleteRouteGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(
    await screen.findByText('This group is still referenced by a saved PnL comparison.'),
  ).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
})

it('falls back to a generic message when the error has no response payload', async () => {
  const onConfirm = jest.fn().mockRejectedValue(new Error('network down'))
  const onClose = jest.fn()
  render(<DeleteRouteGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('An error occurred')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

it('closes the dialog when the delete succeeds', async () => {
  const onConfirm = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<DeleteRouteGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})
