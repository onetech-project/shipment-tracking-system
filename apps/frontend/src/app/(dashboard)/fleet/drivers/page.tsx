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
  FilePreviewDialog,
  FilePreviewState,
} from '@/features/fleet/components/FilePreviewDialog'
import {
  useCreateFleetDriver,
  useDeleteFleetDriver,
  useFleetDrivers,
  useFleetMasterDataByCategory,
  useUpdateFleetDriver,
} from '@/features/fleet/hooks/useFleetDrivers'
import {
  useDeleteDriverSim,
  useDriverSimDownloadUrl,
  useUploadDriverSim,
} from '@/features/fleet/hooks/useDriverSimFile'
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
  const uploadSim = useUploadDriverSim()
  const viewSim = useDriverSimDownloadUrl()
  const deleteSim = useDeleteDriverSim()
  const [simError, setSimError] = useState<string | null>(null)
  // The form dialog stays open underneath: the preview is a look at one of its fields, not a
  // different place to be.
  const [preview, setPreview] = useState<{ driver: FleetDriver; state: FilePreviewState } | null>(
    null,
  )

  const handleSubmit = async (payload: FleetDriverPayload) => {
    if (modal?.type === 'edit') {
      await updateDriver.mutateAsync({ id: modal.driver.id, payload })
    } else {
      await createDriver.mutateAsync(payload)
    }
  }

  // A fresh presigned URL every click, never a cached one: a GET expires in two minutes, the same
  // reason the vehicle files tab re-fetches on every "Lihat".
  const handleViewSim = async (driverId: string) => {
    const driver = (drivers ?? []).find((d) => d.id === driverId)
    if (!driver) return
    setSimError(null)
    setPreview({ driver, state: { status: 'loading' } })
    try {
      const url = await viewSim.mutateAsync({ driverId, disposition: 'inline' })
      setPreview((current) =>
        current?.driver.id === driverId
          ? {
              ...current,
              state: {
                status: 'ready',
                url,
                mimeType: driver.simFile?.mimeType ?? null,
                filename: driver.simFile?.originalName ?? null,
              },
            }
          : current,
      )
    } catch (err: unknown) {
      const message = apiErrorMessage(err, 'Gagal membuka berkas SIM.')
      setPreview((current) =>
        current?.driver.id === driverId
          ? { ...current, state: { status: 'error', message } }
          : current,
      )
    }
  }

  // Asking again without a disposition gets the attachment URL. `<a download>` is ignored across
  // origins, and the object store is a different origin from here.
  const handleDownloadSim = async () => {
    if (!preview) return
    const { driver } = preview
    try {
      const url = await viewSim.mutateAsync({ driverId: driver.id })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setPreview((current) =>
        current?.driver.id === driver.id
          ? {
              ...current,
              state: {
                status: 'error',
                message: apiErrorMessage(err, 'Gagal mengunduh berkas SIM.'),
              },
            }
          : current,
      )
    }
  }

  const handleUploadSim = async (driverId: string, file: File) => {
    setSimError(null)
    try {
      await uploadSim.mutateAsync({ driverId, file })
    } catch (err: unknown) {
      setSimError(apiErrorMessage(err, 'Gagal mengunggah SIM.'))
    }
  }

  const handleDeleteSim = async (driverId: string) => {
    setSimError(null)
    try {
      await deleteSim.mutateAsync(driverId)
    } catch (err: unknown) {
      setSimError(apiErrorMessage(err, 'Gagal menghapus SIM.'))
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

      {simError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {simError}
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
          onUploadSim={handleUploadSim}
          onViewSim={handleViewSim}
          onDeleteSim={handleDeleteSim}
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

      {preview && (
        <FilePreviewDialog
          open
          title="Softcopy SIM"
          subtitle={preview.driver.nama}
          state={preview.state}
          onDownload={() => void handleDownloadSim()}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
