'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { useAvailableRoutes, useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { PnlColumnPick, PnlFilter, PnlRouteFilter, usePnlRouteComparison } from '../hooks/usePnl'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
import { overlappingRoutes, routeFromComparisonCell, toRouteComparisonTable } from '../utils/routeComparison'
import { PnlComparisonTable } from './PnlComparisonTable'

interface PnlRouteComparisonViewProps {
  filter: PnlFilter
  onCellClick?: (route: PnlRouteFilter) => void
}

export function PnlRouteComparisonView({ filter, onCellClick }: PnlRouteComparisonViewProps) {
  // Pick order is column order, so the array is appended to rather than re-sorted.
  const [picks, setPicks] = useState<PnlColumnPick[]>([])
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useRouteGroups()
  const { data: availableRoutes } = useAvailableRoutes()
  const { data, isLoading, isError, refetch } = usePnlRouteComparison(filter, picks)

  const routeIndex = buildRouteLabelIndex(availableRoutes ?? [])
  const pickedRoutes = picks.flatMap((p) => (p.kind === 'route' ? [{ origin: p.origin, dest: p.dest }] : []))

  const toggleGroup = (id: string) =>
    setPicks((prev) =>
      prev.some((p) => p.kind === 'group' && p.id === id)
        ? prev.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...prev, { kind: 'group', id }],
    )

  // Routes are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setRouteLabels = (labels: string[]) => {
    const next = routesForLabels(labels, routeIndex)
    setPicks((prev) => {
      const kept = prev.filter(
        (p) => p.kind === 'group' || next.some((r) => r.origin === p.origin && r.dest === p.dest),
      )
      const added = next
        .filter((r) => !prev.some((p) => p.kind === 'route' && p.origin === r.origin && p.dest === r.dest))
        .map((r) => ({ kind: 'route' as const, origin: r.origin, dest: r.dest }))
      return [...kept, ...added]
    })
  }

  const overlaps = overlappingRoutes(data?.columns ?? [])

  if (isLoadingGroups) {
    return <div className="h-24 animate-pulse rounded-lg border bg-card" />
  }

  // Distinct from the "no groups exist" empty state below: GET /route-groups is guarded by
  // read.route_group, so a user without that permission gets a 403 here, not an empty list. Before
  // this check existed, groups stayed undefined and the empty-state branch below claimed "no groups
  // exist yet — go create one," linking to a page that immediately bounces such a user back out.
  if (isGroupsError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load Route Groups.</p>
        <button onClick={() => refetchGroups()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>
    )
  }

  // A user with no saved groups can still compare bare routes, so this only blocks the whole tab
  // when there is genuinely nothing to pick from.
  if ((groups ?? []).length === 0 && (availableRoutes ?? []).length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Route Group maupun rute yang bisa dibandingkan.</span>{' '}
          <Link href="/route-groups" className="text-primary underline">
            Buat satu dulu
          </Link>
          <span>.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        {(groups ?? []).length > 0 && (
          <>
            <p className="mb-2 text-sm font-medium">Route Group</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(groups ?? []).map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${group.name} (${group.routes.length} rute)`}
                    checked={picks.some((p) => p.kind === 'group' && p.id === group.id)}
                    onChange={() => toggleGroup(group.id)}
                  />
                  <span>{group.name}</span>
                  <span className="text-xs text-muted-foreground">{group.routes.length} rute</span>
                </label>
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-sm font-medium">Rute</p>
        <MultiRouteFilter
          className="w-[260px]"
          routes={routeIndex.labels}
          selected={labelsForRoutes(pickedRoutes)}
          onChange={setRouteLabels}
        />

        {overlaps.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {/* Built as one interpolated string rather than mixed JSX children, so the whole
                sentence lands in a single text node the tests can match on. */}
            {overlaps.map((o) => (
              <p key={o.route}>
                {`${o.groupNames.join(', ')} berbagi rute ${o.route} — angkanya dihitung di setiap kolom, jadi kolom-kolom ini tidak boleh dijumlahkan.`}
              </p>
            ))}
          </div>
        )}
      </div>

      {picks.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih minimal satu group atau rute untuk melihat perbandingan.
          </p>
        </div>
      ) : isLoading ? (
        <div className="h-[420px] animate-pulse rounded-lg border bg-card" />
      ) : isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load the comparison.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="space-y-2">
          {/* Revenue is SUM(revenue_total), gross — revenue_discount is never subtracted. That is
              intentional, but Revenue sits right next to Cost, so without this note the obvious
              (wrong) mental move is to subtract one column from the other. */}
          <p className="text-xs text-muted-foreground">
            Kolom Revenue di sini bruto (belum dikurangi discount), berbeda dari Margin di tab Daily
            Report. Revenue dan Cost tidak dimaksudkan untuk dikurangkan satu sama lain.
          </p>
          <PnlComparisonTable
            model={toRouteComparisonTable(data)}
            firstColumnHeader="Date"
            cellHint="Lihat AWB kolom ini pada tanggal ini"
            onCellClick={
              onCellClick
                ? (column, rowKey) => onCellClick(routeFromComparisonCell(column, rowKey))
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  )
}
