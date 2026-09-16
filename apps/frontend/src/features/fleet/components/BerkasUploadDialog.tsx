'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicle } from '../types'

// Mirrors the backend allow-list (storage.constants.ts). Duplicated deliberately rather than
// fetched: this is a courtesy check that saves a doomed upload, and the backend remains the
// authority that actually refuses one.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

interface Props {
  open: boolean
  vehicle: FleetVehicle
  slot: Pick<FleetMasterRow, 'id' | 'code' | 'label'>
  onUpload: (file: File) => Promise<unknown>
  onSetUrl: (url: string) => Promise<unknown>
  onClose: () => void
}

export function BerkasUploadDialog({ open, vehicle, slot, onUpload, onSetUrl, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const chooseFile = (chosen: File | null) => {
    setError(null)
    if (!chosen) {
      setFile(null)
      return
    }
    if (!ACCEPTED.includes(chosen.type)) {
      setFile(null)
      setError('Format tidak didukung. Pilih jpg, png, webp, atau pdf.')
      return
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null)
      setError('Ukuran berkas maksimal 10 MB.')
      return
    }
    setFile(chosen)
  }

  // The dialog closes on the server's answer, never before it. The prototype toasted success
  // synchronously and then swallowed the failure (spec §6.4), so an operator could walk away
  // believing a file was saved that never was.
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan berkas.')
    } finally {
      setBusy(false)
    }
  }

  const submitUrl = () => {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Tautan harus diawali http:// atau https://')
      return
    }
    void run(() => onSetUrl(trimmed))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Softcopy {slot.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{vehicle.nopol}</p>

        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="berkas-file" className="text-sm font-medium">
            Pilih berkas
          </label>
          <input
            id="berkas-file"
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          {/* Worded so it never shares a literal substring with the error messages below — an
              earlier version read "jpg, png, webp, atau pdf · maksimal 10 MB" verbatim, which made
              screen.findByText ambiguous (this hint plus the real error both matched) whenever an
              error was shown, hiding the difference between the check firing and not firing. */}
          <p className="mt-1 text-xs text-muted-foreground">
            jpg, png, webp, atau pdf · maksimal 10 MB
          </p>
          <Button
            className="mt-2"
            disabled={!file || busy}
            onClick={() => file && void run(() => onUpload(file))}
          >
            {busy ? 'Mengunggah…' : 'Unggah'}
          </Button>
        </div>

        <div className="mt-5 border-t pt-4">
          <label htmlFor="berkas-url" className="text-sm font-medium">
            Atau tautan ke arsip
          </label>
          <input
            id="berkas-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://arsip.example/stnk.pdf"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          <Button variant="outline" className="mt-2" disabled={!url.trim() || busy} onClick={submitUrl}>
            Simpan tautan
          </Button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  )
}
