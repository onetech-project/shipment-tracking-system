'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  PnlFilter,
  usePnlAwbDrilldown,
  usePnlCostByRa,
  usePnlCostBySgIn,
  usePnlCostBySgOut,
  usePnlCostByVendor,
  usePnlCostTotals,
  usePnlDataQualitySummary,
  usePnlProfitByRoute,
  usePnlSummary,
} from '@/features/pnl/hooks/usePnl'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { AnalyticsScope, Campaign } from '../types'
import {
  useAnalyticsDailySeries,
  useAnalyticsGwChw,
  useAnalyticsJourney,
  useAnalyticsOffloaded,
  useAnalyticsPrevDailySeries,
  useAnalyticsSla,
} from '../hooks/useAnalytics'
import { buildAnalyticsContext } from '../utils/context'
import { routeKey } from '../utils/cycle'
import { routeKeysIn } from '../utils/series'
import { loadCampaigns, saveCampaigns } from '../utils/weekday'
import { AnalyticsScopePicker } from './AnalyticsScopePicker'
import { AnalyticsHealth } from './AnalyticsHealth'
import { AnalyticsSummary } from './AnalyticsSummary'
import { AnalyticsTrend } from './AnalyticsTrend'
import { AnalyticsTimePatterns } from './AnalyticsTimePatterns'
import { AnalyticsCostStructure } from './AnalyticsCostStructure'
import { AnalyticsAirline } from './AnalyticsAirline'
import { AnalyticsRa } from './AnalyticsRa'
import { AnalyticsSg } from './AnalyticsSg'
import { AnalyticsVendor } from './AnalyticsVendor'
import { AnalyticsJourney } from './AnalyticsJourney'
import { AnalyticsRoutes } from './AnalyticsRoutes'
import { AnalyticsWeightGap } from './AnalyticsWeightGap'
import { AnalyticsOps } from './AnalyticsOps'
import { AnalyticsAppendix } from './AnalyticsAppendix'

interface PnlAnalyticsViewProps {
  filter: PnlFilter
  /** Lifted to the page: the tab is rendered through a ternary, so local state would be lost. */
  scope: AnalyticsScope
  onScopeChange: (next: AnalyticsScope) => void
}

const APPENDIX_LIMIT = 50

// Anchor targets, in render order. Each id matches the `id` its AnalyticsSection is given, so a
// nav entry can never point at a section that is not on the page.
const SECTIONS: { id: string; label: string }[] = [
  { id: 'health', label: 'Data Health' },
  { id: 'summary', label: 'Summary' },
  { id: 'trend', label: 'Daily Trend' },
  { id: 'time-patterns', label: 'Time Patterns' },
  { id: 'cost-structure', label: 'Cost Structure' },
  { id: 'airline', label: 'SMU & Airline' },
  { id: 'ra', label: 'RA' },
  { id: 'sg', label: 'Incoming & Outgoing' },
  { id: 'vendor', label: 'Vendor Execution' },
  { id: 'journey', label: 'Best Journey' },
  { id: 'routes', label: 'Routes & Groups' },
  { id: 'weight-gap', label: 'Weight Gap' },
  { id: 'ops', label: 'Operations' },
  { id: 'appendix', label: 'Appendix' },
]

