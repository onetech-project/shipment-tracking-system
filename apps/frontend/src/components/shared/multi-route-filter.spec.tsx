import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MultiRouteFilter } from './multi-route-filter'

const routes = ['CGK - SUB', 'Jabo → Denpasar', 'Jabo → Aceh']

function open(selected: string[] = [], onChange = jest.fn()) {
  render(<MultiRouteFilter routes={routes} selected={selected} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  return onChange
}

// The checkbox carries no accessible name of its own — the label text sits in a sibling <span> —
// so it is addressed through the <label> that wraps it. The same text can also appear in the
// trigger button (e.g. as the "1 selected" summary), so pick the match that is inside a <label>.
function checkboxFor(label: string): HTMLElement {
  const match = screen.getAllByText(label).find((el) => el.closest('label'))
  return within(match!.closest('label')!).getByRole('checkbox')
}

describe('MultiRouteFilter', () => {
  it('summarises no selection, one selection and many', () => {
    // Once a route is selected the trigger grows a "Clear routes" span that is also
    // role="button", so the trigger itself is addressed by its (closed) expanded state.
    const { rerender } = render(<MultiRouteFilter routes={routes} selected={[]} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('All Routes')

    rerender(<MultiRouteFilter routes={routes} selected={['Jabo → Aceh']} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Jabo → Aceh')

    rerender(<MultiRouteFilter routes={routes} selected={routes} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('3 routes')
  })

  it('appends a newly ticked route rather than replacing the selection', () => {
    // Selection order is meaningful to the P&L comparison, where it decides column order.
    const onChange = open(['Jabo → Aceh'])
    fireEvent.click(checkboxFor('Jabo → Denpasar'))
    expect(onChange).toHaveBeenCalledWith(['Jabo → Aceh', 'Jabo → Denpasar'])
  })

  it('unticks a route already selected', () => {
    const onChange = open(['Jabo → Aceh'])
    fireEvent.click(checkboxFor('Jabo → Aceh'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('narrows the list by the search box without changing the selection', () => {
    open()
    fireEvent.change(screen.getByPlaceholderText('Search routes…'), { target: { value: 'denpasar' } })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('selects everything with All and clears with None', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onChange).toHaveBeenCalledWith(routes)
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
