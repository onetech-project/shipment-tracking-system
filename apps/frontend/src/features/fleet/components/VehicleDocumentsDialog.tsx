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
import {
  FleetMasterRow,
  FleetVehicle,
  FleetVehicleDocument,
  FleetVehicleDocumentPayload,
} from '../types'
import { apiErrorMessage } from '../utils/api-error'
import { docLabels } from '../utils/doc-labels'
import { SeverityBadge } from './SeverityBadge'

interface VehicleDocumentsDialogProps {
  open: boolean
  vehicle: FleetVehicle
  docTypes: FleetMasterRow[]
  onSubmit: (documents: FleetVehicleDocumentPayload[]) => Promise<void>
  onClose: () => void
}

interface DocRowState {
  nomor: string
  issuedAt: string
  expiresAt: string
}

const emptyRow: DocRowState = { nomor: '', issuedAt: '', expiresAt: '' }

export function VehicleDocumentsDialog({
  open,
  vehicle,
  docTypes,
  onSubmit,
  onClose,
}: VehicleDocumentsDialogProps) {
  // A row per configured type, always — a form showing only the documents already recorded gives
  // the operator no way to add the one that is missing, which is the common case.
  const [rows, setRows] = useState<Record<string, DocRowState>>(() =>
    Object.fromEntries(
      docTypes.map((t) => {
        const existing = vehicle.documents.find((d) => d.docTypeId === t.id)
        return [
          t.id,
          existing
            ? {
                nomor: existing.nomor ?? '',
                issuedAt: existing.issuedAt ?? '',
                expiresAt: existing.expiresAt ?? '',
              }
            : { ...emptyRow },
        ]
      }),
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const patchRow = (id: string, next: Partial<DocRowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }))

  const existingFor = (id: string): FleetVehicleDocument | undefined =>
    vehicle.documents.find((d) => d.docTypeId === id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // An untouched row is not a document — sending it would create a live row with no data.
      // Everything the operator did fill in goes in one submit, because the backend retires
      // whatever is absent and a dropped row would silently delete that document.
      const edited: FleetVehicleDocumentPayload[] = docTypes
        .map((t) => ({ id: t.id, row: rows[t.id] ?? emptyRow }))
        .filter(({ row }) => row.nomor.trim() || row.issuedAt || row.expiresAt)
        .map(({ id, row }) => ({
          docTypeId: id,
          nomor: row.nomor.trim() || null,
          issuedAt: row.issuedAt || null,
          expiresAt: row.expiresAt || null,
        }))
      // Anything missing from this payload is DELETED by the backend, and only a type that was in
      // docTypes at mount has a seeded, editable row above. A document whose type was deactivated
      // in the master data, or whose type reached docTypes only after mount, or every document
      // while docTypes is still loading, would therefore be retired by a Simpan the operator
      // pressed without ever seeing it. With no seeded row to edit, it rides along as-is.
      const carriedThrough: FleetVehicleDocumentPayload[] = vehicle.documents
        .filter((d) => !(docTypes.some((t) => t.id === d.docTypeId) && d.docTypeId in rows))
        .map((d) => ({
          docTypeId: d.docTypeId,
          nomor: d.nomor,
          issuedAt: d.issuedAt,
          expiresAt: d.expiresAt,
        }))
      await onSubmit([...edited, ...carriedThrough])
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Terjadi kesalahan. Coba lagi.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dokumen {vehicle.nopol}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Kosongkan baris untuk menghapus dokumen tersebut dari unit ini.
          </p>

          {docTypes.map((t) => {
            const row = rows[t.id] ?? emptyRow
            const existing = existingFor(t.id)
            // The same map the full form uses (spec §6.2), so a document is called the same
            // thing whichever dialog the operator opened it from.
            const labels = docLabels(t.code, t.label)
            return (
              <div key={t.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t.label}</span>
                  {/* severity and daysLeft come from the backend already computed — nothing here
                      derives a date from the browser clock. */}
                  {existing && (
                    <SeverityBadge severity={existing.severity} daysLeft={existing.daysLeft} />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground" htmlFor={`doc-${t.id}-nomor`}>
                      {t.label} nomor
                    </label>
                    <Input
                      id={`doc-${t.id}-nomor`}
                      value={row.nomor}
                      onChange={(e) => patchRow(t.id, { nomor: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`doc-${t.id}-issued`}
                    >
                      {labels.issued}
                    </label>
                    <Input
                      id={`doc-${t.id}-issued`}
                      type="date"
                      value={row.issuedAt}
                      onChange={(e) => patchRow(t.id, { issuedAt: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`doc-${t.id}-expires`}
                    >
                      {labels.expires}
                    </label>
                    <Input
                      id={`doc-${t.id}-expires`}
                      type="date"
                      value={row.expiresAt}
                      onChange={(e) => patchRow(t.id, { expiresAt: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )
          })}

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
