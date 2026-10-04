import { NO_GROUP } from './constants'
import { routeKey } from './state'
import { Scope, SimRoute, SimState, SimulationRouteGroup, SimulationSource } from '../types'

export interface ScopeSection {
  id: string
  name: string
  kind: 'group' | 'routes'
  routes: SimRoute[]
}

export const groupsOfRoute = (source: SimulationSource, key: string): SimulationRouteGroup[] =>
  source.routeGroups.filter((g) => g.routes.some((r) => routeKey(r) === key))

export const groupNames = (source: SimulationSource, key: string): string =>
  groupsOfRoute(source, key).map((g) => g.name).join(', ') || NO_GROUP.name

export function defaultScope(source: SimulationSource, s: Pick<SimState, 'routes'>): Scope {
  return {
    groups: new Set(source.routeGroups.map((g) => g.id)),
    routes: new Set(s.routes.filter((r) => !groupsOfRoute(source, r.key).length).map((r) => r.key)),
  }
}

// Subtotals are per section; the union counts each route once — a route in two ticked groups is
// shown twice and flagged, never summed twice.
export function resolveScope(source: SimulationSource, s: Pick<SimState, 'routes'>, scope: Scope) {
  const sections: ScopeSection[] = []
  const count: Record<string, number> = {}
  for (const g of source.routeGroups) {
    if (!scope.groups.has(g.id)) continue
    const routes = s.routes.filter((r) => g.routes.some((x) => routeKey(x) === r.key))
    if (!routes.length) continue
    routes.forEach((r) => { count[r.key] = (count[r.key] ?? 0) + 1 })
    sections.push({ id: g.id, name: g.name, kind: 'group', routes })
  }
  const picked = s.routes.filter((r) => scope.routes.has(r.key) && !count[r.key])
  if (picked.length) sections.push({ id: 'picked', name: 'Rute pilihan', kind: 'routes', routes: picked })
  picked.forEach((r) => { count[r.key] = 1 })
  return {
    sections,
    union: s.routes.filter((r) => count[r.key]),
    dupes: new Set(Object.keys(count).filter((k) => count[k] > 1)),
  }
}