function SectionNav() {
  return (
    <nav data-testid="analytics-nav" className="flex flex-wrap gap-2 text-xs">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}

export function PnlAnalyticsView({ filter, scope, onScopeChange }: PnlAnalyticsViewProps) {
  const { hasPermission } = usePermissions()
  const canReadSla = hasPermission('read.sla')
  const canReadGroups = hasPermission('read.route_group')

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns())
  const [appendixPage, setAppendixPage] = useState(1)

  // Changing the period invalidates the page the reader was on.
  useEffect(() => setAppendixPage(1), [filter])

  const seriesQ = useAnalyticsDailySeries(filter)
  const prevQ = useAnalyticsPrevDailySeries(filter)
  const journeyQ = useAnalyticsJourney(filter)
  const gwChwQ = useAnalyticsGwChw(filter)
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.sla never produces a 403.
  const slaQ = useAnalyticsSla(filter, canReadSla)
  const offloadedQ = useAnalyticsOffloaded(filter, canReadSla)

  const summaryQ = usePnlSummary(filter)
  const costTotalsQ = usePnlCostTotals(filter)
  const vendorQ = usePnlCostByVendor(filter)
  const raQ = usePnlCostByRa(filter)
  const sgOutQ = usePnlCostBySgOut(filter)
  const sgInQ = usePnlCostBySgIn(filter)
  const profitQ = usePnlProfitByRoute(filter)
  const dqSummaryQ = usePnlDataQualitySummary()
  const awbQ = usePnlAwbDrilldown(filter, appendixPage, undefined, APPENDIX_LIMIT)

  const { data: groups } = useRouteGroups({ enabled: canReadGroups })
  const group = scope.kind === 'group' ? groups?.find((g) => g.id === scope.id) : undefined
  const groupRoutes = useMemo(
    () => group?.routes.map((r) => routeKey(r.origin, r.dest)) ?? [],
    [group],
  )

  const ctx = useMemo(
    () =>
      buildAnalyticsContext({
        series: seriesQ.data,
        prevSeries: prevQ.data,
        scope,
        groupRoutes,
        groupName: group?.name,
        campaigns,
        ranged: filter.mode === 'range',
        dq: {
          profitByRoute: profitQ.data,
          costTotals: costTotalsQ.data,
          summary: summaryQ.data,
          costByVendor: vendorQ.data,
          costByRa: raQ.data,
          sla: slaQ.data,
          dataQuality: dqSummaryQ.data,
        },
      }),
    [
      seriesQ.data,
      prevQ.data,
      scope,
      groupRoutes,
      group?.name,
      campaigns,
      filter.mode,
      profitQ.data,
      costTotalsQ.data,
      summaryQ.data,
      vendorQ.data,
      raQ.data,
      slaQ.data,
      dqSummaryQ.data,
    ],
  )

  const onCampaignsChange = (next: Campaign[]) => {
    setCampaigns(next)
    saveCampaigns(next)
  }

  const picker = (
    <AnalyticsScopePicker
      routeKeys={routeKeysIn(seriesQ.data)}
      scope={scope}
      onChange={onScopeChange}
    />
  )

  // The picker stays on screen through every state, so a slow or failed request never removes the
  // control the reader would use next.
  const frame = (body: ReactNode) => (
    <div className="space-y-4">
      {picker}
      {body}
    </div>
  )

  if (seriesQ.isLoading) {
    return frame(
      <p data-testid="analytics-loading" className="text-sm text-muted-foreground">
        Loading analytics…
      </p>,
    )
  }

  if (seriesQ.isError || !seriesQ.data) {
    return frame(
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>The analytics series could not be loaded.</p>
        <button
          className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs"
          onClick={() => seriesQ.refetch()}
        >
          Retry
        </button>
      </div>,
    )
  }

  if (!seriesQ.data.rows.length) {
    return frame(
      <p data-testid="analytics-empty" className="text-sm text-muted-foreground">
        This period has no shipment data on the selected date basis.
      </p>,
    )
  }

  return frame(
    <div className="space-y-4">
      <SectionNav />
      <AnalyticsHealth
        dq={ctx.dq}
        outliers={ctx.outliers}
        baselineIncomplete={ctx.baselineIncomplete}
      />
      <AnalyticsSummary
        kpi={ctx.kpi}
        kpiDelta={ctx.kpiDelta}
        baselineIncomplete={ctx.baselineIncomplete}
        scopeLabel={ctx.scopeLabel}
      />
      <AnalyticsTrend series={ctx.series} campaigns={ctx.campaigns} scopeLabel={ctx.scopeLabel} />
      <AnalyticsTimePatterns
        series={ctx.series}
        campaigns={ctx.campaigns}
        onCampaignsChange={onCampaignsChange}
      />
      <AnalyticsCostStructure series={ctx.series} />
      <AnalyticsAirline
        data={vendorQ.data}
        isLoading={vendorQ.isLoading}
        isError={vendorQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsRa
        data={raQ.data}
        isLoading={raQ.isLoading}
        isError={raQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsSg
        outgoing={sgOutQ.data}
        incoming={sgInQ.data}
        isLoading={sgOutQ.isLoading || sgInQ.isLoading}
        isError={sgOutQ.isError || sgInQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsVendor
        data={vendorQ.data}
        isLoading={vendorQ.isLoading}
        isError={vendorQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsJourney
        data={journeyQ.data}
        isLoading={journeyQ.isLoading}
        isError={journeyQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsRoutes series={seriesQ.data} routeKeys={ctx.routeKeys} />
      <AnalyticsWeightGap
        data={gwChwQ.data}
        isLoading={gwChwQ.isLoading}
        isError={gwChwQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsOps
        canReadSla={canReadSla}
        sla={slaQ.data}
        slaLoading={slaQ.isLoading}
        slaError={slaQ.isError}
        offloaded={offloadedQ.data?.data}
        offloadedLoading={offloadedQ.isLoading}
        offloadedError={offloadedQ.isError}
        awbs={awbQ.data?.data ?? []}
        routeKeys={ctx.scoped ? ctx.routeKeys : []}
        ranged={ctx.ranged}
      />
      <AnalyticsAppendix
        rows={awbQ.data?.data}
        total={awbQ.data?.total ?? 0}
        page={appendixPage}
        limit={APPENDIX_LIMIT}
        onPageChange={setAppendixPage}
        isLoading={awbQ.isLoading}
        isError={awbQ.isError}
      />
    </div>,
  )
}
