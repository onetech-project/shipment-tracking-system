import { cn } from '@/lib/utils'
import { FleetSeverity } from '../types'
import { expiryText, severityMeta } from '../utils/severity'

interface SeverityBadgeProps {
  severity: FleetSeverity
  daysLeft?: number | null
  label?: string
  className?: string
}

// role="img" with an aria-label, deliberately not role="status": a status is an ARIA live region,
// and one badge per row means 25 live regions on a full page all announcing at once on every sort
// or filter, which is worse for a screen-reader operator than no announcement at all. The label
// spells out exactly what a sighted user reads — severity plus the written-out day count — so an
// operator using a screen reader, or one of the ~8% of men with a red/green deficiency, still gets
// the same information as everyone else and colour is never the only signal.
export function SeverityBadge({ severity, daysLeft, label, className }: SeverityBadgeProps) {
  const meta = severityMeta(severity)
  const text = label ?? meta.label
  const expiry = daysLeft !== undefined ? expiryText(daysLeft) : null
  return (
    <span
      role="img"
      aria-label={expiry === null ? text : `${text} · ${expiry}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        meta.tone,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text}
      {expiry !== null && <span className="font-normal opacity-80">· {expiry}</span>}
    </span>
  )
}
