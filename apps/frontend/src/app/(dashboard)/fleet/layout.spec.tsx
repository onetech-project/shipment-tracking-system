import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetLayout from './layout'

let pathname = '/fleet/drivers'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

const mockHasPermission = jest.fn()
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}))

describe('FleetLayout', () => {
  beforeEach(() => {
    mockHasPermission.mockReset()
    pathname = '/fleet/drivers'
  })

  it('renders the driver tab and the page content', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi halaman</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Sopir' })).toBeInTheDocument()
    expect(screen.getByText('isi halaman')).toBeInTheDocument()
  })

  // Master data is a separate permission so a field operator can register vehicles without being
  // able to edit the lookup lists. The tab must disappear, not merely 403 on click.
  it('hides the master data tab without read.fleet_master_data', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'read.fleet_master_data')
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.queryByRole('link', { name: 'Master Data' })).not.toBeInTheDocument()
  })

  // The tab labels say nothing about where they go. Without these a tab pointing at the wrong
  // route renders identically and ships silently — the operator clicks "Master Data" and lands
  // somewhere else, or on a 404.
  it('points each tab at its own route', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Sopir' })).toHaveAttribute('href', '/fleet/drivers')
    expect(screen.getByRole('link', { name: 'Master Data' })).toHaveAttribute(
      'href',
      '/fleet/master-data',
    )
  })

  it('marks the active tab with aria-current', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Sopir' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Master Data' })).not.toHaveAttribute('aria-current')
  })

  // Armada is the section the sidebar entry means, so it has to be the first tab — not merely
  // present somewhere in the row.
  it('shows the Armada tab first', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    const tabs = screen.getAllByRole('link')
    expect(tabs[0]).toHaveTextContent('Armada')
    expect(tabs[0]).toHaveAttribute('href', '/fleet/vehicles')
  })

  // The tab is the only route into the register, so gating it on the wrong permission either
  // hides the module from someone who has access or dangles a link that 403s.
  it('hides the Armada tab without read.fleet_vehicle', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'read.fleet_vehicle')
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.queryByRole('link', { name: 'Armada' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sopir' })).toBeInTheDocument()
  })

  it('marks the Armada tab current on /fleet/vehicles', () => {
    mockHasPermission.mockReturnValue(true)
    pathname = '/fleet/vehicles'
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Armada' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Sopir' })).not.toHaveAttribute('aria-current')
  })
})
