'use client'

import { Package, FileText, Scale, PackageCheck, GitCompare, TreePine } from 'lucide-react'
import { KpiCard, KpiGrid } from '@/components/shared/kpi-card'
import { BarhalDashboardKpi } from '../types'

interface BarhalStatCardsProps {
  kpi: BarhalDashboardKpi
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalStatCards({ kpi }: BarhalStatCardsProps) {
  const cards = [
    { label: 'Total Koli', value: fmt.format(kpi.totalKoli), icon: Package, tone: 'brand' as const },
    { label: 'Total TO Barhal', value: fmt.format(kpi.totalTo), icon: FileText, tone: 'info' as const },
    { label: 'Total Weight Before', value: `${fmt.format(kpi.totalWeightBefore)} kg`, icon: Scale, tone: 'muted' as const },
    { label: 'Total Weight After', value: `${fmt.format(kpi.totalWeightAfter)} kg`, icon: PackageCheck, tone: 'alt' as const },
    { label: 'Total Variance', value: `${fmt.format(kpi.totalVariance)} kg`, icon: GitCompare, tone: 'warn' as const },
    { label: 'Total Batang Kayu', value: fmt.format(kpi.totalBatangKayu), icon: TreePine, tone: 'dark' as const },
  ]

  return (
    <KpiGrid cols={6}>
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} value={c.value} icon={c.icon} tone={c.tone} />
      ))}
    </KpiGrid>
  )
}
