/**
 * What the tab is looking at, assembled once and read by every section.
 *
 * Two rules live here and nowhere else:
 *  - the health gate is computed UNSCOPED, so narrowing to a clean route cannot certify a broken
 *    period;
 *  - KPI deltas are withdrawn entirely when the comparison period's own cost data is incomplete.
 */

import {
  AnalyticsDailySeries,
  AnalyticsScope,
  Campaign,
  Kpis,
  KpiSet,
  SeriesDay,
} from '../types'
import { COVERAGE_MIN, DqInput, DqReport, dqReport } from './dq'
import { DEFAULT_CAMPAIGNS } from './weekday'
import {
  Outlier,
  dailyOutliers,
  foldAll,
  foldByRoute,
  kpis,
  kpisWithDelta,
  routeKeysIn,
} from './series'

/** `groupRoutes` is the membership of a picked route group, resolved by the caller. */
export function scopeRouteKeys(
  series: AnalyticsDailySeries | undefined,
  scope: AnalyticsScope,
  groupRoutes?: string[],
): string[] {
  if (scope.kind === 'routes') return scope.keys
  if (scope.kind === 'group') return groupRoutes ?? []
  return routeKeysIn(series)
}

export function scopeLabel(scope: AnalyticsScope, groupName?: string): string {
  if (scope.kind === 'group') return groupName ? `Group: ${groupName}` : 'Route group'
  if (scope.kind === 'routes') {
    return `${scope.keys.length} route${scope.keys.length === 1 ? '' : 's'} selected`
  }
  return 'All routes'
}

export interface AnalyticsContext {
  scope: AnalyticsScope
  scopeLabel: string
  scoped: boolean
  ranged: boolean
  campaigns: Campaign[]
  routeKeys: string[]
  /** Folded to the viewer's scope. Everything the sections chart and total reads this. */
  series: SeriesDay[]
  /** Every route, always. The health gate and the outlier scan read this. */
  unscopedSeries: SeriesDay[]
  kpi: Kpis
  prevKpi: Kpis | null
  kpiDelta: KpiSet
  baselineIncomplete: boolean
  dq: DqReport
  coverageOk: boolean
  outliers: Outlier[]
}

export interface AnalyticsContextInput {
  series: AnalyticsDailySeries | undefined
  prevSeries: AnalyticsDailySeries | undefined
  scope: AnalyticsScope
  groupRoutes?: string[]
  groupName?: string
  campaigns?: Campaign[]
  /** True in custom-range mode, which drives the range-fallback note on period-aggregate sections. */
  ranged?: boolean
  /** The rest of the data-health inputs; the series fields are supplied here. */
  dq?: Omit<DqInput, 'series'>
}

export function buildAnalyticsContext(input: AnalyticsContextInput): AnalyticsContext {
  const scope = input.scope ?? { kind: 'all' }
  const routeKeys = scopeRouteKeys(input.series, scope, input.groupRoutes)
  const scoped = scope.kind !== 'all'

  const unscopedSeries = foldAll(input.series)
  const series = scoped ? foldByRoute(input.series, routeKeys) : unscopedSeries

  const kpi = kpis(series)
  const prevScoped = scoped ? foldByRoute(input.prevSeries, routeKeys) : foldAll(input.prevSeries)
  const hasPrev = prevScoped.length > 0
  const prevKpi = hasPrev ? kpis(prevScoped) : null

  // Day-level completeness across ALL routes, regardless of the viewer's scope. Route-level
  // coverage cannot tell a genuinely healthy period from one where most of a "covered" route's
  // revenue still lands on days its TO rows never completed.
  const dq = dqReport({ ...(input.dq ?? {}), series: unscopedSeries })

  // A delta against a period whose OWN cost data is incomplete is not a fact: the baseline reads
  // as 100% covered route-level while most of its revenue sits on incomplete days, so a naive
  // delta reports a real margin swing where the truth is "healthy period vs broken baseline".
  // Checked the same way — unscoped, day-level — independent of the viewer's scope.
  const baselineIncomplete =
    hasPrev && dqReport({ series: foldAll(input.prevSeries) }).coveragePct < COVERAGE_MIN

  const kpiDelta = kpisWithDelta(kpi, baselineIncomplete ? null : prevKpi)

  return {
    scope,
    scopeLabel: scopeLabel(scope, input.groupName),
    scoped,
    ranged: !!input.ranged,
    campaigns: input.campaigns ?? DEFAULT_CAMPAIGNS,
    routeKeys,
    series,
    unscopedSeries,
    kpi,
    prevKpi,
    kpiDelta,
    baselineIncomplete,
    dq,
    coverageOk: dq.coverageOk,
    // A bulk backfill on one date can hide behind an otherwise-plausible coverage number: the
    // health section needs to name the date, not just report the symptom.
    outliers: dailyOutliers(unscopedSeries),
  }
}
