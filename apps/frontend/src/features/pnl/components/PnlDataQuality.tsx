'use client'

import { usePnlDataQuality } from '../hooks/usePnl'
import { AlertTriangle } from 'lucide-react'

const ISSUE_LABELS: Record<string, string> = {
  smu_lookup_failed:       'SMU rate not found',
  ra_lookup_failed:        'RA rate not found',
  sg_lookup_failed:        'SG Outgoing rate not found',
  sg_in_lookup_failed:     'SG Incoming rate not found',
  all_cost_lookup_failed:  'All cost lookups failed',
  unknown:                 'Unknown cost issue',
}

export function PnlDataQuality() {
  const { data, isLoading, isError, refetch } = usePnlDataQuality()

  if (isLoading) return null
  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">Failed to load data quality report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">Retry</button>
      </div>
    )
  }
  if (!data || data.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
        <AlertTriangle size={16} className="text-amber-600" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Data Quality Issues — {data.length} TOs with missing cost data
          <span className="ml-2 font-normal opacity-60">· All cycles</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              <th className="px-3 py-2 text-left">TO Number</th>
              <th className="px-3 py-2 text-left">AWB</th>
              <th className="px-3 py-2 text-left">Issue</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 50).map((row, i) => (
              <tr key={i} className="border-b border-amber-100 dark:border-amber-900">
                <td className="px-3 py-1.5 font-mono text-xs">{row.toNumber ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{row.awb}</td>
                <td className="px-3 py-1.5 text-amber-700 dark:text-amber-300">
                  {ISSUE_LABELS[row.issue] ?? row.issue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 50 && (
          <p className="px-4 py-2 text-xs text-amber-600">Showing first 50 of {data.length} issues</p>
        )}
      </div>
    </div>
  )
}
