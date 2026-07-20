'use client'

import { BarhalDashboardTotals } from '../types'

interface BarhalStatCardsProps {
  totals: BarhalDashboardTotals
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalStatCards({ totals }: BarhalStatCardsProps) {
  const cards = [
    { label: 'Total Koli', value: fmt.format(totals.koli_count) },
    { label: 'Total TO', value: fmt.format(totals.total_to) },
    { label: 'Weight Before', value: `${fmt.format(totals.weight_before)} kg` },
    { label: 'Weight After', value: `${fmt.format(totals.weight_after)} kg` },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
