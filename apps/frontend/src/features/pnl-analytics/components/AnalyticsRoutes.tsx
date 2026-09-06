'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { AnalyticsDailySeries } from '../types'
import { RouteContributionRow, concentration, marginStability, routeContribution } from '../utils/routes'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsRoutesProps {
  series: AnalyticsDailySeries | undefined
  routeKeys: string[]
}

/** Higher HHI means the period's margin rests on fewer routes. 0.25+ is the usual "concentrated". */
const hhiLabel = (hhi: number) =>
  hhi >= 0.25 ? 'highly concentrated' : hhi >= 0.15 ? 'moderately concentrated' : 'well spread'

export function AnalyticsRoutes({ series, routeKeys }: AnalyticsRoutesProps) {
  const rows = routeContribution(series, routeKeys)
  const conc = concentration(rows)
  const stability = new Map(rows.map((r) => [r.routeKey, marginStability(series, r.routeKey)]))

  return (
    <AnalyticsSection
      id="routes"
      title="Routes & Groups"
      subtitle="Where the margin comes from, and how steady it is"
    >
      <p data-testid="analytics-concentration" className="text-sm">
        Top route holds {pct(conc.top1Pct)} of margin, top three {pct(conc.top3Pct)}; HHI{' '}
        {conc.hhi.toFixed(3)} ({hhiLabel(conc.hhi)}) across {conc.routesCounted} route(s).
        {conc.routesExcluded > 0 && (
          <>
            {' '}
            {conc.routesExcluded} route(s) were excluded because their cost is incomplete — including
            them would let missing cost masquerade as margin.
          </>
        )}
      </p>

      <AnalyticsTable<RouteContributionRow>
        columns={[
          {
            key: 'route',
            header: 'Route',
            cell: (r) => (
              <span className="flex items-center gap-1">
                {r.label}
                {!r.costComplete && (
                  <span title="Cost incomplete on this route" className="text-amber-600">
                    ⚠
                  </span>
                )}
              </span>
            ),
          },
          { key: 'weight', header: 'Weight', align: 'right', cell: (r) => num(Math.round(r.weight)) },
          { key: 'revenue', header: 'Revenue', align: 'right', cell: (r) => fmt.format(r.revenue) },
          { key: 'cost', header: 'Cost', align: 'right', cell: (r) => fmt.format(r.cost) },
          { key: 'margin', header: 'Margin', align: 'right', cell: (r) => fmt.format(r.margin) },
          { key: 'marginPct', header: 'Margin %', align: 'right', cell: (r) => pct(r.marginPct) },
          { key: 'share', header: 'Share', align: 'right', cell: (r) => pct(r.sharePct) },
          {
            key: 'stability',
            header: 'Stability (CV)',
            align: 'right',
            // Fewer than five usable days is not a stability figure. '—' says "not measured";
            // a number here would say "steady", which nobody established.
            cell: (r) => {
              const s = stability.get(r.routeKey)
              return s ? s.cv.toFixed(2) : '—'
            },
          },
        ]}
        rows={rows}
        rowKey={(r) => r.routeKey}
        rowTestId={(r) => `route-${r.routeKey}`}
        rowClassName={(r) => (r.costComplete ? undefined : 'bg-amber-50/60')}
        empty="No routes in this scope."
      />

      <p className="text-xs text-muted-foreground">
        Stability is the coefficient of variation of daily margin per kg, over days with complete
        cost only. Blank means fewer than five such days — not that the route is steady.
      </p>
    </AnalyticsSection>
  )
}
