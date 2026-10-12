'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Map } from 'lucide-react'
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { EmptyState } from '@/components/shared/empty-state'
import { useAvailableRoutes, useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { PnlColumnPick, PnlFilter, PnlRouteFilter, usePnlRouteComparison } from '../hooks/usePnl'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
import { overlappingRoutes, routeFromComparisonCell, toRouteComparisonTable } from '../utils/routeComparison'
import { PnlComparisonTable } from './PnlComparisonTable'

interface PnlRouteComparisonViewProps {
  filter: PnlFilter
  // Lifted to the page (Task 7) so switching tabs — which unmounts this view — does not discard
  // the selection. Pick order is column order, so the array is appended to rather than re-sorted.
  picks: PnlColumnPick[]
  onPicksChange: (next: PnlColumnPick[]) => void
  onCellClick?: (route: PnlRouteFilter) => void
}

export function PnlRouteComparisonView({ filter, picks, onPicksChange, onCellClick }: PnlRouteComparisonViewProps) {
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

  // Picks now outlive the component, so a group deleted while the user was on another tab would
  // otherwise keep a checkbox pointing at nothing. The `!groups` guard is load-bearing:
  // useRouteGroups has no initialData and react-query's default 5-minute gcTime means an undefined
  // list is the normal state after a few minutes away — pruning then would wipe the selection this
  // whole feature exists to keep. Raw route picks are never pruned; a route with no data in the
  // current period is a legitimate, informative empty column.
  useEffect(() => {
    if (!groups) return
    const pruned = picks.filter((p) => p.kind !== 'group' || groups.some((g) => g.id === p.id))
    if (pruned.length !== picks.length) onPicksChange(pruned)
  }, [groups, picks, onPicksChange])

  const toggleGroup = (id: string) =>
    onPicksChange(
      picks.some((p) => p.kind === 'group' && p.id === id)
        ? picks.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...picks, { kind: 'group', id }],
    )

  // Routes are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setRouteLabels = (labels: string[]) => {
    const next = routesForLabels(labels, routeIndex)
    const kept = picks.filter(
      (p) => p.kind === 'group' || next.some((r) => r.origin === p.origin && r.dest === p.dest),
    )
    const added = next
      .filter((r) => !picks.some((p) => p.kind === 'route' && p.origin === r.origin && p.dest === r.dest))
      .map((r) => ({ kind: 'route' as const, origin: r.origin, dest: r.dest }))
    onPicksChange([...kept, ...added])
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
      <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-14 text-center">
        <Map className="mx-auto mb-2.5 h-11 w-11 text-muted-foreground opacity-40" aria-hidden="true" />
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm font-semibold text-muted-foreground">
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
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Route Group</p>
            <div className="flex flex-wrap gap-3.5">
              {(groups ?? []).map((group) => (
                <label
                  key={group.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium motion-safe:transition-colors hover:border-brand hover:bg-[#ecf7ef]"
                >
                  <input
                    type="checkbox"
                    aria-label={`${group.name} (${group.routes.length} rute)`}
                    checked={picks.some((p) => p.kind === 'group' && p.id === group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="accent-brand-2"
                  />
                  <span>{group.name}</span>
                  <span className="text-[11px] font-medium text-faint">{group.routes.length} rute</span>
                </label>
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Rute</p>
        <MultiRouteFilter
          className="w-[260px]"
          routes={routeIndex.labels}
          selected={labelsForRoutes(pickedRoutes)}
          onChange={setRouteLabels}
        />

        {overlaps.length > 0 && (
          <div className="mt-3 rounded-md bg-warn-soft p-2 text-xs text-warn-ink">
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
        <EmptyState
          icon={Map}
          title="Pilih minimal satu Route Group atau rute untuk melihat perbandingan."
        />
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
          {/* Revenue and Margin are both net of revenue_discount now, so the two reconcile against
              Cost directly — the caveat this note used to carry is obsolete. */}
          <p className="text-xs text-muted-foreground">
            Kolom Revenue sudah bersih (rate_spx − pph_2 − disc_15), sama seperti tab Daily Report.
            Revenue − Cost = Margin.
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
