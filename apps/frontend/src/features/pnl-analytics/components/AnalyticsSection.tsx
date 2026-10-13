'use client'

import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { IconSquare, type IconTone } from '@/components/shared/icon-square'

interface AnalyticsSectionProps {
  /** Anchor target for the section nav. */
  id: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  tone?: IconTone
  /** Rendered on the heading row — a picker, a toggle, an edit button. */
  action?: ReactNode
  children: ReactNode
}

// Keeps the plain section/h2/p structure a couple of specs query by tag (not a Card + CardHead,
// whose subtitle renders as a <div> rather than a <p>) — only the classes move to the green system.
export function AnalyticsSection({
  id,
  title,
  subtitle,
  icon,
  tone = 'info',
  action,
  children,
}: AnalyticsSectionProps) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <IconSquare icon={icon} tone={tone} />}
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="text-xs font-medium text-faint">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
