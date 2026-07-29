export interface InvoicePeriodOption {
  label: string
  start: string
  end: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number): string {
  // month is 1-indexed here; JS Date month is 0-indexed.
  return `${year}-${pad(month)}-${pad(day)}`
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of next month = last day of this month (month is 1-indexed here).
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function periodFor(year: number, month: number, half: 1 | 2): InvoicePeriodOption {
  const label = `${year}-${pad(month)}-${half}H`
  return half === 1
    ? { label, start: isoDate(year, month, 1), end: isoDate(year, month, 15) }
    : { label, start: isoDate(year, month, 16), end: isoDate(year, month, lastDayOfMonth(year, month)) }
}

/** Returns the `count` most recent bi-weekly invoice periods (newest first), including the one `today` falls in. */
export function getLastInvoicePeriods(count: number, today: Date): InvoicePeriodOption[] {
  let year = today.getUTCFullYear()
  let month = today.getUTCMonth() + 1
  let half: 1 | 2 = today.getUTCDate() <= 15 ? 1 : 2

  const periods: InvoicePeriodOption[] = []
  for (let i = 0; i < count; i++) {
    periods.push(periodFor(year, month, half))
    if (half === 2) {
      half = 1
    } else {
      half = 2
      month -= 1
      if (month === 0) {
        month = 12
        year -= 1
      }
    }
  }
  return periods
}

export function buildCustomPeriod(start: string, end: string): InvoicePeriodOption {
  return { label: `${start} - ${end}`, start, end }
}
