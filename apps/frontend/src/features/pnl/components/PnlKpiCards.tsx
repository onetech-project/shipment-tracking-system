'use client'

import { PnlSummary } from '../hooks/usePnl'

const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const pct = (n: number) => `${n.toFixed(1)}%`
const num = (n: number) => n.toLocaleString('id-ID')

interface KpiCardProps {
  label: string
  value: string
  sub?: string
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3 sm:p-4">
      <p className="truncate text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl xl:text-sm 2xl:text-base">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface PnlKpiCardsProps {
  summary: PnlSummary
}

export function PnlKpiCards({ summary }: PnlKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="Est. Revenue"     value={fmt.format(summary.totalRevenue)}    sub="based on arrival date" />
      <KpiCard label="Est. Cost"        value={fmt.format(summary.totalCost)}       sub="based on arrival date" />
      <KpiCard label="Est. Gross Profit" value={fmt.format(summary.grossProfit)}   sub="revenue − cost" />
      <KpiCard label="Est. Gross Margin" value={pct(summary.grossMarginPct)}       sub="GP / revenue" />
      <KpiCard label="Total TOs"        value={num(summary.totalTos)} />
      <KpiCard label="Total AWBs"       value={num(summary.totalAwbs)} />
    </div>
  )
}
