// Whole rupiah: instalments are typed and read as whole numbers, and two decimal places on eight
// figures is noise in a table of them. The stored value keeps its scale; only the display rounds.
const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

// An em dash, not 'Rp 0': a unit with no contract owes nothing, which is not the same as a unit
// whose instalment is zero.
export function formatRupiah(value: number | null | undefined): string {
  if (value == null) return '—'
  return FORMATTER.format(value)
}
