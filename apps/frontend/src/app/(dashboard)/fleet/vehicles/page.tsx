'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { VehicleFilters } from '@/features/fleet/components/VehicleFilters'
import { VehicleTable } from '@/features/fleet/components/VehicleTable'
import { VehicleFormDialog } from '@/features/fleet/components/VehicleFormDialog'
import { VehicleDocumentsDialog } from '@/features/fleet/components/VehicleDocumentsDialog'
import {
  useArchiveFleetVehicle,
  useCreateFleetVehicle,
  useFleetVehicles,
  useReplaceVehicleDocuments,
  useRestoreFleetVehicle,
  useUpdateFleetVehicle,
} from '@/features/fleet/hooks/useFleetVehicles'
import {
  useFleetDrivers,
  useFleetMasterDataByCategory,
} from '@/features/fleet/hooks/useFleetDrivers'
import { apiErrorMessage } from '@/features/fleet/utils/api-error'
import {
  FleetVehicle,
  FleetVehicleDocumentPayload,
  FleetVehicleFilters,
  FleetVehiclePayload,
  FleetVehicleSort,
} from '@/features/fleet/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; vehicle: FleetVehicle }
  | { type: 'documents'; vehicle: FleetVehicle }
  | { type: 'archive'; vehicle: FleetVehicle }
  | null

