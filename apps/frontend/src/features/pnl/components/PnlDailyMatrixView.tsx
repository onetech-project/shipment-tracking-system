'use client'

import { PnlFilter, usePnlDailyMatrix } from '../hooks/usePnl'
import { toMarginTable, toRevenueTable } from '../utils/dailyMatrix'
import { PnlMatrixTable } from './PnlMatrixTable'

export function PnlDailyMatrixView({ filter }: { filter: PnlFilter }) {
  const { data, isLoading, isError, refetch } = usePnlDailyMatrix(filter)

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-[320px] rounded-lg border bg-card" />
        <div className="h-[420px] rounded-lg border bg-card" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load the daily report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.columns.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No route data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PnlMatrixTable title="Revenue — CGK/SUB" model={toRevenueTable(data)} />
      <PnlMatrixTable title="Profit Margin — CGK/SUB" model={toMarginTable(data)} />
    </div>
  )
}
