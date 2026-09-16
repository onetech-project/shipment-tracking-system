'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetDriverPayload, FleetMasterRow } from '../types'
import { apiErrorMessage } from '../utils/api-error'
import { formatBytes } from '../utils/format-bytes'

// Mirrors the backend allow-list (storage.constants.ts), same as BerkasUploadDialog. The input's
// accept attribute is only a picker filter — a user can still choose "All files" or drag-drop a
// file past it — so the handler below re-checks the type itself before it ever reaches the server.
const ACCEPTED_SIM_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

interface DriverFormDialogProps {
  open: boolean
  initial?: FleetDriver
  simTypes: FleetMasterRow[]
  simTypesUnavailable?: boolean
  onSubmit: (payload: FleetDriverPayload) => Promise<void>
  onClose: () => void
  // Optional, like simTypesUnavailable above: only exercised once a driver has an id (see the
  // guard around the SIM slot below), so a caller rendering the create form has nothing to pass.
  onUploadSim?: (driverId: string, file: File) => Promise<unknown>
  onViewSim?: (driverId: string) => Promise<unknown>
  onDeleteSim?: (driverId: string) => Promise<unknown>
}

export function DriverFormDialog({
  open,
  initial,
  simTypes,
  simTypesUnavailable = false,
  onSubmit,
  onClose,
  onUploadSim,
  onViewSim,
  onDeleteSim,
}: DriverFormDialogProps) {
  const [nama, setNama] = useState(initial?.nama ?? '')
  const [telepon, setTelepon] = useState(initial?.telepon ?? '')
  const [simNomor, setSimNomor] = useState(initial?.simNomor ?? '')
  const [simJenisId, setSimJenisId] = useState(initial?.simJenisId ?? '')
  const [simExpiresAt, setSimExpiresAt] = useState(initial?.simExpiresAt ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nama.trim()) {
      setError('Nama sopir wajib diisi.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // Optional fields travel as null, never '': the backend reads an absent field as "leave
      // unchanged", so an empty string would make a cleared field unremovable.
      await onSubmit({
        nama: nama.trim(),
        telepon: telepon.trim() || null,
        simNomor: simNomor.trim() || null,
        simJenisId: simJenisId || null,
        simExpiresAt: simExpiresAt || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Terjadi kesalahan. Coba lagi.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah sopir' : 'Tambah sopir'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Nama sopir" required htmlFor="driver-nama">
            <Input id="driver-nama" value={nama} onChange={(e) => setNama(e.target.value)} />
          </FormField>

          <FormField label="Nomor telepon" htmlFor="driver-telepon">
            <Input
              id="driver-telepon"
              value={telepon}
              onChange={(e) => setTelepon(e.target.value)}
            />
          </FormField>

          <FormField label="Nomor SIM" htmlFor="driver-sim-nomor">
            <Input
              id="driver-sim-nomor"
              value={simNomor}
              onChange={(e) => setSimNomor(e.target.value)}
            />
          </FormField>

          <FormField label="Jenis SIM" htmlFor="driver-sim-jenis">
            <select
              id="driver-sim-jenis"
              value={simJenisId}
              onChange={(e) => setSimJenisId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— pilih —</option>
              {simTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>

          {simTypesUnavailable && (
            <p className="text-xs text-muted-foreground">
              Daftar Jenis SIM tidak tersedia — butuh izin akses master data.
            </p>
          )}

          <FormField
            label="Masa berlaku SIM"
            htmlFor="driver-sim-exp"
            hint="Dipantau di daftar Perlu Tindakan."
          >
            <Input
              id="driver-sim-exp"
              type="date"
              value={simExpiresAt}
              onChange={(e) => setSimExpiresAt(e.target.value)}
            />
          </FormField>

          {/* Only for a saved driver: a new one has no id, so there is nothing to attach a file to.
              The scan is uploaded separately from the form fields rather than as part of the save,
              because it goes straight to storage and never through this form's payload. */}
          {initial?.id && (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium">Softcopy SIM</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {initial.simFile
                  ? `${initial.simFile.originalName ?? 'berkas'} · ${formatBytes(initial.simFile.sizeBytes)}`
                  : 'Belum ada softcopy.'}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {initial.simFile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onViewSim?.(initial.id)}
                  >
                    Lihat
                  </Button>
                )}
                <label className="inline-flex">
                  <input
                    type="file"
                    accept={ACCEPTED_SIM_TYPES.join(',')}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!ACCEPTED_SIM_TYPES.includes(file.type)) {
                        setSimError('Format tidak didukung. Pilih jpg, png, webp, atau pdf.')
                        return
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        setSimError('Ukuran berkas maksimal 10 MB.')
                        return
                      }
                      setSimError(null)
                      void onUploadSim?.(initial.id, file)
                    }}
                  />
                  <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm">
                    {initial.simFile ? 'Ganti SIM' : 'Unggah SIM'}
                  </span>
                </label>
                {initial.simFile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDeleteSim?.(initial.id)}
                  >
                    Hapus
                  </Button>
                )}
              </div>
              {simError && <p className="mt-2 text-sm text-destructive">{simError}</p>}
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle size={14} aria-hidden="true" />
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
