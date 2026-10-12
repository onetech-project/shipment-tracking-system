'use client'

import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardHead, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'

export interface RouteAlertRow {
  route: string
  totalTonnage: number
  totalCount: number
  alerts: Record<string, number>
  alertCounts: Record<string, number>
  otp: {
    percentage: number | null
    onTimeWeight: number
    onTimeCount: number
    lateWeight: number
    lateCount: number
  }
}

interface RouteAlertTableProps {
  data: RouteAlertRow[]
  isLoading: boolean
  onAlertClick: (route: string, alertKey: string) => void
  /** Alert columns to render, in order — sourced from the active SlaMode. */
  cols: Array<{ key: string; label: string; color: string }>
}

function fmt(n: number) {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function otpClass(pct: number): string {
  if (pct >= 80) return 'text-good'
  if (pct >= 50) return 'text-warn'
  return 'text-bad-strong'
}

export function RouteAlertTable({ data, isLoading, onAlertClick, cols }: RouteAlertTableProps) {
  return (
    <Card>
      <CardHead icon={MapPin} tone="alt" title="Alerts by Route" />
      <CardContent className="pt-4">
      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading route data…</p>
      ) : data.length === 0 ? (
        <EmptyState title="No route data for this period." />
      ) : (
        <div className="max-h-[480px] overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-table-head">
              <tr className="border-b">
                <th className="sticky left-0 z-30 bg-table-head py-2.5 pl-3.5 pr-4 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground [box-shadow:1px_0_0_0_hsl(var(--border))]">Route</th>
                <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <span className="opacity-60">(TOs)</span> Total{' '}
                  <span className="opacity-60">(Kg)</span>
                </th>
                {cols.map((col) => (
                  <th key={col.key} className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: col.color }}>
                    <span className="opacity-60">(TOs)</span> {col.label}{' '}
                    <span className="opacity-60">(Kg)</span>
                  </th>
                ))}
                <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">OTP %</th>
                <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-good">
                  <span className="opacity-60">(TOs)</span> On Time{' '}
                  <span className="opacity-60">(Kg)</span>
                </th>
                <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-bad-strong">
                  <span className="opacity-60">(TOs)</span> Late{' '}
                  <span className="opacity-60">(Kg)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const { percentage, onTimeWeight, onTimeCount, lateWeight, lateCount } = row.otp
                const hasOtp = onTimeWeight > 0 || lateWeight > 0
                return (
                  <tr key={row.route} className="border-b motion-safe:transition-colors hover:bg-row-hover">
                    <td className="sticky left-0 z-10 bg-card [box-shadow:1px_0_0_0_hsl(var(--border))] py-[7px] pl-3.5 pr-4 font-medium text-foreground">{row.route}</td>
                    <td className="tabular py-[7px] pr-4 text-right text-foreground">
                      <span className="text-muted-foreground">({row.totalCount})</span>{' '}
                      {fmt(row.totalTonnage)}
                    </td>
                    {cols.map((col) => {
                      const tonnage = row.alerts[col.key] ?? 0
                      const count = row.alertCounts[col.key] ?? 0
                      const hasAlert = tonnage > 0
                      return (
                        <td key={col.key} className="tabular py-[7px] pr-4 text-right">
                          {hasAlert ? (
                            <button
                              type="button"
                              onClick={() => onAlertClick(row.route, col.key)}
                              className="rounded-sm px-1.5 py-0.5 motion-safe:transition-opacity hover:opacity-75 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                              style={{ color: col.color }}
                              title={`Filter by ${col.label} · ${row.route}`}
                            >
                              <span className="font-normal opacity-70">({count})</span>{' '}
                              <span className="font-medium">{fmt(tonnage)}</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="tabular py-[7px] pr-4 text-right">
                      {percentage !== null ? (
                        <span className={cn('font-medium', otpClass(percentage))}>{percentage}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="tabular py-[7px] pr-4 text-right">
                      {hasOtp ? (
                        <>
                          <span className="text-muted-foreground">({onTimeCount})</span>{' '}
                          <span className="font-medium text-good">{fmt(onTimeWeight)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="tabular py-[7px] pr-4 text-right">
                      {hasOtp ? (
                        <>
                          <span className="text-muted-foreground">({lateCount})</span>{' '}
                          <span className="font-medium text-bad-strong">{fmt(lateWeight)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </CardContent>
    </Card>
  )
}
