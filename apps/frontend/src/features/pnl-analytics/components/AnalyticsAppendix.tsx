'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { PnlAwbRow } from '@/features/pnl/hooks/usePnl'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote } from './AnalyticsNotes'

interface AnalyticsAppendixProps {
  rows: PnlAwbRow[] | undefined
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  isLoading: boolean
  isError: boolean
}

export function AnalyticsAppendix({
  rows,
  total,
  page,
  limit,
  onPageChange,
  isLoading,
  isError,
}: AnalyticsAppendixProps) {
  const lastPage = Math.max(1, Math.ceil(total / limit))

  return (
    <AnalyticsSection
      id="appendix"
      title="Appendix"
      subtitle="The raw per-AWB rows every figure above is built from"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !rows ? (
        <AbsentNote what="AWB rows" />
      ) : (
        <>
          <AnalyticsTable<PnlAwbRow>
            columns={[
              { key: 'awb', header: 'AWB', cell: (r) => r.awb },
              { key: 'date', header: 'Date', cell: (r) => r.date ?? '—' },
              { key: 'vendor', header: 'Vendor', cell: (r) => r.vendor ?? '—' },
              { key: 'airline', header: 'Airline', cell: (r) => r.airline ?? '—' },
              {
                key: 'route',
                header: 'Route',
                cell: (r) => (r.origin && r.dest ? `${r.origin} → ${r.dest}` : '—'),
              },
              { key: 'gw', header: 'Gross wt', align: 'right', cell: (r) => num(Math.round(r.sumGw)) },
              {
                key: 'chwt',
                header: 'Chargeable wt',
                align: 'right',
                cell: (r) => (r.chwt == null ? '—' : num(Math.round(r.chwt))),
              },
              {
                key: 'revenue',
                header: 'Revenue',
                align: 'right',
                cell: (r) => fmt.format(r.totalRevenue),
              },
              {
                key: 'cost',
                header: 'Cost',
                align: 'right',
                cell: (r) => (r.totalCost == null ? '—' : fmt.format(r.totalCost)),
              },
              {
                key: 'margin',
                header: 'Margin %',
                align: 'right',
                cell: (r) => pct(r.grossMarginPct),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.awb}
            // A row with missing cost is shaded rather than dropped: the appendix exists to show
            // exactly what the aggregates were built from, gaps included.
            rowClassName={(r) => (r.hasNullCost ? 'bg-amber-50/60' : undefined)}
            empty="No AWB in this period."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {lastPage} — {num(total)} AWB(s)
            </span>
            <span className="flex gap-2">
              <button
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </button>
              <button
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={page >= lastPage}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </button>
            </span>
          </div>
        </>
      )}
    </AnalyticsSection>
  )
}
