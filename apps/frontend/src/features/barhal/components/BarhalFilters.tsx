'use client'

import { Search } from 'lucide-react'
import { FilterBar } from '@/components/shared/filter-bar'
import { fieldClass } from '@/components/ui/input'

interface BarhalFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  date: string
  onDateChange: (v: string) => void
  origin: string
  onOriginChange: (v: string) => void
  dest: string
  onDestChange: (v: string) => void
  stations: { origins: string[]; dests: string[] }
}

export function BarhalFilters({
  search,
  onSearchChange,
  date,
  onDateChange,
  origin,
  onOriginChange,
  dest,
  onDestChange,
  stations,
}: BarhalFiltersProps) {
  return (
    <FilterBar>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari No. Koli, No. Penerbangan, No. TO…"
          className={`w-72 pl-8 ${fieldClass}`}
        />
      </div>
      <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className={fieldClass} />
      <select value={origin} onChange={(e) => onOriginChange(e.target.value)} className={fieldClass}>
        <option value="">Semua Origin</option>
        {stations.origins.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select value={dest} onChange={(e) => onDestChange(e.target.value)} className={fieldClass}>
        <option value="">Semua Destinasi</option>
        {stations.dests.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </FilterBar>
  )
}
