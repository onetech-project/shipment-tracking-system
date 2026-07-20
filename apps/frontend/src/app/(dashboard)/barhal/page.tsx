'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalList, useBarhalRoutes } from '@/features/barhal/hooks/useBarhal'
import { BarhalListTable } from '@/features/barhal/components/BarhalListTable'
import { BarhalFilters } from '@/features/barhal/components/BarhalFilters'
import { TambahKoliModal } from '@/features/barhal/components/TambahKoliModal'

const PAGE_SIZE = 25

function BarhalPageContent() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [route, setRoute] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)

  const { data: routes } = useBarhalRoutes()
  const { data, isLoading, refetch } = useBarhalList({
    search: search || undefined,
    date: date || undefined,
    route: route || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    setPage(1)
  }, [search, date, route])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barhal</h1>
          <p className="text-sm text-muted-foreground">
            Pencatatan dan pemantauan TO yang telah di packing kayu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/barhal/dashboard" className="text-sm text-primary underline">
            Dashboard
          </a>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Tambah Koli
          </button>
        </div>
      </div>

      <BarhalFilters
        search={search}
        onSearchChange={setSearch}
        date={date}
        onDateChange={setDate}
        route={route}
        onRouteChange={setRoute}
        routes={routes ?? []}
      />

      <BarhalListTable data={data?.data ?? []} page={page} pageSize={PAGE_SIZE} isLoading={isLoading} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <TambahKoliModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => refetch()} />
    </div>
  )
}

export default function BarhalPage() {
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

  return <BarhalPageContent />
}
