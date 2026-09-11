import { FleetSeverity } from '../types'

export interface SeverityMeta {
  label: string
  tone: string
  dot: string
}

// Presentation only. daysLeft and severity arrive already computed from the backend — nothing
// here recomputes a date, because the browser clock belongs to the user and two operators in
// different timezones must not see different badges on the same row.
const META: Record<FleetSeverity, SeverityMeta> = {
  crit: {
    label: 'Kadaluarsa',
    tone: 'bg-red-50 text-red-700 ring-red-600/20',
    dot: 'bg-red-500',
  },
  warn: {
    label: 'Segera',
    tone: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  ok: {
    label: 'Aktif',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  // Grey, not green: no dated document is an absence of information, not a clean bill of health.
  none: {
    label: 'Belum ada',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
}

export function severityMeta(severity: FleetSeverity): SeverityMeta {
  return META[severity] ?? META.none
}

// Today is the last valid day. "0 hari lagi" reads like there is still time, so it gets its own
// wording.
export function expiryText(daysLeft: number | null): string {
  if (daysLeft === null) return 'Belum ada tanggal'
  if (daysLeft === 0) return 'Hari ini'
  if (daysLeft < 0) return `Lewat ${Math.abs(daysLeft)} hari`
  return `${daysLeft} hari lagi`
}

export const SEVERITY_FILTER_OPTIONS: { value: '' | FleetSeverity; label: string }[] = [
  { value: '', label: 'Semua dokumen' },
  { value: 'crit', label: 'Kadaluarsa' },
  { value: 'warn', label: 'Segera habis' },
  { value: 'ok', label: 'Aktif' },
  { value: 'none', label: 'Belum ada dokumen' },
]
