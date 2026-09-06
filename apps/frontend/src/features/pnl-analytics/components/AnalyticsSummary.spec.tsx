import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsSummary } from './AnalyticsSummary'
import { KPI_KEYS, KpiKey, KpiSet, Kpis } from '../types'

const kpis: Kpis = {
  days: 4,
  weight: 40,
  weightPerDay: 10,
  revenue: 400,
  revenuePerDay: 100,
  revenuePerKg: 10,
  cost: 240,
  costPerDay: 60,
  costPerKg: 6,
  margin: 160,
  marginPerDay: 40,
  marginPerKg: 4,
  marginPct: 40,
}

const set = (deltaPct: number | null): KpiSet =>
  Object.fromEntries(
    KPI_KEYS.map((k) => [k, { value: kpis[k], prev: deltaPct == null ? null : kpis[k], deltaPct }]),
  ) as KpiSet

describe('AnalyticsSummary', () => {
  it('renders one card per KPI', () => {
    render(
      <AnalyticsSummary
        kpi={kpis}
        kpiDelta={set(null)}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(screen.getAllByTestId(/^kpi-/)).toHaveLength(KPI_KEYS.length)
  })

  it('shows a delta when there is a usable baseline', () => {
    render(
      <AnalyticsSummary
        kpi={kpis}
        kpiDelta={set(12.5)}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(within(screen.getByTestId('kpi-revenue')).getByText('+12.5%')).toBeInTheDocument()
  })

  it('shows no delta at all — not 0% — when there is no usable baseline', () => {
    render(
      <AnalyticsSummary kpi={kpis} kpiDelta={set(null)} baselineIncomplete scopeLabel="All routes" />,
    )
    expect(within(screen.getByTestId('kpi-revenue')).queryByText(/%$/)).not.toBeInTheDocument()
    expect(screen.getByTestId('analytics-summary-note')).toHaveTextContent(/baseline/i)
  })
})

/**
 * The tests above never look at what a card actually says. A KPI grid that renders its labels in a
 * different order than its values mislabels every figure on the page while staying green, so the
 * hardening below pins label→value pairing card by card, the exact ordering of the grid, and the
 * three different number formats (compact rupiah, exact rupiah, plain count) that make a swapped
 * card visible.
 */

// Distinct across every key, so a label paired with the wrong value cannot look correct. Money
// values are large enough that compact and exact formatting render differently.
const spread: Kpis = {
  days: 15,
  weight: 123456.7,
  weightPerDay: 8230.4,
  revenue: 400000000,
  revenuePerDay: 26666666,
  revenuePerKg: 3240,
  cost: 240000000,
  costPerDay: 16000000,
  costPerKg: 1944,
  margin: 160000000,
  marginPerDay: 10666666,
  marginPerKg: 1296,
  marginPct: 40,
}

const deltas = (per: Partial<Record<KpiKey, number | null>>, fallback: number | null = null): KpiSet =>
  Object.fromEntries(
    KPI_KEYS.map((k) => {
      const d = k in per ? (per[k] as number | null) : fallback
      return [k, { value: spread[k], prev: d == null ? null : spread[k], deltaPct: d }]
    }),
  ) as KpiSet

const card = (key: KpiKey) => screen.getByTestId(`kpi-${key}`)

/**
 * `Intl` separates "Rp" from the digits with a non-breaking space. Only that character is folded to
 * an ordinary space — digits, separators and the compact suffix are still compared exactly.
 */
const text = (el: Element | null | undefined) => el?.textContent?.replace(/ /g, ' ')

describe('AnalyticsSummary — hardening', () => {
  it('renders the KPI cards in the declared KPI_KEYS order', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({})}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(screen.getAllByTestId(/^kpi-/).map((el) => el.getAttribute('data-testid'))).toEqual(
      KPI_KEYS.map((k) => `kpi-${k}`),
    )
  })

  // Labels in the grid's visual order. If the label map and the key order ever drift apart, every
  // number on this grid is captioned with someone else's name.
  it('captions the cards, in order, with the right labels', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({})}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(
      screen.getAllByTestId(/^kpi-/).map((el) => el.querySelector('p')?.textContent),
    ).toEqual([
      'Days',
      'Weight (kg)',
      'Weight / day',
      'Revenue',
      'Revenue / day',
      'Revenue / kg',
      'Cost',
      'Cost / day',
      'Cost / kg',
      'Margin',
      'Margin / day',
      'Margin / kg',
      'Margin %',
    ])
  })

  // Each card's own value, so a value read from the wrong key is caught. The three formats are all
  // represented: plain counts, compact rupiah, exact rupiah, and the percentage.
  it('pairs each label with its own value in its own format', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({})}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    const value = (key: KpiKey) => text(card(key).querySelectorAll('p')[1])

    // Plain counts, rounded — no currency sign.
    expect(value('days')).toBe('15')
    expect(value('weight')).toBe('123.457')
    expect(value('weightPerDay')).toBe('8.230')

    // Compact rupiah for the totals and per-day figures.
    expect(value('revenue')).toBe('Rp 400 jt')
    expect(value('revenuePerDay')).toBe('Rp 26,7 jt')
    expect(value('cost')).toBe('Rp 240 jt')
    expect(value('costPerDay')).toBe('Rp 16 jt')
    expect(value('margin')).toBe('Rp 160 jt')
    expect(value('marginPerDay')).toBe('Rp 10,7 jt')

    // Exact rupiah for per-kg, so they cannot be misread as kilograms.
    expect(value('revenuePerKg')).toBe('Rp 3.240')
    expect(value('costPerKg')).toBe('Rp 1.944')
    expect(value('marginPerKg')).toBe('Rp 1.296')

    // The one percentage.
    expect(value('marginPct')).toBe('40.0%')
  })

  it('formats a negative margin as compact rupiah, not as a count', () => {
    render(
      <AnalyticsSummary
        kpi={{ ...spread, margin: -160000000, marginPct: -40 }}
        kpiDelta={deltas({})}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(text(card('margin').querySelectorAll('p')[1])).toBe('-Rp 160 jt')
    expect(text(card('marginPct').querySelectorAll('p')[1])).toBe('-40.0%')
  })

  it('gives each card its own delta rather than one shared figure', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({ revenue: 12.5, cost: -3.25, margin: 0 })}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(card('revenue').querySelectorAll('p')[2].textContent).toBe('+12.5%')
    expect(card('cost').querySelectorAll('p')[2].textContent).toBe('-3.3%')
    // Zero is a real, known delta and must be shown as such — only `null` withholds it.
    expect(card('margin').querySelectorAll('p')[2].textContent).toBe('+0.0%')
    // Keys not given a delta carry none at all.
    expect(card('days').querySelectorAll('p')).toHaveLength(2)
  })

  it('colours a non-negative delta green and a negative delta red', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({ revenue: 12.5, cost: -3.25, margin: 0 })}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(card('revenue').querySelectorAll('p')[2].className).toContain('text-emerald-600')
    expect(card('margin').querySelectorAll('p')[2].className).toContain('text-emerald-600')
    expect(card('cost').querySelectorAll('p')[2].className).toContain('text-red-600')
    expect(card('cost').querySelectorAll('p')[2].className).not.toContain('text-emerald-600')
  })

  it('withholds only the deltas that are null, keeping the others', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({ revenue: null, cost: 4.2 })}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(card('revenue').querySelectorAll('p')).toHaveLength(2)
    expect(card('cost').querySelectorAll('p')[2].textContent).toBe('+4.2%')
  })

  it('shows the scope label so the figures cannot be read as the whole period', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({})}
        baselineIncomplete={false}
        scopeLabel="CGK → DPS only"
      />,
    )
    expect(screen.getByText('CGK → DPS only')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
  })

  it('states the exact reason the deltas were hidden', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({})}
        baselineIncomplete
        scopeLabel="All routes"
      />,
    )
    expect(screen.getByTestId('analytics-summary-note')).toHaveTextContent(
      "Period-over-period deltas are hidden: the baseline period's own cost data is incomplete, " +
        'so a delta against it would not be a fact.',
    )
  })

  it('shows no baseline note when the baseline is usable', () => {
    render(
      <AnalyticsSummary
        kpi={spread}
        kpiDelta={deltas({}, 5)}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(screen.queryByTestId('analytics-summary-note')).not.toBeInTheDocument()
  })
})
