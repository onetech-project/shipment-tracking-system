import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { VehiclesTabs } from './VehiclesTabs'

describe('VehiclesTabs', () => {
  it('shows the prototype three tabs', () => {
    render(<VehiclesTabs value="armada" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /armada & dokumen/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /softcopy berkas/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /kepemilikan & angsuran/i })).toBeInTheDocument()
  })

  it('marks the active tab for assistive technology', () => {
    render(<VehiclesTabs value="berkas" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /softcopy berkas/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /armada & dokumen/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('reports the tab the operator picked', async () => {
    const onChange = jest.fn()
    render(<VehiclesTabs value="armada" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: /kepemilikan & angsuran/i }))
    expect(onChange).toHaveBeenCalledWith('angsuran')
  })
})
