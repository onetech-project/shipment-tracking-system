'use client'

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Campaign, SeriesDay } from '../types'
import { campaignDates } from '../utils/weekday'
import { colorForMargin, formatDateLabel } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsTrendProps {
  series: SeriesDay[]
  campaigns: Campaign[]
  scopeLabel: string
}

interface TrendDatum {
  date: string
  label: string
  weight: number
  marginPct: number | null
  revenue: number
  cost: number
  incomplete: boolean
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendDatum }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow">
      <p className="font-medium">{d.date}</p>
      <p>Weight: {num(Math.round(d.weight))} kg</p>
      <p>Revenue: {fmt.format(d.revenue)}</p>
      <p>Cost: {fmt.format(d.cost)}</p>
      <p>Margin: {pct(d.marginPct)}</p>
      {d.incomplete && <p className="text-amber-600">Cost incomplete on this day</p>}
    </div>
  )
}

export function AnalyticsTrend({ series, campaigns, scopeLabel }: AnalyticsTrendProps) {
  const data: TrendDatum[] = series.map((d) => ({
    date: d.date,
    label: formatDateLabel(d.date),
    weight: d.weight,
    // A day with incomplete cost gets no margin point at all: a line dipping to a fabricated
    // number reads as a bad day rather than as missing data.
    marginPct: d.incompleteTos || !d.revenue ? null : (d.margin / d.revenue) * 100,
    revenue: d.revenue,
    cost: d.cost,
    incomplete: d.incompleteTos > 0,
  }))

  const marks = new Set<string>()
  for (const c of campaigns) for (const date of campaignDates(c.rule, series)) marks.add(date)

  return (
    <AnalyticsSection
      id="trend"
      title="Daily Trend"
      subtitle={`${scopeLabel} — tonnage bars, margin % line, campaign days marked`}
    >
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No days in this period.</p>
      ) : (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="weight" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="margin"
                orientation="right"
                unit="%"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Array.from(marks).map((date) => (
                <ReferenceLine
                  key={date}
                  yAxisId="weight"
                  x={formatDateLabel(date)}
                  stroke="#EC4899"
                  strokeDasharray="4 4"
                />
              ))}
              <Bar yAxisId="weight" dataKey="weight" name="Weight (kg)">
                {data.map((d) => (
                  <Cell key={d.date} fill={colorForMargin(d.marginPct, d.incomplete)} />
                ))}
              </Bar>
              <Line
                yAxisId="margin"
                type="monotone"
                dataKey="marginPct"
                name="Margin %"
                stroke="#0F172A"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Bars are coloured by that day&apos;s margin — grey where cost is incomplete, and those days
        carry no margin point on the line. Dashed pink lines mark campaign dates.
      </p>
    </AnalyticsSection>
  )
}
