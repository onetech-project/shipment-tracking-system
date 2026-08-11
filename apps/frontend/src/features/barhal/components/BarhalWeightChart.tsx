'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No data for this range.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-4 text-sm font-medium">Weight Before / After / ChWt per Tanggal</p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="weightBefore" name="Weight Before" fill="#60A5FA" radius={[4, 4, 0, 0]} />
          <Bar dataKey="weightAfter" name="Weight After" fill="#22C55E" radius={[4, 4, 0, 0]} />
          <Bar dataKey="chwt" name="ChWt" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
