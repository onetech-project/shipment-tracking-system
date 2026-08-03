/**
 * Pure recap builders for the Barhal dashboard. Kept free of NestJS/DB dependencies so the status
 * rule and the "show every date/route" gap filling can be unit-tested without SQL, mirroring
 * barhal-csv.builder.ts.
 */

/** One aggregated group as returned by the per-tanggal / per-rute dashboard queries. */
export interface RecapAggregateRow {
  total_to: number
  total_koli: number
  awb_count: number
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
  status: 'completed' | 'incomplete'
}

/**
 * chWt lives on the AWB, not the Koli, so a date/route counts as completed once every AWB already
 * packed into a Koli there has a chWt. Barhal TOs still waiting to be packed deliberately do NOT
 * affect the status. awb_count = 0 (nothing packed yet, or every packed TO has a null AWB) means
 * there is nothing to confirm, which is reported as incomplete.
 */
export function toRecapMetrics(row: RecapAggregateRow): RecapMetrics {
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
    status: row.awb_count > 0 && row.missing_chwt === 0 ? 'completed' : 'incomplete',
  }
}

/** Row shown for a date/route with no TOs and no Koli at all in the filtered range. */
export function emptyRecapMetrics(): RecapMetrics {
  return {
    totalTo: 0,
    totalKoli: 0,
    weightBefore: 0,
    weightAfter: 0,
    chwt: 0,
    variance: 0,
    variancePercent: 0,
    addRevenue: 0,
    status: 'incomplete',
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
