'use client'

import { Fragment, useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { usePnlAwbDrilldown, usePnlAwbTos, PnlFilter, PnlToRow } from '../hooks/usePnl'
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
      <td colSpan={13} className="p-0">
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

interface PnlAwbDrilldownProps {
  filter: PnlFilter
}

export function PnlAwbDrilldown({ filter }: PnlAwbDrilldownProps) {
  const [page, setPage] = useState(1)
  const [expandedAwb, setExpandedAwb] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
    setExpandedAwb(null)
  }, [filter])
  const { data, isLoading, isError, refetch } = usePnlAwbDrilldown(filter, page)
  const totalPages = data ? Math.ceil(data.total / 50) : 0
  const title = filter.mode === 'cycle' ? filter.cycle : `${filter.start} → ${filter.end}`

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="w-6 px-2 py-2" />
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Airline</th>
              <th className="px-3 py-2 text-right">TOs</th>
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
              <tr><td colSpan={13} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
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
                    <td className="px-3 py-2">{row.vendor ?? '—'}</td>
                    <td className="px-3 py-2">{row.airline ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{row.toCount}</td>
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
