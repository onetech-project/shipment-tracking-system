/**
 * The health panel's whole job is to stop a reader trusting a broken period. These tests pin the
 * two ways it must not fail quietly: certifying an artifact period as healthy, and reporting the
 * two cost sources as agreeing when they could not be compared at all.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsHealth } from './AnalyticsHealth'
import { DqReport } from '../utils/dq'

const dq = (over: Partial<DqReport> = {}): DqReport => ({
  coveragePct: 99,
  coverageOk: true,
  routeCoveragePct: 100,
  completeDaysPct: 99,
  cleanDays: 15,
  totalDays: 15,
  routesWithoutCost: [],
  revenueWithoutCost: 0,
  costSourceDelta: {
    componentSum: 100,
    summaryTotal: 100,
    delta: 0,
    deltaPct: 0,
    agrees: true,
    comparable: true,
  },
  vendorAttributedPct: 100,
  raAttributedPct: 100,
  unmappedSlaRoutes: [],
  backendIssues: [],
  level: 'ok',
  ...over,
})

describe('AnalyticsHealth', () => {
  it('reports a healthy period without a warning banner', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.getByTestId('analytics-health-level')).toHaveTextContent(/healthy/i)
    expect(screen.queryByTestId('analytics-health-warning')).not.toBeInTheDocument()
  })

  it('warns loudly when day-level completeness is below the threshold', () => {
    render(
      <AnalyticsHealth
        dq={dq({ coveragePct: 14.9, coverageOk: false, completeDaysPct: 14.9, level: 'bad' })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-health-warning')).toHaveTextContent('14.9%')
    // Route-level coverage says 100% for exactly this period; it must not be the headline.
    expect(screen.getByTestId('analytics-health-level')).toHaveTextContent(/unreliable/i)
  })

  it('says the two cost sources could not be compared rather than that they agree', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          costSourceDelta: {
            componentSum: 100,
            summaryTotal: 0,
            delta: 100,
            deltaPct: null,
            agrees: false,
            comparable: false,
          },
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-cost-sources')).toHaveTextContent(/could not be compared/i)
  })

  it('names the outlier date instead of only reporting the symptom', () => {
    render(
      <AnalyticsHealth
        dq={dq()}
        outliers={[{ date: '2026-05-02', weight: 5000, median: 100, ratio: 50, sharePct: 92 }]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-outliers')).toHaveTextContent('2026-05-02')
  })

  it('says why the KPI deltas are missing when the baseline is broken', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete />)
    expect(screen.getByTestId('analytics-baseline-note')).toHaveTextContent(/previous period/i)
  })
})

/**
 * The tests above leave the panel's three worst mislabelling failures unpinned: a level badge that
 * reads "Healthy" for a `warn` period, a coverage figure that quotes the route-level number instead
 * of the day-level one, and four side-by-side stats whose labels could be paired with each other's
 * values. Each is invisible to a fixture whose values are all equal, so every fixture below carries
 * distinguishable values.
 */
