/**
 * The campaign editor replaces the original dashboard's `prompt()`. The behaviour that matters is
 * that unparseable input never takes the section down with it.
 *
 * Beyond that, this spec pins the two things a reader of this section actually trusts:
 *
 *  - the weekday grid is read POSITIONALLY (header sequence, then every cell of every row in
 *    order), so a rotated weekday grid, a swapped column, or a value paired with the wrong label
 *    is a failure rather than a silently plausible table;
 *  - the campaign strip is read as the exact ordered list of its `<span>`s, so the peak marker,
 *    the offset window, the offset ordering and every lift figure are asserted together.
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsTimePatterns } from './AnalyticsTimePatterns'
import { Campaign, SeriesDay } from '../types'
import { DEFAULT_CAMPAIGNS } from '../utils/weekday'

// recharts' ResponsiveContainer constructs a ResizeObserver on mount and jsdom has none. This
// section renders no chart today, but its siblings do and the stub costs nothing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

/** id-ID IDR emits U+00A0 between "Rp" and the digits; normalise so literals can use a space. */
const plain = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ')

const day = (
  date: string,
  weight: number,
  revenue: number,
  margin: number,
): SeriesDay => ({
  date,
  revenue,
  costSmu: revenue - margin,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: revenue - margin,
  margin,
  weight,
})

/**
 * Nine consecutive days from Friday 2026-05-01, so every weekday appears at least once and Friday
 * and Saturday appear twice (the Days column is therefore not a constant).
 *
 * Tuning that makes mutations visible:
 *  - all seven average weights are DISTINCT (120…160), so a rotated weekday grid mislabels
 *    every row and cannot hide behind a tie;
 *  - the period average is exactly 140, and Tuesday sits exactly ON it — so `vsOverallPct`
 *    renders "+0.0%" and the `n >= 0` sign boundary in `signed` is exercised;
 *  - Monday (-7.1%) and Wednesday (+7.1%) are equal and opposite, so a flipped subtraction
 *    order swaps them rather than changing magnitudes;
 *  - every weekday has a DISTINCT margin % (10/20/30/40/25/60/50) and a distinct average
 *    margin, so the last two columns cannot be swapped for one another.
 */
const weekdaySeries: SeriesDay[] = [
  day('2026-05-01', 100, 1000, 250), // Fri
  day('2026-05-02', 110, 1100, 660), // Sat
  day('2026-05-03', 120, 1200, 600), // Sun
  day('2026-05-04', 130, 1300, 130), // Mon
  day('2026-05-05', 140, 1400, 280), // Tue
  day('2026-05-06', 150, 1500, 450), // Wed
  day('2026-05-07', 160, 1600, 640), // Thu
  day('2026-05-08', 170, 1700, 424), // Fri
  day('2026-05-09', 180, 1800, 1080), // Sat
]

const DOUBLE_DATE: Campaign[] = [{ label: 'Double Date', rule: { type: 'doubleDate' } }]

/**
 * Fourteen days across 2026-06, whose only double date is 2026-06-06. With the default ±3 window
 * that covers 06-03…06-09 and leaves seven quiet days.
 *
 * Six of those quiet days weigh 100 and one is a 10 000 kg backfill. The MEDIAN of the quiet days
 * is therefore 100 while their MEAN is 1 514 — so every lift below is only correct if the baseline
 * is the median. The seven in-window weights are all distinct, giving seven distinct lifts with a
 * unique peak at D+0, one negative offset (D+2) and one lift of exactly zero (D+3) to pin the
 * `avgLift >= 0` colour boundary.
 */
const campaignSeries: SeriesDay[] = [
  day('2026-06-01', 100, 1000, 400),
  day('2026-06-02', 100, 1000, 400),
  day('2026-06-03', 120, 1200, 480), // D-3
  day('2026-06-04', 130, 1300, 520), // D-2
  day('2026-06-05', 150, 1500, 600), // D-1
  day('2026-06-06', 300, 3000, 1200), // D+0 — the campaign day
  day('2026-06-07', 200, 2000, 800), // D+1
  day('2026-06-08', 90, 900, 360), // D+2
  day('2026-06-09', 100, 1000, 400), // D+3
  day('2026-06-10', 100, 1000, 400),
  day('2026-06-11', 100, 1000, 400),
  day('2026-06-12', 100, 1000, 400),
  day('2026-06-13', 100, 1000, 400),
  day('2026-06-14', 10000, 100000, 40000), // a backfill: drags a MEAN baseline far above normal
]

const grid = () => {
  const table = document.querySelector('table')
  if (!table) throw new Error('weekday table not rendered')
  return {
    headers: Array.from(table.querySelectorAll('thead th')).map((th) => plain(th.textContent)),
    rows: Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => plain(td.textContent)),
    ),
  }
}

