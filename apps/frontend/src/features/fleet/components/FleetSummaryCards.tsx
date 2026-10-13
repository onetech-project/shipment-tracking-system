'use client'

import { AlertTriangle, Clock, Landmark, Truck, Wallet } from 'lucide-react'
import { KpiCard, KpiGrid } from '@/components/shared/kpi-card'
import { FleetSummary } from '../types'
import { formatRupiah } from '../utils/format-rupiah'

interface Props {
  summary: FleetSummary | undefined
  isLoading: boolean
}

// The prototype's five tiles, in its order and with its wording, so the operator meets the same
// figures they signed off on.
export function FleetSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div data-testid="summary-skeleton">
        <KpiGrid cols={5} className="mb-6 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </KpiGrid>
      </div>
    )
  }

  // Nothing rather than zeroes: a tile reading "0 dokumen kedaluwarsa" during an outage is an
  // affirmative claim that the papers are in order, and an operator who believes it stops
  // checking.
  if (!summary) return null

  const tiles = [
    {
      value: String(summary.totalUnit),
      caption: 'kendaraan terdaftar',
      hint: 'armada aktif',
      icon: Truck,
      tone: 'brand' as const,
    },
    {
      value: String(summary.dokumenKedaluwarsa),
      caption: 'dokumen kedaluwarsa',
      hint: 'butuh perpanjangan',
      icon: AlertTriangle,
      tone: 'danger' as const,
    },
    {
      value: String(summary.jatuhTempo30Hari),
      caption: 'jatuh tempo ≤ 30 hari',
      hint: 'segera habis',
      icon: Clock,
      tone: 'warn' as const,
    },
    {
      value: formatRupiah(summary.cicilanPerBulan),
      caption: 'cicilan & sewa per bulan',
      hint: 'angsuran bulanan',
      icon: Wallet,
      tone: 'dark' as const,
    },
    {
      value: formatRupiah(summary.sisaKewajiban),
      caption: 'sisa kewajiban leasing',
      hint: 'total outstanding',
      icon: Landmark,
      tone: 'info' as const,
    },
  ]

  return (
    <KpiGrid cols={5} className="mb-6 xl:grid-cols-5">
      {tiles.map((tile) => (
        <KpiCard
          key={tile.caption}
          label={tile.caption}
          value={tile.value}
          hint={tile.hint}
          icon={tile.icon}
          tone={tile.tone}
        />
      ))}
    </KpiGrid>
  )
}
