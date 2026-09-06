import {
  CAMPAIGN_STORAGE_KEY,
  DEFAULT_CAMPAIGNS,
  campaignDates,
  campaignSummary,
  campaignWindows,
  isoWeekday,
  loadCampaigns,
  parseCampaignInput,
  saveCampaigns,
  serializeCampaigns,
  weekdayProfile,
} from './weekday'
import { SeriesDay } from '../types'

const day = (date: string, weight: number, over: Partial<SeriesDay> = {}): SeriesDay => ({
  date,
  revenue: weight * 10,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: weight * 6,
  margin: weight * 4,
  weight,
  ...over,
})

// 2026-08-01 is a Saturday, so this run covers every weekday at least once.
const series: SeriesDay[] = Array.from({ length: 14 }, (_, i) =>
  day(`2026-08-${String(i + 1).padStart(2, '0')}`, 100),
)

describe('isoWeekday', () => {
  it('numbers Monday as 0, parsing the date as UTC', () => {
    expect(isoWeekday('2026-08-03')).toBe(0) // Monday
    expect(isoWeekday('2026-08-09')).toBe(6) // Sunday
  })
})

describe('weekdayProfile', () => {
  it('returns all seven weekdays, even ones the period never saw', () => {
    const p = weekdayProfile([day('2026-08-03', 100)])
    expect(p).toHaveLength(7)
    expect(p[0]).toMatchObject({ weekday: 0, days: 1, weight: 100, avgWeight: 100 })
    // A weekday with no days averages 0, not NaN.
    expect(p[1]).toMatchObject({ days: 0, avgWeight: 0, avgMargin: 0, avgMarginPct: 0 })
  })

  it('measures each weekday against the period average', () => {
    const heavy = series.map((d) => (isoWeekday(d.date) === 0 ? day(d.date, 300) : d))
    const p = weekdayProfile(heavy)
    expect(p[0].vsOverallPct).toBeGreaterThan(0)
    expect(p[1].vsOverallPct).toBeLessThan(0)
  })
})

describe('campaignDates', () => {
  it('matches double dates — 8.8 in August', () => {
    expect(campaignDates({ type: 'doubleDate' }, series)).toEqual(['2026-08-08'])
  })

  it('matches a fixed day of month, and returns nothing when the period misses it', () => {
    expect(campaignDates({ type: 'dayOfMonth', day: 3 }, series)).toEqual(['2026-08-03'])
    expect(campaignDates({ type: 'dayOfMonth', day: 25 }, series)).toEqual([])
  })
})

describe('campaignWindows', () => {
  it('excludes campaign-affected days from the baseline', () => {
    // Every day is 100 except the campaign day and its ±3 neighbours, which are 500. If the
    // baseline included those days it would be dragged upward and understate the lift.
    const inflated = series.map((d) =>
      d.date >= '2026-08-05' && d.date <= '2026-08-11' ? day(d.date, 500) : d,
    )
    const [w] = campaignWindows(inflated, [{ label: 'Double Date', rule: { type: 'doubleDate' } }])
    expect(w.baselineWeight).toBe(100)
    // The default window is ±3 around the campaign day, all seven inside this period.
    expect(w.days.map((d) => d.offset)).toEqual([-3, -2, -1, 0, 1, 2, 3])
    const peak = w.days.find((d) => d.offset === 0)!
    expect(peak.lift).toBeCloseTo(400, 6)
  })

  it('uses the median of quiet days, so one backfill does not swallow the lift', () => {
    const withBackfill = series.map((d) => (d.date === '2026-08-14' ? day(d.date, 100000) : d))
    const [w] = campaignWindows(withBackfill, [
      { label: 'Double Date', rule: { type: 'doubleDate' } },
    ])
    expect(w.baselineWeight).toBe(100)
  })

  it('returns nothing when no campaign date falls inside the period', () => {
    expect(campaignWindows(series, [{ label: 'X', rule: { type: 'dayOfMonth', day: 25 } }])).toEqual(
      [],
    )
  })

  it('drops window offsets that fall outside the period rather than inventing days', () => {
    const [w] = campaignWindows(series, [{ label: 'Day 2', rule: { type: 'dayOfMonth', day: 2 } }])
    // offsets -3 and -2 would land on 2026-07-30/31, outside the series.
    expect(w.days.map((d) => d.offset)).toEqual([-1, 0, 1, 2, 3])
  })
})

describe('campaignSummary', () => {
  it('averages the lift per offset across every occurrence of a label', () => {
    const spiky = series.map((d) =>
      d.date === '2026-08-08' || d.date === '2026-08-03' ? day(d.date, 300) : d,
    )
    const windows = campaignWindows(spiky, [
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 3', rule: { type: 'dayOfMonth', day: 3 } },
    ])
    const summary = campaignSummary(windows)
    expect(summary.map((s) => s.label).sort()).toEqual(['Day 3', 'Double Date'])
    const dd = summary.find((s) => s.label === 'Double Date')!
    expect(dd.peakOffset).toBe(0)
    // Pin the averaged value, not just which offset wins: a wrong denominator scales every
    // offset uniformly, so peakOffset alone cannot see it. 300t against a 100t baseline = +200%.
    expect(dd.byOffset.find((o) => o.offset === 0)!.avgLift).toBeCloseTo(200, 6)
  })
})

describe('campaign rule storage', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips through the text format the editor uses', () => {
    expect(serializeCampaigns(DEFAULT_CAMPAIGNS)).toBe('double,25')
    expect(parseCampaignInput('double, 25')).toEqual([
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 25', rule: { type: 'dayOfMonth', day: 25 } },
    ])
  })

  it('drops entries that are neither "double" nor a day of the month', () => {
    expect(parseCampaignInput('double, banana, 40, 0, 25')).toEqual([
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 25', rule: { type: 'dayOfMonth', day: 25 } },
    ])
  })

  it('falls back to the defaults rather than failing to render on unusable storage', () => {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, 'not json')
    expect(loadCampaigns()).toEqual(DEFAULT_CAMPAIGNS)
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, '[{"label":"x","rule":{"type":"nope"}}]')
    expect(loadCampaigns()).toEqual(DEFAULT_CAMPAIGNS)
  })

  it('persists and reads back a saved list', () => {
    const custom = [{ label: 'Day 12', rule: { type: 'dayOfMonth' as const, day: 12 } }]
    saveCampaigns(custom)
    expect(loadCampaigns()).toEqual(custom)
  })
})
