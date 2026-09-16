'use client'

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
      <div
        data-testid="summary-skeleton"
        className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    )
  }

  // Nothing rather than zeroes: a tile reading "0 dokumen kedaluwarsa" during an outage is an
  // affirmative claim that the papers are in order, and an operator who believes it stops
  // checking.
  if (!summary) return null

  const tiles = [
    { value: String(summary.totalUnit), caption: 'kendaraan terdaftar', tone: '' },
    {
      value: String(summary.dokumenKedaluwarsa),
      caption: 'dokumen kedaluwarsa',
      tone: 'border-destructive/40 bg-destructive/5 text-destructive',
    },
    {
      value: String(summary.jatuhTempo30Hari),
      caption: 'jatuh tempo ≤ 30 hari',
      tone: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    },
    { value: formatRupiah(summary.cicilanPerBulan), caption: 'cicilan & sewa per bulan', tone: '' },
    { value: formatRupiah(summary.sisaKewajiban), caption: 'sisa kewajiban leasing', tone: '' },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.caption} className={`rounded-lg border bg-card p-4 ${tile.tone}`}>
          <div className="text-2xl font-semibold tabular-nums">{tile.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{tile.caption}</div>
        </div>
      ))}
    </div>
  )
}
