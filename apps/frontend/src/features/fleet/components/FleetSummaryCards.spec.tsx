import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FleetSummaryCards } from './FleetSummaryCards'

// Every figure is distinct so a tile carrying its neighbour's value is a change a test can
// actually see — two tiles sharing 0 would make a swap between them invisible by construction.
const SUMMARY = {
  totalUnit: 8,
  dokumenKedaluwarsa: 2,
  jatuhTempo30Hari: 1,
  cicilanPerBulan: 13750000,
  sisaKewajiban: 177500000,
}

// Resolves the tile div that owns a caption, so a value can be asserted against ITS OWN tile
// rather than merely "present somewhere on screen" — a figure rendered under the wrong caption
// is worse than no tile at all, and only a DOM-scoped assertion catches that.
const getTile = (captionPattern: RegExp) => {
  const caption = screen.getByText(captionPattern)
  const tile = caption.closest('div')?.parentElement
  expect(tile).not.toBeNull()
  return tile as HTMLElement
}

describe('FleetSummaryCards', () => {
  it('pins every figure to the tile carrying its own caption', () => {
    render(<FleetSummaryCards summary={SUMMARY} isLoading={false} />)

    expect(within(getTile(/kendaraan terdaftar/i)).getByText('8')).toBeInTheDocument()
    expect(within(getTile(/dokumen kedaluwarsa/i)).getByText('2')).toBeInTheDocument()
    expect(within(getTile(/jatuh tempo/i)).getByText('1')).toBeInTheDocument()
    expect(within(getTile(/cicilan & sewa per bulan/i)).getByText(/13\.750\.000/)).toBeInTheDocument()
    expect(within(getTile(/sisa kewajiban leasing/i)).getByText(/177\.500\.000/)).toBeInTheDocument()
  })

  it('gives the already-expired tile the destructive tone and the expiring-soon tile the warning tone', () => {
    render(<FleetSummaryCards summary={SUMMARY} isLoading={false} />)

    // Colour is the operator's fast read: red for papers already lapsed, amber for papers still
    // running out. Scoped to each tile so a tone swap between these two is what fails, not a
    // brittle match on the full Tailwind string (spacing/shade utilities are free to change).
    expect(getTile(/dokumen kedaluwarsa/i).className).toMatch(/destructive/)
    expect(getTile(/jatuh tempo/i).className).toMatch(/amber/)
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
