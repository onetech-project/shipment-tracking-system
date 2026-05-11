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
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

const filterLabel = (filter: PnlFilter) =>
  filter.mode === 'cycle' ? filter.cycle : `${filter.start} → ${filter.end}`

const colorForMargin = (margin: number | null, incomplete: boolean) => {
  if (incomplete) return '#94A3B8'
  if (margin == null) return '#94A3B8'
  if (margin < 0) return '#EF4444'
  if (margin < 10) return '#F59E0B'
  return '#22C55E'
}

interface TooltipPayload {
  payload: { date: string; revenue: number; cost: number; marginPct: number | null; hasIncompleteCost: boolean }
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
      {p.hasIncompleteCost && (
        <p className="mt-1 text-amber-600 font-medium">⚠ Cost data incomplete</p>
      )}
    </div>
  )
}

export function PnlDailyMarginChart({ filter }: PnlDailyMarginChartProps) {
  const { data, isLoading, isError, refetch } = usePnlDailyMargin(filter)
  const hasAnyIncomplete = data?.some((d) => d.hasIncompleteCost) ?? false

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Failed to load daily margin chart.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">Daily Gross Margin — {filterLabel(filter)}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-green-500" />≥10%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" />0–10%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-500" />&lt;0%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-slate-400" />Incomplete</span>
        </div>
      </div>
      {hasAnyIncomplete && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <span>⚠</span>
          <span>Some days have incomplete cost data (booking records missing). Grey bars show revenue only — margin figures are overstated.</span>
        </div>
      )}
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
                <Cell key={d.date} fill={colorForMargin(d.marginPct, d.hasIncompleteCost)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
