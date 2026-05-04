'use client'

import { useState, useEffect } from 'react'
import { usePnlCycles, usePnlSummary, usePnlTrend } from '@/features/pnl/hooks/usePnl'
import { PnlKpiCards } from '@/features/pnl/components/PnlKpiCards'
import { PnlTrendChart } from '@/features/pnl/components/PnlTrendChart'
import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'
import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'

export default function PnlPage() {
  const { data: cycles } = usePnlCycles()
  const [cycle, setCycle] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cycles && cycles.length > 0 && !cycle) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  const { data: summary, isLoading } = usePnlSummary(cycle)
  const { data: trendData } = usePnlTrend()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Analysis</h1>
          <p className="text-muted-foreground text-sm">Air shipment profit &amp; loss by billing cycle</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={cycle ?? ''}
            onChange={(e) => setCycle(e.target.value)}
          >
            {cycles?.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {cycle && (
            <p className="text-xs text-muted-foreground">
              {cycle.endsWith('-1H')
                ? `${cycle.slice(0, 7)} · days 1–15`
                : `${cycle.slice(0, 7)} · days 16–31`}
            </p>
          )}
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading summary…</p>}
      {summary && <PnlKpiCards summary={summary} />}
      {trendData && trendData.length > 0 && <PnlTrendChart data={trendData} />}
      {cycle && <PnlAwbDrilldown cyclePeriod={cycle} />}
      <PnlDataQuality />
    </div>
  )
}
