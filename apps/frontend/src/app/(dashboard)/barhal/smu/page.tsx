'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { isStaging } from '@/lib/env'
import { Card, CardHead, CardContent } from '@/components/ui/card'
import { FilterBar } from '@/components/shared/filter-bar'
import { useBarhalList, useBarhalStations, useSmuList } from '@/features/barhal/hooks/useBarhal'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalSmuInlineTable } from '@/features/barhal/components/BarhalSmuInlineTable'
import { BulkSmuForm } from '@/features/barhal/components/BulkSmuForm'
import { BarhalSmuListTable } from '@/features/barhal/components/BarhalSmuListTable'

function BarhalSmuPageContent() {
  const [date, setDate] = useState('')
  const [dest, setDest] = useState('')

  const { data: stations } = useBarhalStations()
  const { data: koliData, isLoading: koliLoading, refetch: refetchKoli } = useBarhalList({
    date: date || undefined,
    dest: dest || undefined,
    page: 1,
    pageSize: 100,
  })
  const { data: smuList, isLoading: smuLoading, refetch: refetchSmuList } = useSmuList({
    date: date || undefined,
    dest: dest || undefined,
  })

  const handleSaved = () => {
    refetchKoli()
    refetchSmuList()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barhal"
        subtitle="Input dan pemantauan data SMU"
        badge={isStaging() ? <StagingBadge /> : undefined}
      />

      <BarhalTabNav active="smu" />

      <FilterBar>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
        />
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

      <BarhalSmuInlineTable data={koliData?.data ?? []} isLoading={koliLoading} onSaved={handleSaved} />

      <BulkSmuForm stations={stations ?? { origins: [], dests: [] }} onApplied={handleSaved} />

      <Card>
        <CardHead icon={ListChecks} tone="info" title="List SMU" />
        <CardContent className="pt-4">
          <BarhalSmuListTable data={smuList ?? []} isLoading={smuLoading} onUnassigned={handleSaved} />
        </CardContent>
      </Card>
    </div>
  )
}

export default function BarhalSmuPage() {
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

  return <BarhalSmuPageContent />
}
