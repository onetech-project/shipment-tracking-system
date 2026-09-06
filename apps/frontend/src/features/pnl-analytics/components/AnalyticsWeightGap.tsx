'use client'

import { fmt, num } from '@/features/pnl/utils/format'
import { AnalyticsGwChwRow } from '../types'
import { routeLabel } from '../utils/cycle'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

interface AnalyticsWeightGapProps {
  data: AnalyticsGwChwRow[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsWeightGap({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsWeightGapProps) {
  const rows = (data ?? []).slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  const totalImpact = rows.reduce((s, r) => s + r.impact, 0)

  return (
    <AnalyticsSection
      id="weight-gap"
      title="Weight Gap"
      subtitle="Gross weight against chargeable weight, and what the difference is worth"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !data ? (
        <AbsentNote what="Weight data" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weight data in this period.</p>
      ) : (
        <>
          <p className="text-sm">
            Net effect across all routes: <strong>{fmt.format(totalImpact)}</strong>. A positive
            figure means gross weight exceeds chargeable weight — tonnage carried but not billed.
          </p>
          <AnalyticsTable<AnalyticsGwChwRow>
            columns={[
              {
                key: 'route',
                header: 'Route',
                cell: (r) => routeLabel(r.origin, r.dest),
              },
              { key: 'gw', header: 'Gross wt', align: 'right', cell: (r) => num(Math.round(r.gw)) },
              { key: 'chwt', header: 'Chargeable wt', align: 'right', cell: (r) => num(Math.round(r.chwt)) },
              { key: 'diff', header: 'Difference', align: 'right', cell: (r) => num(Math.round(r.diff)) },
              {
                key: 'revenuePerKg',
                header: 'Revenue / kg',
                align: 'right',
                cell: (r) => fmt.format(r.revenuePerKg),
              },
              { key: 'impact', header: 'Impact', align: 'right', cell: (r) => fmt.format(r.impact) },
            ]}
            rows={rows}
            rowKey={(r) => `${r.origin}|${r.dest}`}
            rowClassName={(r) => (r.impact < 0 ? 'text-emerald-700' : undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Chargeable weight is an AWB attribute, so it is taken once per AWB and then summed —
            adding it per TO row would multiply it by the number of TOs on the AWB.
          </p>
        </>
      )}
    </AnalyticsSection>
  )
}
