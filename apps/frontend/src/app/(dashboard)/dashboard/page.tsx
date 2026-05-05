'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { Settings } from 'lucide-react'
import { useAuth } from '@/features/auth/auth.context'

const TABLE_ENDPOINT = `/air-shipments/air_shipments_compileaircgk`

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams } = useGeneralParams()
  const { user } = useAuth()
  const router = useRouter()

  const days = useMemo(() => {
    const p = generalParams.find((p) => p.key === 'days_range')
    return p ? parseInt(p.value, 10) || 30 : 30
  }, [generalParams])

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await apiClient.get<DashboardAlertSummary>(
        `${TABLE_ENDPOINT}/alert-summary?days=${days}`
      )
      setSummary(response.data)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    void fetchAlertSummary()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

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
          <p className="mt-2 text-sm text-muted-foreground">
            Operational monitoring for the last {days} days.
          </p>
        </div>

        <DashboardAlertCards
          summary={summary}
          activeAlert={null}
          onRouteSelect={handleRouteSelect}
          isLoading={summaryLoading}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {lastUpdated ? `Last updated: ${lastUpdated}` : 'Waiting for data...'}
            </p>
            <p className="text-sm text-muted-foreground">
              Live refresh is active for Compile Air CGK synchronization.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Settings size={14} />
              Configure
            </button>
            <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
          </div>
        </div>

        <GeneralParamsModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            void reloadGeneralParams().then(() => {
              void fetchAlertSummary()
            })
          }}
        />
      </section>
    </div>
  )
}
