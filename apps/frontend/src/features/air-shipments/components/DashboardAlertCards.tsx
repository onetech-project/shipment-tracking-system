'use client'

import { useState, type ElementType } from 'react'
import {
  AlertTriangle,
  Hourglass,
  PlaneLanding,
  Clock,
  ShieldAlert,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'

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

export interface OtpSummary {
  percentage: number
  onTimeWeight: number
  lateWeight: number
  breakdown: Array<{ route: string; percentage: number; onTimeWeight: number; lateWeight: number }>
}

export interface DashboardAlertSummary {
  nHours: number
  mHours: number
  alerts: Record<DashboardAlertKey, AlertSummaryItem>
  otp?: OtpSummary
}

interface DashboardAlertCardsProps {
  summary: DashboardAlertSummary | null
  activeAlert: DashboardAlertKey | null
  onRouteSelect: (alertKey: DashboardAlertKey, route: string) => void
  isLoading?: boolean
  error?: string | null
  // Date range filter (optional — if provided, shows date pickers in header)
  startDate?: string
  endDate?: string
  onStartDateChange?: (d: string) => void
  onEndDateChange?: (d: string) => void
  dateError?: string | null
  // Status / meta
  lastUpdated?: string | null
  syncNote?: string
  onConfigure?: () => void
  isConnected?: boolean
  lastSyncAt?: string | null
}

const ALERT_CARDS: Array<{
  key: DashboardAlertKey
  label: string
  color: string
  icon: ElementType
}> = [
  { key: 'reservasiPenerbangan', label: 'Flight Reservations', color: '#F97316', icon: Clock },
  { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', color: '#EAB308', icon: Hourglass },
  { key: 'melewatiSla', label: 'SLA Breach', color: '#EF4444', icon: AlertTriangle },
  { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', color: '#8B5CF6', icon: PlaneLanding },
  { key: 'melewatiTjph', label: 'TJPH Breach', color: '#DC2626', icon: ShieldAlert },
]

export function DashboardAlertCards({
  summary,
  activeAlert,
  onRouteSelect,
  isLoading,
  error,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  dateError,
  lastUpdated,
  syncNote,
  onConfigure,
  isConnected,
  lastSyncAt,
}: DashboardAlertCardsProps) {
  const [expandedKey, setExpandedKey] = useState<DashboardAlertKey | null>(null)
  const [otpExpanded, setOtpExpanded] = useState(false)

  const handleCardClick = (key: DashboardAlertKey) => {
    setExpandedKey((prev) => (prev === key ? null : key))
    if (summary?.alerts[key]?.breakdown?.length === 0) return
  }

  const showDatePickers = !!(startDate !== undefined && onStartDateChange && onEndDateChange)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section
      aria-labelledby="dashboard-alert-cards-heading"
      className="rounded-3xl border border-border bg-panel p-6 shadow-sm"
    >
      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-0.5 min-w-0">
            <h2 id="dashboard-alert-cards-heading" className="text-lg font-semibold text-foreground">
              Shipment Alerts
            </h2>
            {lastUpdated !== undefined && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {lastUpdated ? `Last updated: ${lastUpdated}` : 'Waiting for data...'}
              </p>
            )}
            {syncNote && <p className="text-sm text-muted-foreground">{syncNote}</p>}
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading alert data…' : error ?? ''}
            </p>
          </div>

          {/* Right side: date pickers + n/m hours + configure + sync */}
          <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            {showDatePickers && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-slate-700">Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(e) => onStartDateChange!(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-slate-700">End Date</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={today}
                    onChange={(e) => onEndDateChange!(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </>
            )}
            {summary && !isLoading && (
              <div className="flex items-center self-end pb-1.5">
                <span className="text-xs text-muted-foreground">n={summary.nHours}h · m={summary.mHours}h</span>
              </div>
            )}
            {onConfigure && (
              <button
                type="button"
                onClick={onConfigure}
                className="self-end inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Settings size={14} />
                Configure
              </button>
            )}
            {isConnected !== undefined && (
              <div className="self-end">
                <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt ?? null} />
              </div>
            )}
          </div>
        </div>

        {dateError && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {dateError}
          </div>
        )}
      </div>

      {/* ── Alert Cards Grid ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALERT_CARDS.map((card) => {
          const item = summary?.alerts[card.key]
          const routes = item?.routes ?? 0
          const tonnage = item?.tonnage ?? 0
          const breakdown = item?.breakdown ?? []
          const isExpanded = expandedKey === card.key
          const isActive = activeAlert === card.key
          const Icon = card.icon

          return (
            <div key={card.key} className="relative">
              <button
                type="button"
                onClick={() => handleCardClick(card.key)}
                className={cn(
                  'group flex w-full flex-col justify-between rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2',
                  isActive ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-border bg-background'
                )}
                aria-pressed={isActive}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{card.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${card.color}22`, color: card.color }}
                    >
                      <Icon size={16} />
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-3xl font-semibold text-foreground">{isLoading ? '—' : routes}</p>
                    <p className="text-xs text-muted-foreground">impacted routes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium text-foreground">
                      {isLoading ? '—' : tonnage.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
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
                              onClick={() => { onRouteSelect(card.key, route); setExpandedKey(null) }}
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

        {/* ── On Time Performance Card ── */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOtpExpanded((prev) => !prev)}
            className="group flex w-full flex-col justify-between rounded-3xl border border-border bg-background p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
            aria-expanded={otpExpanded}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">On Time Performance</span>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#22C55E22', color: '#22C55E' }}
                >
                  <CheckCircle size={16} />
                </span>
                {otpExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold text-foreground">
                  {isLoading ? '—' : `${summary?.otp?.percentage ?? 0}%`}
                </p>
                <p className="text-xs text-muted-foreground">on time</p>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>
                    {isLoading ? '—' : (summary?.otp?.onTimeWeight ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">on time kg</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>
                    {isLoading ? '—' : (summary?.otp?.lateWeight ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">late kg</p>
                </div>
              </div>
            </div>
          </button>

          {otpExpanded && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl border border-border bg-background shadow-xl">
              {(summary?.otp?.breakdown?.length ?? 0) > 0 ? (
                <>
                  <p className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    On Time Performance by Route
                  </p>
                  <div className="max-h-64 overflow-y-auto overflow-x-auto">
                    <table className="w-full min-w-[480px] text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Route</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">OTP %</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">On Time (kg)</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Late (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary!.otp!.breakdown.map(({ route, percentage, onTimeWeight, lateWeight }) => (
                          <tr key={route} className="border-t border-border/50">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <MapPin size={11} className="shrink-0 text-muted-foreground" />
                                {route}
                              </span>
                            </td>
                            <td
                              className="px-3 py-2 text-right font-medium"
                              style={{ color: percentage >= 80 ? '#22C55E' : percentage >= 50 ? '#EAB308' : '#EF4444' }}
                            >
                              {percentage}%
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {onTimeWeight.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {lateWeight.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">No completed shipments in this period.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
