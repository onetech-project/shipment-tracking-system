import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsVendor } from './AnalyticsVendor'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'

// jsdom implements no ResizeObserver, and recharts' ResponsiveContainer constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

const data: PnlVendorCostItem[] = [
  {
    vendor: 'ESP',
    totalWeight: 100,
    totalCost: 500,
    airlines: [{ airline: 'Lion', totalWeight: 100, totalCost: 500 }],
  },
  {
    vendor: 'Acme',
    totalWeight: 200,
    totalCost: 1600,
    airlines: [{ airline: 'Lion', totalWeight: 200, totalCost: 1600 }],
  },
]

/**
 * Three vendor/airline pairs with three DISTINCT impacts, one of them negative, so the ranking
 * comparator has no tie to hide behind and the sign of the gap is observable.
 *
 * ESP baselines:  Lion 500/100 = Rp 5/kg   Garuda 2000/200 = Rp 10/kg
 *   Acme|Lion    200 kg @ 1600 → Rp  8/kg, gap +3 → impact  600, capital 1.000
 *   Acme|Garuda  100 kg @ 1400 → Rp 14/kg, gap +4 → impact  400, capital 1.000
 *   Bolt|Lion     50 kg @  150 → Rp  3/kg, gap -2 → impact -100, capital   250
 * Totals: impact 900, capital 2.250. Note 900 is no single row's impact, and the per-kg gaps
 * (3, 4, -2) collide with none of the impacts — so a wrong column cannot pass as a right one.
 */
const ranked: PnlVendorCostItem[] = [
  {
    vendor: 'ESP',
    totalWeight: 300,
    totalCost: 2500,
    airlines: [
      { airline: 'Lion', totalWeight: 100, totalCost: 500 },
      { airline: 'Garuda', totalWeight: 200, totalCost: 2000 },
    ],
  },
  {
    vendor: 'Acme',
    totalWeight: 300,
    totalCost: 3000,
    airlines: [
      { airline: 'Lion', totalWeight: 200, totalCost: 1600 },
      { airline: 'Garuda', totalWeight: 100, totalCost: 1400 },
    ],
  },
  {
    vendor: 'Bolt',
    totalWeight: 50,
    totalCost: 150,
    airlines: [{ airline: 'Lion', totalWeight: 50, totalCost: 150 }],
  },
]

/** Intl currency output uses U+00A0; normalise so assertions can be written with plain spaces. */
const text = (el: Element) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ').trim()

/**
 * Finds the table whose header row is exactly `want`. Identifying a table by its full header
 * sequence means every row lookup below doubles as a column-order assertion.
 */
function tableWithHeaders(want: string[]): HTMLElement {
  const match = screen.getAllByRole('table').filter((t) => {
    const got = within(t).getAllByRole('columnheader').map(text)
    return got.length === want.length && got.every((h, i) => h === want[i])
  })
  if (match.length !== 1) {
    const seen = screen
      .getAllByRole('table')
      .map((t) => within(t).getAllByRole('columnheader').map(text).join(' | '))
    throw new Error(
      `expected exactly one table with headers [${want.join(' | ')}], found ${match.length}. ` +
        `Tables present:\n  ${seen.join('\n  ')}`,
    )
  }
  return match[0]
}

const GAP_HEADERS = [
  'Airline',
  'Vendor',
  'Weight',
  'Vendor / kg',
  'ESP / kg',
  'Gap / kg',
  'Impact',
]

const gapRows = () =>
  within(tableWithHeaders(GAP_HEADERS))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').map(text))

