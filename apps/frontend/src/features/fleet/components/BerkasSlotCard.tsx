'use client'

import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicleFile } from '../types'
import { formatBytes } from '../utils/format-bytes'

interface Props {
  slot: Pick<FleetMasterRow, 'id' | 'code' | 'label'>
  file: FleetVehicleFile | null
  canEdit: boolean
  onUpload: (slotId: string) => void
  onView: (file: FleetVehicleFile) => void
  onDelete: (file: FleetVehicleFile) => void
}

// No preview thumbnail is rendered from file content. The prototype put the raw data URI into an
// <img src> (lines 585, 754), which is precisely the XSS this port removes. The card links to a
// file; "Lihat" opens it in FilePreviewDialog through a presigned URL (spec §4.3), which is a
// different thing from rendering bytes the row carries.
export function BerkasSlotCard({ slot, file, canEdit, onUpload, onView, onDelete }: Props) {
  const status = !file
    ? 'belum ada berkas'
    : file.externalUrl
      ? 'tautan eksternal'
      : `${file.originalName ?? 'berkas'} · ${formatBytes(file.sizeBytes)}`

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-sm font-medium">{slot.label}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground" title={status}>
        {status}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {file && (
          <Button variant="outline" size="sm" onClick={() => onView(file)}>
            Lihat
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => onUpload(slot.id)}>
            {file ? 'Ganti' : 'Unggah'}
          </Button>
        )}
        {canEdit && file && (
          <Button variant="outline" size="sm" onClick={() => onDelete(file)}>
            Hapus
          </Button>
        )}
      </div>
    </div>
  )
}
