'use client'

import { useState } from 'react'
import { usePnlDataQuality, usePnlDataQualitySummary } from '../hooks/usePnl'
import { issueLabel } from '../utils/issueLabels'
import { AlertTriangle } from 'lucide-react'

const PAGE_SIZE = 25

export function PnlDataQuality() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = usePnlDataQuality(page, PAGE_SIZE)
  const { data: summary } = usePnlDataQualitySummary()

  if (isLoading && !data) return null
  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">Failed to load data quality report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">Retry</button>
      </div>
    )
  }
  if (!data || data.total === 0) return null

  const totalPages = Math.ceil(data.total / PAGE_SIZE)

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
        <AlertTriangle size={16} className="text-amber-600" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Data Quality — {data.total} AWB/issue rows need source-sheet fixes
          <span className="ml-2 font-normal opacity-60">· All cycles · fix in source Google Sheets, then re-sync</span>
        </p>
      </div>
      {summary && summary.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-amber-200 px-4 py-3 dark:border-amber-800">
          {summary.map((s) => (
            <div
              key={s.issue}
              className="rounded-md border border-amber-200 bg-white/60 px-3 py-1.5 text-xs dark:border-amber-800 dark:bg-amber-950/40"
            >
              <span className="font-medium text-amber-800 dark:text-amber-200">{issueLabel(s.issue)}</span>
              <span className="ml-2 text-amber-700 dark:text-amber-300">
                {s.awbs} AWB · {s.rows} TO
              </span>
            </div>
          ))}
        </div>
      )}
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
            {data.data.map((row, i) => (
              <tr key={i} className="border-b border-amber-100 dark:border-amber-900">
                <td className="px-3 py-1.5 font-mono text-xs">{row.toNumber ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{row.awb}</td>
                <td className="px-3 py-1.5 text-amber-700 dark:text-amber-300">
                  {issueLabel(row.issue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-amber-200 px-4 py-3 dark:border-amber-800">
          <button
            className="text-xs text-amber-700 disabled:opacity-40 hover:text-amber-900 dark:text-amber-300"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="text-xs text-amber-700 dark:text-amber-300">Page {page} / {totalPages}</span>
          <button
            className="text-xs text-amber-700 disabled:opacity-40 hover:text-amber-900 dark:text-amber-300"
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
