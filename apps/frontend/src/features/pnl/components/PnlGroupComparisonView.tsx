'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { PnlFilter, usePnlGroupComparison } from '../hooks/usePnl'
import { overlappingRoutes, toComparisonTable } from '../utils/groupComparison'
import { PnlGroupComparisonTable } from './PnlGroupComparisonTable'

interface PnlGroupComparisonViewProps {
  filter: PnlFilter
}

export function PnlGroupComparisonView({ filter }: PnlGroupComparisonViewProps) {
  // Selection order is the column order, so the array is appended to rather than re-sorted.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { data: groups, isLoading: isLoadingGroups } = useRouteGroups()
  const { data, isLoading, isError, refetch } = usePnlGroupComparison(filter, selectedIds)

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const selectedGroups = (groups ?? []).filter((g) => selectedIds.includes(g.id))
  const overlaps = overlappingRoutes(selectedGroups)

  if (isLoadingGroups) {
    return <div className="h-24 animate-pulse rounded-lg border bg-card" />
  }

  if ((groups ?? []).length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Route Group.</span>{' '}
          <Link href="/route-groups" className="text-primary underline">
            Buat satu dulu
          </Link>{' '}
          <span>untuk mulai membandingkan.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Group</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(groups ?? []).map((group) => (
            <label key={group.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`${group.name} (${group.routes.length} rute)`}
                checked={selectedIds.includes(group.id)}
                onChange={() => toggle(group.id)}
              />
              <span>{group.name}</span>
              <span className="text-xs text-muted-foreground">{group.routes.length} rute</span>
            </label>
          ))}
        </div>

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

      {selectedIds.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih minimal satu group untuk melihat perbandingan.
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
        <PnlGroupComparisonTable model={toComparisonTable(data)} />
      ) : null}
    </div>
  )
}
