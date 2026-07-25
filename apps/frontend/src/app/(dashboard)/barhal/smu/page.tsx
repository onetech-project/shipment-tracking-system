'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Barhal</h1>
        <p className="text-sm text-muted-foreground">Input dan pemantauan data SMU</p>
      </div>

      <BarhalTabNav active="smu" />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
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

      <BarhalSmuInlineTable data={koliData?.data ?? []} isLoading={koliLoading} onSaved={handleSaved} />

      <BulkSmuForm stations={stations ?? { origins: [], dests: [] }} onApplied={handleSaved} />

      <div>
        <p className="mb-2 text-sm font-medium">List SMU</p>
        <BarhalSmuListTable data={smuList ?? []} isLoading={smuLoading} />
      </div>
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
