'use client'

import { useState } from 'react'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Campaign, SeriesDay } from '../types'
import {
  CampaignSummaryRow,
  WeekdayBucket,
  campaignSummary,
  campaignWindows,
  parseCampaignInput,
  serializeCampaigns,
  weekdayProfile,
} from '../utils/weekday'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsTimePatternsProps {
  series: SeriesDay[]
  campaigns: Campaign[]
  onCampaignsChange: (next: Campaign[]) => void
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

export function AnalyticsTimePatterns({
  series,
  campaigns,
  onCampaignsChange,
}: AnalyticsTimePatternsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const profile = weekdayProfile(series)
  const windows = campaignWindows(series, campaigns)
  const summary = campaignSummary(windows)

  const openEditor = () => {
    setDraft(serializeCampaigns(campaigns))
    setError(null)
    setEditing(true)
  }

  const save = () => {
    const parsed = parseCampaignInput(draft)
    // Saving an empty list would silently erase the section rather than report bad input.
    if (!parsed.length) {
      setError('Could not read any rule. Use "double" for double dates, or a day number like 25.')
      return
    }
    onCampaignsChange(parsed)
    setEditing(false)
  }

  return (
    <AnalyticsSection
      id="time-patterns"
      title="Time Patterns"
      subtitle="Which weekdays carry the tonnage, and what campaigns do to it"
      action={
        <button
          className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
          onClick={openEditor}
        >
          Edit campaigns
        </button>
      }
    >
      {editing && (
        <div className="rounded-md border p-3">
          <label htmlFor="campaign-rules" className="text-xs font-medium">
            Campaign rules
          </label>
          <input
            id="campaign-rules"
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Comma-separated. <code>double</code> means double dates (7.7, 8.8, …); a number means
            that day of every month.
          </p>
          {error && (
            <p data-testid="analytics-campaign-error" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
              onClick={save}
            >
              Save
            </button>
            <button className="rounded-md border px-3 py-1 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <AnalyticsTable<WeekdayBucket>
        columns={[
          { key: 'label', header: 'Weekday', cell: (b) => b.label },
          { key: 'days', header: 'Days', align: 'right', cell: (b) => num(b.days) },
          {
            key: 'avgWeight',
            header: 'Avg weight',
            align: 'right',
            cell: (b) => num(Math.round(b.avgWeight)),
          },
          {
            key: 'vs',
            header: 'vs period avg',
            align: 'right',
            cell: (b) => signed(b.vsOverallPct),
          },
          {
            key: 'avgMargin',
            header: 'Avg margin',
            align: 'right',
            cell: (b) => fmt.format(b.avgMargin),
          },
          { key: 'marginPct', header: 'Margin %', align: 'right', cell: (b) => pct(b.avgMarginPct) },
        ]}
        rows={profile}
        rowKey={(b) => String(b.weekday)}
        empty="No days in this period."
      />

      {summary.length === 0 ? (
        <p data-testid="analytics-campaign-empty" className="text-sm text-muted-foreground">
          No campaign date falls inside this period, so there is nothing to measure against.
        </p>
      ) : (
        <div className="space-y-2">
          {summary.map((row: CampaignSummaryRow) => (
            <div key={row.label} data-testid={`campaign-${row.label}`}>
              <p className="text-sm font-medium">
                {row.label}
                {row.peakOffset != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    peak at D{row.peakOffset >= 0 ? '+' : ''}
                    {row.peakOffset}
                  </span>
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.byOffset.map((o) => (
                  <span
                    key={o.offset}
                    className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${o.avgLift >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                  >
                    D{o.offset >= 0 ? '+' : ''}
                    {o.offset}: {signed(o.avgLift)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Lift is against the median tonnage of days outside every campaign window, so a large
            campaign cannot inflate its own baseline.
          </p>
        </div>
      )}
    </AnalyticsSection>
  )
}
