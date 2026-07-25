'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalDashboardStats, exportBarhalCsv } from '@/features/barhal/hooks/useBarhalDashboard'
import { useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalStatCards } from '@/features/barhal/components/BarhalStatCards'
import { BarhalWeightChart } from '@/features/barhal/components/BarhalWeightChart'
import { BarhalRecapBatangKayuTable } from '@/features/barhal/components/BarhalRecapBatangKayuTable'
import { BarhalRecapToTable } from '@/features/barhal/components/BarhalRecapToTable'
import { triggerBlobDownload } from '@/shared/utils/file-download.util'

function BarhalDashboardContent() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data: stations } = useBarhalStations()
  const { data, isLoading, isError, refetch } = useBarhalDashboardStats({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
  })

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await exportBarhalCsv({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        origin: origin || undefined,
        dest: dest || undefined,
      })
      triggerBlobDownload(blob, `barhal-${startDate || 'all'}_${endDate || 'all'}.csv`)
    } catch (err) {
      window.alert(`Failed to export: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barhal Dashboard</h1>
          <p className="text-sm text-muted-foreground">Statistik packing kayu &amp; Koli</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
        >
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <BarhalTabNav active="dashboard" />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Semua Origin</option>
          {(stations?.origins ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load dashboard data.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <BarhalStatCards kpi={data.kpi} />
          <BarhalWeightChart data={data.chartByDate} />

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Batang Kayu</p>
            <BarhalRecapBatangKayuTable data={data.recapBatangKayu} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Tanggal</p>
            <BarhalRecapToTable rows={data.recapPerTanggal} groupColumnLabel="Date" />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Rute</p>
            <BarhalRecapToTable rows={data.recapPerRute} groupColumnLabel="Rute" />
          </div>
        </>
      )}
    </div>
  )
}

export default function BarhalDashboardPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.barhal')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.barhal')) return null

  return <BarhalDashboardContent />
}
