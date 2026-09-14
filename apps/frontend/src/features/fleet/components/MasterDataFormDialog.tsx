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
import {
  CATEGORIES_WITH_WARN_DAYS,
  FLEET_CATEGORY_LABELS,
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
} from '../types'
import { apiErrorMessage } from '../utils/api-error'

interface MasterDataFormDialogProps {
  open: boolean
  category: FleetMasterCategory
  initial?: FleetMasterRow
  onSubmit: (payload: FleetMasterPayload) => Promise<void>
  onClose: () => void
}

// Mirrors the backend's /^[a-z0-9_]+$/ rule so an admin never has to think about the slug: the
// label they type produces it. Editing keeps the original — code is the row's identity.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function MasterDataFormDialog({
  open,
  category,
  initial,
  onSubmit,
  onClose,
}: MasterDataFormDialogProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0))
  const [warnDays, setWarnDays] = useState(
    initial?.warnDays == null ? '' : String(initial.warnDays),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const showWarnDays = CATEGORIES_WITH_WARN_DAYS.includes(category)
  const code = initial?.code ?? slugify(label)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) {
      setError('Label wajib diisi.')
      return
    }
    if (!code) {
      setError('Label harus memuat huruf atau angka.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        category,
        code,
        label: label.trim(),
        sortOrder: Number(sortOrder) || 0,
        warnDays: showWarnDays && warnDays !== '' ? Number(warnDays) : null,
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
          <DialogTitle>
            {initial ? 'Ubah' : 'Tambah'} {FLEET_CATEGORY_LABELS[category]}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Label" required htmlFor="md-label">
            <Input id="md-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>

          <FormField
            label="Kode"
            htmlFor="md-code"
            hint={initial ? 'Kode tidak bisa diubah.' : 'Dibuat otomatis dari label.'}
          >
            <Input id="md-code" value={code} disabled readOnly />
          </FormField>

          <FormField label="Urutan tampil" htmlFor="md-sort" hint="Angka kecil tampil lebih dulu.">
            <Input
              id="md-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </FormField>

          {showWarnDays && (
            <FormField
              label="Ambang peringatan (hari)"
              htmlFor="md-warn"
              hint="Berapa hari sebelum jatuh tempo peringatan mulai muncul. Kosongkan untuk 30 hari."
            >
              <Input
                id="md-warn"
                type="number"
                min={0}
                max={365}
                value={warnDays}
                onChange={(e) => setWarnDays(e.target.value)}
              />
            </FormField>
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
