import { cn } from '@/lib/utils'
import { FleetSeverity } from '../types'
import { expiryText, severityMeta } from '../utils/severity'

interface SeverityBadgeProps {
  severity: FleetSeverity
  daysLeft?: number | null
  label?: string
  className?: string
}

// role="status" and the written-out day count are what make this readable without colour — an
// operator using a screen reader, or one of the ~8% of men with a red/green deficiency, gets the
// same information as everyone else.
export function SeverityBadge({ severity, daysLeft, label, className }: SeverityBadgeProps) {
  const meta = severityMeta(severity)
  const text = label ?? meta.label
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        meta.tone,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text}
      {daysLeft !== undefined && (
        <span className="font-normal opacity-80">· {expiryText(daysLeft)}</span>
      )}
    </span>
  )
}
