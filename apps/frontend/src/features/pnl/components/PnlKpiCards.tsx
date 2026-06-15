'use client'

import { PnlSummary } from '../hooks/usePnl'
import { fmt, num, pct } from '../utils/format'

export type PnlKpiKey = 'revenue' | 'cost' | 'gp'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  active?: boolean
  onClick?: () => void
}

function KpiCard({ label, value, sub, active, onClick }: KpiCardProps) {
  const interactive = onClick != null
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={[
        'min-w-0 rounded-lg border bg-card p-3 sm:p-4 transition-colors',
        interactive ? 'cursor-pointer hover:border-primary/50' : '',
        active ? 'ring-2 ring-primary border-primary' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="truncate text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl xl:text-sm 2xl:text-base">
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface PnlKpiCardsProps {
  summary: PnlSummary
  activeKpi: PnlKpiKey | null
  onSelect: (key: PnlKpiKey) => void
}

export function PnlKpiCards({ summary, activeKpi, onSelect }: PnlKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Est. Revenue"
        value={fmt.format(summary.totalRevenue)}
        sub="based on arrival date"
        active={activeKpi === 'revenue'}
        onClick={() => onSelect('revenue')}
      />
      <KpiCard
        label="Est. Cost"
        value={fmt.format(summary.totalCost)}
        sub="based on arrival date"
        active={activeKpi === 'cost'}
        onClick={() => onSelect('cost')}
      />
      <KpiCard
        label="Est. Gross Profit"
        value={fmt.format(summary.grossProfit)}
        sub="revenue − discount − cost"
        active={activeKpi === 'gp'}
        onClick={() => onSelect('gp')}
      />
      <KpiCard label="Est. Gross Margin" value={pct(summary.grossMarginPct)} sub="GP / revenue" />
      <KpiCard label="Total TOs" value={num(summary.totalTos)} />
      <KpiCard label="Total AWBs" value={num(summary.totalAwbs)} />
    </div>
  )
}
