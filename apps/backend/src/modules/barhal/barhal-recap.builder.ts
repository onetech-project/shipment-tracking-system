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
  /** TOs in this group whose chWt is still unknown — not in a Koli with a No. SMU that has chWt. */
  to_without_chwt: number
  /** Kolis in this group with no No. SMU filled in yet — empty shells included. */
  koli_without_smu: number
  /**
   * Kolis in this group holding no TO that belongs to the Koli's own date and route. Such a Koli was
   * packed here but everything inside it is booked under some other date/route, so this row has no
   * TO of its own to vouch for it.
   */
  koli_without_matching_to: number
  /** Distinct No. SMU in this group not found in Reservasi, or found there with no chWt. */
  koli_smu_without_chwt: number
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
 * Completed means every TO in the group sits in a Koli whose No. SMU carries a chWt, and every Koli
 * in the group has a No. SMU that carries one. chWt reaches a row through the SMU only: a Koli whose
 * No. SMU is still blank contributes nothing to the chWt column and keeps its row Incomplete, which
 * is what tells the operator the SMU is the step still missing.
 *
 * The TO-side and Koli-side checks are both needed because a Koli does not have to share its
 * group. A Koli packed on the 27th routinely holds TOs dated weeks earlier, so:
 *  - the TO's own date/route row is the only place its chWt can be judged (to_without_chwt) — a row
 *    showing 0 Koli can still have TOs that were packed elsewhere, and judging chWt only through
 *    this group's Kolis reported such a row as completed while nothing about it was confirmed;
 *  - the Koli's date/route row is the only place the Koli itself can be judged
 *    (koli_without_smu, koli_smu_without_chwt, koli_without_matching_to) — that row may hold no TOs
 *    of its own at all, which is what let a row reading "0 TO / 1 Koli" call itself completed: with
 *    no TO on the row, every TO-side check passes vacuously. koli_without_matching_to is what such
 *    a row is judged on instead.
 *
 * Every counter counts items the drilldown *partitions*: a TO belongs to exactly one date and one
 * route, and so does a Koli. That is what makes the status roll up in both directions — any child
 * with an outstanding item has that same item inside its parent, so a "Completed" parent can never
 * sit above an "Incomplete" child, and an "Incomplete" parent always has a child to point at.
 *
 * total_to and total_koli alone decide whether the row is empty. Every other number is derived from
 * the Koli — its contents (weight_before) or its own fields (chwt through No. SMU, weight_increase,
 * add_revenue) — so none of them can be non-zero while total_koli is 0.
 */
export function toRecapMetrics(row: RecapAggregateRow): RecapMetrics {
  let status: RecapStatus = 'none'
  if (row.total_to > 0 || row.total_koli > 0) {
    const outstanding =
      row.unpacked_to > 0 ||
      row.to_without_chwt > 0 ||
      row.koli_without_smu > 0 ||
      row.koli_without_matching_to > 0 ||
      row.koli_smu_without_chwt > 0
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
