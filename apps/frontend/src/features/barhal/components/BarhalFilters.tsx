'use client'

import { Search } from 'lucide-react'

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
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari No. Koli, No. Penerbangan, No. TO…"
          className="w-72 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />
      <select
        value={origin}
        onChange={(e) => onOriginChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Semua Origin</option>
        {stations.origins.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select
        value={dest}
        onChange={(e) => onDestChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Semua Destinasi</option>
        {stations.dests.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  )
}
