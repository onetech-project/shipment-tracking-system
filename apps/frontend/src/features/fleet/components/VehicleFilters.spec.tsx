import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleFilters } from './VehicleFilters'
import { FleetMasterRow } from '../types'

const opt = (id: string, label: string): FleetMasterRow => ({
  id,
  category: 'pool',
  code: id,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
})

const setup = (value = {}, onChange = jest.fn()) => {
  render(
    <VehicleFilters
      value={value}
      onChange={onChange}
      kepemilikanOptions={[opt('k1', 'Milik Sendiri')]}
      poolOptions={[opt('p1', 'Pool Cakung')]}
      statusOptions={[opt('s1', 'Beroperasi')]}
    />,
  )
  return onChange
}

describe('VehicleFilters', () => {
  it('renders the current search term', () => {
    setup({ q: 'canter' })
    expect(screen.getByLabelText(/cari/i)).toHaveValue('canter')
  })

  it('reports a typed search term', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/cari/i), { target: { value: 'B 9114' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'B 9114' }))
  })

  // Every filter change has to reset to page 1. Staying on page 4 after narrowing to two results
  // shows an empty table and reads as "the filter found nothing".
  it('resets to the first page whenever a filter changes', () => {
    const onChange = setup({ page: 4, q: 'x' })
    fireEvent.change(screen.getByLabelText(/cari/i), { target: { value: 'y' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('offers every severity option', () => {
    setup()
    const select = screen.getByLabelText(/dokumen/i)
    expect(select.querySelectorAll('option')).toHaveLength(5)
  })

  it('reports a chosen severity', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/dokumen/i), { target: { value: 'crit' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ severity: 'crit' }))
  })

  // Clearing a filter must send undefined, not ''. An empty string is a value the hook would
  // forward and the backend DTO would reject as a non-UUID.
  it('clears a filter to undefined rather than an empty string', () => {
    const onChange = setup({ severity: 'crit' })
    fireEvent.change(screen.getByLabelText(/dokumen/i), { target: { value: '' } })
    expect(onChange.mock.calls[0][0].severity).toBeUndefined()
  })

  // Every select must clear to undefined, not ''. Only severity was covered before, and an
  // empty string reaching the backend DTO is rejected as a non-UUID.
  it.each([
    [/kepemilikan/i, 'kepemilikanId', 'k1'],
    [/pool/i, 'poolId', 'p1'],
    [/status unit/i, 'statusId', 's1'],
  ])('clears %s to undefined rather than an empty string', (labelRe, field, id) => {
    const onChange = setup({ [field]: id })
    fireEvent.change(screen.getByLabelText(labelRe), { target: { value: '' } })
    expect(onChange.mock.calls[0][0][field]).toBeUndefined()
    expect(field in onChange.mock.calls[0][0]).toBe(true)
  })

  it.each([
    [/kepemilikan/i, 'kepemilikanId', 'k1'],
    [/pool/i, 'poolId', 'p1'],
    [/status unit/i, 'statusId', 's1'],
  ])('reports the chosen %s', (labelRe, field, id) => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(labelRe), { target: { value: id } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ [field]: id }))
  })

  it('lists the master options it was given', () => {
    setup()
    expect(screen.getByRole('option', { name: 'Pool Cakung' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Milik Sendiri' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beroperasi' })).toBeInTheDocument()
  })

  it('toggles archived units into the list', () => {
    const onChange = setup()
    fireEvent.click(screen.getByLabelText(/arsip/i))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ includeArchived: true }))
  })

  it('shows the archived toggle as checked when archives are included', () => {
    setup({ includeArchived: true })
    expect(screen.getByLabelText(/arsip/i)).toBeChecked()
  })

  // Unticking sends undefined, not false: the hook drops undefined keys from the query string,
  // whereas includeArchived=false would travel to the backend as an explicit filter.
  it('drops the archived flag entirely when it is unticked', () => {
    const onChange = setup({ includeArchived: true })
    fireEvent.click(screen.getByLabelText(/arsip/i))
    expect(onChange.mock.calls[0][0].includeArchived).toBeUndefined()
  })

  // The reset button appears for ANY active filter. Tested one at a time, because a disjunction
  // missing a term still lights up whenever some other filter happens to be set.
  it.each([
    ['q', 'x'],
    ['severity', 'crit'],
    ['kepemilikanId', 'k1'],
    ['poolId', 'p1'],
    ['statusId', 's1'],
    ['includeArchived', true],
  ])('offers the reset when only %s is set', (field, val) => {
    setup({ [field]: val })
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  // Paging alone is not a filter — showing reset on page 2 of an unfiltered list is noise.
  it('does not offer the reset for paging alone', () => {
    setup({ page: 3 })
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })

  // Without this the operator has to clear five controls one at a time to get back to the full
  // list, and the archived toggle is easy to forget.
  it('offers a reset that clears every filter at once', () => {
    const onChange = setup({ q: 'x', severity: 'crit', poolId: 'p1', includeArchived: true })
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(onChange).toHaveBeenCalledWith({ page: 1 })
  })

  it('hides the reset button when nothing is filtered', () => {
    setup()
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })
})
