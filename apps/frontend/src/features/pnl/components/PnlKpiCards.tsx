'use client'

import { ArrowUpFromLine, Package, Receipt, Target, TrendingUp, Wallet } from 'lucide-react'
import { KpiGrid, KpiCard } from '@/components/shared/kpi-card'
import { PnlSummary } from '../hooks/usePnl'
import { fmt, num, pct } from '../utils/format'

export type PnlKpiKey = 'revenue' | 'cost' | 'gp'

interface PnlKpiCardsProps {
  summary: PnlSummary
  activeKpi: PnlKpiKey | null
  onSelect: (key: PnlKpiKey) => void
}

export function PnlKpiCards({ summary, activeKpi, onSelect }: PnlKpiCardsProps) {
  const selectedRing = (key: PnlKpiKey) =>
    activeKpi === key ? 'ring-2 ring-primary border-primary' : ''

  return (
    <KpiGrid cols={6}>
      <KpiCard
        label="Est. Revenue"
        value={fmt.format(summary.totalRevenue)}
        hint="net of pph & disc"
        icon={Wallet}
        tone="brand"
        onClick={() => onSelect('revenue')}
        className={selectedRing('revenue')}
      />
      <KpiCard
        label="Est. Cost"
        value={fmt.format(summary.totalCost)}
        hint="based on arrival date"
        icon={ArrowUpFromLine}
        tone="dark"
        onClick={() => onSelect('cost')}
        className={selectedRing('cost')}
      />
      <KpiCard
        label="Est. Gross Profit"
        value={fmt.format(summary.grossProfit)}
        hint="revenue − cost"
        icon={TrendingUp}
        tone="alt"
        onClick={() => onSelect('gp')}
        className={selectedRing('gp')}
      />
      <KpiCard
        label="Est. Gross Margin"
        value={pct(summary.grossMarginPct)}
        hint="GP / revenue"
        icon={Target}
        tone="brand"
        // The mockup's margin icon is a darker green (#2d7a4a) than the shared "brand" tone
        // (#3dae68) — overridden here via an arbitrary descendant selector rather than widening
        // IconTone for one card.
        className="[&_[data-testid='icon-square']]:bg-[#2d7a4a]"
      />
      <KpiCard label="Total TOs" value={num(summary.totalTos)} hint="orders" icon={Package} tone="light" />
      <KpiCard label="Total AWBs" value={num(summary.totalAwbs)} hint="waybills" icon={Receipt} tone="muted" />
    </KpiGrid>
  )
}
