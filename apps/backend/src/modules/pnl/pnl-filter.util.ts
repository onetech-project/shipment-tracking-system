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

// The calendar dates a filter spans, ascending, as YYYY-MM-DD. Days with no shipments are still
// listed: the daily matrix renders one row per calendar day so "per day" averages stay consistent.
// UTC arithmetic throughout, so the result does not shift with the server timezone.
export function calendarDatesForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): string[] {
  if (cyclePeriod) {
    // YYYY-MM-1H = days 1–15; YYYY-MM-2H = day 16 through month end.
    const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(cyclePeriod)
    if (!m) return []
    const [, year, month, half] = m
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    const from = half === '1H' ? 1 : 16
    const to = half === '1H' ? 15 : lastDay
    const dates: string[] = []
    for (let day = from; day <= to; day++) {
      dates.push(`${year}-${month}-${String(day).padStart(2, '0')}`)
    }
    return dates
  }

  if (startDate && endDate) {
    const cursor = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return []
    const dates: string[] = []
    while (cursor.getTime() <= end.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  return []
}

// Number of calendar days the filter spans. Used as denominator for "per day" averages, so it
// never returns zero. Derived from calendarDatesForFilter to keep one definition of the period.
export function calendarDaysForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): number {
  return Math.max(1, calendarDatesForFilter(cyclePeriod, startDate, endDate).length)
}
