/**
 * The "best combination" is a recommendation. When the 5% tonnage floor did not hold, the winner is
 * one lucky AWB rather than a repeatable rate — and the table has to say so, or the number reads as
 * advice it cannot support.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsJourney } from './AnalyticsJourney'
import { AnalyticsJourneyRow } from '../types'

const jrow = (over: Partial<AnalyticsJourneyRow>): AnalyticsJourneyRow => ({
  vendor: 'ESP',
  airline: 'Lion',
  origin: 'Jabo',
  dest: 'Denpasar',
  awbCount: 10,
  gw: 100,
  chwt: 110,
  revenue: 1000,
  cost: 600,
  margin: 400,
  marginPerKg: 4,
  ...over,
})

/**
 * Four routes with four DISTINCT upsides (812 / 675 / 450 / 0), so the ranking comparator cannot
 * hide behind a tie. Each route also probes one specific rule:
 *
 * - Denpasar: plain case — ESP holds 100 of 400 kg at 4/kg against a 2/kg route average.
 * - Batam:    the two combinations differ only by VENDOR, so `tonnageOnBest` must match on both
 *             vendor and airline, not on airline alone.
 * - Kupang:   the winner ESP (1/kg) is BELOW the 5/kg route average because the 100/kg Lux row is
 *             only 4% of tonnage and is excluded — raw upside is negative and must be clamped to 0.
 * - Palu:     Edge sits at EXACTLY 5% of tonnage, on the floor boundary, so `>=` vs `>` is visible.
 */
const routes: AnalyticsJourneyRow[] = [
  jrow({}),
  jrow({ vendor: 'Acme', gw: 300, margin: 300, marginPerKg: 1 }),
  jrow({ dest: 'Batam', airline: 'Garuda', gw: 100, margin: 1000, marginPerKg: 10 }),
  jrow({ dest: 'Batam', airline: 'Garuda', vendor: 'Acme', gw: 100, margin: 100, marginPerKg: 1 }),
  jrow({ dest: 'Kupang', gw: 96, margin: 96, marginPerKg: 1 }),
  jrow({ dest: 'Kupang', vendor: 'Lux', airline: 'Garuda', gw: 4, margin: 400, marginPerKg: 100 }),
  jrow({ dest: 'Palu', vendor: 'Edge', gw: 5, margin: 50, marginPerKg: 10 }),
  jrow({ dest: 'Palu', vendor: 'Bulk', gw: 95, margin: 95, marginPerKg: 1 }),
]

/** 21 combinations at 10 kg each of 210 kg — every one is 4.76%, so NOTHING clears the 5% floor. */
const floorless: AnalyticsJourneyRow[] = Array.from({ length: 21 }, (_, i) =>
  jrow({ dest: 'Aceh', vendor: `V${i + 1}`, gw: 10, margin: 10 * (i + 1), marginPerKg: i + 1 }),
)

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Header sequence, in DOM order — every cell lookup below is positional against this. */
const headers = () => screen.getAllByRole('columnheader').map((h) => norm(h.textContent))

const cellsOf = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('cell')
    .map((c) => norm(c.textContent))

const rowOrder = () =>
  screen.getAllByTestId(/^journey-/).map((r) => r.getAttribute('data-testid'))

