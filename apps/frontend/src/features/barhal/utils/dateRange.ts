/**
 * Keeps the Barhal dashboard's start/end pair valid as the operator edits either side.
 *
 * Two rules, both enforced here rather than only through the inputs' `min`/`max` attributes —
 * those constrain the native picker but not a typed or pasted date:
 *  - end never precedes start;
 *  - the span never exceeds MAX_RANGE_DAYS, which mirrors the backend's MAX_RECAP_DAYS. Exceeding
 *    it server-side is a 400, so clamping here is what keeps the dashboard from asking for a range
 *    it will only be refused.
 *
 * Editing one side moves the other, never the side just touched: the operator's most recent choice
 * is the one they meant.
 */

const MS_PER_DAY = 86_400_000

/** One calendar month, matching MAX_RECAP_DAYS in the backend's barhal-recap.builder. */
export const MAX_RANGE_DAYS = 31

export interface DateRange {
  start: string
  end: string
}

/**
 * Computed from UTC components rather than local-time Date arithmetic so a DST transition can
 * never skip or repeat a day — the same reason the backend's enumerateDates does it this way.
 */
function toUtcMillis(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function toIsoDate(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10)
}

export function shiftDate(isoDate: string, days: number): string {
  return toIsoDate(toUtcMillis(isoDate) + days * MS_PER_DAY)
}

/** Latest end date still within MAX_RANGE_DAYS of `start`, counting both endpoints. */
export function latestEndFor(start: string): string {
  return shiftDate(start, MAX_RANGE_DAYS - 1)
}

/** Earliest start date still within MAX_RANGE_DAYS of `end`, counting both endpoints. */
export function earliestStartFor(end: string): string {
  return shiftDate(end, -(MAX_RANGE_DAYS - 1))
}

/** The operator picked a new start; `end` follows if it would now be invalid. */
export function withStartDate(nextStart: string, currentEnd: string): DateRange {
  if (!nextStart || !currentEnd) return { start: nextStart, end: currentEnd }
  if (currentEnd < nextStart) return { start: nextStart, end: nextStart }
  const latest = latestEndFor(nextStart)
  return { start: nextStart, end: currentEnd > latest ? latest : currentEnd }
}

/** The operator picked a new end; `start` follows if it would now be invalid. */
export function withEndDate(nextEnd: string, currentStart: string): DateRange {
  if (!nextEnd || !currentStart) return { start: currentStart, end: nextEnd }
  if (nextEnd < currentStart) return { start: nextEnd, end: nextEnd }
  const earliest = earliestStartFor(nextEnd)
  return { start: currentStart < earliest ? earliest : currentStart, end: nextEnd }
}
