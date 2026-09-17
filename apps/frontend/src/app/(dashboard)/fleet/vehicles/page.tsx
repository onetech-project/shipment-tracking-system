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
import { FleetSummaryCards } from '@/features/fleet/components/FleetSummaryCards'
import { VehiclesTabs, VehiclesTab } from '@/features/fleet/components/VehiclesTabs'
import { FleetAlertList } from '@/features/fleet/components/FleetAlertList'
import { BerkasTab } from '@/features/fleet/components/BerkasTab'
import { BerkasUploadDialog } from '@/features/fleet/components/BerkasUploadDialog'
import {
  FilePreviewDialog,
  FilePreviewState,
} from '@/features/fleet/components/FilePreviewDialog'
import { AngsuranTab } from '@/features/fleet/components/AngsuranTab'
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
import { useFleetSummary } from '@/features/fleet/hooks/useFleetSummary'
import { useFleetExport } from '@/features/fleet/hooks/useFleetExport'
import { useFleetAlerts } from '@/features/fleet/hooks/useFleetAlerts'
import {
  useDeleteVehicleFile,
  useFileDownloadUrl,
  useSetExternalUrl,
  useUploadVehicleFile,
  useVehicleFiles,
} from '@/features/fleet/hooks/useFleetVehicleFiles'
import { apiErrorMessage } from '@/features/fleet/utils/api-error'
import {
  FleetVehicle,
  FleetVehicleDocumentPayload,
  FleetVehicleFile,
  FleetVehicleFilters,
  FleetVehiclePayload,
  FleetVehicleSort,
} from '@/features/fleet/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; vehicle: FleetVehicle }
  | { type: 'documents'; vehicle: FleetVehicle }
  | { type: 'archive'; vehicle: FleetVehicle }
  | { type: 'upload'; vehicle: FleetVehicle; slotId: string }
  | { type: 'deleteFile'; vehicle: FleetVehicle; file: FleetVehicleFile }
  | null