describe('AnalyticsJourney', () => {
  it('ranks routes by the upside of moving tonnage onto the best combination', () => {
    render(
      <AnalyticsJourney
        data={[jrow({}), jrow({ vendor: 'Acme', gw: 300, margin: 300, marginPerKg: 1 })]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    const row = screen.getByTestId('journey-Jabo|Denpasar')
    expect(within(row).getByText(/ESP/)).toBeInTheDocument()
  })

  /**
   * Ordering is the whole claim of this table: the top row is the route worth acting on first. With
   * four distinct upsides a reversed comparator cannot survive.
   */
  it('puts the largest upside first and the zero-upside route last', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(rowOrder()).toEqual([
      'journey-Jabo|Palu',
      'journey-Jabo|Denpasar',
      'journey-Jabo|Batam',
      'journey-Jabo|Kupang',
    ])
  })

  /**
   * Identifying the table by its exact header sequence makes every positional cell assertion below
   * double as a column-order assertion: reorder the columns and the numbers land under the wrong
   * labels, which is the failure mode that silently mislabels every figure on the page.
   */
  it('labels each column in the order the cells are rendered', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(headers()).toEqual([
      'Route',
      'Best combination',
      'Best margin / kg',
      'Route margin / kg',
      'On best',
      'Upside',
    ])
  })

  it('renders each route against its own winner, rate and upside', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(cellsOf('journey-Jabo|Denpasar')).toEqual([
      'CGK → Denpasar',
      'ESP · Lion',
      'Rp 4',
      'Rp 2',
      '25.0%',
      'Rp 675',
    ])
    // Both Batam rows fly Garuda; only the ESP tonnage is "on best", so 50% — not 100%.
    expect(cellsOf('journey-Jabo|Batam')).toEqual([
      'CGK → Batam',
      'ESP · Garuda',
      'Rp 10',
      'Rp 6',
      '50.0%',
      'Rp 450',
    ])
  })

  /**
   * Lux earns 100/kg but carries 4% of Kupang — under the floor, so it cannot set the benchmark.
   * The eligible winner ESP earns 1/kg against a 5/kg route average, so the raw upside is NEGATIVE.
   * Unclamped it would read as -Rp 16; a negative "upside" is a phantom gain pointing the wrong way.
   */
  it('never claims a negative upside when the eligible winner is below the route average', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(cellsOf('journey-Jabo|Kupang')).toEqual([
      'CGK → Kupang',
      'ESP · Lion',
      'Rp 1',
      'Rp 5',
      '96.0%',
      'Rp 0',
    ])
  })

  /**
   * Edge holds exactly 5% of Palu — precisely ON the eligibility floor. A route sitting on the
   * boundary is the only fixture that can tell `>= 5` from `> 5`.
   */
  it('admits a combination sitting exactly on the 5% tonnage floor', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(cellsOf('journey-Jabo|Palu')).toEqual([
      'CGK → Palu',
      'Edge · Lion',
      'Rp 10',
      'Rp 1',
      '5.0%',
      'Rp 812',
    ])
  })

  it('leaves an eligible winner unmarked, so the warning means something', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    for (const key of ['Palu', 'Denpasar', 'Batam', 'Kupang']) {
      expect(
        within(screen.getByTestId(`journey-Jabo|${key}`)).queryByTitle(/tonnage floor/i),
      ).not.toBeInTheDocument()
    }
  })

  it('marks a route whose winner did not clear the tonnage floor', () => {
    // 21 combinations at 10 kg of 210 — every one is 4.76%, so nothing is eligible and the winner
    // comes from the unfiltered set.
    render(
      <AnalyticsJourney
        data={floorless}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    const row = screen.getByTestId('journey-Jabo|Aceh')
    expect(within(row).getByTitle(/tonnage floor/i)).toBeInTheDocument()
    expect(cellsOf('journey-Jabo|Aceh')).toEqual([
      'CGK → Aceh',
      'V21 · Lion⚠',
      'Rp 21',
      'Rp 11',
      '4.8%',
      'Rp 2.000',
    ])
  })

  it('totals the tonnage already on its best combination and the rest of the prize', () => {
    render(
      <AnalyticsJourney
        data={routes}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    // 301 of 800 kg on best = 37.6%; 812 + 675 + 450 + 0 = Rp 1.937 of upside.
    expect(screen.getByText(/already flies on its route/i).textContent?.replace(/\s+/g, ' ')).toBe(
      "37.6% of 800 kg already flies on its route's best combination. Moving the rest would be worth Rp 1.937.",
    )
  })

  it('says the data failed to load rather than showing an empty ranking', () => {
    render(
      <AnalyticsJourney data={undefined} isLoading={false} isError scoped={false} ranged={false} />,
    )
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('distinguishes a loaded-but-empty period from a failed load', () => {
    render(
      <AnalyticsJourney
        data={[]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(screen.getByText(/no vendor and airline combination/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })

  /** The endpoint carries no route dimension, so a narrowed scope must be disclosed, not applied. */
  it('discloses that the route scope and custom range do not reach this section', () => {
    render(
      <AnalyticsJourney data={routes} isLoading={false} isError={false} scoped ranged />,
    )
    expect(screen.getByText(/route scope selected above does not apply/i)).toBeInTheDocument()
    expect(screen.getByText(/custom date range is active/i)).toBeInTheDocument()
  })
})
