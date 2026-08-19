import { PnlFilter } from '../hooks/usePnl'

export interface PeriodBounds {
  min: string // YYYY-MM-DD, '' when the period cannot be derived
  max: string
}

// Calendar span of the active period, used as min/max on the drilldown's date inputs so a user
// cannot pick a day the page is not showing. Mirrors calendarDatesForFilter on the backend:
// 1H = days 1–15, 2H = day 16 through month end. UTC arithmetic, so it never shifts by timezone.
export function periodBounds(filter: PnlFilter): PeriodBounds {
  if (filter.mode === 'range') {
    return { min: filter.start, max: filter.end }
  }

  const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(filter.cycle)
  if (!m) return { min: '', max: '' }

  const [, year, month, half] = m
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  const from = half === '1H' ? 1 : 16
  const to = half === '1H' ? 15 : lastDay
  const pad = (day: number) => String(day).padStart(2, '0')
  return { min: `${year}-${month}-${pad(from)}`, max: `${year}-${month}-${pad(to)}` }
}
