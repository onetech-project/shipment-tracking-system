'use client'
import { useEffect, useMemo, useState } from 'react'
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

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()
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
    if (!paramsLoaded) return
    void fetchAlertSummary()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, paramsLoaded])

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
          days={days}
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
