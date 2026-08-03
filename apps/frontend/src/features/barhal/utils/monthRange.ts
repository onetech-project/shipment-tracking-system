/**
 * Default filter range for the Barhal dashboard. Rekap Per Tanggal renders one row per calendar
 * date in the range, so the dashboard opens on a whole month rather than an unbounded range.
 */
export function currentMonthRange(now: Date = new Date()): { start: string; end: string } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}
