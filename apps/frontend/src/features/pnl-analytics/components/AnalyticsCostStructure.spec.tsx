/**
 * Cost Structure renders two things a reader trusts independently, so this spec pins both:
 *
 *  - the four component tiles, read POSITIONALLY (the sequence of testids, and for each position
 *    its label, rupiah value, share and per-kg figure together). A reordered tile grid pairs a
 *    label with a plausible-looking number from a different component, which no presence-only
 *    assertion can see;
 *  - the stacked bar chart, read as real geometry. Each `<Bar>` takes its `dataKey` from the
 *    SeriesDay FIELD (`costSmu`…) while its colour comes from the component KEY (`smu`…) — the
 *    component's own source comment calls out that swapping the two renders four empty bars. The
 *    chart therefore has to actually mount here rather than be asserted around.
 *
 * Every fixture figure below is distinct and strictly ordered (SMU > RA > SG Out > SG In, and
 * day 1 > day 2 > day 3 within each component). A tie would make a reordering or a mis-keyed
 * series invisible.
 */
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsCostStructure } from './AnalyticsCostStructure'
import { SeriesDay } from '../types'
import { COMPONENT_COLORS } from '../utils/theme'

/**
 * jsdom implements no ResizeObserver and recharts' ResponsiveContainer constructs one on mount.
 * The sibling specs stub it with no-ops, but a container that is never told a size renders an
 * empty chart — and an empty chart cannot tell a correct `dataKey` from a broken one. So this
 * stub reports a fixed box back to the observer, which is what makes the bars below measurable.
 */
