'use client'

import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { RouteGroupSelect } from '@/components/shared/route-group-select'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import {
  PnlDailyMatrixColumn,
  PnlFilter,
  PnlRoutePair,
  usePnlDailyMatrix,
  usePnlRoutes,
} from '../hooks/usePnl'
import {
  groupOrigins,
  offerableRoutes,
  selectMatrixColumns,
  toMarginTable,
  toRevenueTable,
  unionRoutes,
} from '../utils/dailyMatrix'
import { buildRouteLabelIndex, displayRouteLabel, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
import { PnlMatrixTable } from './PnlMatrixTable'

interface PnlDailyMatrixViewProps {
  filter: PnlFilter
  // Lifted to the page for the same reason the comparison picks are: the tab is rendered by a
  // ternary, so leaving it unmounts this view and would otherwise discard the selection.
  picks: PnlRoutePair[]
  onPicksChange: (next: PnlRoutePair[]) => void
  groupId: string | undefined
  onGroupChange: (id: string | undefined) => void
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

export function PnlDailyMatrixView({
  filter,
  picks,
  onPicksChange,
  groupId,
  onGroupChange,
  onCellClick,
}: PnlDailyMatrixViewProps) {
  const { data, isLoading, isError, refetch } = usePnlDailyMatrix(filter)
  const { data: routes } = usePnlRoutes()
  const { hasPermission } = usePermissions()
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.route_group never produces a 403.
  const { data: groups } = useRouteGroups({ enabled: hasPermission('read.route_group') })

  const group = groupId ? groups?.find((g) => g.id === groupId) : undefined
  const groupRoutes: PnlRoutePair[] = (group?.routes ?? []).map((r) => ({
    origin: r.origin,
    dest: r.dest,
  }))

  // What the filter actually covers, and what the dropdown may still offer. A route inside the
  // chosen group is withheld rather than shown ticked-and-inert: unticking it would not widen
  // anything, because the group keeps supplying it.
  const effectiveRoutes = unionRoutes(picks, groupRoutes)
  const offerable = offerableRoutes(routes ?? [], groupRoutes)

  // Labelled by airport code, unlike the Route Comparison picker's raw-station form: this dropdown
  // sits directly above a matrix whose headers name origins that way, and the two must agree.
  const routeIndex = buildRouteLabelIndex(offerable, displayRouteLabel)

  // Rendered before the early returns below so the filter stays usable while the report reloads,
  // errors, or comes back empty — otherwise a too-narrow pick would hide the control that undoes it.
  const routeFilter = (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* A <label> here would give the MultiRouteFilter trigger button an implicit accessible
            name of "Rute", clobbering its own "All Routes" / "N routes" label — so this stays a
            plain <div>, unlike the Route Group field below whose <select> already carries its own
            aria-label and so is immune to the same trap. */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Rute</span>
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(picks, routeIndex)}
            onChange={(labels) => onPicksChange(routesForLabels(labels, routeIndex))}
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Route Group</span>
          <RouteGroupSelect value={groupId} onChange={onGroupChange} />
        </label>
      </div>

      {group && (
        <p data-testid="filter-summary" className="mt-3 text-xs text-muted-foreground">
          Filter aktif: <span className="font-medium text-foreground">{group.name}</span> (
          {groupRoutes.length} rute) + {picks.length} rute dipilih →{' '}
          <span className="font-medium text-foreground">{effectiveRoutes.length} rute</span>
        </p>
      )}
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
  const shown = selectMatrixColumns(data, effectiveRoutes)
  const originSuffix = groupOrigins(shown.columns).map((g) => g.label).join('/')

  return frame(
    <>
      <PnlMatrixTable title={`Revenue — ${originSuffix}`} model={toRevenueTable(shown)} onCellClick={onCellClick} />
      <PnlMatrixTable title={`Profit Margin — ${originSuffix}`} model={toMarginTable(shown)} onCellClick={onCellClick} />
    </>,
  )
}
