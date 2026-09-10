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

interface DriverFormDialogProps {
  open: boolean
  initial?: FleetDriver
  simTypes: FleetMasterRow[]
  simTypesUnavailable?: boolean
  onSubmit: (payload: FleetDriverPayload) => Promise<void>
  onClose: () => void
}

export function DriverFormDialog({
  open,
  initial,
  simTypes,
  simTypesUnavailable = false,
  onSubmit,
  onClose,
}: DriverFormDialogProps) {
  const [nama, setNama] = useState(initial?.nama ?? '')
  const [telepon, setTelepon] = useState(initial?.telepon ?? '')
  const [simNomor, setSimNomor] = useState(initial?.simNomor ?? '')
  const [simJenisId, setSimJenisId] = useState(initial?.simJenisId ?? '')
  const [simExpiresAt, setSimExpiresAt] = useState(initial?.simExpiresAt ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
