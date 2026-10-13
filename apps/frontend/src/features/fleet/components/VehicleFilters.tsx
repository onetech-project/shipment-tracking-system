'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, fieldClass } from '@/components/ui/input'
import { FilterBar } from '@/components/shared/filter-bar'
import { FleetMasterRow, FleetSeverity, FleetVehicleFilters } from '../types'
import { SEVERITY_FILTER_OPTIONS } from '../utils/severity'

// `.field .lbl` in the mockup: a tiny bold uppercase caption above every filter control.
const LABEL_CLASS = 'text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground'

interface VehicleFiltersProps {
  value: FleetVehicleFilters
  onChange: (next: FleetVehicleFilters) => void
  kepemilikanOptions: FleetMasterRow[]
  poolOptions: FleetMasterRow[]
  statusOptions: FleetMasterRow[]
}

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
      <div className="flex min-w-[220px] max-w-[320px] flex-1 flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="vehicle-q">
          Cari armada
        </label>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <Input
            id="vehicle-q"
            value={value.q ?? ''}
            placeholder="Nopol, merk, no. rangka, sopir…"
            onChange={(e) => patch({ q: e.target.value })}
            className="pl-7"
          />
        </div>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="vehicle-severity">
          Status dokumen
        </label>
        <select
          id="vehicle-severity"
          className={`w-full ${fieldClass}`}
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

      <div className="flex min-w-[160px] flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="vehicle-kepemilikan">
          Kepemilikan
        </label>
        <select
          id="vehicle-kepemilikan"
          className={`w-full ${fieldClass}`}
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

      <div className="flex min-w-[160px] flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="vehicle-pool">
          Pool
        </label>
        <select
          id="vehicle-pool"
          className={`w-full ${fieldClass}`}
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

      <div className="flex min-w-[160px] flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="vehicle-status">
          Status unit
        </label>
        <select
          id="vehicle-status"
          className={`w-full ${fieldClass}`}
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

      <label
        className="mb-0 inline-flex cursor-pointer items-center gap-1.5 self-center rounded-md border bg-surface-2 px-3 py-1.5 text-xs font-medium motion-safe:transition-colors hover:border-brand hover:bg-good-soft"
        htmlFor="vehicle-archived"
      >
        <input
          id="vehicle-archived"
          type="checkbox"
          className="h-3.5 w-3.5 accent-brand-2"
          checked={value.includeArchived ?? false}
          onChange={(e) => patch({ includeArchived: e.target.checked || undefined })}
        />
        Tampilkan arsip
      </label>

      {isFiltered && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ page: 1 })}>
          Reset filter
        </Button>
      )}
    </FilterBar>
  )
}
