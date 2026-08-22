'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import {
  usePnlCycles,
  usePnlSummary,
  PnlColumnPick,
  PnlFilter,
  PnlRouteFilter,
  PnlDailyMatrixColumn,
  DateBasis,
  DEFAULT_DATE_BASIS,
  BASIS_LABELS,
} from '@/features/pnl/hooks/usePnl'
import { ROUTE_COMPARISON_LABEL } from '@/features/pnl/constants'
import { routeFromCell } from '@/features/pnl/utils/dailyMatrix'
import { PnlKpiCards, PnlKpiKey } from '@/features/pnl/components/PnlKpiCards'
import { PnlDailyMarginChart } from '@/features/pnl/components/PnlDailyMarginChart'
import { PnlBreakdownPanel } from '@/features/pnl/components/PnlBreakdownPanel'
import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'
import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'
import { PnlFormulaPanel } from '@/features/pnl/components/PnlFormulaPanel'
import { PnlDailyMatrixView } from '@/features/pnl/components/PnlDailyMatrixView'
import { PnlRouteComparisonView } from '@/features/pnl/components/PnlRouteComparisonView'
import { SettlementView } from '@/features/pnl-settlement/components/SettlementView'

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

// Order is deliberate — the default basis comes first. Labels come from BASIS_LABELS so the
// drilldown's date column header can never disagree with this dropdown.
const BASIS_OPTIONS: { value: DateBasis; label: string }[] = (
  ['ata_vendor_wh_destination', 'atd_origin', 'completed_time'] satisfies DateBasis[]
).map((value) => ({ value, label: BASIS_LABELS[value] }))

type PnlView = 'estimate' | 'actual' | 'daily' | 'routes'

const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L based on arrival date — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
  routes: 'Revenue, cost and margin per date, compared across routes and route groups',
}

function PnlPageContent() {
  const { hasPermission } = usePermissions()
  const [dateBasis, setDateBasis] = useState<DateBasis>(DEFAULT_DATE_BASIS)
  const { data: cycles, isLoading: isLoadingCycles, isError: isCyclesError, refetch: refetchCycles } = usePnlCycles(dateBasis)
  const [mode, setMode] = useState<FilterMode>('cycle')
  const [cycle, setCycle] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeKpi, setActiveKpi] = useState<PnlKpiKey | null>(null)
  const [showDq, setShowDq] = useState(false)
  const [view, setView] = useState<PnlView>('estimate')
  const [drilldownRoute, setDrilldownRoute] = useState<PnlRouteFilter>({})
  const drilldownRef = useRef<HTMLDivElement>(null)

  // Lifted out of PnlRouteComparisonView so switching tabs does not discard the selection: the
  // tab is rendered by a ternary below, so leaving it unmounts the component outright. Deliberately
  // NOT cleared by the period effect below — a pick carries no date, unlike drilldownRoute.
  // vendorPicks is unused for now — it shapes the container for a future Vendor Comparison tab.
  const [routePicks, setRoutePicks] = useState<PnlColumnPick[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [vendorPicks, setVendorPicks] = useState<PnlColumnPick[]>([])

  useEffect(() => {
    if (cycles && cycles.length > 0 && (!cycle || !cycles.includes(cycle))) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  // A route filter carries a date inside the old period; keeping it after the period changes would
  // silently empty the table with no visible cause.
  useEffect(() => {
    setDrilldownRoute({})
  }, [dateBasis, mode, cycle, startDate, endDate])

  // The Route Comparison tab button below is gated on read.route_group, but view state is not
  // otherwise constrained — this is a defensive backstop so a user who can't see the tab can never
  // stay parked on its view (e.g. if a future change ever set `view` from somewhere other than the
  // button, such as a persisted or URL-driven value).
  useEffect(() => {
    if (view === 'routes' && !hasPermission('read.route_group')) {
      setView('estimate')
    }
  }, [view, hasPermission])

  // Changing the date basis re-derives the cycle list; drop the stale selection so the effect
  // above repicks the newest available cycle for the new basis.
  function handleBasisChange(next: DateBasis) {
    setDateBasis(next)
    setCycle(undefined)
  }

  // The page period, KPIs, chart and breakdowns keep showing the whole cycle; only the drilldown
  // narrows, which is what makes it readable as a subset of them.
  function applyDrilldownRoute(route: PnlRouteFilter) {
    setDrilldownRoute(route)
    setView('estimate')
    // Runs after the Estimated tab has mounted the drilldown.
    requestAnimationFrame(() => {
      drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleCellClick(column: PnlDailyMatrixColumn, date: string) {
    applyDrilldownRoute(routeFromCell(column, date))
  }

  const filter: PnlFilter | undefined =
    mode === 'cycle'
      ? cycle ? { mode: 'cycle', cycle, basis: dateBasis } : undefined
      : startDate && endDate ? { mode: 'range', start: startDate, end: endDate, basis: dateBasis } : undefined

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
          <p className="text-muted-foreground text-sm">{VIEW_SUBTITLE[view]}</p>
          <div className="mt-2 flex w-fit rounded-md border text-sm overflow-hidden">
            <button
              className={`px-3 py-1.5 ${view === 'estimate' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('estimate')}
            >
              Estimated
            </button>
            <button
              className={`px-3 py-1.5 border-l ${view === 'actual' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('actual')}
            >
              Actual vs Estimate
            </button>
            <button
              className={`px-3 py-1.5 border-l ${view === 'daily' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('daily')}
            >
              Daily Report
            </button>
            {hasPermission('read.route_group') && (
              <button
                className={`px-3 py-1.5 border-l ${view === 'routes' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                onClick={() => setView('routes')}
              >
                {ROUTE_COMPARISON_LABEL}
              </button>
            )}
          </div>
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

          <div className="flex items-center gap-2">
            <select
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
              value={dateBasis}
              onChange={(e) => handleBasisChange(e.target.value as DateBasis)}
              title="Date field used to assign the billing cycle / filter the range"
            >
              {BASIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {mode === 'cycle' && (
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
          {mode === 'cycle' && cycleDateHint && (
            <p className="text-xs text-muted-foreground">{cycleDateHint}</p>
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
      ) : view === 'actual' ? (
        <SettlementView filter={filter} />
      ) : view === 'daily' ? (
        filter && <PnlDailyMatrixView filter={filter} onCellClick={handleCellClick} />
      ) : view === 'routes' ? (
        filter &&
        hasPermission('read.route_group') && (
          <PnlRouteComparisonView
            filter={filter}
            picks={routePicks}
            onPicksChange={setRoutePicks}
            onCellClick={applyDrilldownRoute}
          />
        )
      ) : (
        <>
          <PnlFormulaPanel />
          {summary && (
            <PnlKpiCards summary={summary} activeKpi={activeKpi} onSelect={handleKpiSelect} />
          )}
          {filter && <PnlDailyMarginChart filter={filter} />}
          {filter && <PnlBreakdownPanel filter={filter} activeKpi={activeKpi} />}
          {filter && (
            <div ref={drilldownRef}>
              <PnlAwbDrilldown
                filter={filter}
                route={drilldownRoute}
                onRouteChange={setDrilldownRoute}
              />
            </div>
          )}
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

export default function PnlPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.pnl')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.pnl')) return null

  return <PnlPageContent />
}
