/**
 * Unit tests for VendorGroupForm. These pin the three rules the form owns: the client-side mirror
 * of the DTO's ArrayMinSize(1), sending `description: null` (not undefined) when the field is
 * cleared — undefined tells the backend to leave the existing value alone, so a description could
 * never be removed — and that vendor names go out exactly as they came in.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VendorGroupForm } from './VendorGroupForm'
import { AvailableVendor, VendorGroup } from '../types'

const vendors: AvailableVendor[] = [
  { vendor: '  ASIA CARGO ', hasData: true, inMaster: true },
  { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: true },
]

it('rejects submission when no vendor is selected', async () => {
  const onSubmit = jest.fn()
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Maskapai' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Pick at least one vendor')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('rejects submission when the name is blank', async () => {
  const onSubmit = jest.fn()
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.click(screen.getByLabelText('GARUDA INDONESIA'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Name is required')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('sends description: null rather than undefined when the description is cleared', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const initial: VendorGroup = {
    id: 'vg-1',
    name: 'Maskapai',
    description: 'deskripsi lama',
    vendors: ['GARUDA INDONESIA'],
  }
  render(
    <VendorGroupForm
      initial={initial}
      vendors={vendors}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
    />,
  )

  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

  const payload = onSubmit.mock.calls[0][0]
  expect(payload.description).toBeNull()
  expect('description' in payload).toBe(true)
})

// The group's own name is trimmed — it is ours. The vendor names are not: they are the join key.
it('trims the group name but sends the vendor names byte-for-byte', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '  Maskapai  ' } })
  // The identity normalizer is required: getByLabelText normalises the aria-label it reads (trim +
  // whitespace collapse) but never the matcher, so the untrimmed string could not otherwise match.
  fireEvent.click(screen.getByLabelText('  ASIA CARGO ', { normalizer: (v: string) => v }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

  expect(onSubmit.mock.calls[0][0]).toEqual({
    name: 'Maskapai',
    description: null,
    vendors: ['  ASIA CARGO '],
  })
})

it('surfaces the backend message when the submit rejects', async () => {
  const onSubmit = jest.fn().mockRejectedValue({
    response: { data: { message: 'A vendor group named "Maskapai" already exists' } },
  })
  render(<VendorGroupForm vendors={vendors} onSubmit={onSubmit} onCancel={jest.fn()} />)

  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Maskapai' } })
  fireEvent.click(screen.getByLabelText('GARUDA INDONESIA'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(
    await screen.findByText('A vendor group named "Maskapai" already exists'),
  ).toBeInTheDocument()
})
