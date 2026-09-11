'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FleetMasterRow, FleetSeverity, FleetVehicleFilters } from '../types'
import { SEVERITY_FILTER_OPTIONS } from '../utils/severity'

interface VehicleFiltersProps {
  value: FleetVehicleFilters
  onChange: (next: FleetVehicleFilters) => void
  kepemilikanOptions: FleetMasterRow[]
  poolOptions: FleetMasterRow[]
  statusOptions: FleetMasterRow[]
}

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

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
    <div className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/20 p-3 md:flex-row md:flex-wrap md:items-end">
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
          className={SELECT_CLASS}
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
          className={SELECT_CLASS}
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
          className={SELECT_CLASS}
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
          className={SELECT_CLASS}
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
          className="h-4 w-4"
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
    </div>
  )
}