export default function FleetVehiclesPage() {
  const { hasPermission } = usePermissions()
  const [filters, setFilters] = useState<FleetVehicleFilters>({ page: 1, sort: 'nopol' })
  const [modal, setModal] = useState<Modal>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')
  // Spec §7 keeps master data behind its own permission so a field operator can register
  // vehicles without editing the lookup lists. That operator reaches this page with
  // read.fleet_vehicle alone, so every master-data query here is conditional: firing them
  // anyway spends five guaranteed 403s and leaves five dropdowns silently empty.
  const canReadMaster = hasPermission('read.fleet_master_data')

  const { data, isLoading, isError, refetch } = useFleetVehicles(filters)
  const { data: drivers } = useFleetDrivers({})
  const master = { enabled: canReadMaster }
  const { data: jenisArmada } = useFleetMasterDataByCategory('jenis_armada', master)
  const { data: kepemilikan } = useFleetMasterDataByCategory('kepemilikan', master)
  const { data: leasing } = useFleetMasterDataByCategory('leasing', master)
  const { data: pool } = useFleetMasterDataByCategory('pool', master)
  const { data: statusKendaraan } = useFleetMasterDataByCategory('status_kendaraan', master)
  const { data: docTypes } = useFleetMasterDataByCategory('jenis_dokumen', master)

  const createVehicle = useCreateFleetVehicle()
  const updateVehicle = useUpdateFleetVehicle()
  const archiveVehicle = useArchiveFleetVehicle()
  const restoreVehicle = useRestoreFleetVehicle()
  const replaceDocuments = useReplaceVehicleDocuments()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? filters.page ?? 1
  const pageSize = data?.pageSize ?? 25
  // Math.max(1, …) so an empty result still reads "halaman 1 dari 1" rather than "dari 0".
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleSubmit = async (payload: FleetVehiclePayload) => {
    if (modal?.type === 'edit') {
      await updateVehicle.mutateAsync({ id: modal.vehicle.id, payload })
    } else {
      await createVehicle.mutateAsync(payload)
    }
  }

  const handleDocuments = async (documents: FleetVehicleDocumentPayload[]) => {
    if (modal?.type !== 'documents') return
    await replaceDocuments.mutateAsync({ id: modal.vehicle.id, documents })
  }

  // Restore is a single reversible click, so it does not get a confirmation the way archiving
  // does — but it can still fail on a plate another unit has taken since.
  const handleRestore = async (vehicle: FleetVehicle) => {
    setActionError(null)
    try {
      await restoreVehicle.mutateAsync(vehicle.id)
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Gagal memulihkan armada.'))
    }
  }

  return (
    <div>
      {/* Eyebrow, title and description follow the prototype's masthead verbatim, so the operator
          meets the same words here as in the document they signed off. */}
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Buku induk kendaraan · angkutan barang
      </p>
      <PageHeader
        title="Registrasi Armada"
        subtitle="Data kendaraan, masa berlaku KIR & STNK, softcopy dokumen, status kepemilikan, dan angsuran leasing dalam satu tempat. Peringatan muncul otomatis 30 hari sebelum jatuh tempo."
        action={
          canCreate ? (
            <Button onClick={() => setModal({ type: 'create' })}>+ Tambah armada</Button>
          ) : undefined
        }
      />

      {actionError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {!canReadMaster && (
        <p className="mb-4 text-sm text-muted-foreground">
          Daftar jenis armada, kepemilikan, leasing, pool, status dan jenis dokumen tidak tersedia
          — butuh izin akses master data. Filter dan pilihan terkait dikosongkan.
        </p>
      )}

      <VehicleFilters
        value={filters}
        onChange={setFilters}
        kepemilikanOptions={kepemilikan ?? []}
        poolOptions={pool ?? []}
        statusOptions={statusKendaraan ?? []}
      />

      {isError ? (
        // The empty-state copy is an affirmative claim that no unit matches. During an outage
        // that claim is false, and an operator who believes it starts re-registering units that
        // already exist.
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Gagal memuat data armada.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <VehicleTable
            rows={rows}
            docTypes={docTypes ?? []}
            isLoading={isLoading}
            sort={filters.sort ?? 'nopol'}
            onSortChange={(sort: FleetVehicleSort) => setFilters({ ...filters, sort, page: 1 })}
            onEdit={canUpdate ? (v) => setModal({ type: 'edit', vehicle: v }) : () => {}}
            onDocuments={canUpdate ? (v) => setModal({ type: 'documents', vehicle: v }) : () => {}}
            onArchive={canDelete ? (v) => setModal({ type: 'archive', vehicle: v }) : () => {}}
            onRestore={canDelete ? handleRestore : () => {}}
            showActions={{ edit: canUpdate, documents: canUpdate, archive: canDelete }}
          />

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} armada</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setFilters({ ...filters, page: page - 1 })}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {page} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setFilters({ ...filters, page: page + 1 })}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <VehicleFormDialog
          open
          initial={modal.type === 'edit' ? modal.vehicle : undefined}
          masterData={{
            jenisArmada: jenisArmada ?? [],
            kepemilikan: kepemilikan ?? [],
            leasing: leasing ?? [],
            pool: pool ?? [],
            status: statusKendaraan ?? [],
            jenisDokumen: docTypes ?? [],
          }}
          drivers={drivers ?? []}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {/* Gated on docTypes being loaded, not just on the modal state: the dialog builds its
          submit payload from the rows it renders, and the backend's PUT retires every document
          that is absent from that payload. Opened with an empty docTypes it would render zero
          rows over a live Simpan button, and one click would retire every document on the unit. */}
      {modal?.type === 'documents' && docTypes && docTypes.length > 0 && (
        <VehicleDocumentsDialog
          open
          vehicle={modal.vehicle}
          docTypes={docTypes}
          onSubmit={handleDocuments}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'archive'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Arsipkan armada"
        description={
          modal?.type === 'archive'
            ? `Arsipkan ${modal.vehicle.nopol}? Unit ini keluar dari daftar tapi dokumennya tetap tersimpan, dan bisa dipulihkan lagi.`
            : undefined
        }
        confirmLabel="Arsipkan"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'archive') return
          // ConfirmDialog does not catch, so a rejected mutation would surface as an unhandled
          // rejection and the dialog would close with no explanation.
          setActionError(null)
          try {
            await archiveVehicle.mutateAsync(modal.vehicle.id)
          } catch (err: unknown) {
            setActionError(apiErrorMessage(err, 'Gagal mengarsipkan armada.'))
          }
        }}
      />
    </div>
  )
}
