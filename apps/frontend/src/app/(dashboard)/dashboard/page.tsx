'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { AIR_SLA_MODE, SEA_SLA_MODE, type SlaMode } from '@/features/air-shipments/sla-mode.config'
import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { cn } from '@/lib/utils'

const DASHBOARD_MODES: SlaMode[] = [AIR_SLA_MODE, SEA_SLA_MODE]

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDateRange(): { start: string; end: string } {
  const today = new Date()
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  if (today.getUTCDate() <= 15) {
    return {
      start: toDateStr(new Date(Date.UTC(y, m, 1))),
      end: toDateStr(new Date(Date.UTC(y, m, 15))),
    }
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return {
    start: toDateStr(new Date(Date.UTC(y, m, 16))),
    end: toDateStr(new Date(Date.UTC(y, m, lastDay))),
  }
}


export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const canReadSla = hasPermission('read.sla')
  const router = useRouter()

  const [mode, setMode] = useState<SlaMode>(AIR_SLA_MODE)
  const [startDate, setStartDate] = useState(() => defaultDateRange().start)
  const [endDate, setEndDate] = useState(() => defaultDateRange().end)
  const [dateError, setDateError] = useState<string | null>(null)

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await apiClient.get<DashboardAlertSummary>(
        `/air-shipments/${mode.tableName}/alert-summary?startDate=${startDate}&endDate=${endDate}`
      )
      setSummary(response.data)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (!paramsLoaded) return
    if (!canReadSla) return
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    if (diff < 0) { setDateError('End date must be after start date.'); return }
    if (diff > 60) { setDateError('Date range cannot exceed 60 days.'); return }
    setDateError(null)
    void fetchAlertSummary()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, paramsLoaded, canReadSla, mode])

  useEffect(() => {
    if (!canReadSla) return
    if (lastCompletedSheet === mode.syncSheetKey) {
      void fetchAlertSummary()
      setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCompletedSheet, canReadSla, mode])

  const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) => {
    const params = new URLSearchParams()
    params.set('alert', alertKey)
    params.set('route', route)
    params.set('startDate', startDate)
    params.set('endDate', endDate)
    router.push(`/sla/${mode.key}?${params.toString()}`)
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      <section className="space-y-6">
        <div className="rounded-3xl border border-border bg-panel p-6 shadow-sm">
          <div className="text-xl font-semibold text-foreground">
            Welcome back, {user?.username}
          </div>
        </div>

        {canReadSla && (
          <>
            <nav className="flex gap-1 border-b border-border">
              {DASHBOARD_MODES.map((m) => {
                const isActive = m.key === mode.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {m.key === 'air' ? 'Air' : 'Sea'}
                  </button>
                )
              })}
            </nav>
            <DashboardAlertCards
              summary={summary}
              activeAlert={null}
              onRouteSelect={handleRouteSelect}
              alertCards={mode.alerts}
              isLoading={summaryLoading}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              dateError={dateError}
              lastUpdated={lastUpdated}
              syncNote={mode.syncNote}
              onConfigure={() => setShowConfigModal(true)}
              isConnected={isConnected}
              lastSyncAt={lastSyncAt}
            />
            <GeneralParamsModal
              open={showConfigModal}
              onClose={() => setShowConfigModal(false)}
              onSaved={() => {
                void reloadGeneralParams().then(() => {
                  void fetchAlertSummary()
                  setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
                })
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
