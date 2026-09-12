import { todayISO } from './fleet-severity'

export interface LeaseMath {
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  angsuranTerbayarOverride: number | null
}

export interface LeaseTotals {
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}

// Day 0 of the following month is the last day of this one, which is how the standard library
// answers "how long is February 2024" without a leap-year rule of our own.
function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

// Calendar months, not elapsed days: instalments fall on a date, and 30-day arithmetic drifts a
// whole instalment over a three-year tenor. The day-of-month guard is what stops a month being
// counted before it has actually completed.
export function monthsBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`)
  const to = new Date(`${toISO}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  // A contract due on the 31st falls due on the last day of any month that has no 31st — the
  // ordinary instalment convention. Comparing against the raw start day instead would skip the
  // month every February and every 30-day month, then quietly correct on the next long month.
  const dueDay = Math.min(from.getUTCDate(), daysInMonth(to))
  if (to.getUTCDate() < dueDay) months -= 1
  return Math.max(0, months)
}

// Every figure the lease section displays is computed here rather than in the browser, for the
// same reason document severity is: two clients in different timezones must not disagree about
// how much is left to pay.
export function computeLease(input: LeaseMath, today: string = todayISO()): LeaseTotals {
  const tenor = input.tenorBulan ?? 0
  const cicilan = input.cicilanPerBulan ?? 0

  let terbayar: number
  if (input.angsuranTerbayarOverride != null) {
    terbayar = input.angsuranTerbayarOverride
  } else if (input.angsuranMulai) {
    // A contract that has not started owes everything: nothing has fallen due, so crediting the
    // first instalment would understate the debt of every unit booked ahead of its start date.
    // ISO dates compare correctly as strings, both being YYYY-MM-DD.
    // Otherwise +1, because the instalment due on the start date has been paid — a contract that
    // started today is one instalment in, not zero.
    terbayar = input.angsuranMulai > today ? 0 : monthsBetween(input.angsuranMulai, today) + 1
  } else {
    terbayar = 0
  }
  terbayar = Math.max(0, Math.min(tenor, terbayar))

  const sisaAngsuran = Math.max(0, tenor - terbayar)
  return { angsuranTerbayar: terbayar, sisaAngsuran, sisaKewajiban: sisaAngsuran * cicilan }
}
