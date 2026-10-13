'use client'

import { AvailableRoute } from '../types'

interface RoutePickerProps {
  routes: AvailableRoute[]
  value: { origin: string; dest: string }[]
  onChange: (next: { origin: string; dest: string }[]) => void
}

const key = (r: { origin: string; dest: string }) => `${r.origin}|${r.dest}`

// Consecutive routes sharing an origin label become one section, mirroring how the PnL matrix
// header groups its columns.
function groupByOrigin(routes: AvailableRoute[]): { label: string; routes: AvailableRoute[] }[] {
  const groups: { label: string; routes: AvailableRoute[] }[] = []
  for (const route of routes) {
    const last = groups[groups.length - 1]
    if (last && last.label === route.originLabel) last.routes.push(route)
    else groups.push({ label: route.originLabel, routes: [route] })
  }
  return groups
}

export function RoutePicker({ routes, value, onChange }: RoutePickerProps) {
  const selected = new Set(value.map(key))

  const toggle = (route: AvailableRoute) => {
    const k = key(route)
    onChange(
      selected.has(k)
        ? value.filter((v) => key(v) !== k)
        : [...value, { origin: route.origin, dest: route.dest }],
    )
  }

  return (
    <div className="max-h-72 space-y-2.5 overflow-y-auto rounded-md border p-2.5">
      {groupByOrigin(routes).map((group) => (
        <div key={group.label} className="overflow-hidden rounded-sm border">
          <p className="rounded-t-sm bg-brand-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-ink">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-1 bg-card p-2.5">
            {group.routes.map((route) => {
              const label = `${route.originLabel} → ${route.dest}`
              return (
                <label key={key(route)} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={selected.has(key(route))}
                    onChange={() => toggle(route)}
                  />
                  <span>{route.dest}</span>
                  {!route.hasData && (
                    <span title="Belum ada shipment di rute ini" className="text-xs text-warn">
                      •
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {routes.length === 0 && (
        <p className="text-sm text-muted-foreground">No routes available.</p>
      )}
    </div>
  )
}
