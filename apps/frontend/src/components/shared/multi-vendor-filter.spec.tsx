import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MultiVendorFilter } from './multi-vendor-filter'

const VENDORS = ['Angkasa Kargo', 'ESP', 'PT Kargo, Tbk']

describe('MultiVendorFilter', () => {
  it('summarises the selection on the trigger', () => {
    const { rerender } = render(
      <MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('All Vendors')

    rerender(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('ESP')

    rerender(
      <MultiVendorFilter vendors={VENDORS} selected={['ESP', 'Angkasa Kargo']} onChange={jest.fn()} />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('2 vendors')
  })

  it('adds a vendor on tick and removes it on untick', () => {
    const onChange = jest.fn()
    render(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Angkasa Kargo' }))
    expect(onChange).toHaveBeenCalledWith(['ESP', 'Angkasa Kargo'])

    fireEvent.click(screen.getByRole('checkbox', { name: 'ESP' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  // Vendor names are free text and the list is flat and alphabetical, so search is the only way
  // through a long one.
  it('filters the list by the search box, case-insensitively', () => {
    render(<MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.change(screen.getByPlaceholderText('Search vendors…'), { target: { value: 'kargo' } })

    expect(screen.getByRole('checkbox', { name: 'Angkasa Kargo' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'PT Kargo, Tbk' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'ESP' })).not.toBeInTheDocument()
  })

  it('says so when the search matches nothing', () => {
    render(<MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.change(screen.getByPlaceholderText('Search vendors…'), { target: { value: 'zzz' } })

    expect(screen.getByText('No vendors')).toBeInTheDocument()
  })

  it('clears everything from the trigger without opening the dropdown', () => {
    const onChange = jest.fn()
    render(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear vendors' }))
    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })

  // Names are never trimmed or re-cased on any path that stores or emits a value, including when a
  // name carries surrounding whitespace straight out of the source sheet. getByLabelText normalises
  // the label text it reads but not the matcher string, so an identity normalizer is required to
  // select this row at all — that requirement is itself proof the component left the whitespace
  // alone. The assertion is on the emitted array, not merely that the checkbox was found, so this
  // fails if a trim/case-fold ever creeps onto the selection path.
  it('keeps a whitespace-padded vendor name byte-identical from click to onChange', () => {
    const onChange = jest.fn()
    const padded = ['ESP', '  Angkasa Kargo  ']
    render(<MultiVendorFilter vendors={padded} selected={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByLabelText('  Angkasa Kargo  ', { normalizer: (v: string) => v }))

    expect(onChange).toHaveBeenCalledWith(['  Angkasa Kargo  '])
  })
})
