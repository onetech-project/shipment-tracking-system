'use client'

import { useState } from 'react'
import { FileWarning } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { FilterBar } from '@/components/shared/filter-bar'
import { Input } from '@/components/ui/input'
import { FleetMasterRow, FleetVehicle, FleetVehicleFile } from '../types'
import { useVehicleFiles } from '../hooks/useFleetVehicleFiles'
import { BerkasSlotCard } from './BerkasSlotCard'

type Completeness = 'all' | 'lengkap' | 'kurang'

interface Props {
  vehicles: FleetVehicle[]
  slots: FleetMasterRow[]
  canEdit: boolean
  onUpload: (vehicle: FleetVehicle, slotId: string) => void
  onView: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
  onDelete: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
}

export function BerkasTab({ vehicles, slots, canEdit, onUpload, onView, onDelete }: Props) {
  const [completeness, setCompleteness] = useState<Completeness>('all')
  const [q, setQ] = useState('')

  // Without slots there is nothing to fill, and rendering zero slots over a live page reads as
  // "the files are gone" rather than "the list has not loaded".
  if (slots.length === 0) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Belum ada jenis berkas di master data. Tambahkan dulu di tab Master Data."
      />
    )
  }

  const term = q.trim().toLowerCase()
  const rows = vehicles.filter((v) => {
    if (term) {
      const hay = [v.nopol, v.merk, v.tipe, v.driver?.nama, v.pool?.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(term)) return false
    }
    const { ada, wajib } = v.berkasCount
    if (completeness === 'lengkap' && ada < wajib) return false
    if (completeness === 'kurang' && ada >= wajib) return false
    return true
  })

  return (
    <div>
      <FilterBar>
        <Input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nopol, merk, sopir, atau pool…"
          aria-label="Cari kendaraan"
          className="min-w-56 flex-1"
        />
        <div role="group" aria-label="Saring kelengkapan berkas" className="flex gap-1">
          {(
            [
              ['all', 'Semua'],
              ['lengkap', 'Lengkap'],
              ['kurang', 'Belum lengkap'],
            ] as [Completeness, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={completeness === value}
              onClick={() => setCompleteness(value)}
              className={`h-8 rounded-[7px] border px-3 text-[12.5px] font-medium motion-safe:transition-colors ${
                completeness === value
                  ? 'border-brand-ink bg-brand-ink text-white'
                  : 'border-border bg-card text-muted-foreground hover:border-brand hover:text-brand-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Tidak ada kendaraan yang cocok." />
      ) : (
        <div className="space-y-4">
          {rows.map((vehicle) => (
            <BerkasVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              slots={slots}
              canEdit={canEdit}
              onUpload={onUpload}
              onView={onView}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// A component per vehicle, so each one calls useVehicleFiles for itself: a hook cannot be called
// inside a .map(), and lifting every unit's files into the page would mean one query per row
// fired from a single component.
function BerkasVehicleCard({
  vehicle,
  slots,
  canEdit,
  onUpload,
  onView,
  onDelete,
}: {
  vehicle: FleetVehicle
  slots: FleetMasterRow[]
  canEdit: boolean
  onUpload: (vehicle: FleetVehicle, slotId: string) => void
  onView: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
  onDelete: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
}) {
  const { data: files } = useVehicleFiles(vehicle.id)
  const bySlot = new Map((files ?? []).map((f) => [f.slotId, f]))
  // The chip comes from the list response rather than from the rows just fetched, so it reads the
  // same number as the Armada tab does for the same unit.
  const { ada, wajib } = vehicle.berkasCount
  const tone =
    ada >= wajib
      ? 'bg-good/10 text-brand-ink'
      : ada === 0
        ? 'bg-bad/10 text-bad'
        : 'bg-warn/10 text-warn-ink'

  return (
    <article className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-extrabold tabular">{vehicle.nopol}</div>
          <div className="text-xs text-muted-foreground">
            {[vehicle.merk, vehicle.tipe].filter(Boolean).join(' ')}
            {' · '}
            {vehicle.driver?.nama ?? 'tanpa sopir'}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
          {ada}/{wajib}
        </span>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => (
          <BerkasSlotCard
            key={slot.id}
            slot={slot}
            file={bySlot.get(slot.id) ?? null}
            canEdit={canEdit}
            onUpload={(slotId) => onUpload(vehicle, slotId)}
            onView={(file) => onView(vehicle, file)}
            onDelete={(file) => onDelete(vehicle, file)}
          />
        ))}
      </div>
    </article>
  )
}
