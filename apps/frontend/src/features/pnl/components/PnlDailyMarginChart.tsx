'use client'

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PnlFilter, usePnlDailyMargin } from '../hooks/usePnl'
import { fmt } from '../utils/format'

interface PnlDailyMarginChartProps {
  filter: PnlFilter
}

const formatDateLabel = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

const filterLabel = (filter: PnlFilter) =>
  filter.mode === 'cycle' ? filter.cycle : `${filter.start} → ${filter.end}`

const colorForMargin = (margin: number | null) => {
  if (margin == null) return '#94A3B8'
  if (margin < 0) return '#EF4444'
  if (margin < 10) return '#F59E0B'
  return '#22C55E'
}

interface TooltipPayload {
  payload: { date: string; revenue: number; cost: number; marginPct: number | null }
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{formatDateLabel(p.date)}</p>
      <p className="text-muted-foreground">Revenue: {fmt.format(p.revenue)}</p>
      <p className="text-muted-foreground">Cost: {fmt.format(p.cost)}</p>
      <p className="font-medium">
        Margin: {p.marginPct == null ? '—' : `${p.marginPct.toFixed(1)}%`}
      </p>
    </div>
  )
}

export function PnlDailyMarginChart({ filter }: PnlDailyMarginChartProps) {
  const { data, isLoading } = usePnlDailyMargin(filter)

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-4 text-sm font-medium">Daily Gross Margin — {filterLabel(filter)}</p>
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {data && data.length === 0 && (
        <p className="text-muted-foreground text-sm">No data for this range.</p>
      )}
      {data && data.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 11 }}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="marginPct" name="Margin %" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={colorForMargin(d.marginPct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
