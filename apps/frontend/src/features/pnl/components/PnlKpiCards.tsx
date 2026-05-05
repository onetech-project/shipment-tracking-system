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
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface PnlKpiCardsProps {
  summary: PnlSummary
}

export function PnlKpiCards({ summary }: PnlKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="Est. Revenue"     value={fmt.format(summary.totalRevenue)}    sub="based on arrival date" />
      <KpiCard label="Est. Cost"        value={fmt.format(summary.totalCost)}       sub="based on arrival date" />
      <KpiCard label="Est. Gross Profit" value={fmt.format(summary.grossProfit)}   sub="revenue − cost" />
      <KpiCard label="Est. Gross Margin" value={pct(summary.grossMarginPct)}       sub="GP / revenue" />
      <KpiCard label="Total TOs"        value={num(summary.totalTos)} />
      <KpiCard label="Total AWBs"       value={num(summary.totalAwbs)} />
    </div>
  )
}
