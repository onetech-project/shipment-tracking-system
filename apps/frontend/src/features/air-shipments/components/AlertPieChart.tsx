'use client'

import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts'
import { apiClient } from '@/shared/api/client'
import { CHART_COLORS } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'
import { Banner } from '@/components/shared/banner'
import { EmptyState } from '@/components/shared/empty-state'

export type AlertType = 'slaAlert' | 'tjphAlert' | 'ataFlightAlert' | 'atdFlightAlert' | 'smuAlert'

export interface AlertSummary {
  slaAlert: number
  tjphAlert: number
  ataFlightAlert: number
  atdFlightAlert: number
  smuAlert: number
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  slaAlert: 'SLA Alert',
  tjphAlert: 'TJPH Alert',
  ataFlightAlert: 'ATA Flight Alert',
  atdFlightAlert: 'ATD Flight Alert',
  smuAlert: 'SMU Alert',
}

// Categorical slice colors from the app's CHART_COLORS palette (bad, warn, info, brand-alt, neutral).
const ALERT_COLORS: Record<AlertType, string> = {
  slaAlert: CHART_COLORS[7],
  tjphAlert: CHART_COLORS[6],
  ataFlightAlert: CHART_COLORS[5],
  atdFlightAlert: CHART_COLORS[1],
  smuAlert: CHART_COLORS[8],
}

const ALERT_KEYS: AlertType[] = [
  'slaAlert',
  'tjphAlert',
  'ataFlightAlert',
  'atdFlightAlert',
  'smuAlert',
]

export interface AlertPieChartProps {
  tableName: string
  activeAlert: AlertType | null
  onAlertSelect: (alertType: AlertType | null) => void
  affectedTables: string[]
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function CustomTooltip({ active, payload }: TooltipProps<any, string>) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as { name: string; value: number; percent: number }
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-soft-md">
      <div className="font-semibold text-foreground">{item.name}</div>
      <div className="text-muted-foreground">Count: {item.value}</div>
      <div className="text-muted-foreground">Share: {formatPercent(item.percent * 100)}</div>
    </div>
  )
}

export function AlertPieChart({
  tableName,
  activeAlert,
  onAlertSelect,
  affectedTables,
}: AlertPieChartProps) {
  const [summary, setSummary] = useState<AlertSummary>({
    slaAlert: 0,
    tjphAlert: 0,
    ataFlightAlert: 0,
    atdFlightAlert: 0,
    smuAlert: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiClient.get<AlertSummary>(
        `/air-shipments/${tableName}/alert-summary`
      )
      setSummary(response.data)
    } catch (err: unknown) {
      setError('Failed to load alert summary')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName])

  useEffect(() => {
    if (affectedTables.includes(tableName)) {
      void fetchSummary()
    }
  }, [affectedTables, tableName])

  const data = useMemo(() => {
    const values = ALERT_KEYS.map((key) => ({
      key,
      name: ALERT_TYPE_LABELS[key],
      value: Number(summary[key]),
      color: ALERT_COLORS[key],
    }))

    const total = values.reduce((sum, item) => sum + Number(item.value), 0)
    return values.map((item) => ({
      ...item,
      percent: total > 0 ? Number(item.value) / total : 0,
    }))
  }, [summary])

  const totalCount = data.reduce((sum, item) => sum + Number(item.value), 0)
  const hasData = totalCount > 0

  return (
    <section aria-labelledby="alert-pie-chart-heading" className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="alert-pie-chart-heading" className="font-display text-sm font-bold tracking-[-0.01em] text-foreground">
            Shipment Alerts
          </h2>
          <p className="text-xs font-medium text-faint">
            Review alert volume and click a slice to filter rows.
          </p>
        </div>
        <div className="tabular text-xs text-muted-foreground">
          {isLoading ? 'Loading summary…' : `${totalCount} total alert matches`}
        </div>
      </div>

      <div className="px-[18px] pb-4 pt-4">
      {error ? (
        <Banner tone="danger">{error}</Banner>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="h-[400px] w-full">
            {hasData ? (
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                    stroke="transparent"
                    onClick={(entry) => {
                      const key = (entry as any)?.payload?.key as AlertType | undefined
                      if (!key) return
                      onAlertSelect(activeAlert === key ? null : key)
                    }}
                    cursor="pointer"
                  >
                    {data.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.color}
                        // '#1f2a22' is the design system's `ink-2` token, used literally since recharts needs a raw color.
                        stroke={activeAlert === entry.key ? '#1f2a22' : 'transparent'}
                        strokeWidth={activeAlert === entry.key ? 4 : 0}
                        fillOpacity={entry.value > 0 ? 1 : 0.36}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                className="h-full"
                title={isLoading ? 'Loading chart...' : 'No alert counts available for this shipment table.'}
              />
            )}
          </div>

          <div className="flex flex-wrap flex-row items-start gap-3 md:justify-between">
            {data.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onAlertSelect(activeAlert === item.key ? null : item.key)}
                className={cn(
                  'flex w-full sm:w-auto items-center justify-between gap-3 rounded-md border px-3 py-2 text-left motion-safe:transition-colors hover:border-border-strong',
                  activeAlert === item.key ? 'border-primary bg-brand-soft' : 'border-border bg-card',
                )}
                aria-pressed={activeAlert === item.key}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.value} rows</div>
                  </div>
                </div>
                <span className="tabular text-xs text-muted-foreground">
                  {formatPercent(item.percent * 100)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
