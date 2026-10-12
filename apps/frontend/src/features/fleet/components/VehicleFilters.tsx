'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilterBar } from '@/components/shared/filter-bar'
import { FleetMasterRow, FleetSeverity, FleetVehicleFilters } from '../types'
import { SEVERITY_FILTER_OPTIONS } from '../utils/severity'

interface VehicleFiltersProps {
  value: FleetVehicleFilters
  onChange: (next: FleetVehicleFilters) => void
  kepemilikanOptions: FleetMasterRow[]
  poolOptions: FleetMasterRow[]
  statusOptions: FleetMasterRow[]
}

// Matches Input's own styling (see BarhalFilters.tsx:18) so every field across the fleet area —
// text, date, and these hand-rolled selects alike — reads as one field style, not several.
const fieldClass =
  'h-8 w-full rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40'

export function VehicleFilters({
  value,
  onChange,
  kepemilikanOptions,
  poolOptions,
  statusOptions,
}: VehicleFiltersProps) {
  // Every change resets to page 1. Narrowing the filter while sitting on page 4 shows an empty
  // table, which reads as "the filter found nothing" rather than "you are past the end".
  const patch = (next: Partial<FleetVehicleFilters>) => onChange({ ...value, ...next, page: 1 })

  const isFiltered = Boolean(
    value.q ||
      value.severity ||
      value.kepemilikanId ||
      value.poolId ||
      value.statusId ||
      value.includeArchived,
  )

  return (
    <FilterBar>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-q">
          Cari armada
        </label>
        <Input
          id="vehicle-q"
          value={value.q ?? ''}
          placeholder="Nopol, merk, no. rangka, sopir…"
          onChange={(e) => patch({ q: e.target.value })}
        />
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-severity">
          Status dokumen
        </label>
        <select
          id="vehicle-severity"
          className={fieldClass}
          value={value.severity ?? ''}
          // undefined, not '': an empty string would travel to the backend as a filter value and
          // the DTO would reject it.
          onChange={(e) =>
            patch({ severity: (e.target.value || undefined) as FleetSeverity | undefined })
          }
        >
          {SEVERITY_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-kepemilikan">
          Kepemilikan
        </label>
        <select
          id="vehicle-kepemilikan"
          className={fieldClass}
          value={value.kepemilikanId ?? ''}
          onChange={(e) => patch({ kepemilikanId: e.target.value || undefined })}
        >
          <option value="">Semua kepemilikan</option>
          {kepemilikanOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-pool">
          Pool
        </label>
        <select
          id="vehicle-pool"
          className={fieldClass}
          value={value.poolId ?? ''}
          onChange={(e) => patch({ poolId: e.target.value || undefined })}
        >
          <option value="">Semua pool</option>
          {poolOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-status">
          Status unit
        </label>
        <select
          id="vehicle-status"
          className={fieldClass}
          value={value.statusId ?? ''}
          onChange={(e) => patch({ statusId: e.target.value || undefined })}
        >
          <option value="">Semua status</option>
          {statusOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm" htmlFor="vehicle-archived">
        <input
          id="vehicle-archived"
          type="checkbox"
          className="h-4 w-4 accent-brand-2"
          checked={value.includeArchived ?? false}
          onChange={(e) => patch({ includeArchived: e.target.checked || undefined })}
        />
        Tampilkan arsip
      </label>

      {isFiltered && (
        <Button type="button" variant="ghost" onClick={() => onChange({ page: 1 })}>
          Reset filter
        </Button>
      )}
    </FilterBar>
  )
}
