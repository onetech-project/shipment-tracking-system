import { FleetSeverity } from './fleet-vehicles.constants'

// Mirrors COALESCE(m.warn_days, 30) in fleet_vehicle_document_status. The view decides which
// rows a ?severity= filter returns and this decides the badge each row shows; if the two
// disagree an operator filters for "expiring" and gets back a page of green rows.
const FALLBACK_WARN_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Lower is worse, so Math.min picks the worst — the same ordering severity_rank uses in the
// view, which is what makes ORDER BY severity agree with the badge.
export const SEVERITY_RANK: Record<FleetSeverity, number> = {
  crit: 0,
  warn: 1,
  ok: 2,
  none: 3,
}

// The Jakarta business day, which is what the operator means by "today" — NOT the UTC day
// toISOString() would give, which reads as yesterday every morning until 07:00 WIB. The view
// names the same zone in its own severity ladder; if these two ever disagree, a row's badge and
// the ?severity= filter that hides or shows it disagree too. Thresholds move once a day, not
// once an hour, so day precision is the right resolution.
//
// en-CA because it formats as YYYY-MM-DD, the shape the rest of this module passes around.
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Both dates are parsed as UTC midnight (Date.parse of a bare YYYY-MM-DD does exactly that), so
// the difference is a whole number of days no matter what zone the server runs in. Subtracting
// two local-midnight Dates would come out at 9.958 days across a DST boundary and floor wrong.
export function daysUntil(dateISO: string | null, todayISOValue: string = todayISO()): number | null {
  if (!dateISO) return null
  const target = Date.parse(`${dateISO}T00:00:00Z`)
  const base = Date.parse(`${todayISOValue}T00:00:00Z`)
  if (Number.isNaN(target) || Number.isNaN(base)) return null
  return Math.round((target - base) / MS_PER_DAY)
}

// Strictly less than zero, mirroring the view's `WHEN d.expires_at < today THEN 0`. A document
// whose expiry date IS today is still valid for the rest of the business day, so it is warn
// (rank 1) with daysLeft 0; crit starts the day after. Verified against the live view.
export function severityFor(daysLeft: number | null, warnDays: number | null): FleetSeverity {
  if (daysLeft === null) return 'none'
  if (daysLeft < 0) return 'crit'
  return daysLeft <= (warnDays ?? FALLBACK_WARN_DAYS) ? 'warn' : 'ok'
}

export function worstSeverity(list: FleetSeverity[]): FleetSeverity {
  return list.reduce<FleetSeverity>(
    (worst, s) => (SEVERITY_RANK[s] < SEVERITY_RANK[worst] ? s : worst),
    'none',
  )
}
