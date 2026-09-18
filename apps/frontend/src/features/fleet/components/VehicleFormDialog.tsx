'use client'

import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import {
  FleetDriver,
  FleetMasterRow,
  FleetVehicle,
  FleetVehicleFile,
  FleetVehiclePayload,
} from '../types'
import { apiErrorMessage } from '../utils/api-error'
import { BerkasFormSection } from './vehicle-form/BerkasFormSection'
import { UploadFailure, isPhotoSlot, useVehicleBerkas } from './vehicle-form/useVehicleBerkas'
import { DocumentSection } from './vehicle-form/DocumentSection'
import { IdentitySection } from './vehicle-form/IdentitySection'
import { LeaseSection } from './vehicle-form/LeaseSection'
import { OperationalSection } from './vehicle-form/OperationalSection'
import { useVehicleForm } from './vehicle-form/useVehicleForm'

interface VehicleMasterData {
  jenisArmada: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  leasing: FleetMasterRow[]
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
  jenisDokumen: FleetMasterRow[]
}

interface VehicleFormDialogProps {
  open: boolean
  initial?: FleetVehicle
  masterData: VehicleMasterData
  drivers: FleetDriver[]
  // The jenis_berkas slots this deployment has. Empty for an operator without master-data
  // permission, which renders both file sections away rather than showing empty ones.
  berkasSlots?: FleetMasterRow[]
  existingFiles?: FleetVehicleFile[]
  // Returns the saved vehicle rather than void: on a create its id is the only way the uploads
  // that follow know where to file themselves.
  onSubmit: (payload: FleetVehiclePayload) => Promise<FleetVehicle>
  onUploadBerkas?: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
  onClose: () => void
}

// Sections 4 and 6 each own one document type; everything else collects in section 5. Split by
// code rather than by a list of ids, so a type an admin adds later still lands somewhere.
const KIR_CODE = 'kir'
const SERVIS_CODE = 'servis'

