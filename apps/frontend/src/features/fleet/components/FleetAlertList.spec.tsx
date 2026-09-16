import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { FleetAlertList } from './FleetAlertList'
import { FleetAlert } from '../types'

function alert(over: Partial<FleetAlert> = {}): FleetAlert {
  return {
    kind: 'document',
    vehicleId: 'v1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    subjectId: 'dt-1',
    label: 'KIR',
    expiresAt: '2026-09-20',
    daysLeft: 4,
    severity: 'warn',
    driverName: 'Ahmad Fauzi',
    ...over,
  }
}

const noop = () => {}

describe('FleetAlertList', () => {
  it('heads the section the way the prototype does', () => {
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByRole('heading', { name: /perlu tindakan/i })).toBeInTheDocument()
  })

  it('names the plate, the document and the unit beneath it', () => {
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
    expect(screen.getByText(/KIR/)).toBeInTheDocument()
    expect(screen.getByText(/Mitsubishi Canter FE 74 HD/)).toBeInTheDocument()
    expect(screen.getByText(/Pool Cakung/)).toBeInTheDocument()
  })

  // The count is what tells an operator whether the section is worth reading before they scroll.
  it('counts the rows in the subheading', () => {
    render(
      <FleetAlertList
        alerts={[alert(), alert({ subjectId: 'dt-2', label: 'STNK' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/2 dokumen perlu diperpanjang/i)).toBeInTheDocument()
  })

  // Rendered from the server's number, never recomputed from the date in the browser.
  it('says how long is left, and how long it has been overdue', () => {
    const { rerender } = render(
      <FleetAlertList alerts={[alert({ daysLeft: 4 })]} isLoading={false} isError={false} onOpen={noop} />,
    )
    expect(screen.getByText(/4 hari lagi/i)).toBeInTheDocument()

    rerender(
      <FleetAlertList
        alerts={[alert({ daysLeft: -7, severity: 'crit' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/lewat 7 hari/i)).toBeInTheDocument()
  })

  it('says today rather than zero days', () => {
    render(<FleetAlertList alerts={[alert({ daysLeft: 0 })]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText(/hari ini/i)).toBeInTheDocument()
  })

  it('names the driver whose licence is expiring', () => {
    render(
      <FleetAlertList
        alerts={[alert({ kind: 'sim', label: 'SIM B2 Umum', subjectId: 'dr-1' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/SIM B2 Umum/)).toBeInTheDocument()
    expect(screen.getByText(/Ahmad Fauzi/)).toBeInTheDocument()
  })

  // Rows are keyed on kind + subjectId + vehicleId. A unit with both its KIR and its STNK due is
  // an ordinary case, not an edge case — if subjectId ever dropped out of that key, the two would
  // collide and one would silently vanish from the list with nothing but a console warning to show
  // for it. Asserted on the rendered rows themselves, not the subheading's count text, which is
  // computed straight from alerts.length and so cannot see a row go missing underneath it.
  it('renders both alerts when two documents on the same vehicle are due', () => {
    render(
      <FleetAlertList
        alerts={[alert({ subjectId: 'dt-1', label: 'KIR' }), alert({ subjectId: 'dt-2', label: 'STNK' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/· KIR/)).toBeInTheDocument()
    expect(screen.getByText(/· STNK/)).toBeInTheDocument()
  })

  it('opens the vehicle the row is about', async () => {
    const onOpen = jest.fn()
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /B 9114 KYZ/ }))
    expect(onOpen).toHaveBeenCalledWith('v1')
  })

  // A licence with no unit attached has nothing to open, so it must not present itself as
  // clickable and then do nothing.
  it('does not offer to open a licence with no vehicle', () => {
    render(
      <FleetAlertList
        alerts={[alert({ kind: 'sim', vehicleId: null, nopol: null, subjectId: 'dr-1' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says so when nothing needs attention', () => {
    render(<FleetAlertList alerts={[]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText(/tidak ada dokumen yang jatuh tempo/i)).toBeInTheDocument()
  })

  // The empty state is an affirmative claim that the papers are in order. During an outage that
  // claim is false, and an operator who believes it stops checking.
  it('reports a failure rather than claiming nothing is due', () => {
    render(<FleetAlertList alerts={[]} isLoading={false} isError onOpen={noop} />)
    expect(screen.queryByText(/tidak ada dokumen yang jatuh tempo/i)).not.toBeInTheDocument()
    expect(screen.getByText(/gagal memuat/i)).toBeInTheDocument()
  })

  it('shows a skeleton while loading, not an empty state', () => {
    render(<FleetAlertList alerts={[]} isLoading isError={false} onOpen={noop} />)
    expect(screen.queryByText(/tidak ada dokumen yang jatuh tempo/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('alert-skeleton')).toBeInTheDocument()
  })

  // Colour carries meaning: an operator scans for red first, so crit and warn must render
  // distinctly on every element that encodes severity by colour, not just one of them.
  it('gives critical rows a red tone and warn rows an amber tone', () => {
    const { container } = render(
      <FleetAlertList
        alerts={[
          alert({ subjectId: 'dt-1', severity: 'warn', daysLeft: 4 }),
          alert({ subjectId: 'dt-2', severity: 'crit', daysLeft: -1 }),
        ]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )

    expect(screen.getByText(/4 hari lagi/i)).toHaveClass('text-amber-700')
    expect(screen.getByText(/lewat 1 hari/i)).toHaveClass('text-destructive')

    const dots = container.querySelectorAll('[aria-hidden]')
    expect(dots[0]).toHaveClass('bg-amber-500')
    expect(dots[1]).toHaveClass('bg-destructive')
  })
})
