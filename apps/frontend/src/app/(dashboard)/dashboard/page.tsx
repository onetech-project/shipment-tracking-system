'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, RefreshCw, Settings, Ship } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/shared/api/client'
import { Button } from '@/components/ui/button'
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
import { ModeTabs } from '@/components/ui/segmented'

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

const JAKARTA_DATE_FMT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
})
const JAKARTA_TIME_FMT = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
})

/** "<tanggal> · <jam> WIB", derived from the browser clock — refreshed every minute so the
 *  hero's eyebrow pill never goes visibly stale while the page stays open. */
function useJakartaClock(): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setLabel(`${JAKARTA_DATE_FMT.format(now)} · ${JAKARTA_TIME_FMT.format(now)} WIB`)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])
  return label
}

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const canReadSla = hasPermission('read.sla')
  const router = useRouter()
  const clock = useJakartaClock()

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
      {/* ── Hero ── */}
      <div className="mb-[18px] rounded-lg bg-[linear-gradient(135deg,#1a2420_0%,#223029_100%)] px-[26px] py-[22px] text-white">
        <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.08] px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#c5d0c5]">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isConnected ? 'bg-brand-2 motion-safe:animate-pulse-soft' : 'bg-faint',
                )}
                aria-hidden="true"
              />
              {isConnected ? 'Online' : 'Offline'} · {clock}
            </div>
            <h1 className="mb-1 font-display text-2xl font-bold tracking-[-0.02em]">
              Welcome back, <span className="text-brand-light">{user?.username}</span>
            </h1>
            <p className="max-w-[640px] text-[13.5px] text-[#c5d0c5]">
              Ringkasan operasional hari ini. Periode{' '}
              <em className="font-semibold not-italic text-brand-light">
                {startDate} – {endDate}
              </em>
              , SLA refresh live.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              type="button"
              variant="ghost-dark"
              size="sm"
              onClick={() => void fetchAlertSummary()}
              disabled={!canReadSla || summaryLoading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </Button>
            {canReadSla && (
              <Button type="button" variant="ghost-dark" size="sm" onClick={() => setShowConfigModal(true)}>
                <Settings size={14} aria-hidden="true" />
                Configure
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-6">
        {canReadSla && (
          <>
            <ModeTabs
              value={mode.key}
              onValueChange={(key) => setMode(DASHBOARD_MODES.find((m) => m.key === key) ?? AIR_SLA_MODE)}
              items={DASHBOARD_MODES.map((m) => ({
                value: m.key,
                label: m.key === 'air' ? 'Air' : 'Sea',
                icon: m.key === 'air' ? Plane : Ship,
              }))}
              aria-label="Shipment mode"
            />
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
