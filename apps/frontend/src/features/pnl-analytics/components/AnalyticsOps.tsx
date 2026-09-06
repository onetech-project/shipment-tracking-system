'use client'

import { num, pct } from '@/features/pnl/utils/format'
import { OffloadedAwbRow } from '@/features/air-shipments/types'
import { SlaOverview } from '../types'
import { SlaRouteRow, SlaView, offloadView, slaView } from '../utils/ops'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote } from './AnalyticsNotes'

interface AnalyticsOpsProps {
  /** False means the hooks were never enabled: no request was sent and no 403 was produced. */
  canReadSla: boolean
  sla: SlaOverview | undefined
  slaLoading: boolean
  slaError: boolean
  offloaded: OffloadedAwbRow[] | undefined
  offloadedLoading: boolean
  offloadedError: boolean
  /** The current page of the AWB drilldown, used only to attach a route to an offloaded AWB. */
  awbs: Array<{ awb: string; origin: string | null; dest: string | null }>
  routeKeys: string[]
  ranged: boolean
}

export function AnalyticsOps({
  canReadSla,
  sla,
  slaLoading,
  slaError,
  offloaded,
  offloadedLoading,
  offloadedError,
  awbs,
  routeKeys,
  ranged,
}: AnalyticsOpsProps) {
  if (!canReadSla) {
    return (
      <AnalyticsSection
        id="ops"
        title="Operations"
        subtitle="On-time performance, SLA alerts and offloaded AWBs"
      >
        <p
          data-testid="analytics-ops-permission"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          This section needs the SLA read permission, which your account does not have. Ask an
          administrator for <code>read.sla</code> to see on-time performance, SLA alerts and
          offloaded AWBs here.
        </p>
      </AnalyticsSection>
    )
  }

  const view = sla ? slaView(sla, routeKeys) : undefined
  const off = offloaded
    ? offloadView(
        offloaded.map((o) => ({ awb: o.awb, airline: (o.airline as string | null) ?? null })),
        awbs,
      )
    : undefined

  return (
    <AnalyticsSection
      id="ops"
      title="Operations"
      subtitle="On-time performance, SLA alerts and offloaded AWBs"
    >
      {ranged && <RangeFallbackNote />}

      {slaLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : slaError || !view ? (
        <AbsentNote what="SLA data" />
      ) : (
        <>
          <p data-testid="analytics-ops-otp" className="text-sm">
            On-time performance <strong>{pct(view.otpPct)}</strong> —{' '}
            {num(Math.round(view.onTimeWeight))} kg on time against {num(Math.round(view.lateWeight))}{' '}
            kg late
            {view.scoped ? ', recomputed over the routes in scope' : ''}.
          </p>

          {view.alerts.length > 0 && (
            <AnalyticsTable<SlaView['alerts'][number]>
              columns={[
                { key: 'label', header: 'Alert', cell: (a) => a.label },
                { key: 'routes', header: 'Routes', align: 'right', cell: (a) => num(a.routes) },
                {
                  key: 'tonnage',
                  header: 'Tonnage',
                  align: 'right',
                  cell: (a) => num(Math.round(a.tonnage)),
                },
              ]}
              rows={view.alerts}
              rowKey={(a) => a.type}
            />
          )}

          <AnalyticsTable<SlaRouteRow>
            columns={[
              { key: 'route', header: 'Route', cell: (r) => r.label },
              { key: 'otp', header: 'OTP', align: 'right', cell: (r) => pct(r.otpPct) },
              {
                key: 'onTime',
                header: 'On time',
                align: 'right',
                cell: (r) => num(Math.round(r.onTimeWeight)),
              },
              { key: 'late', header: 'Late', align: 'right', cell: (r) => num(Math.round(r.lateWeight)) },
            ]}
            rows={view.byRoute}
            rowKey={(r) => r.routeKey}
            rowTestId={(r) => `sla-route-${r.routeKey}`}
            empty="No measured SLA route in this scope."
          />

          {view.noDataRoutes.length > 0 && (
            <p data-testid="analytics-ops-nodata" className="text-xs text-muted-foreground">
              Not measured (no on-time and no late weight, so their 0% is an artifact rather than a
              failure): {view.noDataRoutes.map((r) => r.label).join(', ')}.
            </p>
          )}

          {view.unmapped.length > 0 && (
            <p className="text-xs text-muted-foreground">
              SLA routes with no P&amp;L counterpart, excluded above: {view.unmapped.join(', ')}.
            </p>
          )}
        </>
      )}

      <div>
        <p className="text-sm font-medium">Offloaded AWBs</p>
        {offloadedLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : offloadedError || !off ? (
          <AbsentNote what="Offloaded AWBs" />
        ) : off.count === 0 ? (
          <p className="text-sm text-muted-foreground">No offloaded AWB in this period.</p>
        ) : (
          <>
            <p className="text-sm">
              {num(off.count)} offloaded AWB(s). {pct(off.joinRatePct)} of them matched an AWB on the
              current drilldown page, which is the only way a route can be attached to them.
            </p>
            <AnalyticsTable<{ name: string; count: number }>
              columns={[
                { key: 'name', header: 'Airline', cell: (r) => r.name },
                { key: 'count', header: 'AWBs', align: 'right', cell: (r) => num(r.count) },
              ]}
              rows={off.byAirline}
              rowKey={(r) => r.name}
            />
            {off.byRoute.length > 0 && (
              <AnalyticsTable<{ routeKey: string; label: string; count: number }>
                columns={[
                  { key: 'route', header: 'Route', cell: (r) => r.label },
                  { key: 'count', header: 'AWBs', align: 'right', cell: (r) => num(r.count) },
                ]}
                rows={off.byRoute}
                rowKey={(r) => r.routeKey}
              />
            )}
          </>
        )}
      </div>
    </AnalyticsSection>
  )
}
