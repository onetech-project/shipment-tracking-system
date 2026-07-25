'use client'

import { BarhalDashboardKpi } from '../types'

interface BarhalStatCardsProps {
  kpi: BarhalDashboardKpi
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalStatCards({ kpi }: BarhalStatCardsProps) {
  const cards = [
    { label: 'Total Koli', value: fmt.format(kpi.totalKoli) },
    { label: 'Total TO Barhal', value: fmt.format(kpi.totalTo) },
    { label: 'Total Weight Before', value: `${fmt.format(kpi.totalWeightBefore)} kg` },
    { label: 'Total Weight After', value: `${fmt.format(kpi.totalWeightAfter)} kg` },
    { label: 'Total Variance', value: `${fmt.format(kpi.totalVariance)} kg` },
    { label: 'Total Batang Kayu', value: fmt.format(kpi.totalBatangKayu) },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
