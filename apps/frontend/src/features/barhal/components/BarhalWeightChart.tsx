'use client'

import { BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardHead, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { CHART_STATUS } from '@/lib/chart-colors'
import { BarhalChartByDateItem } from '../types'

interface BarhalWeightChartProps {
  data: BarhalChartByDateItem[]
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

interface TooltipPayload {
  payload: BarhalChartByDateItem
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{p.date}</p>
      <p className="text-muted-foreground">Weight Before: {fmt.format(p.weightBefore)} kg</p>
      <p className="text-muted-foreground">Weight After: {fmt.format(p.weightAfter)} kg</p>
      <p className="text-muted-foreground">ChWt: {fmt.format(p.chwt)} kg</p>
    </div>
  )
}

export function BarhalWeightChart({ data }: BarhalWeightChartProps) {
  if (data.length === 0) {
    return <EmptyState title="No data for this range." />
  }

  return (
    <Card>
      <CardHead icon={BarChart3} tone="info" title="Weight Before / After / ChWt per Tanggal" />
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_STATUS.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="weightBefore" name="Weight Before" fill={CHART_STATUS.info} radius={[4, 4, 0, 0]} />
            <Bar dataKey="weightAfter" name="Weight After" fill={CHART_STATUS.good} radius={[4, 4, 0, 0]} />
            <Bar dataKey="chwt" name="ChWt" fill={CHART_STATUS.warn} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
