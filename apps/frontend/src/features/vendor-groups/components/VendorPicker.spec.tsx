/**
 * Unit tests for VendorPicker. The vendor list is passed in rather than fetched, so these isolate
 * the picker from the data layer. The load-bearing assertion is the last one: search filters on a
 * lowercased copy but every value handed back to onChange is the raw name, because that string
 * ends up in the database and is compared byte-for-byte against v_pnl_to.vendor.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VendorPicker } from './VendorPicker'
import { AvailableVendor } from '../types'

const vendors: AvailableVendor[] = [
  { vendor: 'ASIA CARGO', hasData: true, inMaster: true },
  { vendor: 'GARUDA INDONESIA', hasData: true, inMaster: false },
  { vendor: 'Sriwijaya Air', hasData: false, inMaster: true },
]

it('renders one flat list in the order given, with no grouping headers', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'))).toEqual([
    'ASIA CARGO',
    'GARUDA INDONESIA',
    'Sriwijaya Air',
  ])
})

it('checks the vendors already in value', () => {
  render(<VendorPicker vendors={vendors} value={['GARUDA INDONESIA']} onChange={jest.fn()} />)

  expect(screen.getByLabelText('ASIA CARGO')).not.toBeChecked()
  expect(screen.getByLabelText('GARUDA INDONESIA')).toBeChecked()
})

it('adds a vendor on tick', () => {
  const onChange = jest.fn()
  render(<VendorPicker vendors={vendors} value={[]} onChange={onChange} />)

  fireEvent.click(screen.getByLabelText('Sriwijaya Air'))

  expect(onChange).toHaveBeenCalledWith(['Sriwijaya Air'])
})

it('removes a vendor on untick', () => {
  const onChange = jest.fn()
  render(
    <VendorPicker
      vendors={vendors}
      value={['ASIA CARGO', 'GARUDA INDONESIA']}
      onChange={onChange}
    />,
  )

  fireEvent.click(screen.getByLabelText('ASIA CARGO'))

  expect(onChange).toHaveBeenCalledWith(['GARUDA INDONESIA'])
})

// Selecting one of these is legitimate, but it renders as an all-em-dash column, so the picker
// says so rather than letting the admin find out in the comparison table.
it('marks a vendor no TO has ever used', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getByTitle('Belum ada TO yang memakai vendor ini')).toBeInTheDocument()
})

// A separate signal from the amber dot, and the opposite problem: there IS data, but the rate card
// has no row for this vendor at all.
it('labels a vendor that has data but no rate card', () => {
  render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  expect(screen.getByText('ada data, tidak ada rate card')).toBeInTheDocument()
})

it('filters case-insensitively but hands back the raw name', () => {
  const onChange = jest.fn()
  render(<VendorPicker vendors={vendors} value={[]} onChange={onChange} />)

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'sriwijaya' } })

  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Sriwijaya Air'))
  expect(onChange).toHaveBeenCalledWith(['Sriwijaya Air'])
})

it('counts the whole selection, including rows the current search hides', () => {
  render(
    <VendorPicker
      vendors={vendors}
      value={['ASIA CARGO', 'Sriwijaya Air']}
      onChange={jest.fn()}
    />,
  )

  expect(screen.getByText('2 selected')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'garuda' } })

  expect(screen.getByText('2 selected')).toBeInTheDocument()
})

it('explains an empty search result differently from an empty vendor list', () => {
  const { rerender } = render(<VendorPicker vendors={vendors} value={[]} onChange={jest.fn()} />)

  fireEvent.change(screen.getByLabelText('Search vendors'), { target: { value: 'zzz' } })
  expect(screen.getByText('No vendor matches that search.')).toBeInTheDocument()

  rerender(<VendorPicker vendors={[]} value={[]} onChange={jest.fn()} />)
  expect(screen.getByText('No vendors available.')).toBeInTheDocument()
})

// Names are never trimmed or re-cased anywhere on the selection path, including when they carry
// surrounding whitespace straight out of the spreadsheet. getByLabelText normalises the label text
// it reads but not the matcher string, so an identity normalizer is required to select this row —
// that requirement is itself proof the component left the whitespace alone.
it('keeps a vendor name with surrounding whitespace untouched end to end', () => {
  const onChange = jest.fn()
  const padded: AvailableVendor[] = [{ vendor: '  ASIA CARGO ', hasData: true, inMaster: true }]
  render(<VendorPicker vendors={padded} value={[]} onChange={onChange} />)

  fireEvent.click(screen.getByLabelText('  ASIA CARGO ', { normalizer: (v: string) => v }))

  expect(onChange).toHaveBeenCalledWith(['  ASIA CARGO '])
})

// A name in `value` that `vendors` no longer lists — e.g. a sheet re-sync dropped it. Without a row
// for it, `toggle` (the only way to mutate `selected`) can never reach it, and the service
// re-validates the whole array on every save, so the group becomes permanently un-editable. It has
// to render, be tickable, and be flagged as distinct from the rest of the list.
describe('an orphaned selection no longer in the vendor list', () => {
  it('renders with its own checkbox, already checked', () => {
    render(<VendorPicker vendors={vendors} value={['DEFUNCT CARGO']} onChange={jest.fn()} />)

    expect(screen.getByLabelText('DEFUNCT CARGO')).toBeChecked()
  })

  it('is removed from the emitted array on untick', () => {
    const onChange = jest.fn()
    render(
      <VendorPicker vendors={vendors} value={['ASIA CARGO', 'DEFUNCT CARGO']} onChange={onChange} />,
    )

    fireEvent.click(screen.getByLabelText('DEFUNCT CARGO'))

    expect(onChange).toHaveBeenCalledWith(['ASIA CARGO'])
  })

  it('is flagged with a marker distinct from the hasData/inMaster markers', () => {
    render(<VendorPicker vendors={vendors} value={['DEFUNCT CARGO']} onChange={jest.fn()} />)

    expect(screen.getByText('tidak ada di daftar vendor')).toBeInTheDocument()
  })

  it('does not put the orphan marker on a genuine vendor row', () => {
    render(<VendorPicker vendors={vendors} value={['DEFUNCT CARGO']} onChange={jest.fn()} />)

    const sriwijayaRow = screen.getByLabelText('Sriwijaya Air').closest('label')
    expect(sriwijayaRow).not.toHaveTextContent('tidak ada di daftar vendor')
  })

  // A row with both hasData and inMaster false never occurs for a genuine vendor — the endpoint's
  // union guarantees at least one is true. It only happens for an orphan, and the orphan marker
  // must replace those two markers rather than stack alongside them.
  it('does not also show the hasData/inMaster markers on the orphan row', () => {
    render(<VendorPicker vendors={vendors} value={['DEFUNCT CARGO']} onChange={jest.fn()} />)

    const orphanRow = screen.getByLabelText('DEFUNCT CARGO').closest('label')
    expect(orphanRow).not.toHaveTextContent('ada data, tidak ada rate card')
    expect(
      orphanRow?.querySelector('[title="Belum ada TO yang memakai vendor ini"]'),
    ).toBeNull()
  })
})
