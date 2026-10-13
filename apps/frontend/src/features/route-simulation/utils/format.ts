// Ported from the prototype (lines 697–705) so every tab reads the same as the HTML it replaces.
export const fmtNum = (n: number) => Math.round(Number(n) || 0).toLocaleString('id-ID')
export const fmtIdr = (n: number) => (n < 0 ? '-' : '') + 'Rp ' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('id-ID')
export const fmtPct = (ratio: number) => (ratio * 100).toFixed(1).replace('.', ',') + '%'
export function fmtShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
  if (a >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'
  return fmtNum(n)
}
export const toneClass = (n: number) => (n < 0 ? 'text-bad' : n > 0 ? 'text-good' : 'text-foreground')
