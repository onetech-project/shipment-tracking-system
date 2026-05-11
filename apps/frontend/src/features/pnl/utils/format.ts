export const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export const fmtIdrCompact = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
  style: 'currency',
  currency: 'IDR',
})

export const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toFixed(1)}%`

export const num = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('id-ID')
