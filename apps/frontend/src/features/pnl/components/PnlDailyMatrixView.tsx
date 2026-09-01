'use client'

import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import {
  PnlDailyMatrixColumn,
  PnlFilter,
  PnlRoutePair,
  usePnlDailyMatrix,
  usePnlRoutes,
} from '../hooks/usePnl'
import { groupOrigins, selectMatrixColumns, toMarginTable, toRevenueTable } from '../utils/dailyMatrix'
import { buildRouteLabelIndex, displayRouteLabel, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
import { PnlMatrixTable } from './PnlMatrixTable'

interface PnlDailyMatrixViewProps {
  filter: PnlFilter
  // Lifted to the page for the same reason the comparison picks are: the tab is rendered by a
  // ternary, so leaving it unmounts this view and would otherwise discard the selection.
  picks: PnlRoutePair[]
  onPicksChange: (next: PnlRoutePair[]) => void
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

export function PnlDailyMatrixView({ filter, picks, onPicksChange, onCellClick }: PnlDailyMatrixViewProps) {
  const { data, isLoading, isError, refetch } = usePnlDailyMatrix(filter)
  const { data: routes } = usePnlRoutes()

  // Labelled by airport code, unlike the Route Comparison picker's raw-station form: this dropdown
  // sits directly above a matrix whose headers name origins that way, and the two must agree.
  const routeIndex = buildRouteLabelIndex(routes ?? [], displayRouteLabel)

  // Rendered before the early returns below so the filter stays usable while the report reloads,
  // errors, or comes back empty — otherwise a too-narrow pick would hide the control that undoes it.
  const routeFilter = (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-2 text-sm font-medium">Rute</p>
      <MultiRouteFilter
        className="w-[260px]"
        routes={routeIndex.labels}
        selected={labelsForRoutes(picks, routeIndex)}
        onChange={(labels) => onPicksChange(routesForLabels(labels, routeIndex))}
      />
    </div>
  )

  function frame(body: React.ReactNode) {
    return (
      <div className="space-y-6">
        {routeFilter}
        {body}
      </div>
    )
  }

  if (isLoading) {
    return frame(
      <div className="space-y-6 animate-pulse">
        <div className="h-[320px] rounded-lg border bg-card" />
        <div className="h-[420px] rounded-lg border bg-card" />
      </div>,
    )
  }

  if (isError) {
    return frame(
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load the daily report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>,
    )
  }

  if (!data || data.columns.length === 0) {
    return frame(
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No route data available.</p>
      </div>,
    )
  }

  // Applied once, ahead of both tables, so the two stay column-aligned and every downstream index —
  // headers, footers, the column a cell click reports — comes from the same narrowed matrix.
  const shown = selectMatrixColumns(data, picks)
  const originSuffix = groupOrigins(shown.columns).map((g) => g.label).join('/')

  return frame(
    <>
      <PnlMatrixTable title={`Revenue — ${originSuffix}`} model={toRevenueTable(shown)} onCellClick={onCellClick} />
      <PnlMatrixTable title={`Profit Margin — ${originSuffix}`} model={toMarginTable(shown)} onCellClick={onCellClick} />
    </>,
  )
}