export default function FleetVehiclesPage() {
  const { hasPermission } = usePermissions()
  const [filters, setFilters] = useState<FleetVehicleFilters>({ page: 1, sort: 'nopol' })
  const [modal, setModal] = useState<Modal>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<VehiclesTab>('armada')
  // The unit a row's Berkas action was opened for. Keyed onto BerkasTab so a fresh navigation
  // always remounts it — spec §6.4: BerkasTab's completeness filter is local useState, and a
  // stale 'Lengkap' filter carried over from a previous visit must not hide the unit the operator
  // just clicked through to.
  const [focusVehicleId, setFocusVehicleId] = useState<string | null>(null)
  // Separate from `modal`: a preview is opened over whatever the operator was already doing in the
  // Berkas tab, and it carries its own fetch state rather than a vehicle-and-slot selection.
  const [preview, setPreview] = useState<
    { file: FleetVehicleFile; vehicle: FleetVehicle; state: FilePreviewState } | null
  >(null)

  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')
  // Spec §7 keeps master data behind its own permission so a field operator can register
  // vehicles without editing the lookup lists. That operator reaches this page with
  // read.fleet_vehicle alone, so every master-data query here is conditional: firing them
  // anyway spends five guaranteed 403s and leaves five dropdowns silently empty.
  const canReadMaster = hasPermission('read.fleet_master_data')

  const { data, isLoading, isError, refetch } = useFleetVehicles(filters)
  const { data: summary, isLoading: summaryLoading } = useFleetSummary()
  const { data: alerts, isLoading: alertsLoading, isError: alertsError } = useFleetAlerts(50)
  const exportCsv = useFleetExport()
  const { data: drivers } = useFleetDrivers({})
  const master = { enabled: canReadMaster }
  const { data: jenisArmada } = useFleetMasterDataByCategory('jenis_armada', master)
  const { data: kepemilikan } = useFleetMasterDataByCategory('kepemilikan', master)
  const { data: leasing } = useFleetMasterDataByCategory('leasing', master)
  const { data: pool } = useFleetMasterDataByCategory('pool', master)
  const { data: statusKendaraan } = useFleetMasterDataByCategory('status_kendaraan', master)
  const { data: docTypes } = useFleetMasterDataByCategory('jenis_dokumen', master)
  const { data: jenisBerkas } = useFleetMasterDataByCategory('jenis_berkas', master)

  const createVehicle = useCreateFleetVehicle()
  const updateVehicle = useUpdateFleetVehicle()
  const archiveVehicle = useArchiveFleetVehicle()
  const restoreVehicle = useRestoreFleetVehicle()
  const replaceDocuments = useReplaceVehicleDocuments()
  const uploadFile = useUploadVehicleFile()
  const setExternalUrl = useSetExternalUrl()
  const deleteFile = useDeleteVehicleFile()
  const downloadUrl = useFileDownloadUrl()

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

  // A fresh presigned URL per click rather than one cached with the row: a GET expires in two
  // minutes, so a cached one would be dead by the time an operator clicked it.
  const handleViewFile = async (vehicle: FleetVehicle, file: FleetVehicleFile) => {
    setActionError(null)
    // Not ours to sign, and not ours to frame: an arbitrary host may refuse with X-Frame-Options,
    // and an empty frame reads as a lost document rather than an unframeable one.
    if (file.externalUrl) {
      // noopener so the opened document cannot reach back through window.opener.
      window.open(file.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }

    setPreview({ vehicle, file, state: { status: 'loading' } })
    try {
      const url = await downloadUrl.mutateAsync({
        vehicleId: vehicle.id,
        fileId: file.id,
        disposition: 'inline',
      })
      // Keyed on the file so a second click while the first was in flight does not have its
      // answer overwritten by the slower one.
      setPreview((current) =>
        current?.file.id === file.id
          ? {
              ...current,
              state: {
                status: 'ready',
                url,
                mimeType: file.mimeType,
                filename: file.originalName,
              },
            }
          : current,
      )
    } catch (err: unknown) {
      const message = apiErrorMessage(err, 'Gagal membuka berkas.')
      setPreview((current) =>
        current?.file.id === file.id ? { ...current, state: { status: 'error', message } } : current,
      )
    }
  }

  // A second request rather than a saved URL: the inline one is signed with a different
  // disposition, and `<a download>` is ignored across origins — which is what the object store is
  // from here. Two minutes of validity makes the first URL not worth keeping anyway.
  const handleDownloadPreview = async () => {
    if (!preview) return
    const { vehicle, file } = preview
    try {
      const url = await downloadUrl.mutateAsync({ vehicleId: vehicle.id, fileId: file.id })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setPreview((current) =>
        current?.file.id === file.id
          ? {
              ...current,
              state: { status: 'error', message: apiErrorMessage(err, 'Gagal mengunduh berkas.') },
            }
          : current,
      )
    }
  }

  // Spec §6.4: the row's Berkas action jumps to the Berkas tab focused on this unit. Changing
  // focusVehicleId remounts BerkasTab (see its key below), which resets its local completeness
  // filter — otherwise a filter left on 'Lengkap' from an earlier visit could hide the very unit
  // the operator just clicked through to.
  const handleFocusBerkas = (vehicle: FleetVehicle) => {
    setTab('berkas')
    setFocusVehicleId(vehicle.id)
  }

  const handleExport = async () => {
    setActionError(null)
    try {
      await exportCsv.mutateAsync()
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Gagal mengunduh CSV.'))
    }
  }

  // Opens the unit the row is about. The vehicle may not be on the page the operator is looking
  // at, so the filters are reset to the plate rather than the row being looked up in `rows` —
  // searching finds it whatever page, filter or sort is active.
  const handleOpenAlert = (vehicleId: string) => {
    const match = rows.find((v) => v.id === vehicleId)
    if (match && canUpdate) {
      setModal({ type: 'edit', vehicle: match })
      return
    }
    setFilters({ page: 1, sort: 'severity', severity: undefined })
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={exportCsv.isPending}>
              {exportCsv.isPending ? 'Menyiapkan…' : 'Ekspor CSV'}
            </Button>
            {canCreate && <Button onClick={() => setModal({ type: 'create' })}>+ Tambah armada</Button>}
          </div>
        }
      />

      {actionError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <FleetSummaryCards summary={summary} isLoading={summaryLoading} />

      <VehiclesTabs value={tab} onChange={setTab} />

      {!canReadMaster && (
        <p className="mb-4 text-sm text-muted-foreground">
          Daftar jenis armada, kepemilikan, leasing, pool, status dan jenis dokumen tidak tersedia
          — butuh izin akses master data. Filter dan pilihan terkait dikosongkan.
        </p>
      )}

      {tab === 'armada' && (
        <>
          <FleetAlertList
            alerts={alerts ?? []}
            isLoading={alertsLoading}
            isError={alertsError}
            onOpen={handleOpenAlert}
          />

          <VehicleFilters
            value={filters}
            onChange={setFilters}
            kepemilikanOptions={kepemilikan ?? []}
            poolOptions={pool ?? []}
            statusOptions={statusKendaraan ?? []}
          />

          {isError ? (
            // The empty-state copy is an affirmative claim that no unit matches. During an outage
            // that claim is false, and an operator who believes it starts re-registering units
            // that already exist.
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
                onBerkas={canUpdate ? handleFocusBerkas : undefined}
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
        </>
      )}

      {tab === 'berkas' && (
        // The key looks redundant today — {tab === 'berkas' && …} already unmounts BerkasTab on
        // every tab switch, which resets its local completeness filter on its own. It starts
        // pulling weight the day BerkasTab gains a same-tab "jump to this unit" affordance (spec
        // §6.4's dead-end case, from inside the tab rather than from the row action): without the
        // key, navigating unit-to-unit while already on Berkas would reuse the mounted instance and
        // keep whatever filter was active. Keep it rather than pruning it as dead code.
        <BerkasTab
          key={focusVehicleId ?? 'all'}
          vehicles={rows}
          slots={jenisBerkas ?? []}
          canEdit={canUpdate}
          onUpload={(vehicle, slotId) => setModal({ type: 'upload', vehicle, slotId })}
          onView={handleViewFile}
          onDelete={(vehicle, file) => setModal({ type: 'deleteFile', vehicle, file })}
        />
      )}

      {tab === 'angsuran' && <AngsuranTab vehicles={rows} />}

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

      {modal?.type === 'upload' && (
        <BerkasUploadDialog
          open
          vehicle={modal.vehicle}
          slot={
            (jenisBerkas ?? []).find((s) => s.id === modal.slotId) ?? {
              id: modal.slotId,
              code: '',
              label: 'Berkas',
            }
          }
          onUpload={(file) =>
            uploadFile.mutateAsync({ vehicleId: modal.vehicle.id, slotId: modal.slotId, file })
          }
          onSetUrl={(url) =>
            setExternalUrl.mutateAsync({ vehicleId: modal.vehicle.id, slotId: modal.slotId, url })
          }
          onClose={() => setModal(null)}
        />
      )}

      {preview && (
        <FilePreviewDialog
          open
          title={`Softcopy ${preview.file.slotLabel}`}
          subtitle={preview.vehicle.nopol}
          state={preview.state}
          onDownload={() => void handleDownloadPreview()}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Spec §6.4: every deletion goes through a confirmation. The prototype deleted straight
          from the edit modal, so one mis-click removed a vehicle and its four files. */}
      <ConfirmDialog
        open={modal?.type === 'deleteFile'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus berkas"
        description={
          modal?.type === 'deleteFile'
            ? `Hapus ${modal.file.originalName ?? 'berkas'} dari ${modal.vehicle.nopol}?`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'deleteFile') return
          setActionError(null)
          try {
            await deleteFile.mutateAsync({ vehicleId: modal.vehicle.id, fileId: modal.file.id })
          } catch (err: unknown) {
            setActionError(apiErrorMessage(err, 'Gagal menghapus berkas.'))
          }
        }}
      />
    </div>
  )
}
