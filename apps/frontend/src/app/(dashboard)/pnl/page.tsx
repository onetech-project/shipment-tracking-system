'use client'

import { useState, useEffect } from 'react'
import { usePnlCycles, usePnlSummary, PnlFilter } from '@/features/pnl/hooks/usePnl'
import { PnlKpiCards, PnlKpiKey } from '@/features/pnl/components/PnlKpiCards'
import { PnlDailyMarginChart } from '@/features/pnl/components/PnlDailyMarginChart'
import { PnlBreakdownPanel } from '@/features/pnl/components/PnlBreakdownPanel'
import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'
import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'
import { PnlFormulaPanel } from '@/features/pnl/components/PnlFormulaPanel'

function PnlSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-6 w-28 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted opacity-60" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 h-4 w-48 rounded bg-muted" />
        <div className="h-[280px] rounded bg-muted opacity-50" />
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 h-4 w-32 rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-muted opacity-50" />
          ))}
        </div>
      </div>
    </div>
  )
}

type FilterMode = 'cycle' | 'range'

export default function PnlPage() {
  const { data: cycles, isLoading: isLoadingCycles, isError: isCyclesError, refetch: refetchCycles } = usePnlCycles()
  const [mode, setMode] = useState<FilterMode>('cycle')
  const [cycle, setCycle] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeKpi, setActiveKpi] = useState<PnlKpiKey | null>(null)
  const [showDq, setShowDq] = useState(false)

  useEffect(() => {
    if (cycles && cycles.length > 0 && !cycle) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  const filter: PnlFilter | undefined =
    mode === 'cycle'
      ? cycle ? { mode: 'cycle', cycle } : undefined
      : startDate && endDate ? { mode: 'range', start: startDate, end: endDate } : undefined

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError, refetch: refetchSummary } = usePnlSummary(filter)
  const isPageLoading = !cycles || (!!filter && isSummaryLoading && !summary)
  const isPageError = isCyclesError || isSummaryError

  const cycleDateHint =
    cycle && mode === 'cycle'
      ? cycle.endsWith('-1H')
        ? `${cycle.slice(0, 7)} · days 1–15`
        : `${cycle.slice(0, 7)} · days 16–31`
      : null

  const handleKpiSelect = (key: PnlKpiKey) => {
    setActiveKpi((prev) => (prev === key ? null : key))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Analysis</h1>
          <p className="text-muted-foreground text-sm">Estimated P&amp;L based on arrival date — not yet billed</p>
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
                {Object.entries(
                  (cycles ?? []).reduce<Record<string, string[]>>((acc, c) => {
                    const year = c.slice(0, 4)
                    ;(acc[year] ??= []).push(c)
                    return acc
                  }, {})
                ).map(([year, items]) => (
                  <optgroup key={year} label={year}>
                    {items.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
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

      {isPageError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isCyclesError ? 'Failed to load billing cycles.' : 'Failed to load summary data.'}
          </p>
          <button
            onClick={() => isCyclesError ? refetchCycles() : refetchSummary()}
            className="mt-2 text-sm text-primary underline"
          >
            Retry
          </button>
        </div>
      ) : isPageLoading ? (
        <PnlSkeleton />
      ) : mode === 'range' && !filter ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Select a start and end date above to view P&amp;L data.</p>
        </div>
      ) : (
        <>
          <PnlFormulaPanel />
          {summary && (
            <PnlKpiCards summary={summary} activeKpi={activeKpi} onSelect={handleKpiSelect} />
          )}
          {filter && <PnlDailyMarginChart filter={filter} />}
          {filter && <PnlBreakdownPanel filter={filter} activeKpi={activeKpi} />}
          {filter && <PnlAwbDrilldown filter={filter} />}
          {showDq ? (
            <PnlDataQuality />
          ) : (
            <div className="flex justify-center">
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowDq(true)}
              >
                Check data quality
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
