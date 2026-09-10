'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { MasterDataFormDialog } from '@/features/fleet/components/MasterDataFormDialog'
import {
  useCreateFleetMasterData,
  useDeleteFleetMasterData,
  useFleetMasterData,
  useUpdateFleetMasterData,
} from '@/features/fleet/hooks/useFleetMasterData'
import { apiErrorMessage } from '@/features/fleet/utils/api-error'
import {
  FLEET_CATEGORY_LABELS,
  FLEET_MASTER_CATEGORIES,
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
} from '@/features/fleet/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; row: FleetMasterRow }
  | { type: 'delete'; row: FleetMasterRow }
  | null

export default function FleetMasterDataPage() {
  const { hasPermission } = usePermissions()
  const [category, setCategory] = useState<FleetMasterCategory>('jenis_armada')
  const [modal, setModal] = useState<Modal>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: rows, isLoading } = useFleetMasterData(category)
  const createRow = useCreateFleetMasterData()
  const updateRow = useUpdateFleetMasterData()
  const deleteRow = useDeleteFleetMasterData()

  const canCreate = hasPermission('create.fleet_master_data')
  const canUpdate = hasPermission('update.fleet_master_data')
  const canDelete = hasPermission('delete.fleet_master_data')

  const handleSubmit = async (payload: FleetMasterPayload) => {
    if (modal?.type === 'edit') {
      await updateRow.mutateAsync({
        id: modal.row.id,
        payload: {
          label: payload.label,
          sortOrder: payload.sortOrder,
          warnDays: payload.warnDays,
        },
      })
    } else {
      await createRow.mutateAsync(payload)
    }
  }

  return (
    <div>
      <PageHeader
        title="Master Data Armada"
        subtitle="Daftar pilihan yang muncul di form kendaraan dan sopir."
        action={
          canCreate ? (
            <Button onClick={() => setModal({ type: 'create' })}>
              + Tambah {FLEET_CATEGORY_LABELS[category]}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b" role="tablist">
        {FLEET_MASTER_CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            onClick={() => {
              setCategory(c)
              // The banner names a row in the category being left behind.
              setDeleteError(null)
            }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium motion-safe:transition-colors',
              c === category
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {FLEET_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {deleteError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      <DataTable
        rows={rows ?? []}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="Belum ada data untuk kategori ini."
        columns={[
          {
            header: 'Label',
            accessor: (r) => (
              <span className="flex items-center gap-2">
                {r.label}
                {!r.isActive && <Badge variant="secondary">nonaktif</Badge>}
              </span>
            ),
          },
          { header: 'Kode', accessor: (r) => <code className="text-xs">{r.code}</code> },
          { header: 'Urutan', accessor: (r) => r.sortOrder },
          { header: 'Ambang (hari)', accessor: (r) => r.warnDays ?? '—' },
          {
            header: '',
            className: 'text-right',
            accessor: (r) => (
              <div className="flex justify-end gap-2">
                {canUpdate && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit', row: r })}>
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateRow.mutate({ id: r.id, payload: { isActive: !r.isActive } })
                      }
                    >
                      {r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'delete', row: r })}>
                    Hapus
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <MasterDataFormDialog
          open
          category={category}
          initial={modal.type === 'edit' ? modal.row : undefined}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'delete'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus data master"
        description={
          modal?.type === 'delete'
            ? `Hapus "${modal.row.label}"? Kalau masih dipakai kendaraan, sistem akan menolak — nonaktifkan saja.`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'delete') return
          setDeleteError(null)
          try {
            await deleteRow.mutateAsync(modal.row.id)
          } catch (err: unknown) {
            // The 409 carries the reference count and the advice to deactivate. Surfacing it
            // verbatim is more useful than a generic failure toast.
            setDeleteError(apiErrorMessage(err, 'Gagal menghapus data master.'))
          }
        }}
      />
    </div>
  )
}
