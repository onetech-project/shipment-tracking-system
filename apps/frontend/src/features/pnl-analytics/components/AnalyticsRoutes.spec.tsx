import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsRoutes } from './AnalyticsRoutes'
import { AnalyticsDailyRow, AnalyticsDailySeries } from '../types'

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 100,
  costSmu: 60,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 10,
  incompleteTos: 0,
  ...over,
})

const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06']

const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date) => row({ date })),
    ...dates.map((date) => row({ date, dest: 'Batam', revenue: 50, costSmu: 45, weight: 5 })),
  ],
}

/**
 * Five routes with five DISTINCT absolute margins (900 / 600 / 480 / 240 / 50), so neither the
 * ranking comparator nor the top-3 slice can hide behind a tie. Each route probes one rule:
 *
 * - Aceh:     revenue with no cost at all and incomplete TOs — a false 100% margin, and the LARGEST
 *             absolute margin, so excluding it changes every concentration figure.
 * - Medan:    a LOSS of 480 — the second-largest exposure. Signing the share instead of taking its
 *             absolute value would let it cancel Kupang's profit out.
 * - Kupang:   the largest genuine margin.
 * - Denpasar: varying daily revenue, so its CV is a real number rather than 0.00.
 * - Batam:    exactly FIVE usable days — sitting on the stability floor, so `< 5` vs `< 6` shows.
 */
const denpasarRevenue = [80, 90, 100, 100, 110, 120]
const batamRevenue = [40, 45, 50, 55, 60]

const rich: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date, i) => row({ date, revenue: denpasarRevenue[i] })),
    ...dates.map((date) => row({ date, dest: 'Kupang', revenue: 200, costSmu: 100, weight: 20 })),
    ...dates.map((date) => row({ date, dest: 'Medan', revenue: 100, costSmu: 180, weight: 10 })),
    ...dates
      .slice(0, 5)
      .map((date, i) => row({ date, dest: 'Batam', revenue: batamRevenue[i], costSmu: 40, weight: 5 })),
    row({ dest: 'Aceh', revenue: 900, costSmu: 0, weight: 100, incompleteTos: 4 }),
  ],
}

const richKeys = ['Jabo|Denpasar', 'Jabo|Kupang', 'Jabo|Medan', 'Jabo|Batam', 'Jabo|Aceh']

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Header sequence, in DOM order — every cell lookup below is positional against this. */
const headers = () => screen.getAllByRole('columnheader').map((h) => norm(h.textContent))

const cellsOf = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('cell')
    .map((c) => norm(c.textContent))

const rowOrder = () => screen.getAllByTestId(/^route-/).map((r) => r.getAttribute('data-testid'))

