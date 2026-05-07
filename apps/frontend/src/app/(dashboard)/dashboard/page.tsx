'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { useAuth } from '@/features/auth/auth.context'

const TABLE_ENDPOINT = `/air-shipments/air_shipments_compileaircgk`

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function computeDays(startDate: string, endDate: string): number {
  const diff = new Date(endDate).getTime() - new Date(startDate).getTime()
  return Math.max(1, Math.round(diff / 86_400_000))
}

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()
  const { user } = useAuth()
  const router = useRouter()

  const daysRange = useMemo(() => {
    const p = generalParams.find((p) => p.key === 'days_range')
    return p ? parseInt(p.value, 10) || 15 : 15
  }, [generalParams])

  const today = toDateStr(new Date())
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 15)
    return toDateStr(d)
  })
  const [endDate, setEndDate] = useState(today)
  const [dateError, setDateError] = useState<string | null>(null)

  const initialDateSet = useRef(false)
  useEffect(() => {
    if (!paramsLoaded || initialDateSet.current) return
    initialDateSet.current = true
    const d = new Date()
    d.setDate(d.getDate() - daysRange)
    setStartDate(toDateStr(d))
    setEndDate(today)
  }, [paramsLoaded, daysRange, today])

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await apiClient.get<DashboardAlertSummary>(
        `${TABLE_ENDPOINT}/alert-summary?days=${computeDays(startDate, endDate)}`
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
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    if (diff < 0) { setDateError('End date must be after start date.'); return }
    if (diff > 60) { setDateError('Date range cannot exceed 60 days.'); return }
    setDateError(null)
    void fetchAlertSummary()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, paramsLoaded])

  useEffect(() => {
    if (lastCompletedSheet === 'compileaircgk') {
      void fetchAlertSummary()
      setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCompletedSheet])

  const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) => {
    const params = new URLSearchParams()
    params.set('alert', alertKey)
    params.set('route', route)
    router.push(`/sla?${params.toString()}`)
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

        <DashboardAlertCards
          summary={summary}
          activeAlert={null}
          onRouteSelect={handleRouteSelect}
          isLoading={summaryLoading}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          dateError={dateError}
          lastUpdated={lastUpdated}
          syncNote="Live refresh is active for Compile Air CGK synchronization."
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
      </section>
    </div>
  )
}
