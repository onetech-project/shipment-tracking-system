'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicleFile } from '../../types'
import { formatBytes } from '../../utils/format-bytes'
import { Section } from './form-primitives'
import { SlotState, VehicleBerkasApi } from './useVehicleBerkas'

interface BerkasFormSectionProps {
  title: string
  slots: FleetMasterRow[]
  // What the server already holds for this unit. Empty on a create, where nothing is filed yet.
  existing: FleetVehicleFile[]
  berkas: VehicleBerkasApi
  cols: number
  accept: string
  hint: string
  showThumbnail: boolean
}

// One component for both photos and documents. They differ only in their limits, their column
// count and whether a thumbnail is drawn — two near-identical components would drift apart on
// the first change, the same reason DocumentSection serves three sections at once.
export function BerkasFormSection({
  title,
  slots,
  existing,
  berkas,
  cols,
  accept,
  hint,
  showThumbnail,
}: BerkasFormSectionProps) {
  // Per slot, not per section: a photo this form refused says nothing about the slot beside it.
  const [pickErrors, setPickErrors] = useState<Record<string, string>>({})

  // An empty section is worse than no section: a fieldset with no cards reads as a list that
  // failed to load rather than a kind of file this deployment does not have.
  if (slots.length === 0) return null

  const bySlot = new Map(existing.map((f) => [f.slotId, f]))

  const choose = (slot: FleetMasterRow, file: File | null) => {
    if (!file) return
    const message = berkas.pick(slot, file)
    setPickErrors((current) => {
      const next = { ...current }
      if (message) next[slot.id] = message
      else delete next[slot.id]
      return next
    })
  }

  return (
    <Section title={title} cols={cols}>
      {slots.map((slot) => {
        const state = berkas.slotState(slot.id)
        const onFile = bySlot.get(slot.id) ?? null
        const busy = state.status === 'uploading'
        const inputId = `vf-berkas-${slot.id}`
        const preview =
          state.status === 'picked' || state.status === 'failed' ? state.previewUrl : null

        return (
          <div key={slot.id} className="rounded-md border bg-card p-3">
            <div className="text-sm font-medium">{slot.label}</div>

            {showThumbnail && preview && (
              // A blob URL the operator's own pick produced a moment ago, not bytes a row
              // carries — the ban noted on BerkasSlotCard is about raw data URIs inherited from
              // the prototype and does not reach this.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={slot.label}
                className="mt-2 h-24 w-full rounded object-cover"
              />
            )}

            <div className="mt-1 text-xs text-muted-foreground">
              <SlotStatus state={state} file={onFile} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <label
                htmlFor={inputId}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-sm ${
                  busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
              >
                {pickLabel(state, onFile)}
              </label>
              <input
                id={inputId}
                type="file"
                accept={accept}
                disabled={busy}
                aria-label={`Pilih berkas ${slot.label}`}
                className="sr-only"
                onChange={(e) => {
                  choose(slot, e.target.files?.[0] ?? null)
                  // Cleared so picking the same filename twice running still fires a change.
                  e.target.value = ''
                }}
              />
              {(state.status === 'picked' || state.status === 'failed') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => berkas.clear(slot.id)}
                >
                  Batalkan pilihan
                </Button>
              )}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

            {state.status === 'failed' && (
              <p className="mt-1 text-xs text-destructive">{state.message}</p>
            )}
            {pickErrors[slot.id] && (
              <p className="mt-1 text-xs text-destructive">{pickErrors[slot.id]}</p>
            )}
          </div>
        )
      })}
    </Section>
  )
}

// Never "Mengunggah…": the status line above already says that, and a button repeating it reads
// as a second thing happening rather than the same one.
function pickLabel(state: SlotState, file: FleetVehicleFile | null): string {
  if (state.status === 'failed') return 'Coba lagi'
  if (state.status === 'picked' || state.status === 'uploading' || file) return 'Ganti'
  return 'Pilih berkas'
}

function SlotStatus({ state, file }: { state: SlotState; file: FleetVehicleFile | null }) {
  if (state.status === 'uploading') return <>Mengunggah…</>

  // A pending pick describes the slot better than what the server still holds: it is what the
  // operator is about to replace that with.
  if (state.status === 'picked' || state.status === 'failed') {
    return (
      <>
        {state.file.name} · {formatBytes(state.file.size)} · belum diunggah
      </>
    )
  }

  if (!file) return <>Belum ada berkas</>
  if (file.externalUrl) return <>tautan eksternal</>
  return (
    <>
      {file.originalName ?? 'berkas'} · {formatBytes(file.sizeBytes)}
    </>
  )
}