describe('AnalyticsRoutes', () => {
  it('lists every route in scope with its share of margin', () => {
    render(<AnalyticsRoutes series={series} routeKeys={['Jabo|Denpasar', 'Jabo|Batam']} />)
    expect(screen.getByTestId('route-Jabo|Denpasar')).toBeInTheDocument()
    expect(screen.getByTestId('route-Jabo|Batam')).toBeInTheDocument()
  })

  /**
   * Identifying the table by its exact header sequence makes every positional cell assertion below
   * double as a column-order assertion — otherwise Revenue could render under "Cost" with the
   * suite still green.
   */
  it('labels each column in the order the cells are rendered', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    expect(headers()).toEqual([
      'Route',
      'Weight',
      'Revenue',
      'Cost',
      'Margin',
      'Margin %',
      'Share',
      'Stability (CV)',
    ])
  })

  it('orders routes by margin, biggest contributor first and the loss-maker last', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    expect(rowOrder()).toEqual([
      'route-Jabo|Aceh',
      'route-Jabo|Kupang',
      'route-Jabo|Denpasar',
      'route-Jabo|Batam',
      'route-Jabo|Medan',
    ])
  })

  it('renders each route with its own weight, revenue, cost, margin and share', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    expect(cellsOf('route-Jabo|Kupang')).toEqual([
      'CGK → Kupang',
      '120',
      'Rp 1.200',
      'Rp 600',
      'Rp 600',
      '50.0%',
      '45.8%',
      '0.00',
    ])
    // A loss-making route keeps its negative margin and negative share of the signed total.
    expect(cellsOf('route-Jabo|Medan')).toEqual([
      'CGK → Medan',
      '60',
      'Rp 600',
      'Rp 1.080',
      '-Rp 480',
      '-80.0%',
      '-36.6%',
      '0.00',
    ])
  })

  it('flags the route whose cost is missing rather than showing its 100% margin unqualified', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    const aceh = screen.getByTestId('route-Jabo|Aceh')
    expect(within(aceh).getByTitle(/cost incomplete/i)).toBeInTheDocument()
    expect(cellsOf('route-Jabo|Aceh')[5]).toBe('100.0%')
    // The genuine routes must stay unmarked, or the flag says nothing.
    expect(
      within(screen.getByTestId('route-Jabo|Kupang')).queryByTitle(/cost incomplete/i),
    ).not.toBeInTheDocument()
  })

  it('reports how many routes the concentration figure had to exclude', () => {
    const withBroken: AnalyticsDailySeries = {
      dates,
      rows: [...series.rows, row({ dest: 'Aceh', revenue: 900, costSmu: 0, incompleteTos: 4 })],
    }
    render(
      <AnalyticsRoutes
        series={withBroken}
        routeKeys={['Jabo|Denpasar', 'Jabo|Batam', 'Jabo|Aceh']}
      />,
    )
    expect(screen.getByTestId('analytics-concentration')).toHaveTextContent(/1 route/i)
  })

  /**
   * The exact concentration sentence. Aceh's uncosted Rp 900 is the largest absolute margin in the
   * set, so leaving it in would move top1 to 39.6% and the HHI to 0.283 — missing cost masquerading
   * as the single biggest margin concentration. And the shares are on ABSOLUTE margin: Medan's
   * -Rp 480 is real exposure, so signing it would push top1 past 100% instead of counting it.
   */
  it('states the concentration on complete routes only, weighing losses as exposure', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    expect(norm(screen.getByTestId('analytics-concentration').textContent)).toBe(
      'Top route holds 43.8% of margin, top three 96.4%; HHI 0.347 (highly concentrated) across 4 route(s). ' +
        '1 route(s) were excluded because their cost is incomplete — including them would let missing cost ' +
        'masquerade as margin.',
    )
  })

  it('says nothing about exclusions when every route carries complete cost', () => {
    render(<AnalyticsRoutes series={series} routeKeys={['Jabo|Denpasar', 'Jabo|Batam']} />)
    expect(screen.getByTestId('analytics-concentration')).not.toHaveTextContent(/excluded/i)
    expect(screen.getByTestId('analytics-concentration')).toHaveTextContent(/across 2 route\(s\)/)
  })

  it('leaves stability blank rather than guessing when a route has too few usable days', () => {
    const thin: AnalyticsDailySeries = {
      dates: dates.slice(0, 3),
      rows: dates.slice(0, 3).map((date) => row({ date })),
    }
    render(<AnalyticsRoutes series={thin} routeKeys={['Jabo|Denpasar']} />)
    expect(within(screen.getByTestId('route-Jabo|Denpasar')).getByText('—')).toBeInTheDocument()
  })

  /**
   * Batam has exactly five usable days — on the floor — and Aceh's single incomplete day is under
   * it. Only a route sitting ON the boundary can tell "five is enough" from "five is not".
   */
  it('measures a route with exactly five usable days and blanks the one with fewer', () => {
    render(<AnalyticsRoutes series={rich} routeKeys={richKeys} />)
    expect(cellsOf('route-Jabo|Batam')[7]).toBe('0.71')
    expect(cellsOf('route-Jabo|Aceh')[7]).toBe('—')
  })

  it('shows an empty-scope message instead of a bare table header', () => {
    render(<AnalyticsRoutes series={{ dates, rows: [] }} routeKeys={[]} />)
    expect(screen.getByText(/no routes in this scope/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
