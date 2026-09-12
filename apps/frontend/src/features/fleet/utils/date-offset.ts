// The one place the frontend does date arithmetic, and deliberately narrow: it seeds the value
// of an input the operator can overwrite (requirement §4), and whatever they leave there is
// stored as typed. Every figure that carries meaning — daysLeft, severity, instalments
// outstanding — is still computed by the backend.
//
// Built from the date parts rather than Date.setMonth, which rolls 31 August + 6 months into
// March. An operator who writes "six months" means the last day of February, not the third.
export function addMonths(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const y = String(target.getUTCFullYear()).padStart(4, '0')
  const m = String(target.getUTCMonth() + 1).padStart(2, '0')
  const d = String(Math.min(day, lastDay)).padStart(2, '0')
  return `${y}-${m}-${d}`
}
