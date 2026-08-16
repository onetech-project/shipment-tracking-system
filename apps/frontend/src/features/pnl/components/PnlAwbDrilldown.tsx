'use client'

import { Fragment, useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  usePnlAwbDrilldown,
  usePnlAwbTos,
  usePnlStations,
  BASIS_LABELS,
  PnlFilter,
  PnlRouteFilter,
  PnlToRow,
} from '../hooks/usePnl'
import { periodBounds } from '../utils/periodBounds'
import { fmt, num, pct } from '../utils/format'
import { issueLabel } from '../utils/issueLabels'

interface ToSubTableProps {
  awb: string
  filter: PnlFilter
}

function ToSubTable({ awb, filter }: ToSubTableProps) {
  const { data, isLoading } = usePnlAwbTos(awb, filter)

  return (
    <tr>
      <td colSpan={18} className="p-0">
        <div className="border-t border-b bg-muted/20 px-4 py-2">
          {isLoading && <p className="py-2 text-xs text-muted-foreground">Loading TOs…</p>}
          {data && data.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">No TOs found.</p>
          )}
          {data && data.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-3 text-left">TO Number</th>
                  <th className="py-1 pr-3 text-right">GW (kg)</th>
                  <th
                    className="py-1 pr-3 text-right cursor-help underline decoration-dotted"
                    title="ChWt per TO = proporsi gross weight: ChWt AWB × (GW TO ÷ total GW AWB)"
                  >
                    ChWt (kg)
                  </th>
                  <th className="py-1 pr-3 text-right">Revenue</th>
                  <th className="py-1 pr-3 text-right">Cost SMU</th>
                  <th className="py-1 pr-3 text-right">Cost RA</th>
                  <th className="py-1 pr-3 text-right">Cost SG Out</th>
                  <th className="py-1 pr-3 text-right">Cost SG In</th>
                  <th className="py-1 pr-3 text-right">Total Cost</th>
                  <th className="py-1 pr-3 text-right">GP</th>
                  <th className="py-1 pr-3 text-right">Margin</th>
                  <th className="py-1 text-left">Issue</th>
                </tr>
              </thead>
              <tbody>
                {data.map((to: PnlToRow, idx: number) => (
                  <tr key={to.toNumber} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="py-1 pr-3 font-mono">{to.toNumber}</td>
                    <td className="py-1 pr-3 text-right">{num(to.grossWeight)}</td>
                    <td className="py-1 pr-3 text-right">{to.chwt != null ? num(to.chwt) : '—'}</td>
                    <td className="py-1 pr-3 text-right">{fmt.format(to.revenue)}</td>
                    <td className="py-1 pr-3 text-right">{to.costSmu != null ? fmt.format(to.costSmu) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right">{to.costRa != null ? fmt.format(to.costRa) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right">{to.costSg != null ? fmt.format(to.costSg) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right">{to.costSgIn != null ? fmt.format(to.costSgIn) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right">{to.totalCost != null ? fmt.format(to.totalCost) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right">{to.grossProfit != null ? fmt.format(to.grossProfit) : '—'}</td>
                    <td className="py-1 pr-3 text-right font-medium">{pct(to.marginPct)}</td>
                    <td className="py-1 text-left text-amber-600">{to.issue ? issueLabel(to.issue) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  )
}

// Marks a column whose TOs within one AWB disagree, so a dominant-value cell never reads as the
// whole truth. The AWB stays one row: splitting it would break paging and AWB counts.
function VariesMark({ when }: { when: boolean }) {
  if (!when) return null
  return (
    <span
      data-testid="varies-mark"
      title="TO dalam AWB ini punya nilai berbeda — yang tampil adalah nilai terbanyak, dan angka di baris ini menjumlahkan seluruh TO AWB ini, termasuk yang berada di luar filter rute/tanggal"
      className="ml-1 text-amber-600"
    >
      +
    </span>
  )
}

interface PnlAwbDrilldownProps {
  filter: PnlFilter
  route: PnlRouteFilter
  onRouteChange: (next: PnlRouteFilter) => void
}

export function PnlAwbDrilldown({ filter, route, onRouteChange }: PnlAwbDrilldownProps) {
  const [page, setPage] = useState(1)
  const [expandedAwb, setExpandedAwb] = useState<string | null>(null)
  const { data: stations } = usePnlStations()

  useEffect(() => {
    setPage(1)
    setExpandedAwb(null)
  }, [filter, route])
  const { data, isLoading, isError, refetch } = usePnlAwbDrilldown(filter, page, route)
  const totalPages = data ? Math.ceil(data.total / 50) : 0
  const title = filter.mode === 'cycle' ? filter.cycle : `${filter.start} → ${filter.end}`

  const origins = Array.from(new Set((stations ?? []).map((s) => s.origin))).sort()
  const dests = Array.from(
    new Set(
      (stations ?? [])
        .filter((s) => !route.origin || s.origin === route.origin)
        .map((s) => s.dest),
    ),
  ).sort()
  const bounds = periodBounds(filter)
  const hasRoute = Boolean(route.origin || route.dest || route.dateFrom || route.dateTo)

  // Empty string means "no filter": the hook drops empty fields before building the request.
  function setField(field: keyof PnlRouteFilter, value: string) {
    const next: PnlRouteFilter = { ...route, [field]: value || undefined }
    // A destination that does not belong to the newly chosen origin would return nothing at all.
    // Only prune when origin is being narrowed to a specific value — clearing it back to "Semua"
    // widens the filter, so any destination the user already picked still applies fine.
    if (field === 'origin' && value && next.dest) {
      const stillValid = (stations ?? []).some((s) => s.origin === value && s.dest === next.dest)
      if (!stillValid) next.dest = undefined
    }
    onRouteChange(next)
  }

  function toggleAwb(awb: string) {
    setExpandedAwb((prev) => (prev === awb ? null : awb))
  }

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Failed to load AWB drilldown.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">AWB Drilldown — {title}</p>
        {data && <p className="text-xs text-muted-foreground">{data.total} AWBs</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Origin
          <select
            aria-label="Origin"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            value={route.origin ?? ''}
            onChange={(e) => setField('origin', e.target.value)}
          >
            <option value="">Semua</option>
            {origins.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Destination
          <select
            aria-label="Destination"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            value={route.dest ?? ''}
            onChange={(e) => setField('dest', e.target.value)}
          >
            <option value="">Semua</option>
            {dests.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            aria-label="Dari"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={bounds.min}
            max={route.dateTo || bounds.max}
            value={route.dateFrom ?? ''}
            onChange={(e) => setField('dateFrom', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            aria-label="Sampai"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={route.dateFrom || bounds.min}
            max={bounds.max}
            value={route.dateTo ?? ''}
            onChange={(e) => setField('dateTo', e.target.value)}
          />
        </label>

        {hasRoute && (
          <button
            type="button"
            className="pb-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => onRouteChange({})}
          >
            Reset
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="w-6 px-2 py-2" />
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Origin</th>
              <th className="px-3 py-2 text-left">Destination</th>
              <th className="px-3 py-2 text-left">{BASIS_LABELS[filter.basis]}</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Airline</th>
              <th className="px-3 py-2 text-right">TOs</th>
              <th className="px-3 py-2 text-right">GW</th>
              <th className="px-3 py-2 text-right">ChWt</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost SMU</th>
              <th className="px-3 py-2 text-right">Cost RA</th>
              <th className="px-3 py-2 text-right">Cost SG Out</th>
              <th className="px-3 py-2 text-right">Cost SG In</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
              <th className="px-3 py-2 text-right">GP</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={18} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {data?.data.map((row, idx) => {
              const isExpanded = expandedAwb === row.awb
              const rowBg = row.hasNullCost
                ? 'bg-amber-50 dark:bg-amber-950/20'
                : idx % 2 === 1
                  ? 'bg-muted/70'
                  : ''
              return (
                <Fragment key={row.awb}>
                  <tr
                    className={`border-b cursor-pointer hover:bg-muted/50 ${rowBg}`}
                    onClick={() => toggleAwb(row.awb)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.awb}
                      {row.issue && (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                          title="Fix in source Google Sheet, then re-sync"
                        >
                          {issueLabel(row.issue)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.origin ?? '—'}
                      <VariesMark when={row.originVaries} />
                    </td>
                    <td className="px-3 py-2">
                      {row.dest ?? '—'}
                      <VariesMark when={row.destVaries} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.date ?? '—'}
                      <VariesMark when={row.dateVaries} />
                    </td>
                    <td className="px-3 py-2">{row.vendor ?? '—'}</td>
                    <td className="px-3 py-2">{row.airline ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{row.toCount}</td>
                    <td className="px-3 py-2 text-right">{num(row.sumGw)}</td>
                    <td className="px-3 py-2 text-right">{row.chwt != null ? num(row.chwt) : '—'}</td>
                    <td className="px-3 py-2 text-right">{fmt.format(row.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right">{row.costSmu != null ? fmt.format(row.costSmu) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="px-3 py-2 text-right">{row.costRa != null ? fmt.format(row.costRa) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="px-3 py-2 text-right">{row.costSgOut != null ? fmt.format(row.costSgOut) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="px-3 py-2 text-right">{row.costSgIn != null ? fmt.format(row.costSgIn) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="px-3 py-2 text-right">{row.totalCost != null ? fmt.format(row.totalCost) : <span className="text-amber-600">NULL</span>}</td>
                    <td className="px-3 py-2 text-right">{row.grossProfit != null ? fmt.format(row.grossProfit) : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{pct(row.grossMarginPct)}</td>
                  </tr>
                  {isExpanded && <ToSubTable awb={row.awb} filter={filter} />}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <button
            className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
