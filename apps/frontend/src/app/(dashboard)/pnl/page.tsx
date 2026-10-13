'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { isStaging } from '@/lib/env'
import { PeriodChip } from '@/components/shared/period-chip'
import { fieldClass } from '@/components/ui/input'
import {
  usePnlCycles,
  usePnlSummary,
  PnlColumnPick,
  PnlVendorPick,
  PnlFilter,
  PnlRouteFilter,
  PnlRoutePair,
  PnlDailyMatrixColumn,
  DateBasis,
  DEFAULT_DATE_BASIS,
  BASIS_LABELS,
} from '@/features/pnl/hooks/usePnl'
import {
  ANALYTICS_LABEL,
  ROUTE_COMPARISON_LABEL,
  VENDOR_COMPARISON_LABEL,
} from '@/features/pnl/constants'
import { PnlAnalyticsView } from '@/features/pnl-analytics/components/PnlAnalyticsView'
import { AnalyticsScope } from '@/features/pnl-analytics/types'
import { routeFromCell, unionRoutes } from '@/features/pnl/utils/dailyMatrix'
import { PnlKpiCards, PnlKpiKey } from '@/features/pnl/components/PnlKpiCards'
import { PnlEstimateFilterBar } from '@/features/pnl/components/PnlEstimateFilterBar'
import { PnlDailyMarginChart } from '@/features/pnl/components/PnlDailyMarginChart'
import { PnlBreakdownPanel } from '@/features/pnl/components/PnlBreakdownPanel'
import { PnlAwbDrilldown } from '@/features/pnl/components/PnlAwbDrilldown'
import { PnlDataQuality } from '@/features/pnl/components/PnlDataQuality'
import { PnlFormulaPanel } from '@/features/pnl/components/PnlFormulaPanel'
import { PnlDailyMatrixView } from '@/features/pnl/components/PnlDailyMatrixView'
import { PnlRouteComparisonView } from '@/features/pnl/components/PnlRouteComparisonView'
import { PnlVendorComparisonView } from '@/features/pnl/components/PnlVendorComparisonView'
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
  ['date', 'ata_vendor_wh_destination', 'atd_origin', 'completed_time'] satisfies DateBasis[]
).map((value) => ({ value, label: BASIS_LABELS[value] }))

type PnlView = 'estimate' | 'actual' | 'daily' | 'routes' | 'vendors' | 'analytics'

