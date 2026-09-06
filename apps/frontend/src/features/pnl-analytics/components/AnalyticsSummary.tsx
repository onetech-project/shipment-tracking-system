'use client'

import { fmt, fmtIdrCompact, num, pct } from '@/features/pnl/utils/format'
import { KPI_KEYS, KpiKey, KpiSet, Kpis } from '../types'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsSummaryProps {
  kpi: Kpis
  kpiDelta: KpiSet
  baselineIncomplete: boolean
  scopeLabel: string
}

const KPI_LABELS: Record<KpiKey, string> = {
  days: 'Days',
  weight: 'Weight (kg)',
  weightPerDay: 'Weight / day',
  revenue: 'Revenue',
  revenuePerDay: 'Revenue / day',
  revenuePerKg: 'Revenue / kg',
  cost: 'Cost',
  costPerDay: 'Cost / day',
  costPerKg: 'Cost / kg',
  margin: 'Margin',
  marginPerDay: 'Margin / day',
  marginPerKg: 'Margin / kg',
  marginPct: 'Margin %',
}

// Full-precision rupiah would wrap on a 13-card grid; the per-kg figures keep the currency sign so
// they cannot be misread as kilograms.
const MONEY_COMPACT: KpiKey[] = [
  'revenue',
  'revenuePerDay',
  'cost',
  'costPerDay',
  'margin',
  'marginPerDay',
]
const MONEY_EXACT: KpiKey[] = ['revenuePerKg', 'costPerKg', 'marginPerKg']

function formatKpi(key: KpiKey, value: number): string {
  if (key === 'marginPct') return pct(value)
  if (MONEY_COMPACT.includes(key)) return fmtIdrCompact.format(value)
  if (MONEY_EXACT.includes(key)) return fmt.format(value)
  return num(Math.round(value))
}

export function AnalyticsSummary({
  kpi,
  kpiDelta,
  baselineIncomplete,
  scopeLabel,
}: AnalyticsSummaryProps) {
  return (
    <AnalyticsSection id="summary" title="Summary" subtitle={scopeLabel}>
      {baselineIncomplete && (
        <p
          data-testid="analytics-summary-note"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
        >
          Period-over-period deltas are hidden: the baseline period&apos;s own cost data is
          incomplete, so a delta against it would not be a fact.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {KPI_KEYS.map((key) => {
          const d = kpiDelta[key]
          return (
            <div
              key={key}
              data-testid={`kpi-${key}`}
              className="min-w-0 rounded-lg border bg-card p-2.5"
            >
              <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                {KPI_LABELS[key]}
              </p>
              <p className="mt-1 truncate text-base font-bold tabular-nums">
                {formatKpi(key, kpi[key])}
              </p>
              {/* Absent, not zero: a 0% here would read as "unchanged". */}
              {d.deltaPct != null && (
                <p
                  className={`mt-0.5 text-xs tabular-nums ${d.deltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {d.deltaPct >= 0 ? '+' : ''}
                  {d.deltaPct.toFixed(1)}%
                </p>
              )}
            </div>
          )
        })}
      </div>
    </AnalyticsSection>
  )
}
