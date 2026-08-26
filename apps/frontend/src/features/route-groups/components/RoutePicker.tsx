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
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
      {groupByOrigin(routes).map((group) => (
        <div key={group.label}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-1">
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
                    <span
                      title="Belum ada shipment di rute ini"
                      className="text-xs text-amber-600"
                    >
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
