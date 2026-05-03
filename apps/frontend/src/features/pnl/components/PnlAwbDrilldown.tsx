'use client'

import { useState } from 'react'
import { usePnlAwbDrilldown } from '../hooks/usePnl'

const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`)

interface PnlAwbDrilldownProps {
  cyclePeriod: string
}

export function PnlAwbDrilldown({ cyclePeriod }: PnlAwbDrilldownProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePnlAwbDrilldown(cyclePeriod, page)
  const totalPages = data ? Math.ceil(data.total / 50) : 0

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">AWB Drilldown — {cyclePeriod}</p>
        {data && <p className="text-xs text-muted-foreground">{data.total} AWBs</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Airline</th>
              <th className="px-3 py-2 text-right">TOs</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost SMU</th>
              <th className="px-3 py-2 text-right">Cost RA</th>
              <th className="px-3 py-2 text-right">Cost SG</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
              <th className="px-3 py-2 text-right">GP</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {data?.data.map((row) => (
              <tr key={row.awb} className={`border-b hover:bg-muted/50 ${row.hasNullCost ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{row.awb}</td>
                <td className="px-3 py-2">{row.vendor ?? '—'}</td>
                <td className="px-3 py-2">{row.airline ?? '—'}</td>
                <td className="px-3 py-2 text-right">{row.toCount}</td>
                <td className="px-3 py-2 text-right">{fmt.format(row.totalRevenue)}</td>
                <td className="px-3 py-2 text-right">{row.costSmu != null ? fmt.format(row.costSmu) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.costRa != null ? fmt.format(row.costRa) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.costSgOut != null ? fmt.format(row.costSgOut) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.totalCost != null ? fmt.format(row.totalCost) : <span className="text-amber-600">NULL</span>}</td>
                <td className="px-3 py-2 text-right">{row.grossProfit != null ? fmt.format(row.grossProfit) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{pct(row.grossMarginPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
