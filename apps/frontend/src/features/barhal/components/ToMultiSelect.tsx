'use client'

import { useState } from 'react'
import { AvailableTo } from '../types'
import { formatDate } from '../utils/dateFormat'

interface ToMultiSelectProps {
  options: AvailableTo[]
  selected: string[]
  onChange: (toNumbers: string[]) => void
  isLoading?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const AVAILABLE_TOS_LIMIT = 100

export function ToMultiSelect({ options, selected, onChange, isLoading }: ToMultiSelectProps) {
  const [search, setSearch] = useState('')
  const selectedSet = new Set(selected)

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.to_number.toLowerCase().includes(search.trim().toLowerCase()) ||
          (o.awb ?? '').toLowerCase().includes(search.trim().toLowerCase()),
      )
    : options

  const toggle = (toNumber: string) => {
    onChange(selectedSet.has(toNumber) ? selected.filter((t) => t !== toNumber) : [...selected, toNumber])
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-2 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari No. TO / AWB…"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </div>
      <div className="max-h-64 overflow-auto">
        {isLoading ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Tidak ada TO tersedia.</p>
        ) : (
          filtered.map((to) => (
            <label
              key={to.to_number}
              className="flex cursor-pointer flex-col gap-1 border-b border-border/50 px-3 py-2 text-xs last:border-b-0 hover:bg-accent/30"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(to.to_number)}
                    onChange={() => toggle(to.to_number)}
                    className="h-3 w-3 rounded border border-border accent-accent"
                  />
                  <span className="truncate font-medium">{to.to_number}</span>
                  <span className="truncate text-muted-foreground">{to.awb ?? '—'}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDate(to.date)}</span>
                  <span className="shrink-0 text-muted-foreground">{to.vendor}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {fmt.format(to.gross_weight ?? 0)} kg
                </span>
              </span>
              <span className="ml-5 flex items-center gap-2 truncate text-muted-foreground">
                <span className="truncate">{to.lt_number ?? '—'}</span>
                <span className="truncate">{to.origin_station ?? '—'} → {to.dest_station ?? '—'}</span>
                <span className="truncate">Remarks: {to.remarks ?? '—'}</span>
              </span>
            </label>
          ))
        )}
      </div>
      {!isLoading && !search.trim() && options.length >= AVAILABLE_TOS_LIMIT && (
        <p className="border-t border-border px-3 py-2 text-center text-xs text-muted-foreground">
          Tidak menemukan data? Ketik nomor TO untuk pencarian.
        </p>
      )}
    </div>
  )
}
