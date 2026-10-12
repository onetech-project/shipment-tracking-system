'use client'

import { Fragment, useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
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
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { FilterBar } from '@/components/shared/filter-bar'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'

// Positive/negative margin and GP cells read as the mockup's `.margin-cell`/`.gp-pos`/`.gp-neg`:
// bold green/red for margin, a slightly lighter semibold green/red for GP. null stays unstyled —
// it already renders as an em-dash, not a number to colour.
function marginClass(value: number | null): string {
  if (value == null) return ''
  return value < 0 ? 'text-bad font-bold' : 'text-good font-bold'
}

function gpClass(value: number | null): string {
  if (value == null) return ''
  return value < 0 ? 'text-bad font-semibold' : 'text-good font-semibold'
}

interface ToSubTableProps {
  awb: string
  filter: PnlFilter
}

function ToSubTable({ awb, filter }: ToSubTableProps) {
  const { data, isLoading } = usePnlAwbTos(awb, filter)

  return (
    <tr>
      <td colSpan={18} className="p-0">
        <div className="border-t border-b bg-surface-2/60 px-4 py-2">
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
                  <tr key={to.toNumber} className={idx % 2 === 0 ? '' : 'bg-surface-2'}>
                    <td className="py-1 pr-3 font-mono tabular">
                      {to.toNumber}
                      {to.isCostEstimated && (
                        <span
                          className="ml-1.5 rounded bg-info-soft px-1 py-0.5 text-[9px] font-normal text-info-ink"
                          title="No reservation yet — cost estimated from the route's dearest SMU and RA rates"
                        >
                          Est
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right tabular">{num(to.grossWeight)}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.chwt != null ? num(to.chwt) : '—'}</td>
                    <td className="py-1 pr-3 text-right tabular">{fmt.format(to.revenue)}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.costSmu != null ? fmt.format(to.costSmu) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.costRa != null ? fmt.format(to.costRa) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.costSg != null ? fmt.format(to.costSg) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.costSgIn != null ? fmt.format(to.costSgIn) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="py-1 pr-3 text-right tabular">{to.totalCost != null ? fmt.format(to.totalCost) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className={`py-1 pr-3 text-right tabular ${gpClass(to.grossProfit)}`}>{to.grossProfit != null ? fmt.format(to.grossProfit) : '—'}</td>
                    <td className={`py-1 pr-3 text-right tabular ${marginClass(to.marginPct)}`}>{pct(to.marginPct)}</td>
                    <td className="py-1 text-left text-warn-ink">{to.issue ? issueLabel(to.issue) : ''}</td>
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
      className="ml-1 text-warn-ink"
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

  const routeIndex = buildRouteLabelIndex(stations ?? [])
  const bounds = periodBounds(filter)
  // `vendors` is in here, not just routes and dates. A drilldown opened from a Vendor Comparison
  // cell carries only a vendor and a period; leaving it out would hide Reset from exactly the user
  // who most needs it, and — because setRoutes and setDate both spread ...route — the invisible
  // vendor narrowing would then survive every edit they made.
  const vendors = route.vendors ?? []
  const hasRoute = Boolean(route.routes?.length || route.dateFrom || route.dateTo || vendors.length)
  const overhangCount = (data?.data ?? []).filter(
    (row) => row.originVaries || row.destVaries || row.dateVaries,
  ).length

  // Empty means "no filter": routeToParams drops empty fields before building the request, and an
  // empty array would otherwise be serialised as a filter that matches nothing.
  function setRoutes(labels: string[]) {
    const routes = routesForLabels(labels, routeIndex)
    onRouteChange({ ...route, routes: routes.length ? routes : undefined })
  }

  function setDate(field: 'dateFrom' | 'dateTo', value: string) {
    onRouteChange({ ...route, [field]: value || undefined })
  }

  // Same "empty means no filter" rule as setRoutes: an empty array would be serialised as a filter
  // matching nothing rather than as no filter at all.
  function removeVendor(name: string) {
    const next = vendors.filter((v) => v !== name)
    onRouteChange({ ...route, vendors: next.length ? next : undefined })
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
        {hasRoute && overhangCount > 0 && (
          <p className="mt-1 text-xs text-warn-ink">
            {overhangCount} AWB di halaman ini punya TO di luar filter — umumnya tanggal ATA yang
            berbeda. Angka barisnya mencakup seluruh TO milik AWB itu, jadi totalnya bisa lebih
            besar dari cell yang diklik.
          </p>
        )}
        {vendors.length > 0 && (
          <p data-testid="vendor-scope-note" className="mt-1 text-xs text-warn-ink">
            Angka di sini menjumlahkan seluruh TO milik AWB yang cocok dan memakai biaya per-AWB,
            sedangkan sel Vendor Comparison memakai prorata weight_share yang dibatasi satu rute.
            Kedua angka memang tidak akan sama.
          </p>
        )}
      </div>
      <FilterBar className="mb-0 rounded-none border-x-0 border-t-0 border-b">
        {/* MultiRouteFilter has no id/aria-labelledby prop to target from a sibling label, so this
            keeps the native nested-<label> association (label wraps the control) instead of
            FormField. */}
        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Rute
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(route.routes ?? [])}
            onChange={setRoutes}
          />
        </label>

        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Dari
          <input
            type="date"
            aria-label="Dari"
            className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
            min={bounds.min}
            max={route.dateTo || bounds.max}
            value={route.dateFrom ?? ''}
            onChange={(e) => setDate('dateFrom', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Sampai
          <input
            type="date"
            aria-label="Sampai"
            className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
            min={route.dateFrom || bounds.min}
            max={bounds.max}
            value={route.dateTo ?? ''}
            onChange={(e) => setDate('dateTo', e.target.value)}
          />
        </label>

        {vendors.length > 0 && (
          <div className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Vendor
            <div className="flex flex-wrap items-center gap-1 pb-0.5">
              {vendors.map((vendor) => (
                <span
                  key={vendor}
                  data-testid={`vendor-chip-${vendor}`}
                  className="flex items-center gap-1 rounded-full border bg-surface-2 px-2 py-1 text-xs font-medium normal-case tracking-normal text-foreground"
                >
                  {vendor}
                  <button
                    type="button"
                    aria-label={`Hapus filter vendor ${vendor}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeVendor(vendor)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {hasRoute && (
          <button
            type="button"
            className="pb-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => onRouteChange({})}
          >
            Reset
          </button>
        )}
      </FilterBar>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="w-6 bg-table-head px-2 py-2.5" />
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">AWB</th>
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Origin</th>
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Destination</th>
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">{BASIS_LABELS[filter.basis]}</th>
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Vendor</th>
              <th className="bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em]">Airline</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">TOs</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">GW</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">ChWt</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Revenue</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Cost SMU</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Cost RA</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Cost SG Out</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Cost SG In</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Total Cost</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">GP</th>
              <th className="bg-table-head px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em]">Margin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={18} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {data?.data.map((row, idx) => {
              const isExpanded = expandedAwb === row.awb
              const rowBg = row.hasNullCost ? 'bg-warn-soft' : idx % 2 === 1 ? 'bg-surface-2' : ''
              return (
                <Fragment key={row.awb}>
                  <tr
                    className={`border-b cursor-pointer hover:bg-row-hover ${rowBg}`}
                    onClick={() => toggleAwb(row.awb)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.awb}
                      {row.issue && (
                        <span
                          className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-normal text-warn-ink"
                          title="Fix in source Google Sheet, then re-sync"
                        >
                          {issueLabel(row.issue)}
                        </span>
                      )}
                      {row.isCostEstimated && (
                        <span
                          className="ml-2 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-normal text-info-ink"
                          title="No reservation yet — cost estimated from the route's dearest SMU and RA rates. Replaced by actuals once the booking is entered."
                        >
                          Estimated
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
                    <td className="px-3 py-2 text-right tabular">{row.toCount}</td>
                    <td className="px-3 py-2 text-right tabular">{num(row.sumGw)}</td>
                    <td className="px-3 py-2 text-right tabular">{row.chwt != null ? num(row.chwt) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular">{fmt.format(row.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right tabular">{row.costSmu != null ? fmt.format(row.costSmu) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="px-3 py-2 text-right tabular">{row.costRa != null ? fmt.format(row.costRa) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="px-3 py-2 text-right tabular">{row.costSgOut != null ? fmt.format(row.costSgOut) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="px-3 py-2 text-right tabular">{row.costSgIn != null ? fmt.format(row.costSgIn) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className="px-3 py-2 text-right tabular">{row.totalCost != null ? fmt.format(row.totalCost) : <span className="text-warn-ink">NULL</span>}</td>
                    <td className={`px-3 py-2 text-right tabular ${gpClass(row.grossProfit)}`}>{row.grossProfit != null ? fmt.format(row.grossProfit) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular font-medium ${marginClass(row.grossMarginPct)}`}>{pct(row.grossMarginPct)}</td>
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
