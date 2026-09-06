'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fmt } from '@/features/pnl/utils/format'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { airlineShare, vendorExecution } from '../utils/share'
import { SERIES_COLORS } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsAirlineProps {
  data: PnlVendorCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsAirline({ data, isLoading, isError, scoped, ranged }: AnalyticsAirlineProps) {
  const airlines = data ? airlineShare(data) : undefined
  const vendors = data ? vendorExecution(data) : undefined
  const pieRows = (airlines?.rows ?? []).filter((r) => r.attributed && r.weight > 0).slice(0, 7)

  return (
    <AnalyticsSection
      id="airline"
      title="SMU & Airline"
      subtitle="Where the main-leg tonnage flies and what it costs"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {pieRows.length > 0 && (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieRows} dataKey="weight" nameKey="name" innerRadius={55} outerRadius={90}>
                {pieRows.map((r, i) => (
                  <Cell key={r.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${Math.round(v)} kg`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <ShareBlock
        what="Airlines"
        nameHeader="Airline"
        share={airlines}
        isLoading={isLoading}
        isError={isError}
      />

      <div>
        <p className="text-sm font-medium">SMU cost by vendor</p>
        <p className="text-xs text-muted-foreground">
          Total cost across all vendors: {vendors ? fmt.format(vendors.rows.reduce((s, r) => s + r.cost, 0)) : '—'}
        </p>
        <ShareBlock
          what="Vendors"
          nameHeader="Vendor"
          share={vendors}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </AnalyticsSection>
  )
}
