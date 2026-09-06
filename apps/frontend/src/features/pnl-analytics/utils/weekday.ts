/**
 * Day-of-week shape and campaign impact.
 *
 * Both answer the same question in different frames: which days carry the tonnage, and does a
 * campaign date actually move it.
 */

import { Campaign, CampaignRule, SeriesDay } from '../types'
import { div, num } from './series'

export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/** 0 = Monday. Parsed as UTC so the weekday never shifts with the machine's timezone. */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return (d.getUTCDay() + 6) % 7
}

export interface WeekdayBucket {
  weekday: number
  label: string
  days: number
  weight: number
  avgWeight: number
  avgMargin: number
  avgMarginPct: number
  vsOverallPct: number
}

export function weekdayProfile(series: SeriesDay[]): WeekdayBucket[] {
  const buckets = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    days: 0,
    weight: 0,
    margin: 0,
    revenue: 0,
  }))
  for (const d of series) {
    const b = buckets[isoWeekday(d.date)]
    if (!b) continue
    b.days += 1
    b.weight += num(d.weight)
    b.margin += num(d.margin)
    b.revenue += num(d.revenue)
  }
  const overallAvg = div(
    series.reduce((s, d) => s + num(d.weight), 0),
    series.length,
  )
  return buckets.map((b) => ({
    weekday: b.weekday,
    label: b.label,
    days: b.days,
    weight: b.weight,
    avgWeight: div(b.weight, b.days),
    avgMargin: div(b.margin, b.days),
    avgMarginPct: div(b.margin, b.revenue) * 100,
    vsOverallPct: overallAvg ? ((div(b.weight, b.days) - overallAvg) / overallAvg) * 100 : 0,
  }))
}

export const DEFAULT_CAMPAIGNS: Campaign[] = [
  { label: 'Double Date', rule: { type: 'doubleDate' } },
  { label: 'Payday (25th)', rule: { type: 'dayOfMonth', day: 25 } },
]

export function campaignDates(rule: CampaignRule, series: SeriesDay[]): string[] {
  return series
    .map((d) => d.date)
    .filter((date) => {
      const month = Number(date.slice(5, 7))
      const day = Number(date.slice(8, 10))
      if (rule.type === 'doubleDate') return month === day
      if (rule.type === 'dayOfMonth') return day === rule.day
      return false
    })
}

function shiftDate(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

export interface CampaignWindow {
  label: string
  date: string
  baselineWeight: number
  days: Array<{ offset: number; date: string; weight: number; lift: number }>
}

export function campaignWindows(
  series: SeriesDay[],
  campaigns: Campaign[],
  opts?: { before?: number; after?: number },
): CampaignWindow[] {
  const before = opts?.before ?? 3
  const after = opts?.after ?? 3
  const byDate = new Map(series.map((d) => [d.date, d]))

  const hits: Array<{ label: string; date: string }> = []
  for (const c of campaigns ?? []) {
    for (const date of campaignDates(c.rule, series)) hits.push({ label: c.label, date })
  }
  if (!hits.length) return []

  // The baseline must exclude campaign-affected days, otherwise a big campaign inflates the very
  // number it is compared against. The baseline itself is the MEDIAN, not the mean, of those quiet
  // days: one backfilled day among them would drag a mean far above every normal day and
  // understate every lift.
  const inWindow = new Set<string>()
  for (const h of hits) {
    for (let o = -before; o <= after; o++) inWindow.add(shiftDate(h.date, o))
  }
  const quietWeights = series
    .filter((d) => !inWindow.has(d.date))
    .map((d) => num(d.weight))
    .sort((a, b) => a - b)
  const qmid = Math.floor(quietWeights.length / 2)
  const baselineWeight = quietWeights.length
    ? quietWeights.length % 2
      ? quietWeights[qmid]
      : (quietWeights[qmid - 1] + quietWeights[qmid]) / 2
    : 0

  return hits.map((h) => {
    const days: CampaignWindow['days'] = []
    for (let o = -before; o <= after; o++) {
      const date = shiftDate(h.date, o)
      const d = byDate.get(date)
      // A day outside the period is skipped, not zero-filled: a zero would read as "no shipments
      // that day" rather than "the period does not reach that far".
      if (!d) continue
      days.push({
        offset: o,
        date,
        weight: num(d.weight),
        lift: baselineWeight ? ((num(d.weight) - baselineWeight) / baselineWeight) * 100 : 0,
      })
    }
    return { label: h.label, date: h.date, baselineWeight, days }
  })
}

export interface CampaignSummaryRow {
  label: string
  byOffset: Array<{ offset: number; avgLift: number }>
  peakOffset: number | null
}

export function campaignSummary(windows: CampaignWindow[]): CampaignSummaryRow[] {
  const byLabel = new Map<string, CampaignWindow[]>()
  for (const w of windows ?? []) {
    const list = byLabel.get(w.label) ?? []
    list.push(w)
    byLabel.set(w.label, list)
  }

  const out: CampaignSummaryRow[] = []
  for (const [label, ws] of byLabel) {
    const acc = new Map<number, number[]>()
    for (const w of ws) {
      for (const d of w.days) {
        const list = acc.get(d.offset) ?? []
        list.push(d.lift)
        acc.set(d.offset, list)
      }
    }
    const byOffset = Array.from(acc.entries())
      .map(([offset, lifts]) => ({
        offset,
        avgLift: div(
          lifts.reduce((s, x) => s + x, 0),
          lifts.length,
        ),
      }))
      .sort((a, b) => a.offset - b.offset)
    const peak = byOffset.slice().sort((a, b) => b.avgLift - a.avgLift)[0]
    out.push({ label, byOffset, peakOffset: peak ? peak.offset : null })
  }
  return out
}

export const CAMPAIGN_STORAGE_KEY = 'esp.campaigns'

/** The editor's text format: comma-separated, "double" for twin dates, a number for a fixed day. */
export function serializeCampaigns(campaigns: Campaign[]): string {
  return campaigns
    .map((c) => (c.rule.type === 'doubleDate' ? 'double' : String(c.rule.day)))
    .join(',')
}

export function parseCampaignInput(text: string): Campaign[] {
  return (text ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t): Campaign | null => {
      if (t.toLowerCase() === 'double') return { label: 'Double Date', rule: { type: 'doubleDate' } }
      const day = Number(t)
      // Anything that is not a real day of the month is dropped rather than turned into a rule
      // that silently matches nothing.
      if (!Number.isInteger(day) || day < 1 || day > 31) return null
      return { label: `Day ${day}`, rule: { type: 'dayOfMonth', day } }
    })
    .filter((c): c is Campaign => c !== null)
}

function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false
  const c = value as Campaign
  if (typeof c.label !== 'string' || !c.rule || typeof c.rule !== 'object') return false
  if (c.rule.type === 'doubleDate') return true
  return c.rule.type === 'dayOfMonth' && Number.isInteger(c.rule.day)
}

/**
 * Stored values that cannot be parsed fall back to the defaults. A stale or hand-edited entry must
 * not take the section down with it.
 */
export function loadCampaigns(): Campaign[] {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY)
    if (!raw) return DEFAULT_CAMPAIGNS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(isCampaign)) {
      return DEFAULT_CAMPAIGNS
    }
    return parsed as Campaign[]
  } catch {
    return DEFAULT_CAMPAIGNS
  }
}

export function saveCampaigns(campaigns: Campaign[]): void {
  try {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns))
  } catch {
    // Private-mode browsers throw on write. The in-memory list still drives this session.
  }
}