describe('AnalyticsTimePatterns', () => {
  it('renders one row per weekday present in the period', () => {
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={jest.fn()}
      />,
    )
    expect(screen.getByText('Friday')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
  })

  it('pairs every weekday with its own figures, in weekday order and column order', () => {
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={jest.fn()}
      />,
    )
    const { headers, rows } = grid()
    expect(headers).toEqual([
      'Weekday',
      'Days',
      'Avg weight',
      'vs period avg',
      'Avg margin',
      'Margin %',
    ])
    // Monday first, Sunday last; every cell read positionally, so a swapped column fails too.
    expect(rows).toEqual([
      ['Monday', '1', '130', '-7.1%', 'Rp 130', '10.0%'],
      ['Tuesday', '1', '140', '+0.0%', 'Rp 280', '20.0%'],
      ['Wednesday', '1', '150', '+7.1%', 'Rp 450', '30.0%'],
      ['Thursday', '1', '160', '+14.3%', 'Rp 640', '40.0%'],
      ['Friday', '2', '135', '-3.6%', 'Rp 337', '25.0%'],
      ['Saturday', '2', '145', '+3.6%', 'Rp 870', '60.0%'],
      ['Sunday', '1', '120', '-14.3%', 'Rp 600', '50.0%'],
    ])
  })

  it('says so plainly when no campaign date falls inside the period', () => {
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={[{ label: 'Payday (25th)', rule: { type: 'dayOfMonth', day: 25 } }]}
        onCampaignsChange={jest.fn()}
      />,
    )
    expect(screen.getByTestId('analytics-campaign-empty')).toBeInTheDocument()
    expect(screen.queryByText(/peak at D/)).not.toBeInTheDocument()
  })

  it('measures every offset of the window against the median of the quiet days', () => {
    render(
      <AnalyticsTimePatterns
        series={campaignSeries}
        campaigns={DOUBLE_DATE}
        onCampaignsChange={jest.fn()}
      />,
    )
    expect(screen.queryByTestId('analytics-campaign-empty')).not.toBeInTheDocument()
    const block = screen.getByTestId('campaign-Double Date')
    // The peak marker first, then the seven offset chips in offset order. Every lift is relative
    // to a baseline of 100 — the MEDIAN quiet day. Against the mean (1 514) none of these match.
    expect(Array.from(block.querySelectorAll('span')).map((s) => plain(s.textContent))).toEqual([
      'peak at D+0',
      'D-3: +20.0%',
      'D-2: +30.0%',
      'D-1: +50.0%',
      'D+0: +200.0%',
      'D+1: +100.0%',
      'D+2: -10.0%',
      'D+3: +0.0%',
    ])
  })

  it('colours a shortfall red and a flat offset green, on a >= 0 boundary', () => {
    render(
      <AnalyticsTimePatterns
        series={campaignSeries}
        campaigns={DOUBLE_DATE}
        onCampaignsChange={jest.fn()}
      />,
    )
    const block = screen.getByTestId('campaign-Double Date')
    const chips = Array.from(block.querySelectorAll('span')).slice(1)
    expect(
      chips.map((c) =>
        c.className.includes('text-emerald-700')
          ? 'up'
          : c.className.includes('text-red-700')
            ? 'down'
            : 'none',
      ),
    ).toEqual(['up', 'up', 'up', 'up', 'up', 'down', 'up'])
  })

  it('seeds the editor with the campaigns currently in force', () => {
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    expect(screen.getByLabelText(/campaign rules/i)).toHaveValue('double,25')
  })

  it('hands the parsed campaigns back when the editor is saved', () => {
    const onCampaignsChange = jest.fn()
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={onCampaignsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onCampaignsChange).toHaveBeenCalledWith([
      { label: 'Day 10', rule: { type: 'dayOfMonth', day: 10 } },
    ])
    // A successful save closes the editor.
    expect(screen.queryByLabelText(/campaign rules/i)).not.toBeInTheDocument()
  })

  it('rejects an unparseable rule instead of saving an empty campaign list', () => {
    const onCampaignsChange = jest.fn()
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={onCampaignsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onCampaignsChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('analytics-campaign-error')).toBeInTheDocument()
    // The editor stays open with the rejected text still in it, so it can be corrected.
    expect(screen.getByLabelText(/campaign rules/i)).toHaveValue('nonsense')
  })

  it('drops a stale error when the editor is reopened', () => {
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByLabelText(/campaign rules/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    expect(screen.queryByTestId('analytics-campaign-error')).not.toBeInTheDocument()
  })

  it('leaves the campaigns alone when the editor is cancelled', () => {
    const onCampaignsChange = jest.fn()
    render(
      <AnalyticsTimePatterns
        series={weekdaySeries}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={onCampaignsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCampaignsChange).not.toHaveBeenCalled()
  })

  /**
   * `weekdayProfile` always emits all seven buckets, so `AnalyticsTable`'s `empty` copy is
   * unreachable here and an empty period renders seven all-zero rows instead. Pinned as-is so the
   * behaviour is at least visible; see the task Findings.
   */
  it('still renders all seven weekday buckets at zero when the period has no days', () => {
    render(
      <AnalyticsTimePatterns series={[]} campaigns={DEFAULT_CAMPAIGNS} onCampaignsChange={jest.fn()} />,
    )
    const { rows } = grid()
    expect(rows).toEqual([
      ['Monday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Tuesday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Wednesday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Thursday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Friday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Saturday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
      ['Sunday', '0', '0', '+0.0%', 'Rp 0', '0.0%'],
    ])
    expect(screen.queryByText('No days in this period.')).not.toBeInTheDocument()
    expect(screen.getByTestId('analytics-campaign-empty')).toBeInTheDocument()
  })

  it('keeps the section heading and its explanation of the baseline', () => {
    render(
      <AnalyticsTimePatterns
        series={campaignSeries}
        campaigns={DOUBLE_DATE}
        onCampaignsChange={jest.fn()}
      />,
    )
    const section = document.getElementById('time-patterns')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByText('Time Patterns')).toBeInTheDocument()
    expect(screen.getByText(/median tonnage of days outside every campaign window/i)).toBeInTheDocument()
  })
})
