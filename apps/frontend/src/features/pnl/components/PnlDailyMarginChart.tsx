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
import { BarChart3 } from 'lucide-react'
import { PnlFilter, usePnlDailyMargin } from '../hooks/usePnl'
import { fmt } from '../utils/format'
import { CHART_STATUS } from '@/lib/chart-colors'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { Banner } from '@/components/shared/banner'

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
  if (incomplete) return CHART_STATUS.neutral
  if (margin == null) return CHART_STATUS.neutral
  if (margin < 0) return CHART_STATUS.bad
  if (margin < 10) return CHART_STATUS.warn
  return CHART_STATUS.good
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
        <p className="mt-1 text-warn-ink font-medium">⚠ Cost data incomplete</p>
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
    <Card>
      <CardHead
        icon={BarChart3}
        title="Daily Gross Margin"
        subtitle={filterLabel(filter)}
        actions={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-good" />≥10%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-warn" />0–10%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-bad-strong" />&lt;0%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-faint" />Incomplete</span>
          </div>
        }
      />
      <CardContent className="pt-4">
        {hasAnyIncomplete && (
          <Banner tone="warn">
            Some days have incomplete cost data (booking records missing). Grey bars show revenue
            only — margin figures are overstated.
          </Banner>
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
      </CardContent>
    </Card>
  )
}
