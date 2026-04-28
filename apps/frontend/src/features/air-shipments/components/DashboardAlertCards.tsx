'use client'

import { useState, type ElementType } from 'react'
import {
  AlertTriangle,
  Hourglass,
  PlaneLanding,
  Clock,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type DashboardAlertKey =
  | 'reservasiPenerbangan'
  | 'potensiMelebihiSla'
  | 'melewatiSla'
  | 'potensiMelebihiTjph'
  | 'melewatiTjph'

export interface AlertSummaryItem {
  routes: number
  tonnage: number
  breakdown: Array<{ route: string; tonnage: number }>
}

export interface DashboardAlertSummary {
  nHours: number
  mHours: number
  alerts: Record<DashboardAlertKey, AlertSummaryItem>
}

interface DashboardAlertCardsProps {
  summary: DashboardAlertSummary | null
  activeAlert: DashboardAlertKey | null
  onRouteSelect: (alertKey: DashboardAlertKey, route: string) => void
  isLoading?: boolean
  error?: string | null
}

const ALERT_CARDS: Array<{
  key: DashboardAlertKey
  label: string
  color: string
  icon: ElementType
}> = [
  { key: 'reservasiPenerbangan', label: 'Reservasi Penerbangan', color: '#F97316', icon: Clock },
  { key: 'potensiMelebihiSla', label: 'Potensi Melebihi SLA', color: '#EAB308', icon: Hourglass },
  { key: 'melewatiSla', label: 'Melewati SLA', color: '#EF4444', icon: AlertTriangle },
  {
    key: 'potensiMelebihiTjph',
    label: 'Potensi Melebihi TJPH',
    color: '#8B5CF6',
    icon: PlaneLanding,
  },
  { key: 'melewatiTjph', label: 'Melewati TJPH', color: '#DC2626', icon: ShieldAlert },
]

export function DashboardAlertCards({
  summary,
  activeAlert,
  onRouteSelect,
  isLoading,
  error,
}: DashboardAlertCardsProps) {
  const [expandedKey, setExpandedKey] = useState<DashboardAlertKey | null>(null)

  const handleCardClick = (key: DashboardAlertKey) => {
    setExpandedKey((prev) => (prev === key ? null : key))
    if (summary?.alerts[key]?.breakdown?.length === 0) return
  }

  return (
    <section
      aria-labelledby="dashboard-alert-cards-heading"
      className="rounded-3xl border border-border bg-panel p-6 shadow-sm"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="dashboard-alert-cards-heading" className="text-lg font-semibold text-foreground">
            Shipment Alerts
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading alert data…' : error ? error : ''}
          </p>
        </div>
        {summary && !isLoading && (
          <div className="text-xs text-muted-foreground">
            n={summary.nHours}h · m={summary.mHours}h
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALERT_CARDS.map((card) => {
          const item = summary?.alerts[card.key]
          const routes = item?.routes ?? 0
          const tonnage = item?.tonnage ?? 0
          const breakdown = item?.breakdown ?? []
          const isExpanded = expandedKey === card.key
          const isActive = activeAlert === card.key
          const Icon = card.icon

          return (
            <div
              key={card.key}
              className="relative"
            >
              <button
                type="button"
                onClick={() => handleCardClick(card.key)}
                className={cn(
                  'group flex w-full flex-col justify-between rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2',
                  isActive ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-border bg-background',
                )}
                aria-pressed={isActive}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{card.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${card.color}22`, color: card.color }}
                    >
                      <Icon size={16} />
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-semibold text-foreground">
                      {isLoading ? '—' : routes}
                    </p>
                    <p className="text-xs text-muted-foreground">impacted routes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium text-foreground">
                      {isLoading
                        ? '—'
                        : tonnage.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">kg total</p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl border border-border bg-background shadow-xl">
                  {breakdown.length > 0 ? (
                    <>
                      <p className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Breakdown by Route
                      </p>
                      <ul className="max-h-52 overflow-y-auto py-1">
                        {breakdown.map(({ route, tonnage: t }) => (
                          <li key={route}>
                            <button
                              type="button"
                              onClick={() => onRouteSelect(card.key, route)}
                              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-muted focus:outline-none focus:bg-muted"
                            >
                              <span className="flex items-center gap-1.5 text-foreground">
                                <MapPin size={12} className="shrink-0 text-muted-foreground" />
                                {route}
                              </span>
                              <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                                {t.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No impacted routes.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
