'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, TreePine, CalendarDays, Route as RouteIcon, FileText } from 'lucide-react'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { isStaging } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { Card, CardHead, CardContent } from '@/components/ui/card'
import { FilterBar } from '@/components/shared/filter-bar'
import { useBarhalDashboardStats, exportBarhalCsv } from '@/features/barhal/hooks/useBarhalDashboard'
import { useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalStatCards } from '@/features/barhal/components/BarhalStatCards'
import { BarhalWeightChart } from '@/features/barhal/components/BarhalWeightChart'
import { BarhalRecapBatangKayuTable } from '@/features/barhal/components/BarhalRecapBatangKayuTable'
import { BarhalRecapToTable } from '@/features/barhal/components/BarhalRecapToTable'
import { BarhalToDetailTable } from '@/features/barhal/components/BarhalToDetailTable'
import { currentMonthRange } from '@/features/barhal/utils/monthRange'
import { MAX_RANGE_DAYS, withEndDate, withStartDate } from '@/features/barhal/utils/dateRange'
import { triggerBlobDownload } from '@/shared/utils/file-download.util'

function BarhalDashboardContent() {
  // Lazy initializer, and BarhalDashboardPage renders null while auth is loading, so this never
  // runs during SSR and cannot cause a hydration mismatch.
  const [defaultRange] = useState(currentMonthRange)
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  // Editing either side pulls the other along so the pair stays a valid, at-most-one-month range.
  // The `min`/`max` attributes below cover the native picker; these cover a typed or pasted date,
  // which the picker's bounds do not stop.
  const handleStartChange = (value: string) => {
    const range = withStartDate(value, endDate)
    setStartDate(range.start)
    setEndDate(range.end)
  }
  const handleEndChange = (value: string) => {
    const range = withEndDate(value, startDate)
    setStartDate(range.start)
    setEndDate(range.end)
  }

  const { data: stations } = useBarhalStations()
  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
  }
  const { data, isLoading, isError, refetch } = useBarhalDashboardStats(filters)

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
      <PageHeader
        title="Barhal Dashboard"
        subtitle="Statistik packing kayu & Koli"
        badge={isStaging() ? <StagingBadge /> : undefined}
        action={
          <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download size={14} />
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      <BarhalTabNav active="dashboard" />

      <FilterBar>
        {/*
          Deliberately no min/max on either input: bounding one side would stop the operator from
          moving it at all, when what they mean by picking a far-away date is that the *other* side
          should follow. Jumping start from 1 Aug to 1 May must land on 1–31 May, not be refused.
        */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartChange(e.target.value)}
          className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
        />
        <span className="pb-1.5 text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleEndChange(e.target.value)}
          className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
        />
        <span className="pb-1.5 text-xs text-muted-foreground">maks. {MAX_RANGE_DAYS} hari</span>
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
        >
          <option value="">Semua Origin</option>
          {(stations?.origins ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </FilterBar>

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

          <Card>
            <CardHead icon={TreePine} tone="dark" title="Rekap Batang Kayu" />
            <CardContent className="pt-4">
              <BarhalRecapBatangKayuTable data={data.recapBatangKayu} />
            </CardContent>
          </Card>

          <Card>
            <CardHead icon={CalendarDays} tone="info" title="Rekap Per Tanggal" />
            <CardContent className="pt-4">
              <BarhalRecapToTable
                rows={data.recapPerTanggal}
                groupColumnLabel="Date"
                groupBy="date"
                filters={filters}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHead icon={RouteIcon} tone="info" title="Rekap Per Rute" />
            <CardContent className="pt-4">
              <BarhalRecapToTable
                rows={data.recapPerRute}
                groupColumnLabel="Rute"
                groupBy="route"
                filters={filters}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHead icon={FileText} tone="brand" title="Detail TO" />
        <CardContent className="pt-4">
          <BarhalToDetailTable startDate={startDate} endDate={endDate} origin={origin} dest={dest} />
        </CardContent>
      </Card>
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
