const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Reshapes the string the backend sent; it does not compute anything. Parsed with a regex rather
// than new Date(), because `new Date('2026-09-15')` is UTC midnight and renders as 14 September
// to anyone west of Greenwich — the row would show a different date to the one stored.
export function formatTanggal(iso: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim())
  if (!match) return '—'

  const month = Number(match[2])
  if (month < 1 || month > 12) return '—'

  return `${Number(match[3])} ${BULAN[month - 1]} ${match[1]}`
}
