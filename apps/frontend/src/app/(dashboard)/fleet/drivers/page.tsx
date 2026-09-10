'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { DriverFormDialog } from '@/features/fleet/components/DriverFormDialog'
import {
  useCreateFleetDriver,
  useDeleteFleetDriver,
  useFleetDrivers,
  useFleetMasterDataByCategory,
  useUpdateFleetDriver,
} from '@/features/fleet/hooks/useFleetDrivers'
import { apiErrorMessage } from '@/features/fleet/utils/api-error'
import { FleetDriver, FleetDriverPayload } from '@/features/fleet/types'

type Modal = { type: 'create' } | { type: 'edit'; driver: FleetDriver } | { type: 'delete'; driver: FleetDriver } | null

export default function FleetDriversPage() {
  const { hasPermission } = usePermissions()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')
  // Spec §7 keeps master data behind its own permission, so this list is not guaranteed to the
  // operator looking at this page.
  const canReadMaster = hasPermission('read.fleet_master_data')

  const { data: drivers, isLoading, isError, refetch } = useFleetDrivers({ q })
  const { data: simTypes } = useFleetMasterDataByCategory('jenis_sim', { enabled: canReadMaster })
  const createDriver = useCreateFleetDriver()
  const updateDriver = useUpdateFleetDriver()
  const deleteDriver = useDeleteFleetDriver()

  const handleSubmit = async (payload: FleetDriverPayload) => {
    if (modal?.type === 'edit') {
      await updateDriver.mutateAsync({ id: modal.driver.id, payload })
    } else {
      await createDriver.mutateAsync(payload)
    }
  }

  return (
    <div>
      <PageHeader
        title="Sopir"
        subtitle="Data sopir dan masa berlaku SIM. Peringatan SIM mengikuti sopirnya, bukan kendaraan."
        action={
          canCreate ? <Button onClick={() => setModal({ type: 'create' })}>+ Tambah sopir</Button> : undefined
        }
      />

      {deleteError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      <div className="mb-4">
        <Input
          placeholder="Cari nama, telepon, atau nomor SIM…"
          aria-label="Cari sopir"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Gagal memuat data sopir.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Coba lagi
          </button>
        </div>
      ) : (
        <DataTable
          rows={drivers ?? []}
          isLoading={isLoading}
          keyExtractor={(d) => d.id}
          emptyMessage="Belum ada sopir terdaftar."
          columns={[
            { header: 'Nama', accessor: (d) => d.nama },
            { header: 'Telepon', accessor: (d) => d.telepon ?? '—' },
            { header: 'Nomor SIM', accessor: (d) => d.simNomor ?? '—' },
            { header: 'Jenis SIM', accessor: (d) => d.simJenis?.label ?? '—' },
            { header: 'Berlaku sampai', accessor: (d) => d.simExpiresAt ?? '—' },
            {
              header: '',
              className: 'text-right',
              accessor: (d) => (
                <div className="flex justify-end gap-2">
                  {canUpdate && (
                    <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit', driver: d })}>
                      Ubah
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'delete', driver: d })}>
                      Hapus
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <DriverFormDialog
          open
          initial={modal.type === 'edit' ? modal.driver : undefined}
          simTypes={simTypes ?? []}
          simTypesUnavailable={!canReadMaster}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'delete'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus sopir"
        description={
          modal?.type === 'delete'
            ? `Hapus ${modal.driver.nama}? Tindakan ini tidak bisa dibatalkan.`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'delete') return
          // A successful retry must not leave the previous failure on screen — the operator
          // reads a stale banner as "it failed again".
          setDeleteError(null)
          // ConfirmDialog does not catch, so a rejected mutation would surface as an unhandled
          // rejection and the dialog would stay open with no explanation.
          try {
            await deleteDriver.mutateAsync(modal.driver.id)
          } catch (err: unknown) {
            setDeleteError(apiErrorMessage(err, 'Gagal menghapus sopir.'))
          }
        }}
      />
    </div>
  )
}
