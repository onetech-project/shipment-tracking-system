'use client'

import { useState, type ElementType } from 'react'
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LiveBadge } from '@/components/shared/header-badges'
import { FilterBar } from '@/components/shared/filter-bar'
import { Banner } from '@/components/shared/banner'
import { IconSquare, type IconTone } from '@/components/shared/icon-square'
import {
  TableWrap,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

/** Alert keys are mode-driven (see sla-mode.config); kept as a string alias for readability. */
export type DashboardAlertKey = string

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
  alerts: Record<string, AlertSummaryItem>
  otp?: OtpSummary
}

interface DashboardAlertCardsProps {
  summary: DashboardAlertSummary | null
  activeAlert: DashboardAlertKey | null
  onRouteSelect: (alertKey: DashboardAlertKey, route: string) => void
  /** Alert cards to render, in order — sourced from the active SlaMode. */
  alertCards: Array<{ key: string; label: string; color: string; icon: ElementType }>
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

/**
 * Semantic icon tone per alert category, matching the mockup's `.alert-kpi.<kind>` colour
 * classes (reservation → brand, tracking → alt, potential breach → warn, breach/TJPH/SPX → danger).
 */
function alertTone(key: string): IconTone {
  const k = key.toLowerCase()
  if (k.includes('reservasi')) return 'brand'
  if (k === 'flighttracking') return 'alt'
  if (k.includes('potensi')) return 'warn'
  return 'danger'
}

function formatRelativeSync(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Never'
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

export function DashboardAlertCards({
  summary,
  activeAlert,
  onRouteSelect,
  alertCards,
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
  const otpPercentage = summary?.otp?.percentage ?? 0

  return (
    <section
      aria-labelledby="dashboard-alert-cards-heading"
      className="rounded-lg border bg-card p-6 shadow-soft-sm"
    >
      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-0.5 min-w-0">
            <h2 id="dashboard-alert-cards-heading" className="font-display text-lg font-bold text-foreground">
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

          {/* Right side: configure + live/sync indicator */}
          <div className="flex flex-wrap items-end gap-2 lg:justify-end">
            {onConfigure && (
              <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
                <Settings size={14} aria-hidden="true" />
                Configure
              </Button>
            )}
            {isConnected !== undefined && (
              <div className="flex items-center gap-2 self-end">
                {isConnected ? <LiveBadge /> : <Badge variant="neutral">Offline</Badge>}
                {lastSyncAt && (
                  <span className="text-xs text-muted-foreground">
                    Last sync: {formatRelativeSync(lastSyncAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {showDatePickers && (
          <FilterBar>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">Start Date</span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => onStartDateChange!(e.target.value)}
                className="rounded-sm border border-border bg-card px-2 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">End Date</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => onEndDateChange!(e.target.value)}
                className="rounded-sm border border-border bg-card px-2 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            {summary && !isLoading && (
              <span className="self-end pb-1.5 text-xs text-muted-foreground">
                n={summary.nHours}h · m={summary.mHours}h
              </span>
            )}
          </FilterBar>
        )}

        {dateError && <Banner tone="danger">{dateError}</Banner>}
      </div>

      {/* ── Alert Cards Grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
        {alertCards.map((card) => {
          const item = summary?.alerts[card.key]
          const routes = item?.routes ?? 0
          const tonnage = item?.tonnage ?? 0
          const breakdown = item?.breakdown ?? []
          const isExpanded = expandedKey === card.key
          const isActive = activeAlert === card.key
          const Icon = card.icon as LucideIcon
          const tone = alertTone(card.key)
          const isZero = !isLoading && routes === 0

          return (
            <div key={card.key} className="relative">
              <button
                type="button"
                onClick={() => handleCardClick(card.key)}
                className={cn(
                  'group flex w-full flex-col rounded-lg border bg-card px-[15px] py-3.5 text-left motion-safe:transition-shadow hover:border-border-strong hover:shadow-soft-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'border-primary bg-brand-soft shadow-soft-md' : 'border-border',
                )}
                aria-pressed={isActive}
                aria-expanded={isExpanded}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                    {card.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IconSquare icon={Icon} tone={tone} size="sm" />
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    'tabular font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]',
                    isZero ? 'text-faint' : 'text-foreground',
                  )}
                >
                  {isLoading ? '—' : routes}
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-dashed border-border pt-1.5 text-[10.5px] text-muted-foreground">
                  <span>
                    impacted routes <strong className="tabular font-bold text-foreground">{isLoading ? '—' : routes}</strong>
                  </span>
                  <span>
                    kg total{' '}
                    <strong className="tabular font-bold text-foreground">
                      {isLoading ? '—' : tonnage.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    </strong>
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-soft-md">
                  {breakdown.length > 0 ? (
                    <>
                      <p className="border-b border-border bg-table-head px-4 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                        Breakdown by Route
                      </p>
                      <ul className="max-h-52 overflow-y-auto py-1">
                        {breakdown.map(({ route, tonnage: t }) => (
                          <li key={route}>
                            <button
                              type="button"
                              onClick={() => {
                                onRouteSelect(card.key, route)
                                setExpandedKey(null)
                              }}
                              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm motion-safe:transition-colors hover:bg-row-hover focus:bg-row-hover focus:outline-none"
                            >
                              <span className="flex items-center gap-1.5 text-foreground">
                                <MapPin size={12} className="shrink-0 text-muted-foreground" />
                                {route}
                              </span>
                              <span className="ml-3 shrink-0 text-xs tabular text-muted-foreground">
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
            className="group flex w-full flex-col rounded-lg border border-border bg-card px-[15px] py-3.5 text-left motion-safe:transition-shadow hover:border-border-strong hover:shadow-soft-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={otpExpanded}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                On Time Performance
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <IconSquare icon={CheckCircle} tone="brand" size="sm" />
                {otpExpanded ? (
                  <ChevronUp size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={14} className="text-muted-foreground" />
                )}
              </div>
            </div>

            <div
              className={cn(
                'tabular font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]',
                !isLoading && otpPercentage === 0 ? 'text-faint' : 'text-foreground',
              )}
            >
              {isLoading ? '—' : `${otpPercentage}%`}
            </div>
            <div className="text-[10.5px] text-muted-foreground">on time</div>

            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand-2"
                style={{ width: `${isLoading ? 0 : otpPercentage}%` }}
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-dashed border-border pt-1.5 text-[10.5px] text-muted-foreground">
              <span>
                on time kg{' '}
                <strong className="tabular font-bold text-good">
                  {isLoading ? '—' : (summary?.otp?.onTimeWeight ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span>
                late kg{' '}
                <strong className="tabular font-bold text-bad-strong">
                  {isLoading ? '—' : (summary?.otp?.lateWeight ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
          </button>

          {otpExpanded && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-soft-md">
              {(summary?.otp?.breakdown?.length ?? 0) > 0 ? (
                <>
                  <p className="border-b border-border bg-table-head px-4 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    On Time Performance by Route
                  </p>
                  <TableWrap className="max-h-64 overflow-y-auto rounded-none border-0">
                    <Table className="min-w-[480px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Route</TableHead>
                          <TableHead num>OTP %</TableHead>
                          <TableHead num>On Time (kg)</TableHead>
                          <TableHead num>Late (kg)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary!.otp!.breakdown.map(({ route, percentage, onTimeWeight, lateWeight }) => (
                          <TableRow key={route}>
                            <TableCell>
                              <span className="flex items-center gap-1.5 text-foreground">
                                <MapPin size={11} className="shrink-0 text-muted-foreground" />
                                {route}
                              </span>
                            </TableCell>
                            <TableCell
                              num
                              className={cn(
                                'font-medium',
                                percentage >= 80 ? 'text-good' : percentage >= 50 ? 'text-warn' : 'text-bad-strong',
                              )}
                            >
                              {percentage}%
                            </TableCell>
                            <TableCell num className="text-muted-foreground">
                              {onTimeWeight.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell num className="text-muted-foreground">
                              {lateWeight.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrap>
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
