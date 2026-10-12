'use client'

import { useState } from 'react'
import {
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
  Percent,
  CreditCard,
  ArrowLeftRight,
} from 'lucide-react'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { KpiCard, KpiGrid } from '@/components/shared/kpi-card'
import { SubTabs } from '@/components/ui/segmented'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useSettlementSummary, useToComparison, SettledFilter } from '../hooks/useSettlement'
import { SettlementUploadDialog } from './SettlementUploadDialog'

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
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Settlement coverage</span>
              <span className="text-muted-foreground">
                {num(summary.settledTos)} / {num(summary.totalTos)} TO ({pct(summary.coveragePct)})
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
              <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, summary.coveragePct)}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs: est vs actual vs variance (revenue) */}
      <KpiGrid cols={5}>
        <KpiCard
          label="Est. Revenue (settled)"
          value={summary ? fmt.format(summary.estRevenueSettled) : '—'}
          hint="TO yang sudah di-settle"
          icon={FileText}
          tone="brand"
        />
        <KpiCard
          label="Actual Revenue"
          value={summary ? fmt.format(summary.actRevenue) : '—'}
          hint="dari invoice"
          icon={Wallet}
          tone="brand"
        />
        <KpiCard
          label="Variance"
          value={
            <span className={varTone(summary?.varRevenue) === 'pos' ? 'text-good' : varTone(summary?.varRevenue) === 'neg' ? 'text-destructive' : undefined}>
              {summary ? fmt.format(summary.varRevenue) : '—'}
            </span>
          }
          hint="actual − estimasi"
          icon={varTone(summary?.varRevenue) === 'neg' ? TrendingDown : TrendingUp}
          tone={varTone(summary?.varRevenue) === 'neg' ? 'danger' : 'info'}
        />
        <KpiCard
          label="Variance %"
          value={
            <span className={varTone(summary?.varRevenue) === 'pos' ? 'text-good' : varTone(summary?.varRevenue) === 'neg' ? 'text-destructive' : undefined}>
              {summary ? pct(summary.varRevenuePct) : '—'}
            </span>
          }
          icon={Percent}
          tone={varTone(summary?.varRevenue) === 'neg' ? 'danger' : 'info'}
        />
        <KpiCard
          label="Actual Cost"
          value="—"
          hint="menunggu invoice vendor"
          icon={CreditCard}
          tone="dark"
          muted
        />
      </KpiGrid>

      {/* Per-TO comparison table */}
      <Card>
        <CardHead
          icon={ArrowLeftRight}
          tone="info"
          title="Per-TO: Estimasi vs Actual"
          actions={
            <SubTabs
              aria-label="Filter settlement status"
              value={settled}
              onValueChange={changeSettled}
              items={[
                { value: 'all', label: 'Semua' },
                { value: 'settled', label: 'Settled' },
                { value: 'unsettled', label: 'Unsettled' },
              ]}
            />
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-table-head">
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">TO Number</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">LT Number</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Route</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Invoice Periode</th>
                <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Est. Revenue</th>
                <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Actual</th>
                <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Variance</th>
                <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Var %</th>
                <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsLoading ? (
                <tr><td colSpan={9} className="p-6 text-center text-xs text-muted-foreground">Memuat…</td></tr>
              ) : !rows || rows.data.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-xs text-muted-foreground">Tidak ada data.</td></tr>
              ) : (
                rows.data.map((r) => (
                  <tr key={r.toNumber} className="border-b last:border-0 hover:bg-row-hover">
                    <td className="p-2 font-mono text-xs">{r.toNumber}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{r.ltNumber ?? '—'}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.originStation && r.destStation ? `${r.originStation} → ${r.destStation}` : '—'}
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{r.invoicePeriod ?? '—'}</td>
                    <td className="p-2 text-right text-xs tabular-nums">{r.estRevenue == null ? '—' : fmt.format(r.estRevenue)}</td>
                    <td className="p-2 text-right text-xs tabular-nums">{r.actRevenue == null ? '—' : fmt.format(r.actRevenue)}</td>
                    <td className={`p-2 text-right text-xs tabular-nums ${r.varRevenue == null ? '' : r.varRevenue >= 0 ? 'text-good' : 'text-destructive'}`}>
                      {r.varRevenue == null ? '—' : fmt.format(r.varRevenue)}
                    </td>
                    <td className={`p-2 text-right text-xs tabular-nums ${r.varRevenue == null ? '' : r.varRevenue >= 0 ? 'text-good' : 'text-destructive'}`}>
                      {pct(r.varRevenuePct)}
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant={r.isSettled ? 'active' : 'neutral'}>
                        {r.isSettled ? 'Settled' : 'Unsettled'}
                      </Badge>
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
      </Card>

      <SettlementUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}
