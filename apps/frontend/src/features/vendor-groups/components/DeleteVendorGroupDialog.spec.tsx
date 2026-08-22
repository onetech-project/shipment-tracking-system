/**
 * Unit tests for DeleteVendorGroupDialog. These pin that a rejecting onConfirm surfaces the
 * backend's message inside the dialog rather than failing silently: without a catch, the rejection
 * goes unhandled and the user is left staring at a dialog that just re-enabled its button with no
 * explanation.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DeleteVendorGroupDialog } from './DeleteVendorGroupDialog'
import { VendorGroup } from '../types'

const group: VendorGroup = {
  id: 'vg-1',
  name: 'Maskapai',
  description: null,
  vendors: ['GARUDA INDONESIA', 'Sriwijaya Air'],
}

it('names the group and says how many vendors it holds', () => {
  render(<DeleteVendorGroupDialog group={group} onConfirm={jest.fn()} onClose={jest.fn()} />)

  expect(screen.getByText('Delete “Maskapai”?')).toBeInTheDocument()
  expect(screen.getByText(/2 vendor/)).toBeInTheDocument()
})

it('shows the backend error message and keeps the dialog open when the delete fails', async () => {
  const onConfirm = jest.fn().mockRejectedValue({
    response: { data: { message: 'Vendor group not found' } },
  })
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('Vendor group not found')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
})

it('falls back to a generic message when the error has no response payload', async () => {
  const onConfirm = jest.fn().mockRejectedValue(new Error('network down'))
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('An error occurred')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

it('closes the dialog when the delete succeeds', async () => {
  const onConfirm = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('cancels without triggering delete', () => {
  const onConfirm = jest.fn()
  const onClose = jest.fn()
  render(<DeleteVendorGroupDialog group={group} onConfirm={onConfirm} onClose={onClose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onConfirm).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})
