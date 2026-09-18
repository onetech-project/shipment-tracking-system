'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FleetMasterRow } from '../../types'

// Mirrors storage.constants.ts on the backend, duplicated for the same reason ACCEPTED is in
// BerkasUploadDialog: this is a courtesy check that saves a doomed upload, and the backend
// remains the authority that actually refuses one.
const DOC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const DOC_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

// Mirrors PHOTO_SLOT_PREFIX in storage.constants.ts. Matched on the code rather than on a list
// of ids because ids differ per environment, and an admin may add a fifth photo slot from the
// Master Data screen without waiting for a deploy.
export const PHOTO_SLOT_PREFIX = 'foto_'

export function isPhotoSlot(code: string): boolean {
  return code.startsWith(PHOTO_SLOT_PREFIX)
}

export type SlotState =
  | { status: 'idle' }
  | { status: 'picked'; file: File; previewUrl: string | null }
  | { status: 'uploading' }
  | { status: 'failed'; file: File; previewUrl: string | null; message: string }

export interface UploadFailure {
  slotLabel: string
  message: string
}

export interface VehicleBerkasApi {
  slotState: (slotId: string) => SlotState
  // Returns the operator-facing reason a file was refused, or null when it was accepted. A
  // rejected pick is an ordinary event on this form rather than an exceptional one, so it is a
  // return value and not a throw.
  pick: (slot: FleetMasterRow, file: File) => string | null
  clear: (slotId: string) => void
  pendingCount: number
  uploadAll: (vehicleId: string) => Promise<UploadFailure[]>
}

export interface UseVehicleBerkasOptions {
  upload: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
}

interface Pending {
  slot: FleetMasterRow
  file: File
  previewUrl: string | null
}

const IDLE: SlotState = { status: 'idle' }

const limitsFor = (code: string) =>
  isPhotoSlot(code)
    ? {
        types: PHOTO_MIME_TYPES,
        max: PHOTO_MAX_BYTES,
        formats: 'jpg, png, atau webp',
        maxLabel: '5 MB',
      }
    : {
        types: DOC_MIME_TYPES,
        max: DOC_MAX_BYTES,
        formats: 'jpg, png, webp, atau pdf',
        maxLabel: '10 MB',
      }

// Holds the files an operator has picked on the vehicle form until they press Simpan. Kept apart
// from useVehicleForm on purpose: a file never enters the JSON payload — it travels to object
// storage through three requests of its own — so putting it there would give that hook two kinds
// of output with nothing in common.
export function useVehicleBerkas({ upload }: UseVehicleBerkasOptions): VehicleBerkasApi {
  const [pending, setPending] = useState<Record<string, Pending>>({})
  const [uploading, setUploading] = useState<Record<string, true>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})

  // uploadAll reads the picks as they stand when it runs, not as they stood when the callback
  // was created. Without the ref it would close over a stale map and upload whatever had been
  // picked at first render.
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  // Revoked on unmount as well as on replace: a dialog closed mid-edit would otherwise leave its
  // previews alive for as long as the tab is open.
  const previewsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const previews = previewsRef.current
    return () => {
      for (const url of previews) URL.revokeObjectURL(url)
      previews.clear()
    }
  }, [])

  const revoke = useCallback((url: string | null) => {
    if (!url) return
    URL.revokeObjectURL(url)
    previewsRef.current.delete(url)
  }, [])

  const forget = useCallback((slotId: string) => {
    setFailures((current) => {
      if (!(slotId in current)) return current
      const next = { ...current }
      delete next[slotId]
      return next
    })
  }, [])

  const pick = useCallback(
    (slot: FleetMasterRow, file: File): string | null => {
      const limits = limitsFor(slot.code)
      if (!limits.types.includes(file.type)) {
        return `Format tidak didukung. Pilih ${limits.formats}.`
      }
      if (file.size > limits.max) {
        return `Ukuran berkas maksimal ${limits.maxLabel}.`
      }

      // Only photos get a preview: a pdf has no thumbnail worth an object URL, and the document
      // cards draw none.
      let previewUrl: string | null = null
      if (isPhotoSlot(slot.code)) {
        previewUrl = URL.createObjectURL(file)
        previewsRef.current.add(previewUrl)
      }

      setPending((current) => {
        revoke(current[slot.id]?.previewUrl ?? null)
        return { ...current, [slot.id]: { slot, file, previewUrl } }
      })
      forget(slot.id)
      return null
    },
    [revoke, forget],
  )

  const clear = useCallback(
    (slotId: string) => {
      setPending((current) => {
        if (!(slotId in current)) return current
        revoke(current[slotId].previewUrl)
        const next = { ...current }
        delete next[slotId]
        return next
      })
      forget(slotId)
    },
    [revoke, forget],
  )

  const slotState = useCallback(
    (slotId: string): SlotState => {
      if (uploading[slotId]) return { status: 'uploading' }
      const row = pending[slotId]
      if (!row) return IDLE
      const message = failures[slotId]
      if (message) {
        return { status: 'failed', file: row.file, previewUrl: row.previewUrl, message }
      }
      return { status: 'picked', file: row.file, previewUrl: row.previewUrl }
    },
    [pending, uploading, failures],
  )

  // Sequential, not parallel: one file is three requests (intent, PUT, confirm), so seven files
  // at once would be twenty-one requests from a single click. A slot that fails does not stop
  // the ones after it — an operator who picked five files is better served by four uploads than
  // by none.
  const uploadAll = useCallback(
    async (vehicleId: string): Promise<UploadFailure[]> => {
      const rows = Object.values(pendingRef.current)
      const failed: UploadFailure[] = []

      for (const row of rows) {
        setUploading((current) => ({ ...current, [row.slot.id]: true }))
        try {
          await upload({ vehicleId, slotId: row.slot.id, file: row.file })
          revoke(row.previewUrl)
          setPending((current) => {
            const next = { ...current }
            delete next[row.slot.id]
            return next
          })
          forget(row.slot.id)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Gagal mengunggah berkas.'
          failed.push({ slotLabel: row.slot.label, message })
          // The File stays in `pending` deliberately: Coba lagi must not send the operator back
          // to the file picker for something they already chose.
          setFailures((current) => ({ ...current, [row.slot.id]: message }))
        } finally {
          setUploading((current) => {
            const next = { ...current }
            delete next[row.slot.id]
            return next
          })
        }
      }

      return failed
    },
    [upload, revoke, forget],
  )

  return {
    slotState,
    pick,
    clear,
    pendingCount: Object.keys(pending).length,
    uploadAll,
  }
}