const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L over the selected date basis — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
  routes: 'Revenue, cost and margin per date, compared across routes and route groups',
  vendors: 'Revenue, cost and margin per route, compared across vendors and vendor groups',
  analytics: 'Data health, trends, cost structure and route economics for the selected period',
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
  // The Estimated tab's whole scope, not just the drilldown's. It narrows the KPI cards, the
  // margin chart, the breakdowns and the AWB table together — the filter bar below owns the
  // controls, this owns the value.
  const [estimateScope, setEstimateScope] = useState<PnlRouteFilter>({})
  const [estimateGroupId, setEstimateGroupId] = useState<string | undefined>(undefined)
  const filterBarRef = useRef<HTMLDivElement>(null)

  // The Daily Report keeps its OWN group. The two tabs are different scopes and must not drag
  // each other around; this sits beside dailyRoutes for the same reason that does.
  const [dailyGroupId, setDailyGroupId] = useState<string | undefined>(undefined)

  // Lifted out of PnlRouteComparisonView so switching tabs does not discard the selection: the
  // tab is rendered by a ternary below, so leaving it unmounts the component outright. Deliberately
  // NOT cleared by the period effect below — a pick carries no date, unlike estimateScope.
  const [routePicks, setRoutePicks] = useState<PnlColumnPick[]>([])

  // Lifted out of PnlDailyMatrixView for the same reason routePicks is: the tab is rendered by a
  // ternary below, so leaving it unmounts the component outright. Deliberately NOT cleared by the
  // period effect — a route carries no date, unlike estimateScope.
  const [dailyRoutes, setDailyRoutes] = useState<PnlRoutePair[]>([])

  // Lifted out of PnlVendorComparisonView for the same reason routePicks is: the tab is rendered
  // by a ternary below, so leaving it unmounts the component outright. Deliberately NOT cleared by
  // the period effect — a pick carries no date, unlike estimateScope.
  const [vendorPicks, setVendorPicks] = useState<PnlVendorPick[]>([])

  // Lifted out of PnlAnalyticsView for the same reason vendorPicks is: the tab is rendered by a
  // ternary below, so leaving it unmounts the component outright. Deliberately NOT cleared by the
  // period effect — a scope carries no date, unlike estimateScope.
  const [analyticsScope, setAnalyticsScope] = useState<AnalyticsScope>({ kind: 'all' })

  useEffect(() => {
    if (cycles && cycles.length > 0 && (!cycle || !cycles.includes(cycle))) {
      setCycle(cycles[0])
    }
  }, [cycles, cycle])

  // Only the dates carry the old period. A route, a vendor and a group do not — the same reason
  // routePicks, dailyRoutes and vendorPicks are deliberately left alone here. Dropping everything
  // used to be acceptable when this scope narrowed one table; now it would wipe the filter for
  // the whole tab every time the reader changed cycle.
  useEffect(() => {
    setEstimateScope((prev) =>
      prev.dateFrom || prev.dateTo ? { ...prev, dateFrom: undefined, dateTo: undefined } : prev,
    )
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

  // Same backstop as the route tab above: the button is the only way `view` becomes 'vendors'
  // today, but a future URL- or storage-driven value must not be able to park a user on a view
  // whose picker they are not allowed to load.
  useEffect(() => {
    if (view === 'vendors' && !hasPermission('read.vendor_group')) {
      setView('estimate')
    }
  }, [view, hasPermission])

  // Changing the date basis re-derives the cycle list; drop the stale selection so the effect
  // above repicks the newest available cycle for the new basis.
  function handleBasisChange(next: DateBasis) {
    setDateBasis(next)
    setCycle(undefined)
  }

  // A cell click REPLACES the scope rather than adding to it, so the group goes too — leaving it
  // on would silently widen what the reader just asked to narrow.
  function applyDrilldownRoute(route: PnlRouteFilter) {
    setEstimateScope(route)
    setEstimateGroupId(undefined)
    setView('estimate')
    // Runs after the Estimated tab has mounted the filter bar. The bar, not the table: what the
    // reader needs to see is that the scope changed, which the numbers below then reflect.
    requestAnimationFrame(() => {
      filterBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleCellClick(column: PnlDailyMatrixColumn, date: string) {
    applyDrilldownRoute(routeFromCell(column, date))
  }

  const filter: PnlFilter | undefined =
    mode === 'cycle'
      ? cycle ? { mode: 'cycle', cycle, basis: dateBasis } : undefined
      : startDate && endDate ? { mode: 'range', start: startDate, end: endDate, basis: dateBasis } : undefined

  const { data: groups } = useRouteGroups({ enabled: hasPermission('read.route_group') })
  const estimateGroupRoutes = (groups?.find((g) => g.id === estimateGroupId)?.routes ?? []).map(
    (r) => ({ origin: r.origin, dest: r.dest }),
  )
  // The scope every panel actually queries. The bar keeps editing `estimateScope` — the
  // hand-picked routes alone — so unticking a route never deletes a group member, and changing
  // group later brings a pre-ticked route back still ticked (spec §2c).
  const effectiveScope: PnlRouteFilter = estimateGroupRoutes.length
    ? { ...estimateScope, routes: unionRoutes(estimateScope.routes ?? [], estimateGroupRoutes) }
    : estimateScope

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError, refetch: refetchSummary } = usePnlSummary(filter, effectiveScope)
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
      <PageHeader
        title="P&L Analysis"
        subtitle={VIEW_SUBTITLE[view]}
        badge={isStaging() ? <StagingBadge /> : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-8 items-center rounded-md border bg-surface-2 p-[3px]">
              <button
                type="button"
                className={cn(
                  'h-full rounded-[6px] px-2.5 text-[11.5px] font-medium motion-safe:transition-colors',
                  mode === 'cycle' ? 'bg-brand-2 font-semibold text-white' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setMode('cycle')}
              >
                Billing Cycle
              </button>
              <button
                type="button"
                className={cn(
                  'h-full rounded-[6px] px-2.5 text-[11.5px] font-medium motion-safe:transition-colors',
                  mode === 'range' ? 'bg-brand-2 font-semibold text-white' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setMode('range')}
              >
                Custom Range
              </button>
            </div>

            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Date</span>
            <select
              className={fieldClass}
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
                className={fieldClass}
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
                  className={fieldClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
          </div>
        }
      />

      {/* The mockup's `.mode-tabs` look: a grey track with each tab a pill, the active one lifted
          to a white card with a soft shadow. A gapped pill row rather than ModeTabs itself — five
          tabs no longer fit on one line at narrow widths, and these need to stay plain <button>s
          (not role=tab) for the existing getByRole('button', …) queries below. */}
      <div data-testid="pnl-view-tabs" className="inline-flex flex-wrap gap-2 rounded-md bg-surface-2 p-1 text-sm">
        <button
          className={cn(
            'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
            view === 'estimate' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setView('estimate')}
        >
          Estimated
        </button>
        <button
          className={cn(
            'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
            view === 'actual' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setView('actual')}
        >
          Actual vs Estimate
        </button>
        <button
          className={cn(
            'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
            view === 'daily' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setView('daily')}
        >
          Daily Report
        </button>
        {hasPermission('read.route_group') && (
          <button
            className={cn(
              'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
              view === 'routes' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setView('routes')}
          >
            {ROUTE_COMPARISON_LABEL}
          </button>
        )}
        {hasPermission('read.vendor_group') && (
          <button
            className={cn(
              'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
              view === 'vendors' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setView('vendors')}
          >
            {VENDOR_COMPARISON_LABEL}
          </button>
        )}
        <button
          className={cn(
            'rounded-[7px] px-3 py-[7px] text-[12.5px] font-medium motion-safe:transition-all',
            view === 'analytics' ? 'bg-card font-semibold text-foreground shadow-soft-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setView('analytics')}
        >
          {ANALYTICS_LABEL}
        </button>
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
        filter && (
          <PnlDailyMatrixView
            filter={filter}
            picks={dailyRoutes}
            onPicksChange={setDailyRoutes}
            groupId={dailyGroupId}
            onGroupChange={setDailyGroupId}
            onCellClick={handleCellClick}
          />
        )
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
      ) : view === 'vendors' ? (
        filter &&
        hasPermission('read.vendor_group') && (
          <PnlVendorComparisonView
            filter={filter}
            picks={vendorPicks}
            onPicksChange={setVendorPicks}
            onCellClick={applyDrilldownRoute}
          />
        )
      ) : view === 'analytics' ? (
        filter && (
          <PnlAnalyticsView
            filter={filter}
            scope={analyticsScope}
            onScopeChange={setAnalyticsScope}
          />
        )
      ) : (
        <>
          {/* mockup `.period-row`: the active cycle/range chip beside the formula help link. */}
          <div className="mb-2 flex flex-wrap items-center gap-3">
            {mode === 'cycle' && cycleDateHint && <PeriodChip>{cycleDateHint}</PeriodChip>}
            <PnlFormulaPanel />
          </div>
          {filter && (
            <div ref={filterBarRef}>
              <PnlEstimateFilterBar
                filter={filter}
                scope={estimateScope}
                onScopeChange={setEstimateScope}
                groupId={estimateGroupId}
                onGroupChange={setEstimateGroupId}
              />
            </div>
          )}
          {summary && (
            <PnlKpiCards summary={summary} activeKpi={activeKpi} onSelect={handleKpiSelect} />
          )}
          {filter && <PnlDailyMarginChart filter={filter} scope={effectiveScope} />}
          {filter && (
            <PnlBreakdownPanel filter={filter} activeKpi={activeKpi} scope={effectiveScope} />
          )}
          {filter && <PnlAwbDrilldown filter={filter} route={effectiveScope} />}
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
