'use client'

import { Search } from 'lucide-react'

interface BarhalFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  date: string
  onDateChange: (v: string) => void
  route: string
  onRouteChange: (v: string) => void
  routes: string[]
}

export function BarhalFilters({
  search,
  onSearchChange,
  date,
  onDateChange,
  route,
  onRouteChange,
  routes,
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
        value={route}
        onChange={(e) => onRouteChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Semua Rute</option>
        {routes.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  )
}
