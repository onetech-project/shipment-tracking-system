'use client'

import { useState } from 'react'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useSettlementSummary, useToComparison, SettledFilter } from '../hooks/useSettlement'
import { SettlementUploadDialog } from './SettlementUploadDialog'

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3 sm:p-4">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={[
          'mt-1 text-xl font-bold leading-tight sm:text-2xl xl:text-base',
          tone === 'pos' ? 'text-green-600' : tone === 'neg' ? 'text-destructive' : '',
        ].filter(Boolean).join(' ')}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function varTone(v: number | null | undefined): 'pos' | 'neg' | undefined {
  if (v == null || v === 0) return undefined
  return v > 0 ? 'pos' : 'neg'
}

const PAGE_SIZE = 50

export function SettlementView({ filter }: { filter: PnlFilter | undefined }) {
  const { hasPermission } = usePermissions()
  const canUpload = hasPermission('create.pnl_settlement')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [settled, setSettled] = useState<SettledFilter>('all')
  const [page, setPage] = useState(1)

  const { data: summary, isLoading: summaryLoading } = useSettlementSummary(filter)
  const { data: rows, isLoading: rowsLoading } = useToComparison(filter, page, settled, PAGE_SIZE)

  const totalPages = rows ? Math.max(1, Math.ceil(rows.total / PAGE_SIZE)) : 1

  function changeSettled(next: SettledFilter) {
    setSettled(next)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Actual revenue dari invoice yang sudah di-settle, dibandingkan estimasi per TO.
        </p>
        {canUpload && <Button onClick={() => setUploadOpen(true)}>Upload Invoice</Button>}
      </div>

      {/* Coverage */}
      {summary && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Settlement coverage</span>
            <span className="text-muted-foreground">
              {num(summary.settledTos)} / {num(summary.totalTos)} TO ({pct(summary.coveragePct)})
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, summary.coveragePct)}%` }} />
          </div>
        </div>
      )}

      {/* KPIs: est vs actual vs variance (revenue) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Est. Revenue (settled)"
          value={summary ? fmt.format(summary.estRevenueSettled) : '—'}
          sub="TO yang sudah di-settle"
        />
        <Kpi
          label="Actual Revenue"
          value={summary ? fmt.format(summary.actRevenue) : '—'}
          sub="dari invoice"
        />
        <Kpi
          label="Variance"
          value={summary ? fmt.format(summary.varRevenue) : '—'}
          sub="actual − estimasi"
          tone={varTone(summary?.varRevenue)}
        />
        <Kpi
          label="Variance %"
          value={summary ? pct(summary.varRevenuePct) : '—'}
          tone={varTone(summary?.varRevenue)}
        />
        <Kpi
          label="Actual Cost"
          value="—"
          sub="menunggu invoice vendor"
        />
      </div>

      {/* Per-TO comparison table */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-semibold">Per-TO: Estimasi vs Actual</h3>
          <div className="flex overflow-hidden rounded-md border text-xs">
            {(['all', 'settled', 'unsettled'] as SettledFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => changeSettled(s)}
                className={`px-3 py-1 ${settled === s ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {s === 'all' ? 'Semua' : s === 'settled' ? 'Settled' : 'Unsettled'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">TO Number</th>
                <th className="p-2 font-medium">LT Number</th>
                <th className="p-2 font-medium">Route</th>
                <th className="p-2 text-right font-medium">Est. Revenue</th>
                <th className="p-2 text-right font-medium">Actual</th>
                <th className="p-2 text-right font-medium">Variance</th>
                <th className="p-2 text-right font-medium">Var %</th>
                <th className="p-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Memuat…</td></tr>
              ) : !rows || rows.data.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Tidak ada data.</td></tr>
              ) : (
                rows.data.map((r) => (
                  <tr key={r.toNumber} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs">{r.toNumber}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{r.ltNumber ?? '—'}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.originStation && r.destStation ? `${r.originStation} → ${r.destStation}` : '—'}
                    </td>
                    <td className="p-2 text-right">{r.estRevenue == null ? '—' : fmt.format(r.estRevenue)}</td>
                    <td className="p-2 text-right">{r.actRevenue == null ? '—' : fmt.format(r.actRevenue)}</td>
                    <td className={`p-2 text-right ${r.varRevenue == null ? '' : r.varRevenue >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {r.varRevenue == null ? '—' : fmt.format(r.varRevenue)}
                    </td>
                    <td className={`p-2 text-right ${r.varRevenue == null ? '' : r.varRevenue >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {pct(r.varRevenuePct)}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs ${r.isSettled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {r.isSettled ? 'Settled' : 'Unsettled'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rows && rows.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">
              Hal {page} / {totalPages} · {num(rows.total)} TO
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <SettlementUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}
