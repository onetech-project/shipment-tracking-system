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
