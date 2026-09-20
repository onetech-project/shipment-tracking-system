'use client'

import { X } from 'lucide-react'
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { RouteGroupSelect } from '@/components/shared/route-group-select'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PnlFilter, PnlRouteFilter, PnlRoutePair, usePnlStations } from '../hooks/usePnl'
import { offerableRoutes, unionRoutes } from '../utils/dailyMatrix'
import { periodBounds } from '../utils/periodBounds'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'

export interface PnlEstimateFilterBarProps {
  filter: PnlFilter
  scope: PnlRouteFilter
  onScopeChange: (next: PnlRouteFilter) => void
  groupId: string | undefined
  onGroupChange: (id: string | undefined) => void
}

/**
 * The Estimated tab's scope, lifted out of PnlAwbDrilldown.
 *
 * It used to narrow the drilldown alone, which is why it lived inside it. It now drives the KPI
 * cards, the margin chart, the breakdowns and the drilldown together, so it sits above all of
 * them — directly under the formula panel, where the reader meets it before any number.
 *
 * Routes are named as the data stores them ('Jabo → Aceh'), unlike the Daily Report's dropdown,
 * which uses airport codes to agree with the matrix headers above it. Here the table below shows
 * raw station values, so this dropdown speaks the language of what it filters.
 */
export function PnlEstimateFilterBar({
  filter,
  scope,
  onScopeChange,
  groupId,
  onGroupChange,
}: PnlEstimateFilterBarProps) {
  const { data: stations } = usePnlStations()
  const { hasPermission } = usePermissions()
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.route_group never produces a 403.
  const { data: groups } = useRouteGroups({ enabled: hasPermission('read.route_group') })

  const group = groupId ? groups?.find((g) => g.id === groupId) : undefined
  const groupRoutes: PnlRoutePair[] = (group?.routes ?? []).map((r) => ({
    origin: r.origin,
    dest: r.dest,
  }))

  const picked = scope.routes ?? []
  const vendors = scope.vendors ?? []
  const effectiveRoutes = unionRoutes(picked, groupRoutes)
  // Withheld rather than shown ticked-and-inert: unticking a route the group still supplies
  // would not widen the filter, and a control that does nothing is worse than an absent one.
  const routeIndex = buildRouteLabelIndex(offerableRoutes(stations ?? [], groupRoutes))
  const bounds = periodBounds(filter)

  // `vendors` counts here, not just routes and dates. A scope set from a Vendor Comparison cell
  // carries only a vendor, and leaving it out would hide Reset from exactly the user who most
  // needs it — while the invisible vendor narrowing survived every other edit, because each
  // handler spreads ...scope.
  const hasScope = Boolean(picked.length || scope.dateFrom || scope.dateTo || vendors.length || groupId)

  // Empty means "no filter": routeToParams drops empty fields before building the request, and an
  // empty array would otherwise be serialised as a filter that matches nothing.
  function setRoutes(labels: string[]) {
    const routes = routesForLabels(labels, routeIndex)
    onScopeChange({ ...scope, routes: routes.length ? routes : undefined })
  }

  function setDate(field: 'dateFrom' | 'dateTo', value: string) {
    onScopeChange({ ...scope, [field]: value || undefined })
  }

  // Same "empty means no filter" rule as setRoutes.
  function removeVendor(name: string) {
    const next = vendors.filter((v) => v !== name)
    onScopeChange({ ...scope, vendors: next.length ? next : undefined })
  }

  function reset() {
    onScopeChange({})
    onGroupChange(undefined)
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        {/* A div, not a label. MultiRouteFilter's trigger is a <button> with no aria-label, so
            wrapping it in a <label> makes implicit label-association rename it to "Rute",
            clobbering its own "All Routes" / "N routes" accessible name. The date inputs below
            can stay <label>s because each carries an explicit aria-label, which wins. */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Rute</span>
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(picked, routeIndex)}
            onChange={setRoutes}
          />
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Route Group
          <RouteGroupSelect value={groupId} onChange={onGroupChange} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            aria-label="Dari"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={bounds.min}
            max={scope.dateTo || bounds.max}
            value={scope.dateFrom ?? ''}
            onChange={(e) => setDate('dateFrom', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            aria-label="Sampai"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={scope.dateFrom || bounds.min}
            max={bounds.max}
            value={scope.dateTo ?? ''}
            onChange={(e) => setDate('dateTo', e.target.value)}
          />
        </label>

        {vendors.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vendor
            <div className="flex flex-wrap items-center gap-1 pb-0.5">
              {vendors.map((vendor) => (
                <span
                  key={vendor}
                  data-testid={`vendor-chip-${vendor}`}
                  className="flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs text-foreground"
                >
                  {vendor}
                  <button
                    type="button"
                    aria-label={`Hapus filter vendor ${vendor}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeVendor(vendor)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {hasScope && (
          <button
            type="button"
            className="pb-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={reset}
          >
            Reset
          </button>
        )}
      </div>

      {group && (
        <p
          data-testid="filter-summary"
          className="border-t px-4 py-2 text-xs text-muted-foreground"
        >
          Filter aktif: <span className="font-medium text-foreground">{group.name}</span> (
          {groupRoutes.length} rute) + {picked.length} rute dipilih →{' '}
          <span className="font-medium text-foreground">{effectiveRoutes.length} rute</span>
        </p>
      )}
    </div>
  )
}
