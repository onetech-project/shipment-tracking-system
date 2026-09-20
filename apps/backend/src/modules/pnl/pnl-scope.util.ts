import { parseRoutePairs } from './pnl-columns.util'
import { parseVendorNames } from './pnl-vendor-columns.util'
import { PnlRouteFilter } from './pnl.service'

/**
 * The four query params that narrow a P&L report, assembled into one filter.
 *
 * Nine handlers accept exactly this set, so the assembly lives here rather than being repeated —
 * and, more importantly, so all nine agree on what an empty value means. An omitted field and an
 * empty one are the same thing: no filter. An empty array is NOT "match nothing", which is what a
 * naive pass-through would produce.
 *
 * Parsing itself is delegated: routes to parseRoutePairs (which rejects malformed pairs loudly)
 * and vendors to parseVendorNames (which copes with qs handing over a string, an array, or — past
 * its arrayLimit of 20 — a plain object keyed by index).
 */
export interface PnlScopeQuery {
  routes?: string
  dateFrom?: string
  dateTo?: string
  vendor?: string | string[] | Record<string, unknown>
}

export function parseScope(q: PnlScopeQuery): PnlRouteFilter {
  const routes = parseRoutePairs(q.routes)
  const vendors = parseVendorNames(q.vendor)
  return {
    ...(routes.length ? { routes } : {}),
    ...(q.dateFrom ? { dateFrom: q.dateFrom } : {}),
    ...(q.dateTo ? { dateTo: q.dateTo } : {}),
    ...(vendors.length ? { vendors } : {}),
  }
}
