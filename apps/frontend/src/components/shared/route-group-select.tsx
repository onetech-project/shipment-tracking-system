'use client';

import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups';
import { usePermissions } from '@/shared/hooks/use-permissions';

export interface RouteGroupSelectProps {
  /** The chosen group id, or undefined for "no group". */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  className?: string;
}

/**
 * Picks one saved Route Group to scope a report by. Shared by the P&L Estimated tab and the Daily
 * Report so the two cannot drift into two different controls.
 *
 * Single-select, unlike the Route Comparison tab's checkbox list: that picks comparison COLUMNS,
 * which are many and ordered, while this picks a SCOPE, which is one.
 *
 * The permission gate is not merely visual. GET /route-groups is guarded by read.route_group, so
 * `enabled` must be false for a viewer without it — with `enabled: false` no request is sent at
 * all, and no 403 ever reaches them.
 */
export function RouteGroupSelect({ value, onChange, className }: RouteGroupSelectProps) {
  const { hasPermission } = usePermissions();
  const canReadGroups = hasPermission('read.route_group');
  const { data: groups } = useRouteGroups({ enabled: canReadGroups });

  if (!canReadGroups) return null;

  // A group deleted while the user was elsewhere leaves an id matching no option, and the select
  // shows its placeholder — which is the honest answer. Deliberately NOT cleared by an effect:
  // useRouteGroups has no initialData, so `groups` is undefined while loading and again after its
  // gcTime, and clearing then would wipe a live choice.
  const known = (groups ?? []).some((g) => g.id === value);

  return (
    <select
      aria-label="Route Group"
      className={`rounded-md border bg-background px-3 py-1.5 text-sm ${className ?? ''}`}
      value={known ? value : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">Route group…</option>
      {(groups ?? []).map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
