/**
 * Three separate facts a share table must never conflate: the data failed to load, the data loaded
 * and was empty, and the data loaded but part of it has no name attached.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ShareBlock } from './ShareBlock'
import { buildShare } from '../utils/share'

// jsdom implements no ResizeObserver, and recharts' ResponsiveContainer constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

const share = buildShare([
  { name: 'Lion', weight: 80, cost: 800 },
  { name: null, weight: 20, cost: 300 },
])

/**
 * Three distinguishable weights, three distinguishable costs, and an attributed share (90%) that
 * equals no single row's share — so a reversed sort, a swapped denominator or an
 * attributedPct-read-off-the-top-row all change what renders.
 *
 * Lion    60 kg / Rp 720 → 60.0% of weight, Rp 12/kg
 * Garuda  30 kg / Rp 150 → 30.0% of weight, Rp  5/kg
 * (none)  10 kg / Rp 250 → 10.0% of weight, Rp 25/kg
 * Cost shares are 64.3 / 13.4 / 22.3 — none of them collides with a weight share.
 */
const ranked = buildShare([
  { name: 'Garuda', weight: 30, cost: 150 },
  { name: null, weight: 10, cost: 250 },
  { name: 'Lion', weight: 60, cost: 720 },
])

/** Intl currency output uses U+00A0; normalise so assertions can be written with plain spaces. */
const text = (el: Element) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ').trim()

const headers = () => screen.getAllByRole('columnheader').map(text)

const bodyRows = () =>
  screen
    .getAllByRole('row')
    .slice(1) // drop the header row
    .map((r) => within(r).getAllByRole('cell').map(text))

describe('ShareBlock', () => {
  it('renders one row per entry with its share of tonnage', () => {
    render(<ShareBlock what="Airlines" share={share} isError={false} isLoading={false} />)
    expect(screen.getByText('Lion')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('flags how much tonnage carries no name', () => {
    render(<ShareBlock what="Airlines" share={share} isError={false} isLoading={false} />)
    expect(screen.getByTestId('share-attributed')).toHaveTextContent('80.0%')
  })

  it('says the data failed to load rather than showing an empty table', () => {
    render(<ShareBlock what="Airlines" share={undefined} isError isLoading={false} />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
  })

  it('says the period was empty when it loaded with no rows', () => {
    render(
      <ShareBlock what="Airlines" share={buildShare([])} isError={false} isLoading={false} />,
    )
    expect(screen.getByText(/no airlines in this period/i)).toBeInTheDocument()
  })

  // --- the four facts above, pinned hard enough that a mutation cannot slip past ---

  it('a failed load never renders the empty-period wording, and vice versa', () => {
    const { unmount } = render(
      <ShareBlock what="Airlines" share={undefined} isError isLoading={false} />,
    )
    expect(screen.getByText('Airlines could not be loaded, so this section is incomplete.'))
      .toBeInTheDocument()
    expect(screen.queryByText(/no airlines in this period/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    unmount()

    render(<ShareBlock what="Airlines" share={buildShare([])} isError={false} isLoading={false} />)
    expect(screen.getByText('No airlines in this period.')).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })

  it('an error wins over data that did arrive — a stale table must not be shown as current', () => {
    render(<ShareBlock what="Airlines" share={share} isError isLoading={false} />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows loading rather than any of the three data verdicts', () => {
    render(<ShareBlock what="Airlines" share={undefined} isError isLoading />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })

  it('labels the columns in the order the cells are written', () => {
    render(<ShareBlock what="Airlines" nameHeader="Airline" share={ranked} isError={false} isLoading={false} />)
    expect(headers()).toEqual(['Airline', 'Weight', 'Share', 'Cost', 'Cost / kg'])
  })

  it('falls back to the plural noun when no name header is given', () => {
    render(<ShareBlock what="RA providers" share={ranked} isError={false} isLoading={false} />)
    expect(headers()[0]).toBe('RA providers')
  })

  it('ranks by tonnage descending and keeps the unattributed bucket last', () => {
    render(<ShareBlock what="Airlines" nameHeader="Airline" share={ranked} isError={false} isLoading={false} />)
    expect(bodyRows().map((cells) => cells[0])).toEqual(['Lion', 'Garuda', '—'])
  })

  it('reports each row against the right denominator, column by column', () => {
    render(<ShareBlock what="Airlines" nameHeader="Airline" share={ranked} isError={false} isLoading={false} />)
    // Share is a share of WEIGHT, not of cost: Lion is 60.0% of tonnage but 64.3% of spend.
    expect(bodyRows()).toEqual([
      ['Lion', '60', '60.0%', 'Rp 720', 'Rp 12'],
      ['Garuda', '30', '30.0%', 'Rp 150', 'Rp 5'],
      ['—', '10', '10.0%', 'Rp 250', 'Rp 25'],
    ])
  })

  it('names the unattributed tonnage with the em-dash placeholder, not a blank cell', () => {
    render(<ShareBlock what="Airlines" nameHeader="Airline" share={ranked} isError={false} isLoading={false} />)
    const last = bodyRows()[2]
    expect(last[0]).toBe('—')
    expect(last[0]).not.toBe('')
  })

  it('states the attributed share of tonnage, not the leading row s share', () => {
    render(<ShareBlock what="Airlines" share={ranked} isError={false} isLoading={false} />)
    // 90 of 100 kg carries a name; the top row alone is only 60%.
    expect(screen.getByTestId('share-attributed')).toHaveTextContent(
      '90.0% of tonnage carries a name; the rest is grouped under —.',
    )
  })
})
