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
    tone: 'bg-bad-soft text-bad-ink ring-bad/20',
    dot: 'bg-bad-strong',
  },
  warn: {
    label: 'Segera',
    tone: 'bg-warn-soft text-warn-ink ring-warn/20',
    dot: 'bg-warn',
  },
  ok: {
    label: 'Aktif',
    tone: 'bg-good-soft text-brand-ink ring-good/20',
    dot: 'bg-good',
  },
  // Grey, not green: no dated document is an absence of information, not a clean bill of health.
  // Dashed border rather than a ring, matching the prototype's pending-doc chip: this is the one
  // tone that is not "something happening to a document," so it does not get the ring the other
  // three share.
  none: {
    label: 'Belum ada',
    // ring-transparent, not ring-0: SeverityBadge always adds ring-1, and ring-1 wins the cascade over ring-0.
    tone: 'bg-surface-2 text-faint border border-dashed border-border ring-transparent',
    dot: 'bg-faint',
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
