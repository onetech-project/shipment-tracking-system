'use client'

import { fmt, num } from '@/features/pnl/utils/format'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { SelfOperateRow, selfOperateGap, vendorExecution } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsVendorProps {
  data: PnlVendorCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsVendor({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsVendorProps) {
  const gap = data ? selfOperateGap(data) : undefined

  return (
    <AnalyticsSection
      id="vendor"
      title="Vendor Execution"
      subtitle="What third-party vendors cost against ESP's own cost on the same airline"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      <ShareBlock
        what="Vendors"
        nameHeader="Vendor"
        share={data ? vendorExecution(data) : undefined}
        isLoading={isLoading}
        isError={isError}
      />

      {isError || !gap ? (
        <AbsentNote what="Vendor costs" />
      ) : gap.rows.length === 0 ? (
        <p data-testid="self-operate-empty" className="text-sm text-muted-foreground">
          No vendor shares an airline with ESP in this period, so there is no comparable baseline
          for a self-operate gap.
        </p>
      ) : (
        <div className="space-y-2">
          <p data-testid="self-operate-total" className="text-sm">
            Self-operate gap: <strong>{fmt.format(gap.totalImpact)}</strong> — the extra cost paid to
            vendors versus ESP&apos;s own per-kg cost on the same airline. Operating that tonnage
            would tie up {fmt.format(gap.totalCapital)}.
          </p>
          <AnalyticsTable<SelfOperateRow>
            columns={[
              { key: 'airline', header: 'Airline', cell: (r) => r.airline },
              { key: 'vendor', header: 'Vendor', cell: (r) => r.vendor },
              {
                key: 'weight',
                header: 'Weight',
                align: 'right',
                cell: (r) => num(Math.round(r.vendorWeight)),
              },
              {
                key: 'vendorCostPerKg',
                header: 'Vendor / kg',
                align: 'right',
                cell: (r) => fmt.format(r.vendorCostPerKg),
              },
              {
                key: 'espCostPerKg',
                header: 'ESP / kg',
                align: 'right',
                cell: (r) => fmt.format(r.espCostPerKg),
              },
              {
                key: 'gapPerKg',
                header: 'Gap / kg',
                align: 'right',
                cell: (r) => fmt.format(r.gapPerKg),
              },
              { key: 'impact', header: 'Impact', align: 'right', cell: (r) => fmt.format(r.impact) },
            ]}
            rows={gap.rows}
            rowKey={(r) => `${r.vendor}|${r.airline}`}
            // A negative gap means the vendor is cheaper than ESP on that airline — worth seeing,
            // not worth hiding.
            rowClassName={(r) => (r.gapPerKg < 0 ? 'text-emerald-700' : undefined)}
          />
        </div>
      )}
    </AnalyticsSection>
  )
}
