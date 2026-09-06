'use client'

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      {children}
    </p>
  )
}

/**
 * Sections 6–9 read period-wide endpoints that carry no route dimension at all. When the viewer
 * has narrowed the scope, the numbers here are still every route — and must say so.
 */
export function ScopeFallbackNote() {
  return (
    <Note>
      The route scope selected above does not apply to this section: the API only provides these
      figures as a period-wide aggregate, with no per-route or per-group breakdown.
    </Note>
  )
}

/**
 * In custom-range mode, metrics that exist only as period aggregates keep using the whole period.
 */
export function RangeFallbackNote() {
  return (
    <Note>
      A custom date range is active. The figures in this section are only available as period
      aggregates, so they are still calculated over the whole period.
    </Note>
  )
}

/** The dataset failed to load. Not the same fact as "there was nothing this period". */
export function AbsentNote({ what }: { what: string }) {
  return <Note>{what} could not be loaded, so this section is incomplete.</Note>
}

/** The dataset loaded and genuinely had nothing in it. */
export function EmptyNote({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground">No {what.toLowerCase()} in this period.</p>
}