describe('AnalyticsHealth — hardening', () => {
  const statFor = (label: string) => screen.getByText(label).closest('div') as HTMLElement

  // A badge saying "Healthy" over an unusable period is the single most damaging thing this
  // component can do, so all three levels are pinned to their exact text — not a regex that would
  // let 'ok' and 'warn' swap, and not one that leaves casing free.
  const levelCases: Array<[DqReport['level'], string]> = [
    ['ok', 'Healthy'],
    ['warn', 'Use with care'],
    ['bad', 'Unreliable'],
  ]
  it.each(levelCases)('renders the %s level as exactly "%s"', (level, text) => {
    render(<AnalyticsHealth dq={dq({ level })} outliers={[]} baselineIncomplete={false} />)
    const badge = screen.getByTestId('analytics-health-level')
    expect(badge.textContent).toBe(text)
  })

  it('quotes the day-level coverage and the real threshold, not the route-level number', () => {
    render(
      <AnalyticsHealth
        // Deliberately all different: a swap between any two of these is otherwise undetectable.
        dq={dq({ coveragePct: 14.9, coverageOk: false, completeDaysPct: 60.5, routeCoveragePct: 100 })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    const warning = screen.getByTestId('analytics-health-warning')
    expect(warning).toHaveTextContent(
      'Only 14.9% of revenue falls on days whose cost is fully attributed (threshold 95%). ' +
        'Margin figures for this period are artifacts of missing cost data, not results.',
    )
    expect(warning).not.toHaveTextContent('60.5%')
    expect(warning).not.toHaveTextContent('100.0%')
  })

  it('pairs each stat label with its own value and hint', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          completeDaysPct: 91.5,
          routeCoveragePct: 82.4,
          vendorAttributedPct: 73.3,
          raAttributedPct: 64.2,
          cleanDays: 12,
          totalDays: 15,
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(within(statFor('Complete days')).getByText('91.5%')).toBeInTheDocument()
    expect(within(statFor('Complete days')).getByText('12 of 15 days')).toBeInTheDocument()
    expect(within(statFor('Route coverage')).getByText('82.4%')).toBeInTheDocument()
    expect(within(statFor('Vendor attributed')).getByText('73.3%')).toBeInTheDocument()
    expect(within(statFor('RA attributed')).getByText('64.2%')).toBeInTheDocument()
  })

  it('omits the day-count hint when the series was unavailable', () => {
    render(
      <AnalyticsHealth
        dq={dq({ completeDaysPct: null, cleanDays: null, totalDays: null })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    const stat = statFor('Complete days')
    expect(within(stat).getByText('—')).toBeInTheDocument()
    // Label + value only: no third paragraph, so no "N of M days" hint is invented.
    expect(stat.querySelectorAll('p')).toHaveLength(2)
    expect(within(stat).queryByText(/of .* days/)).not.toBeInTheDocument()
  })

  it('reports agreeing cost sources with both figures the right way round', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          costSourceDelta: {
            componentSum: 1200000,
            summaryTotal: 1000000,
            delta: 200000,
            deltaPct: 20,
            agrees: true,
            comparable: true,
          },
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-cost-sources')).toHaveTextContent(
      'Cost sources agree: components Rp 1.200.000 vs summary Rp 1.000.000 (20.0%). ' +
        'Every figure on this tab uses the component sum.',
    )
  })

  it('says the cost sources disagree when they do', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          costSourceDelta: {
            componentSum: 1200000,
            summaryTotal: 1000000,
            delta: 200000,
            deltaPct: 20,
            agrees: false,
            comparable: true,
          },
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    const el = screen.getByTestId('analytics-cost-sources')
    expect(el).toHaveTextContent('Cost sources disagree: components')
    expect(el).not.toHaveTextContent('Cost sources agree')
    expect(el).not.toHaveTextContent(/could not be compared/i)
  })

  it('does not claim two incomparable sources agree, and shows no figures for them', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          costSourceDelta: {
            componentSum: 1200000,
            summaryTotal: 0,
            delta: 1200000,
            deltaPct: null,
            agrees: false,
            comparable: false,
          },
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    const el = screen.getByTestId('analytics-cost-sources')
    expect(el).toHaveTextContent(
      'The two cost sources could not be compared — the summary total is missing. ' +
        'That is not a statement that they agree.',
    )
    expect(el).not.toHaveTextContent('Rp 1.200.000')
  })

  it('lists at most six no-cost routes and marks that the list was truncated', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          routesWithoutCost: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
          revenueWithoutCost: 1200000,
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    const p = screen.getByText(/route\(s\) carry revenue with no cost/)
    expect(p).toHaveTextContent(
      '7 route(s) carry revenue with no cost at all (Rp 1.200.000): R1, R2, R3, R4, R5, R6, …',
    )
    expect(p).not.toHaveTextContent('R7')
  })

  it('does not mark the list truncated when every no-cost route is shown', () => {
    render(
      <AnalyticsHealth
        dq={dq({ routesWithoutCost: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], revenueWithoutCost: 995000 })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByText(/route\(s\) carry revenue with no cost/)).toHaveTextContent(
      '6 route(s) carry revenue with no cost at all (Rp 995.000): R1, R2, R3, R4, R5, R6',
    )
  })

  it('hides the no-cost route line entirely when every route has cost', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.queryByText(/carry revenue with no cost/)).not.toBeInTheDocument()
  })

  // Column order is the load-bearing part: a table whose headers are ordered differently from its
  // cells mislabels every number in it. Fixture values are all distinct so a reorder cannot hide.
  it('renders the outlier table with headers and cells in the same order', () => {
    render(
      <AnalyticsHealth
        dq={dq()}
        outliers={[{ date: '2026-05-02', weight: 5000.4, median: 100, ratio: 50.25, sharePct: 92.3 }]}
        baselineIncomplete={false}
      />,
    )
    const table = screen.getByTestId('analytics-outliers')
    expect(within(table).getByText('Suspected backfill days')).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Date', 'Weight', '× median', 'Share of period'])
    const cells = within(table).getAllByRole('row')[1].querySelectorAll('td')
    expect(Array.from(cells).map((c) => c.textContent)).toEqual([
      '2026-05-02',
      '5.000',
      '50.3×',
      '92.3%',
    ])
  })

  it('renders no outlier block when there are no outliers', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.queryByTestId('analytics-outliers')).not.toBeInTheDocument()
  })

  it('names the SLA routes that have no P&L counterpart', () => {
    render(
      <AnalyticsHealth
        dq={dq({ unmappedSlaRoutes: ['CGK-DPS', 'CGK-UPG'] })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByText(/SLA routes with no P&L counterpart/)).toHaveTextContent(
      'SLA routes with no P&L counterpart: CGK-DPS, CGK-UPG',
    )
  })

  it('hides the SLA line when every SLA route maps', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.queryByText(/SLA routes with no/)).not.toBeInTheDocument()
  })

  it('renders the backend issue table with headers and cells in the same order', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          backendIssues: [
            { issue: 'orphan awb', rows: 3001, awbs: 1201 },
            { issue: 'null weight', rows: 12, awbs: 7 },
          ],
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(
      screen.getAllByRole('columnheader').map((h) => h.textContent),
    ).toEqual(['Backend data issue', 'Rows', 'AWBs'])
    const rows = screen.getAllByRole('row')
    expect(Array.from(rows[1].querySelectorAll('td')).map((c) => c.textContent)).toEqual([
      'orphan awb',
      '3.001',
      '1.201',
    ])
    expect(Array.from(rows[2].querySelectorAll('td')).map((c) => c.textContent)).toEqual([
      'null weight',
      '12',
      '7',
    ])
  })

  it('renders no backend issue table when the backend reported none', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('states the exact reason the deltas were withdrawn', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete />)
    expect(screen.getByTestId('analytics-baseline-note')).toHaveTextContent(
      "The previous period's own cost data is incomplete, so period-over-period deltas have been " +
        'withdrawn rather than shown against a broken baseline.',
    )
  })

  it('shows no baseline note when the baseline is usable', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.queryByTestId('analytics-baseline-note')).not.toBeInTheDocument()
  })

  it('shows no coverage warning when coverage is fine, whatever the coverage figure is', () => {
    render(
      <AnalyticsHealth
        dq={dq({ coveragePct: 96, coverageOk: true })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.queryByTestId('analytics-health-warning')).not.toBeInTheDocument()
  })
})
