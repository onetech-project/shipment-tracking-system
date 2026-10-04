import { MONTHS_ID } from './constants'

export interface PeriodParts {
  year: number
  month: number
  half: number
}

export function periodParts(p: string): PeriodParts | null {
  const m = /^(\d{4})-(\d{2})-(\d)H$/.exec(p)
  if (!m) return null
  return { year: +m[1], month: +m[2], half: +m[3] }
}

export function periodKey(y: number, m: number, h: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${h}H`
}

export function nextPeriod(y: number, m: number, h: number): [number, number, number] {
  if (h === 1) return [y, m, 2]
  if (m === 12) return [y + 1, 1, 1]
  return [y, m + 1, 1]
}

export function periodShort(p: string): string {
  const x = periodParts(p)
  if (!x) return p
  return `${MONTHS_ID[x.month - 1]} ${x.year} H${x.half}`
}

const cmp = (a: PeriodParts, b: PeriodParts) =>
  a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.half - b.half

export function periodsBetween(start: string, end: string): string[] {
  const out: string[] = []
  const s = periodParts(start)
  const e = periodParts(end)
  if (!s || !e) return out
  let [y, m, h] = [s.year, s.month, s.half]
  while (cmp({ year: y, month: m, half: h }, e) <= 0) {
    out.push(periodKey(y, m, h))
    ;[y, m, h] = nextPeriod(y, m, h)
    if (out.length > 240) break
  }
  return out
}
