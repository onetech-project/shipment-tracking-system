'use client'

import { useState, useEffect } from 'react'
import { usePnlCycles, usePnlSummary, usePnlTrend, PnlFilter } from '@/features/pnl/hooks/usePnl'
import { PnlKpiCards } from '@/features/pnl/components/PnlKpiCards'
import { PnlTrendChart } from '@/features/pnl/components/PnlTrendChart'
import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'
import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'

type FilterMode = 'cycle' | 'range'

export default function PnlPage() {
  const { data: cycles } = usePnlCycles()
  const [mode, setMode] = useState<FilterMode>('cycle')
  const [cycle, setCycle] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (cycles && cycles.length > 0 && !cycle) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  const filter: PnlFilter | undefined =
    mode === 'cycle'
      ? cycle ? { mode: 'cycle', cycle } : undefined
      : startDate && endDate ? { mode: 'range', start: startDate, end: endDate } : undefined

  const { data: summary, isLoading } = usePnlSummary(filter)
  const { data: trendData } = usePnlTrend()

  const cycleDateHint =
    cycle && mode === 'cycle'
      ? cycle.endsWith('-1H')
        ? `${cycle.slice(0, 7)} · days 1–15`
        : `${cycle.slice(0, 7)} · days 16–31`
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Analysis</h1>
          <p className="text-muted-foreground text-sm">Air shipment profit &amp; loss by billing cycle</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex rounded-md border text-sm overflow-hidden">
            <button
              className={`px-3 py-1.5 ${mode === 'cycle' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('cycle')}
            >
              Billing Cycle
            </button>
            <button
              className={`px-3 py-1.5 border-l ${mode === 'range' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('range')}
            >
              Custom Range
            </button>
          </div>

          {mode === 'cycle' && (
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
              {cycleDateHint && (
                <p className="text-xs text-muted-foreground">{cycleDateHint}</p>
              )}
            </div>
          )}

          {mode === 'range' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading summary…</p>}
      {summary && <PnlKpiCards summary={summary} />}
      {trendData && trendData.length > 0 && <PnlTrendChart data={trendData} />}
      {filter && <PnlAwbDrilldown filter={filter} />}
      <PnlDataQuality />
    </div>
  )
}