class ResizeObserverStub {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: { width: 640, height: 280 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

/** id-ID IDR emits U+00A0 between "Rp" and the digits; normalise so literals can use a space. */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ')

/** jsdom normalises an inline `background-color` hex to `rgb(r, g, b)`. */
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/**
 * Totals: SMU 90.000, RA 30.000, SG Out 15.000, SG In 6.000 — 141.000 over 300 kg.
 * Shares 63.8 / 21.3 / 10.6 / 4.3 % and per-kg 300 / 100 / 50 / 20 are all distinct, so no
 * permutation of the four tiles produces the numbers the assertions below expect.
 */
const series: SeriesDay[] = [
  {
    date: '2026-05-01',
    revenue: 100000,
    costSmu: 45000,
    costRa: 15000,
    costSgOut: 7500,
    costSgIn: 3000,
    incompleteTos: 0,
    cost: 70500,
    margin: 29500,
    weight: 150,
  },
  {
    date: '2026-05-02',
    revenue: 80000,
    costSmu: 30000,
    costRa: 10000,
    costSgOut: 5000,
    costSgIn: 2000,
    incompleteTos: 0,
    cost: 47000,
    margin: 33000,
    weight: 100,
  },
  {
    date: '2026-05-03',
    revenue: 60000,
    costSmu: 15000,
    costRa: 5000,
    costSgOut: 2500,
    costSgIn: 1000,
    incompleteTos: 0,
    cost: 23500,
    margin: 36500,
    weight: 50,
  },
]

/** The plan's single-day fixture: SMU 400 of a 600 total over 100 kg, i.e. a 66.7% share. */
const oneDay: SeriesDay = {
  date: '2026-05-01',
  revenue: 1000,
  costSmu: 400,
  costRa: 100,
  costSgOut: 60,
  costSgIn: 40,
  incompleteTos: 0,
  cost: 600,
  margin: 400,
  weight: 100,
}

/**
 * recharts renders a Bar's rectangles through an entry animation, so the chart geometry only
 * exists once timers have run. Timers are faked for the duration of a single render and handed
 * back straight after.
 */
function renderWithChart(days: SeriesDay[]) {
  jest.useFakeTimers()
  try {
    const view = render(<AnalyticsCostStructure series={days} />)
    act(() => {
      jest.advanceTimersByTime(3000)
    })
    return view
  } finally {
    jest.useRealTimers()
  }
}

const tiles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="cost-component-"]'))

describe('AnalyticsCostStructure', () => {
  it('shows every component with its share and per-kg cost', () => {
    const { container } = render(<AnalyticsCostStructure series={[oneDay]} />)

    const smu = screen.getByTestId('cost-component-smu')
    // 400 of 600 is 66.7%, at 400 over 100 kg. Share and per-kg are asserted as the one string
    // the component actually renders, so neither can drift away from the other unnoticed.
    expect(plain(smu.querySelector('p:last-of-type')?.textContent)).toBe('66.7% · Rp 4 / kg')
    expect(plain(smu.querySelector('p.font-semibold')?.textContent)).toBe('Rp 400')

    // All four components are present, not just the one spot-checked above.
    expect(tiles(container).map((t) => t.getAttribute('data-testid'))).toEqual([
      'cost-component-smu',
      'cost-component-ra',
      'cost-component-sgOut',
      'cost-component-sgIn',
    ])
  })

  it('lays the tiles out largest-component-first, each carrying its own figures', () => {
    const { container } = render(<AnalyticsCostStructure series={series} />)

    // Read positionally: testid, label, rupiah value, share and per-kg for each tile in DOM
    // order. Reordering the grid moves every number onto the wrong label, which this sees.
    expect(
      tiles(container).map((tile) => [
        tile.getAttribute('data-testid'),
        plain(tile.textContent).trim(),
      ]),
    ).toEqual([
      ['cost-component-smu', 'SMURp 90.00063.8% · Rp 300 / kg'],
      ['cost-component-ra', 'RARp 30.00021.3% · Rp 100 / kg'],
      ['cost-component-sgOut', 'SG OutgoingRp 15.00010.6% · Rp 50 / kg'],
      ['cost-component-sgIn', 'Incoming (SG In)Rp 6.0004.3% · Rp 20 / kg'],
    ])

    // Each tile's swatch carries that component's own colour, so the tiles and the chart stacks
    // below agree on what colour means. All four differ, so a single shared colour is visible.
    expect(
      tiles(container).map((tile) =>
        (tile.querySelector('span.rounded-full') as HTMLElement).style.backgroundColor,
      ),
    ).toEqual([
      hexToRgb(COMPONENT_COLORS.smu),
      hexToRgb(COMPONENT_COLORS.ra),
      hexToRgb(COMPONENT_COLORS.sgOut),
      hexToRgb(COMPONENT_COLORS.sgIn),
    ])

    // The heading reports the same total the tiles add up to: 141.000 over 300 kg is 470 / kg.
    expect(plain(container.querySelector('section p.text-xs')?.textContent)).toBe(
      'Total Rp 141.000 — Rp 470 / kg',
    )
  })

  it('stacks one bar series per cost component, each reading its own SeriesDay field', () => {
    const { container } = renderWithChart(series)

    const layers = Array.from(container.querySelectorAll('.recharts-bar'))
    expect(layers).toHaveLength(4)

    // A series keyed to a field that SeriesDay does not have contributes nothing: recharts draws
    // no rectangles for it at all. The per-layer rectangle count is therefore the assertion a
    // broken dataKey cannot survive.
    const geometry = layers.map((layer) =>
      Array.from(layer.querySelectorAll('.recharts-rectangle')).map((rect) => ({
        fill: rect.getAttribute('fill'),
        height: Number(rect.getAttribute('height')),
      })),
    )
    expect(geometry.map((rects) => rects.length)).toEqual([3, 3, 3, 3])

    // Colour is keyed by the component key while the data is keyed by the field name; asserting
    // them together pins the pairing the source comment warns about.
    expect(geometry.map((rects) => rects[0].fill)).toEqual([
      COMPONENT_COLORS.smu,
      COMPONENT_COLORS.ra,
      COMPONENT_COLORS.sgOut,
      COMPONENT_COLORS.sgIn,
    ])

    // Within every layer the three days fall 45000 > 30000 > 15000 (and proportionally for the
    // rest), so each layer's bars must shrink left to right.
    for (const rects of geometry) {
      expect(rects[0].height).toBeGreaterThan(rects[1].height)
      expect(rects[1].height).toBeGreaterThan(rects[2].height)
    }

    // Day 1 stands at SMU 45000, RA 15000, SG Out 7500, SG In 3000 — ratios 3, 2 and 2.5. Heights
    // are drawn to a shared scale, so these ratios say each layer is reading its own field and
    // not, say, all four reading the same one.
    const dayOne = geometry.map((rects) => rects[0].height)
    expect(dayOne[0] / dayOne[1]).toBeCloseTo(3, 5)
    expect(dayOne[1] / dayOne[2]).toBeCloseTo(2, 5)
    expect(dayOne[2] / dayOne[3]).toBeCloseTo(2.5, 5)

    // The value axis is scaled from the stacked totals (day 1 is 70.500), not from a default
    // 0–4 domain, which is what an empty chart falls back to.
    const yTicks = Array.from(
      container.querySelectorAll('.yAxis .recharts-cartesian-axis-tick-value'),
    ).map((tick) => tick.textContent)
    expect(yTicks).toContain('80000')
    expect(yTicks).not.toContain('4')

    // Each stack is labelled with its component, in the same order the tiles use.
    expect(
      Array.from(container.querySelectorAll('.recharts-legend-item-text')).map((t) => t.textContent),
    ).toEqual(['SMU', 'RA', 'SG Outgoing', 'Incoming (SG In)'])

    // One group of x labels, one per day, in date order.
    expect(
      Array.from(container.querySelectorAll('.xAxis .recharts-cartesian-axis-tick-value')).map(
        (t) => t.textContent,
      ),
    ).toEqual(['01 Mei', '02 Mei', '03 Mei'])
  })

  it('says there is no cost rather than rendering an all-zero stack', () => {
    const { container } = renderWithChart([
      { ...oneDay, costSmu: 0, costRa: 0, costSgOut: 0, costSgIn: 0, cost: 0 },
    ])

    expect(screen.getByTestId('analytics-cost-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-component-smu')).not.toBeInTheDocument()
    // Neither the tiles nor the chart: an all-zero stack is four invisible bars, which reads as a
    // rendering failure rather than as "nothing was attributed".
    expect(tiles(container)).toHaveLength(0)
    expect(container.querySelectorAll('.recharts-bar')).toHaveLength(0)
  })
})
