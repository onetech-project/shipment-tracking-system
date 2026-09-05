/** Billing-cycle arithmetic and route naming. Pure functions; no React, no network. */

const CYCLE_RE = /^(\d{4})-(\d{2})-([12])H$/

export function isValidCycle(label: string): boolean {
  const m = CYCLE_RE.exec(label ?? '')
  if (!m) return false
  const month = Number(m[2])
  return month >= 1 && month <= 12
}

export function parseCycle(label: string): { year: number; month: number; half: number } {
  const m = CYCLE_RE.exec(label ?? '')
  if (!m) throw new Error(`Invalid cycle label: ${label}`)
  return { year: Number(m[1]), month: Number(m[2]), half: Number(m[3]) }
}

const pad = (n: number) => String(n).padStart(2, '0')

// UTC arithmetic: Date.UTC(y, month, 0) is the last day of `month` (1-based), so this never
// shifts with the machine timezone.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function cycleDateRange(label: string): { start: string; end: string } {
  const { year, month, half } = parseCycle(label)
  const prefix = `${year}-${pad(month)}-`
  return half === 1
    ? { start: `${prefix}01`, end: `${prefix}15` }
    : { start: `${prefix}16`, end: `${prefix}${pad(daysInMonth(year, month))}` }
}

export function previousCycle(label: string): string {
  const { year, month, half } = parseCycle(label)
  if (half === 2) return `${year}-${pad(month)}-1H`
  return month === 1 ? `${year - 1}-12-2H` : `${year}-${pad(month - 1)}-2H`
}

/** P&L station names → the short label the business uses. Anything absent maps to itself. */
export const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Jabodetabek: 'Jabodetabek',
}

/** SLA names the Jakarta hub "Kosambi" where P&L names it "Jabo". */
const SLA_STATION_ALIASES: Record<string, string> = { Kosambi: 'Jabo' }

export const routeKey = (origin: string, dest: string) => `${origin}|${dest}`

export const routeLabel = (origin: string, dest: string) =>
  `${ORIGIN_LABELS[origin] ?? origin} → ${dest}`

export function splitRouteKey(key: string): { origin: string; dest: string } {
  const i = key.indexOf('|')
  return i < 0 ? { origin: key, dest: '' } : { origin: key.slice(0, i), dest: key.slice(i + 1) }
}

/** "Kosambi DC - Aceh DC" → "Jabo|Aceh". Returns null when the string is not a route pair. */
export function slaRouteKey(slaRoute: string): string | null {
  if (typeof slaRoute !== 'string') return null
  const parts = slaRoute.split(' - ')
  if (parts.length !== 2) return null
  const clean = (s: string) => {
    const name = s.trim().replace(/\s+DC$/i, '').trim()
    return SLA_STATION_ALIASES[name] ?? name
  }
  const origin = clean(parts[0])
  const dest = clean(parts[1])
  if (!origin || !dest) return null
  return routeKey(origin, dest)
}

export interface SlaBreakdownRow {
  route: string
  percentage: number
  onTimeWeight: number
  lateWeight: number
}

/**
 * Unmapped strings are reported rather than dropped: the two systems name stations differently,
 * and a silently missing route reads as "this route has no SLA problem".
 */
export function mapSlaRoutes(rows: SlaBreakdownRow[] | undefined): {
  mapped: Map<string, SlaBreakdownRow>
  unmapped: string[]
} {
  const mapped = new Map<string, SlaBreakdownRow>()
  const unmapped: string[] = []
  for (const row of rows ?? []) {
    const key = slaRouteKey(row.route)
    if (key) mapped.set(key, row)
    else unmapped.push(row.route)
  }
  return { mapped, unmapped }
}
