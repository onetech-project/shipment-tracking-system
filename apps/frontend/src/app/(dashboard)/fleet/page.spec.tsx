import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetIndexPage from './page'

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

describe('FleetIndexPage', () => {
  beforeEach(() => replace.mockClear())

  it('redirects to the vehicles section', () => {
    render(<FleetIndexPage />)
    expect(replace).toHaveBeenCalledWith('/fleet/vehicles')
  })

  // replace(), not push(): /fleet is a signpost, and leaving it in history means Back from
  // /fleet/vehicles bounces the operator straight forward again.
  it('renders nothing of its own', () => {
    const { container } = render(<FleetIndexPage />)
    expect(container).toBeEmptyDOMElement()
  })
})
