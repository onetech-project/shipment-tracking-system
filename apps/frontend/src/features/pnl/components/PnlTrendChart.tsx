'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { PnlTrendItem } from '../hooks/usePnl'

const fmtIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'IDR' }).format(v)

interface PnlTrendChartProps {
  data: PnlTrendItem[]
}

export function PnlTrendChart({ data }: PnlTrendChartProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-4 text-sm font-medium">Revenue vs Cost vs Profit — All Cycles</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="cyclePeriod" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtIDR} tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={(value: number) => fmtIDR(value)} />
          <Legend />
          <Line type="monotone" dataKey="totalRevenue" name="Revenue"     stroke="#3B82F6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="totalCost"    name="Cost"        stroke="#EF4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="grossProfit"  name="Gross Profit" stroke="#22C55E" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