describe('AnalyticsVendor', () => {
  it('shows the self-operate gap against the ESP baseline', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged={false} />)
    // Acme pays 8/kg where ESP pays 5/kg over 200 kg → 600 of impact.
    expect(screen.getByTestId('self-operate-total')).toHaveTextContent('600')
  })

  it('carries the scope note when the viewer has narrowed the scope', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped ranged={false} />)
    expect(screen.getByText(/does not apply/i)).toBeInTheDocument()
  })

  it('carries the range note in custom-range mode', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged />)
    expect(screen.getByText(/whole period/i)).toBeInTheDocument()
  })

  it('says so when no vendor shares an airline with ESP', () => {
    render(
      <AnalyticsVendor
        data={[data[1]]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(screen.getByTestId('self-operate-empty')).toBeInTheDocument()
  })

  // --- pinned hard enough that a mutation cannot slip past ---

  it('shows neither fallback note when the scope and range both apply', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged={false} />)
    expect(screen.queryByText(/does not apply/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/whole period/i)).not.toBeInTheDocument()
  })

  it('does not show the range note merely because the scope is narrowed', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped ranged={false} />)
    expect(screen.queryByText(/whole period/i)).not.toBeInTheDocument()
  })

  it('does not show the scope note merely because a custom range is active', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged />)
    expect(screen.queryByText(/does not apply/i)).not.toBeInTheDocument()
  })

  it('totals the impact and the capital across every comparable pair', () => {
    render(<AnalyticsVendor data={ranked} isLoading={false} isError={false} scoped={false} ranged={false} />)
    const total = screen.getByTestId('self-operate-total')
    // 600 + 400 - 100 = 900 of impact, over 1.000 + 1.000 + 250 = 2.250 of capital.
    expect(text(total)).toContain('Rp 900')
    expect(text(total)).toContain('Rp 2.250')
    // Neither total is any one row's number, so a reduce that stops early cannot pass.
    expect(text(total)).not.toContain('Rp 600')
  })

  it('labels the gap columns in the order the cells are written', () => {
    render(<AnalyticsVendor data={ranked} isLoading={false} isError={false} scoped={false} ranged={false} />)
    expect(within(tableWithHeaders(GAP_HEADERS)).getAllByRole('columnheader').map(text)).toEqual(
      GAP_HEADERS,
    )
  })

  it('ranks the gap rows by impact, biggest first, and reports each column against its own row', () => {
    render(<AnalyticsVendor data={ranked} isLoading={false} isError={false} scoped={false} ranged={false} />)
    expect(gapRows()).toEqual([
      ['Lion', 'Acme', '200', 'Rp 8', 'Rp 5', 'Rp 3', 'Rp 600'],
      ['Garuda', 'Acme', '100', 'Rp 14', 'Rp 10', 'Rp 4', 'Rp 400'],
      ['Lion', 'Bolt', '50', 'Rp 3', 'Rp 5', '-Rp 2', '-Rp 100'],
    ])
  })

  it('keeps a vendor that beats ESP visible, tinted rather than dropped', () => {
    render(<AnalyticsVendor data={ranked} isLoading={false} isError={false} scoped={false} ranged={false} />)
    const rows = within(tableWithHeaders(GAP_HEADERS)).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toHaveClass('text-emerald-700')
    expect(rows[0]).not.toHaveClass('text-emerald-700')
    expect(rows[1]).not.toHaveClass('text-emerald-700')
  })

  it('lists every vendor in the share table, ESP included, ranked by tonnage', () => {
    render(<AnalyticsVendor data={ranked} isLoading={false} isError={false} scoped={false} ranged={false} />)
    const share = tableWithHeaders(['Vendor', 'Weight', 'Share', 'Cost', 'Cost / kg'])
    const rows = within(share)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell').map(text))
    // ESP 300 kg, Acme 300 kg and Bolt 50 kg over 650 kg total.
    expect(rows.map((c) => c[0])).toEqual(['ESP', 'Acme', 'Bolt'])
    expect(rows.map((c) => c[2])).toEqual(['46.2%', '46.2%', '7.7%'])
  })

  it('reports a failed load as absent, not as an empty gap', () => {
    render(
      <AnalyticsVendor data={undefined} isLoading={false} isError scoped={false} ranged={false} />,
    )
    expect(
      screen.getByText('Vendor costs could not be loaded, so this section is incomplete.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('self-operate-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('self-operate-total')).not.toBeInTheDocument()
  })

  it('an error wins over data that did arrive — a stale gap must not be shown as current', () => {
    // The request failed while a previous response is still in hand. Rendering that gap would
    // present a stale saving as this period's fact.
    render(<AnalyticsVendor data={ranked} isLoading={false} isError scoped={false} ranged={false} />)
    expect(
      screen.getByText('Vendor costs could not be loaded, so this section is incomplete.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('self-operate-total')).not.toBeInTheDocument()
    expect(screen.queryByTestId('self-operate-empty')).not.toBeInTheDocument()
  })

  it('reports a genuinely empty gap as empty, not as a failed load', () => {
    render(
      <AnalyticsVendor
        data={[data[1]]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(screen.getByTestId('self-operate-empty')).toBeInTheDocument()
    expect(screen.queryByText(/Vendor costs could not be loaded/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('self-operate-total')).not.toBeInTheDocument()
  })
})