export function VehicleFormDialog({
  open,
  initial,
  masterData,
  drivers,
  berkasSlots,
  existingFiles,
  onSubmit,
  onUploadBerkas,
  onClose,
}: VehicleFormDialogProps) {
  const form = useVehicleForm({
    initial,
    docTypes: masterData.jenisDokumen,
    kepemilikan: masterData.kepemilikan,
    leasing: masterData.leasing,
    drivers,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The unit the pending files belong to. Starts as the vehicle being edited and is filled in by
  // a create's response, which is what lets a failed upload be retried without saving the
  // vehicle a second time.
  const [savedVehicleId, setSavedVehicleId] = useState<string | null>(initial?.id ?? null)
  const [uploadFailures, setUploadFailures] = useState<UploadFailure[] | null>(null)

  const berkas = useVehicleBerkas({
    upload: async ({ vehicleId, slotId, file }) => {
      if (!onUploadBerkas) throw new Error('Unggah berkas tidak tersedia.')
      return onUploadBerkas({ vehicleId, slotId, file })
    },
  })

  const { fotoSlots, dokumenSlots } = useMemo(() => {
    const slots = berkasSlots ?? []
    return {
      fotoSlots: slots.filter((s) => isPhotoSlot(s.code)),
      // Everything else, not a closed list of codes: a slot an admin adds later still lands
      // somewhere rather than vanishing from the form.
      dokumenSlots: slots.filter((s) => !isPhotoSlot(s.code)),
    }
  }, [berkasSlots])

  const { kir, servis, lainnya } = useMemo(() => {
    const types = masterData.jenisDokumen
    return {
      kir: types.filter((t) => t.code === KIR_CODE),
      servis: types.filter((t) => t.code === SERVIS_CODE),
      lainnya: types.filter((t) => t.code !== KIR_CODE && t.code !== SERVIS_CODE),
    }
  }, [masterData.jenisDokumen])

  // Uploads the pending files and reports whether the dialog may close. Shared by the first save
  // and by the retry so the two cannot drift apart.
  const runUploads = async (vehicleId: string): Promise<boolean> => {
    const failed = await berkas.uploadAll(vehicleId)
    setUploadFailures(failed.length > 0 ? failed : null)
    return failed.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    // Without this the browser navigates away and the operator loses a 22-field form.
    e.preventDefault()
    setError(null)
    if (!form.validate()) return

    setSubmitting(true)
    try {
      // A retry after a partial failure: the vehicle is already saved, so re-sending it would
      // PATCH correct data — or, on a create, register a second unit on the same plate.
      if (savedVehicleId && uploadFailures) {
        if (await runUploads(savedVehicleId)) onClose()
        return
      }

      const saved = await onSubmit(form.buildPayload())
      const vehicleId = saved?.id ?? savedVehicleId
      setSavedVehicleId(vehicleId ?? null)

      // No id means nothing can be filed against it; the vehicle is saved either way, so the
      // dialog closes rather than stranding the operator in a form with no next step.
      if (berkas.pendingCount === 0 || !vehicleId) {
        onClose()
        return
      }
      if (await runUploads(vehicleId)) onClose()
    } catch (err) {
      // The backend's own message names the plate that clashed; the fallback only covers the
      // case where the request never reached it.
      setError(apiErrorMessage(err, 'Terjadi kesalahan saat menyimpan armada.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Wider than the two-column dialogs elsewhere (spec §6): six sections at sm:max-w-2xl
          turn into a column the operator has to scroll for a minute. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah armada' : 'Tambah armada'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <IdentitySection form={form} jenisArmada={masterData.jenisArmada} />

          <LeaseSection
            form={form}
            kepemilikan={masterData.kepemilikan}
            leasing={masterData.leasing}
          />

          <OperationalSection
            form={form}
            pool={masterData.pool}
            status={masterData.status}
            drivers={drivers}
          />

          <DocumentSection title="Uji Berkala (KIR)" form={form} types={kir} />

          <DocumentSection title="Dokumen Kendaraan" form={form} types={lainnya} />

          <BerkasFormSection
            title="Foto Kendaraan"
            slots={fotoSlots}
            existing={existingFiles ?? []}
            berkas={berkas}
            cols={4}
            accept="image/jpeg,image/png,image/webp"
            hint="jpg, png, atau webp · maksimal 5 MB"
            showThumbnail
          />

          <BerkasFormSection
            title="Softcopy Berkas"
            slots={dokumenSlots}
            existing={existingFiles ?? []}
            berkas={berkas}
            cols={3}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            hint="jpg, png, webp, atau pdf · maksimal 10 MB"
            showThumbnail={false}
          />

          {/* catatan belongs to the vehicle row rather than to a document, but it belongs on
              this section — and a fieldset with two legends is not a thing, so it is passed
              down as a child instead of standing in a seventh section of its own. */}
          <DocumentSection
            title="Servis dan Perawatan"
            form={form}
            types={servis}
            showNomor={false}
            cols={2}
          >
            <FormField label="Catatan" htmlFor="vf-catatan" className="sm:col-span-2">
              <textarea
                id="vf-catatan"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.values.catatan}
                onChange={(e) => form.setValue('catatan', e.target.value)}
              />
            </FormField>
          </DocumentSection>

          {uploadFailures && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p className="font-medium">
                Armada tersimpan. {uploadFailures.length} berkas gagal diunggah:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {uploadFailures.map((f) => (
                  <li key={f.slotLabel}>
                    {f.slotLabel} — {f.message}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Berkas lain sudah tersimpan. Data armada tidak perlu diisi ulang.
              </p>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={16} aria-hidden="true" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitLabel(submitting, berkas.pendingCount, uploadFailures !== null)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// The button says what the next click will actually do. After a partial failure that is no
// longer "save": the vehicle is already stored, and only the files are outstanding.
function submitLabel(submitting: boolean, pending: number, retrying: boolean): string {
  if (submitting) return pending > 0 ? 'Mengunggah berkas…' : 'Menyimpan…'
  if (retrying) return 'Unggah ulang berkas yang gagal'
  return 'Simpan'
}
