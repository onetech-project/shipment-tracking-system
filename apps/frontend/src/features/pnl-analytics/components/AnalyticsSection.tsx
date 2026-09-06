'use client'

import { ReactNode } from 'react'

interface AnalyticsSectionProps {
  /** Anchor target for the section nav. */
  id: string
  title: string
  subtitle?: string
  /** Rendered on the heading row — a picker, a toggle, an edit button. */
  action?: ReactNode
  children: ReactNode
}

export function AnalyticsSection({ id, title, subtitle, action, children }: AnalyticsSectionProps) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
