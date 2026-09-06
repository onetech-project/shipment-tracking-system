'use client'

import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { AnalyticsScope } from '../types'
import { routeLabel, splitRouteKey } from '../utils/cycle'

interface AnalyticsScopePickerProps {
  /** Every route key the period actually carries — the picker never offers a route with no data. */
  routeKeys: string[]
  scope: AnalyticsScope
  onChange: (next: AnalyticsScope) => void
}

export function AnalyticsScopePicker({ routeKeys, scope, onChange }: AnalyticsScopePickerProps) {
  const { hasPermission } = usePermissions()
  const canReadGroups = hasPermission('read.route_group')
  // Not merely hidden when the permission is missing: `enabled` means no request is sent, so no
  // 403 ever reaches the user.
  const { data: groups } = useRouteGroups({ enabled: canReadGroups })

  const labelFor = (key: string) => {
    const { origin, dest } = splitRouteKey(key)
    return routeLabel(origin, dest)
  }
  const byLabel = new Map(routeKeys.map((k) => [labelFor(k), k]))
  const selectedLabels = scope.kind === 'routes' ? scope.keys.map(labelFor) : []

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={`rounded-md border px-3 py-1.5 text-sm ${scope.kind === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange({ kind: 'all' })}
      >
        All routes
      </button>

      {canReadGroups && (
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={scope.kind === 'group' ? scope.id : ''}
          onChange={(e) =>
            onChange(e.target.value ? { kind: 'group', id: e.target.value } : { kind: 'all' })
          }
        >
          <option value="">Route group…</option>
          {(groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}

      <MultiRouteFilter
        className="w-[240px]"
        routes={Array.from(byLabel.keys())}
        selected={selectedLabels}
        onChange={(labels) => {
          const keys = labels.map((l) => byLabel.get(l)).filter((k): k is string => !!k)
          onChange(keys.length ? { kind: 'routes', keys } : { kind: 'all' })
        }}
      />
    </div>
  )
}
