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

// Calendar months, not elapsed days: instalments fall on a date, and 30-day arithmetic drifts a
// whole instalment over a three-year tenor. The day-of-month guard is what stops a month being
// counted before it has actually completed.
export function monthsBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`)
  const to = new Date(`${toISO}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
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
    // +1 because the instalment due on the start date has been paid — a contract that started
    // today is one instalment in, not zero.
    terbayar = monthsBetween(input.angsuranMulai, today) + 1
  } else {
    terbayar = 0
  }
  terbayar = Math.max(0, Math.min(tenor, terbayar))

  const sisaAngsuran = Math.max(0, tenor - terbayar)
  return { angsuranTerbayar: terbayar, sisaAngsuran, sisaKewajiban: sisaAngsuran * cicilan }
}
