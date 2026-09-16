import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FleetSummaryCards } from './FleetSummaryCards'

const SUMMARY = {
  totalUnit: 8,
  dokumenKedaluwarsa: 2,
  jatuhTempo30Hari: 1,
  cicilanPerBulan: 13750000,
  sisaKewajiban: 177500000,
}

describe('FleetSummaryCards', () => {
  it('shows the five figures the prototype showed', () => {
    render(<FleetSummaryCards summary={SUMMARY} isLoading={false} />)

    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText(/kendaraan terdaftar/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/dokumen kedaluwarsa/i)).toBeInTheDocument()
    expect(screen.getByText(/jatuh tempo/i)).toBeInTheDocument()
    expect(screen.getByText(/13\.750\.000/)).toBeInTheDocument()
    expect(screen.getByText(/177\.500\.000/)).toBeInTheDocument()

    // jatuhTempo30Hari (1) is never asserted on its own above — every other figure collides
    // with something else in the fixture, so a wrong value swapped onto this one tile would
    // slip past every assertion up to here. Scoped to the tile itself, not just present anywhere
    // in the document, so the figure has to sit next to its own caption.
    const jatuhTempoTile = screen.getByText(/jatuh tempo/i).closest('div')?.parentElement
    expect(jatuhTempoTile).not.toBeNull()
    expect(within(jatuhTempoTile as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  // A figure of zero is a real answer; a skeleton is what "we do not know yet" looks like.
  it('shows a skeleton rather than zeroes while loading', () => {
    render(<FleetSummaryCards summary={undefined} isLoading />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByTestId('summary-skeleton')).toBeInTheDocument()
  })

  it('renders nothing when the summary could not be read', () => {
    const { container } = render(<FleetSummaryCards summary={undefined} isLoading={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
