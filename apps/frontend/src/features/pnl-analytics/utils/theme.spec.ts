/**
 * The plan ships `theme.ts` with no spec of its own. It is not decoration: `colorForMargin` is the
 * claim "this period made money", and it must mean exactly what the same scale means on the Daily
 * Report's `PnlDailyMarginChart`. A threshold that drifts by a hundredth repaints a loss-making
 * period green and nothing else in the suite notices.
 *
 * Both branch points are therefore probed with a fixture sitting EXACTLY on the boundary — a
 * `<` → `<=` slip is invisible to any fixture that merely straddles it.
 */
import {
  COMPONENT_COLORS,
  MARGIN_GREY,
  SERIES_COLORS,
  colorForMargin,
  formatDateLabel,
} from './theme'

const RED = '#EF4444'
const AMBER = '#F59E0B'
const GREEN = '#22C55E'

describe('colorForMargin', () => {
  it('paints a loss red', () => {
    expect(colorForMargin(-30)).toBe(RED)
    expect(colorForMargin(-0.1)).toBe(RED)
  })

  // Exactly on the loss boundary. Break-even is not a loss, so it must NOT be red.
  it('treats break-even as thin-margin amber, not as a loss', () => {
    expect(colorForMargin(0)).toBe(AMBER)
  })

  it('paints a thin margin amber', () => {
    expect(colorForMargin(0.1)).toBe(AMBER)
    expect(colorForMargin(9.9)).toBe(AMBER)
  })

  // Exactly on the healthy boundary. 10% is healthy, so it must NOT be amber.
  it('treats exactly 10% as healthy green, not as thin', () => {
    expect(colorForMargin(10)).toBe(GREEN)
  })

  it('paints a healthy margin green', () => {
    expect(colorForMargin(10.1)).toBe(GREEN)
    expect(colorForMargin(40)).toBe(GREEN)
  })

  // Grey is the "do not read a margin off this bar" signal and must beat every coloured branch.
  it('greys out an incomplete day whatever its apparent margin', () => {
    expect(colorForMargin(40, true)).toBe(MARGIN_GREY)
    expect(colorForMargin(-40, true)).toBe(MARGIN_GREY)
    expect(colorForMargin(0, true)).toBe(MARGIN_GREY)
    expect(colorForMargin(10, true)).toBe(MARGIN_GREY)
    expect(colorForMargin(null, true)).toBe(MARGIN_GREY)
  })

  it('greys out an unknown margin rather than guessing a colour', () => {
    expect(colorForMargin(null)).toBe(MARGIN_GREY)
  })

  it('defaults to treating a day as complete', () => {
    expect(colorForMargin(40)).toBe(GREEN)
    expect(colorForMargin(40)).not.toBe(MARGIN_GREY)
  })

  it('is the exact scale used by the Daily Report margin chart', () => {
    expect(MARGIN_GREY).toBe('#94A3B8')
    expect([colorForMargin(-1), colorForMargin(5), colorForMargin(20)]).toEqual([RED, AMBER, GREEN])
  })
})

describe('SERIES_COLORS', () => {
  // Order is load-bearing: series are coloured by index, so a reordered palette silently recolours
  // every categorical chart on the tab between releases.
  it('is a fixed, ordered categorical palette', () => {
    expect(SERIES_COLORS).toEqual([
      '#2563EB',
      '#0EA5E9',
      '#14B8A6',
      '#8B5CF6',
      '#F59E0B',
      '#EC4899',
      '#64748B',
    ])
  })

  it('carries no duplicate, so two adjacent series cannot share a colour', () => {
    expect(new Set(SERIES_COLORS).size).toBe(SERIES_COLORS.length)
  })
})

describe('COMPONENT_COLORS', () => {
  // Keyed by the COST_COMPONENTS `key`, not the SeriesDay field name — a stack that re-keys itself
  // swaps two cost components' colours between periods and invites the wrong conclusion.
  it('fixes one colour per cost component key', () => {
    expect(COMPONENT_COLORS).toEqual({
      smu: '#2563EB',
      ra: '#14B8A6',
      sgOut: '#F59E0B',
      sgIn: '#8B5CF6',
    })
  })

  it('gives each component a distinct colour', () => {
    const used = Object.values(COMPONENT_COLORS)
    expect(new Set(used).size).toBe(used.length)
  })
})

describe('formatDateLabel', () => {
  it('renders an ISO date as a short Indonesian day and month', () => {
    expect(formatDateLabel('2026-05-02')).toBe('02 Mei')
    expect(formatDateLabel('2026-01-15')).toBe('15 Jan')
    expect(formatDateLabel('2026-12-31')).toBe('31 Des')
  })

  it('keeps the leading zero so labels align in a tick axis', () => {
    expect(formatDateLabel('2026-03-05')).toBe('05 Mar')
  })

  it('does not shift the day across a timezone boundary', () => {
    // Parsed as a local date, not as UTC midnight — `new Date('2026-01-01')` would render 31 Des
    // west of Greenwich.
    expect(formatDateLabel('2026-01-01')).toBe('01 Jan')
  })

  it('falls back to the raw string rather than rendering an Invalid Date', () => {
    expect(formatDateLabel('not-a-date')).toBe('not-a-date')
    expect(formatDateLabel('')).toBe('')
    expect(formatDateLabel('2026-00-10')).toBe('2026-00-10')
    expect(formatDateLabel('2026-05-00')).toBe('2026-05-00')
  })
})
