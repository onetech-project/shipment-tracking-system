'use client'

import { Activity } from 'lucide-react'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Banner } from '@/components/shared/banner'
import { COVERAGE_MIN, DqReport } from '../utils/dq'
import { Outlier } from '../utils/series'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsHealthProps {
  dq: DqReport
  outliers: Outlier[]
  baselineIncomplete: boolean
}

const LEVEL_TEXT: Record<DqReport['level'], string> = {
  ok: 'Healthy',
  warn: 'Use with care',
  bad: 'Unreliable',
}

const LEVEL_VARIANT: Record<DqReport['level'], BadgeProps['variant']> = {
  ok: 'active',
  warn: 'pending',
  bad: 'danger',
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AnalyticsHealth({ dq, outliers, baselineIncomplete }: AnalyticsHealthProps) {
  const src = dq.costSourceDelta

  return (
    <AnalyticsSection
      id="health"
      title="Data Health"
      subtitle="Read this before trusting anything below."
      icon={Activity}
      tone="info"
      action={
        <Badge data-testid="analytics-health-level" variant={LEVEL_VARIANT[dq.level]}>
          {LEVEL_TEXT[dq.level]}
        </Badge>
      }
    >
      {!dq.coverageOk && (
        <Banner tone="danger">
          <p data-testid="analytics-health-warning">
            Only {pct(dq.coveragePct)} of revenue falls on days whose cost is fully attributed
            (threshold {COVERAGE_MIN}%). Margin figures for this period are artifacts of missing
            cost data, not results.
          </p>
        </Banner>
      )}

      {baselineIncomplete && (
        <Banner tone="warn">
          <p data-testid="analytics-baseline-note">
            The previous period&apos;s own cost data is incomplete, so period-over-period deltas
            have been withdrawn rather than shown against a broken baseline.
          </p>
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Complete days"
          value={pct(dq.completeDaysPct)}
          hint={
            dq.totalDays != null ? `${num(dq.cleanDays)} of ${num(dq.totalDays)} days` : undefined
          }
        />
        <Stat
          label="Route coverage"
          value={pct(dq.routeCoveragePct)}
          hint="secondary — routes with any cost"
        />
        <Stat label="Vendor attributed" value={pct(dq.vendorAttributedPct)} hint="of tonnage" />
        <Stat label="RA attributed" value={pct(dq.raAttributedPct)} hint="of tonnage" />
      </div>

      <p data-testid="analytics-cost-sources" className="text-sm text-muted-foreground">
        {src.comparable ? (
          <>
            Cost sources {src.agrees ? 'agree' : 'disagree'}: components{' '}
            {fmt.format(src.componentSum)} vs summary {fmt.format(src.summaryTotal)} (
            {pct(src.deltaPct)}). Every figure on this tab uses the component sum.
          </>
        ) : (
          <>
            The two cost sources could not be compared — the summary total is missing. That is not a
            statement that they agree.
          </>
        )}
      </p>

      {dq.routesWithoutCost.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {dq.routesWithoutCost.length} route(s) carry revenue with no cost at all (
          {fmt.format(dq.revenueWithoutCost)}): {dq.routesWithoutCost.slice(0, 6).join(', ')}
          {dq.routesWithoutCost.length > 6 ? ', …' : ''}
        </p>
      )}

      {outliers.length > 0 && (
        <div data-testid="analytics-outliers">
          <p className="text-sm font-medium">Suspected backfill days</p>
          <AnalyticsTable<Outlier>
            columns={[
              { key: 'date', header: 'Date', cell: (o) => o.date },
              {
                key: 'weight',
                header: 'Weight',
                align: 'right',
                cell: (o) => num(Math.round(o.weight)),
              },
              { key: 'ratio', header: '× median', align: 'right', cell: (o) => `${o.ratio.toFixed(1)}×` },
              { key: 'share', header: 'Share of period', align: 'right', cell: (o) => pct(o.sharePct) },
            ]}
            rows={outliers}
            rowKey={(o) => o.date}
          />
        </div>
      )}

      {dq.unmappedSlaRoutes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          SLA routes with no P&amp;L counterpart: {dq.unmappedSlaRoutes.join(', ')}
        </p>
      )}

      {dq.backendIssues.length > 0 && (
        <AnalyticsTable<DqReport['backendIssues'][number]>
          columns={[
            { key: 'issue', header: 'Backend data issue', cell: (i) => i.issue },
            { key: 'rows', header: 'Rows', align: 'right', cell: (i) => num(i.rows) },
            { key: 'awbs', header: 'AWBs', align: 'right', cell: (i) => num(i.awbs) },
          ]}
          rows={dq.backendIssues}
          rowKey={(i) => i.issue}
        />
      )}
    </AnalyticsSection>
  )
}
