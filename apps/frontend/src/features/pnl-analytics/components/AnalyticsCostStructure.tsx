'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmt, pct } from '@/features/pnl/utils/format'
import { SeriesDay } from '../types'
import { COST_COMPONENTS, costComposition } from '../utils/series'
import { COMPONENT_COLORS, formatDateLabel } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsCostStructureProps {
  series: SeriesDay[]
}

export function AnalyticsCostStructure({ series }: AnalyticsCostStructureProps) {
  const comp = costComposition(series)
  const data = series.map((d) => ({
    label: formatDateLabel(d.date),
    costSmu: d.costSmu,
    costRa: d.costRa,
    costSgOut: d.costSgOut,
    costSgIn: d.costSgIn,
  }))

  return (
    <AnalyticsSection
      id="cost-structure"
      title="Cost Structure"
      subtitle={`Total ${fmt.format(comp.total)} — ${fmt.format(comp.totalPerKg)} / kg`}
    >
      {comp.total === 0 ? (
        <p data-testid="analytics-cost-empty" className="text-sm text-muted-foreground">
          No cost has been attributed in this period, so there is no structure to break down.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {comp.components.map((c) => (
              <div
                key={c.key}
                data-testid={`cost-component-${c.key}`}
                className="rounded-md border p-2"
              >
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COMPONENT_COLORS[c.key] }}
                  />
                  {c.label}
                </p>
                <p className="text-sm font-semibold tabular-nums">{fmt.format(c.value)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {pct(c.pct)} · {fmt.format(c.perKg)} / kg
                </p>
              </div>
            ))}
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt.format(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* dataKey is the SeriesDay FIELD (costSmu…); the colour map is keyed by the
                    component key (smu…). Swapping the two renders four empty bars. */}
                {COST_COMPONENTS.map((c) => (
                  <Bar
                    key={c.key}
                    dataKey={c.field}
                    stackId="cost"
                    name={c.label}
                    fill={COMPONENT_COLORS[c.key]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </AnalyticsSection>
  )
}
