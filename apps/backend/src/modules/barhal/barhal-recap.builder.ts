/**
 * Pure recap builders for the Barhal dashboard. Kept free of NestJS/DB dependencies so the status
 * rule and the "show every date/route" gap filling can be unit-tested without SQL, mirroring
 * barhal-csv.builder.ts.
 */

/** One aggregated group as returned by the per-tanggal / per-rute dashboard queries. */
export interface RecapAggregateRow {
  total_to: number
  total_koli: number
  /** TOs in this group not attached to any Koli yet. */
  unpacked_to: number
  /** Kolis in this group whose contents yield no AWB at all — empty shells included. */
  koli_without_awb: number
  /** Distinct AWBs reachable from this group's Kolis that have no chWt. */
  missing_chwt: number
  weight_before: string
  chwt: string
  weight_increase: string
  add_revenue: string
}

export interface RecapMetrics {
  totalTo: number
  totalKoli: number
  weightBefore: number
  weightAfter: number
  chwt: number
  variance: number
  variancePercent: number
  addRevenue: number
  status: RecapStatus
}

/**
 * `none` is not a third kind of progress, it is the absence of anything to report — the group saw
 * no barhal activity at all in the filtered range, so every number on the row is zero. A group that
 * did see activity is always judged, even if none of it has reached an AWB yet.
 */
export type RecapStatus = 'completed' | 'incomplete' | 'none'

/**
 * Completed means nothing in the group is still outstanding: every TO is packed into a Koli, every
 * Koli has produced an AWB, and every one of those AWBs has its chWt.
 *
 * Each of the three counters is a count over items the drilldown *partitions* — a TO belongs to one
 * route and one date, so does a Koli, and an AWB is reachable only through the Kolis it sits in.
 * That is what makes the status roll up in both directions: any child with an outstanding item has
 * that same item inside the parent, so a "Completed" parent can no longer sit above an "Incomplete"
 * child, and an "Incomplete" parent always has an incomplete child to point at. Judging completion
 * on awb_count instead does NOT roll up, which is what let a fully-packed date sit above routes
 * whose TOs had never been packed at all.
 *
 * total_to and total_koli alone decide whether the row is empty. Every other number is derived from
 * the Koli — its contents (weight_before, chwt) or its own fields (weight_increase, add_revenue) —
 * so none of them can be non-zero while total_koli is 0.
 */
export function toRecapMetrics(row: RecapAggregateRow): RecapMetrics {
  let status: RecapStatus = 'none'
  if (row.total_to > 0 || row.total_koli > 0) {
    const outstanding = row.unpacked_to > 0 || row.koli_without_awb > 0 || row.missing_chwt > 0
    status = outstanding ? 'incomplete' : 'completed'
  }

  const weightBefore = Number(row.weight_before)
  const weightAfter = weightBefore + Number(row.weight_increase)
  const variance = weightAfter - weightBefore
  return {
    totalTo: row.total_to,
    totalKoli: row.total_koli,
    weightBefore,
    weightAfter,
    chwt: Number(row.chwt),
    variance,
    variancePercent: weightBefore > 0 ? (variance / weightBefore) * 100 : 0,
    addRevenue: Number(row.add_revenue),
    status,
  }
}

/** Row shown for a date/route with no TOs and no Koli at all in the filtered range. */
export function emptyRecapMetrics(): RecapMetrics {
  // All-zero by construction, which is exactly the case toRecapMetrics reports as `none`.
  return {
    totalTo: 0,
    totalKoli: 0,
    weightBefore: 0,
    weightAfter: 0,
    chwt: 0,
    variance: 0,
    variancePercent: 0,
    addRevenue: 0,
    status: 'none',
  }
}

/** Ceiling on how many dates one Rekap Per Tanggal may span. A full leap year (366) still passes. */
export const MAX_RECAP_DAYS = 366

const MS_PER_DAY = 86_400_000

export interface RecapPerTanggalRow extends RecapMetrics {
  date: string
}

function toUtcMillis(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Inclusive YYYY-MM-DD series. Computed from UTC components rather than local-time Date
 * arithmetic so a DST transition can never skip or repeat a day.
 */
export function enumerateDates(start: string, end: string): string[] {
  const last = toUtcMillis(end)
  const dates: string[] = []
  for (let cursor = toUtcMillis(start); cursor <= last; cursor += MS_PER_DAY) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
  }
  return dates
}

/** Inclusive day count for the range, 0 when end precedes start. */
export function daysInRange(start: string, end: string): number {
  const diff = toUtcMillis(end) - toUtcMillis(start)
  return diff < 0 ? 0 : Math.floor(diff / MS_PER_DAY) + 1
}

/**
 * One row per calendar date in the range, ascending. Dates the query returned keep their real
 * numbers — including dates that have TOs but no Koli yet — everything else becomes a zero row.
 */
export function densifyPerTanggal(
  rows: RecapPerTanggalRow[],
  start: string,
  end: string,
): RecapPerTanggalRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return enumerateDates(start, end).map((date) => byDate.get(date) ?? { date, ...emptyRecapMetrics() })
}

export interface RouteKey {
  originName: string
  destName: string
}

export interface RecapPerRuteRow extends RecapMetrics, RouteKey {}

/** A NUL byte cannot appear in a station name, so it is a safe composite-key separator. */
function routeKey(route: RouteKey): string {
  return `${route.originName}\u0000${route.destName}`
}

/**
 * Every barhal route is listed, whether or not it saw activity in the filtered range. Routes present
 * only in the query result (e.g. a Koli whose route no longer appears in the source sheet) are kept
 * as well, so this is a union rather than a lookup over masterRoutes.
 */
export function densifyPerRute(rows: RecapPerRuteRow[], masterRoutes: RouteKey[]): RecapPerRuteRow[] {
  const byRoute = new Map(rows.map((row) => [routeKey(row), row]))
  for (const route of masterRoutes) {
    const key = routeKey(route)
    if (!byRoute.has(key)) {
      byRoute.set(key, { originName: route.originName, destName: route.destName, ...emptyRecapMetrics() })
    }
  }
  return Array.from(byRoute.values()).sort(
    (a, b) => a.originName.localeCompare(b.originName) || a.destName.localeCompare(b.destName),
  )
}
