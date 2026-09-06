'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { AnalyticsJourneyRow } from '../types'
import { BestRouteRow, bestCombination } from '../utils/journey'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

interface AnalyticsJourneyProps {
  data: AnalyticsJourneyRow[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsJourney({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsJourneyProps) {
  const result = data ? bestCombination(data) : undefined

  return (
    <AnalyticsSection
      id="journey"
      title="Best Journey"
      subtitle="The best vendor × airline combination per route, and what the rest of the tonnage leaves on the table"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !result ? (
        <AbsentNote what="Journey data" />
      ) : result.byRoute.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No vendor and airline combination carries attributed tonnage in this period.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {pct(result.overall.optimalPct)} of {num(Math.round(result.overall.attributedTonnage))} kg
            already flies on its route&apos;s best combination. Moving the rest would be worth{' '}
            <strong>{fmt.format(result.overall.upside)}</strong>.
          </p>
          <AnalyticsTable<BestRouteRow>
            columns={[
              { key: 'route', header: 'Route', cell: (r) => r.label },
              {
                key: 'best',
                header: 'Best combination',
                cell: (r) => (
                  <span className="flex items-center gap-1">
                    {r.best.vendor ?? '—'} · {r.best.airline ?? '—'}
                    {/* The floor did not hold: the winner is one lucky shipment, not a rate. */}
                    {!r.floorCleared && (
                      <span
                        title="No combination cleared the 5% tonnage floor, so this winner may not be repeatable."
                        className="text-amber-600"
                      >
                        ⚠
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'bestPerKg',
                header: 'Best margin / kg',
                align: 'right',
                cell: (r) => fmt.format(r.best.marginPerKg),
              },
              {
                key: 'actualPerKg',
                header: 'Route margin / kg',
                align: 'right',
                cell: (r) => fmt.format(r.actualMarginPerKg),
              },
              { key: 'optimalPct', header: 'On best', align: 'right', cell: (r) => pct(r.optimalPct) },
              { key: 'upside', header: 'Upside', align: 'right', cell: (r) => fmt.format(r.upside) },
            ]}
            rows={result.byRoute}
            rowKey={(r) => r.routeKey}
            rowTestId={(r) => `journey-${r.routeKey}`}
            rowClassName={(r) => (r.floorCleared ? undefined : 'bg-amber-50/60')}
          />
          <p className="text-xs text-muted-foreground">
            A combination must carry at least 5% of a route&apos;s attributed tonnage to set that
            route&apos;s benchmark. Rows marked ⚠ had nothing clear that floor.
          </p>
        </>
      )}
    </AnalyticsSection>
  )
}
