'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PageHeader } from '@/components/shared/page-header'
import { StagingBadge } from '@/components/shared/header-badges'
import { isStaging } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { useBarhalList, useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalListTable } from '@/features/barhal/components/BarhalListTable'
import { BarhalFilters } from '@/features/barhal/components/BarhalFilters'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalKoliWizard } from '@/features/barhal/components/wizard/BarhalKoliWizard'
import { BarhalKoli } from '@/features/barhal/types'

const PAGE_SIZE = 25

function BarhalKoliPageContent() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [page, setPage] = useState(1)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKoli, setWizardKoli] = useState<BarhalKoli | undefined>(undefined)

  const { data: stations } = useBarhalStations()
  const { data, isLoading, refetch } = useBarhalList({
    search: search || undefined,
    date: date || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    setPage(1)
  }, [search, date, origin, dest])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openWizardFor = (koli?: BarhalKoli) => {
    setWizardKoli(koli)
    setWizardOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barhal"
        subtitle="Pencatatan dan pemantauan TO yang telah di packing kayu"
        badge={isStaging() ? <StagingBadge /> : undefined}
        action={
          <Button type="button" onClick={() => openWizardFor(undefined)}>
            <Plus size={14} />
            Tambah Koli
          </Button>
        }
      />

      <BarhalTabNav active="koli" />

      <BarhalFilters
        search={search}
        onSearchChange={setSearch}
        date={date}
        onDateChange={setDate}
        origin={origin}
        onOriginChange={setOrigin}
        dest={dest}
        onDestChange={setDest}
        stations={stations ?? { origins: [], dests: [] }}
      />

      <BarhalListTable
        data={data?.data ?? []}
        page={page}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        onOpenKoli={openWizardFor}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="tabular text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      <BarhalKoliWizard
        open={wizardOpen}
        initialKoli={wizardKoli}
        onClose={() => setWizardOpen(false)}
        onDone={() => refetch()}
      />
    </div>
  )
}

export default function BarhalKoliPage() {
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

  return <BarhalKoliPageContent />
}
