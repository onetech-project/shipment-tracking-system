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
import { FleetDriver, FleetMasterRow, FleetVehicle, FleetVehiclePayload } from '../types'
import { apiErrorMessage } from '../utils/api-error'
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
  onSubmit: (payload: FleetVehiclePayload) => Promise<void>
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
  onSubmit,
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

  const { kir, servis, lainnya } = useMemo(() => {
    const types = masterData.jenisDokumen
    return {
      kir: types.filter((t) => t.code === KIR_CODE),
      servis: types.filter((t) => t.code === SERVIS_CODE),
      lainnya: types.filter((t) => t.code !== KIR_CODE && t.code !== SERVIS_CODE),
    }
  }, [masterData.jenisDokumen])

  const handleSubmit = async (e: React.FormEvent) => {
    // Without this the browser navigates away and the operator loses a 22-field form.
    e.preventDefault()
    setError(null)
    if (!form.validate()) return

    setSubmitting(true)
    try {
      await onSubmit(form.buildPayload())
      onClose()
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
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
