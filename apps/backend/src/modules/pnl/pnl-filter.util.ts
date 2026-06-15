/**
 * Shared PnL date-basis filtering. Extracted from pnl.service so both the estimate-only PnL module
 * and the invoice-settlement (actual vs estimate) module build identical cycle/date-range WHERE
 * clauses against v_pnl_to.
 */

// Date basis the cycle/period and date-range filters run off. Each maps to a pair of precomputed
// v_pnl_to columns (parsed in migration 20260605000002). Default is ata_vendor_wh_destination.
export type DateBasis = 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'

export const BASIS_COLS: Record<DateBasis, { cycle: string; date: string }> = {
  completed_time: { cycle: 'cycle_completed', date: 'date_completed' },
  ata_vendor_wh_destination: { cycle: 'cycle_ata', date: 'date_ata' },
  atd_origin: { cycle: 'cycle_atd', date: 'date_atd' },
}

const DEFAULT_BASIS: DateBasis = 'ata_vendor_wh_destination'

export function resolveBasis(basis?: string): DateBasis {
  return basis && basis in BASIS_COLS ? (basis as DateBasis) : DEFAULT_BASIS
}

// Builds a WHERE clause and its bound params for either cycle or date-range mode, against the
// chosen date basis. The date_* columns are real timestamps, so the range compares directly.
// `alias` prefixes the columns when the query joins v_pnl_to under an alias (e.g. 'v.').
export function buildFilter(
  basis: string | undefined,
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
  alias = '',
): { where: string; params: unknown[]; cycleCol: string; dateCol: string } {
  const cols = BASIS_COLS[resolveBasis(basis)]
  const cycleCol = `${alias}${cols.cycle}`
  const dateCol = `${alias}${cols.date}`
  if (cyclePeriod) {
    return { where: `${cycleCol} = $1`, params: [cyclePeriod], cycleCol, dateCol }
  }
  if (startDate && endDate) {
    return {
      where: `${dateCol} IS NOT NULL
              AND ${dateCol} >= $1::DATE
              AND ${dateCol} <= $2::DATE`,
      params: [startDate, endDate],
      cycleCol,
      dateCol,
    }
  }
  return { where: '1=0', params: [], cycleCol, dateCol }
}

// Number of calendar days the filter spans. Used as denominator for "per day" averages.
export function calendarDaysForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): number {
  if (cyclePeriod) {
    // YYYY-MM-1H = 15 days (1–15); YYYY-MM-2H = remaining days of month.
    const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(cyclePeriod)
    if (!m) return 15
    if (m[3] === '1H') return 15
    const year = Number(m[1])
    const month = Number(m[2])
    const lastDay = new Date(year, month, 0).getDate()
    return Math.max(1, lastDay - 15)
  }
  if (startDate && endDate) {
    const a = new Date(startDate)
    const b = new Date(endDate)
    const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
    return Math.max(1, diff)
  }
  return 1
}
