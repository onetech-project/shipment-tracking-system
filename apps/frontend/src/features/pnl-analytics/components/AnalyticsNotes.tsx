'use client'

import { Banner } from '@/components/shared/banner'

/**
 * Sections 6–9 read period-wide endpoints that carry no route dimension at all. When the viewer
 * has narrowed the scope, the numbers here are still every route — and must say so.
 */
export function ScopeFallbackNote() {
  return (
    <Banner tone="warn">
      The route scope selected above does not apply to this section: the API only provides these
      figures as a period-wide aggregate, with no per-route or per-group breakdown.
    </Banner>
  )
}

/**
 * In custom-range mode, metrics that exist only as period aggregates keep using the whole period.
 */
export function RangeFallbackNote() {
  return (
    <Banner tone="warn">
      A custom date range is active. The figures in this section are only available as period
      aggregates, so they are still calculated over the whole period.
    </Banner>
  )
}

/** The dataset failed to load. Not the same fact as "there was nothing this period". */
export function AbsentNote({ what }: { what: string }) {
  return <Banner tone="warn">{what} could not be loaded, so this section is incomplete.</Banner>
}

/** The dataset loaded and genuinely had nothing in it. */
export function EmptyNote({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground">No {what.toLowerCase()} in this period.</p>
}
