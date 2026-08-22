'use client'

import { useState } from 'react'
import { AvailableVendor } from '../types'

interface VendorPickerProps {
  vendors: AvailableVendor[]
  value: string[]
  onChange: (next: string[]) => void
}

// Deliberately not a copy of RoutePicker. RoutePicker sections its list under an origin label and
// shows only the destination inside each section; that works because routes have an origin axis and
// there are about 31 of them. Vendor names are free text from a Google Sheet with no such axis, so
// the shape here is one flat list plus a search box.
//
// Order comes from the endpoint's `ORDER BY v.vendor`. The picker does not re-sort: a client-side
// sort would use a different collation from Postgres and the two lists would drift apart for no
// benefit.
export function VendorPicker({ vendors, value, onChange }: VendorPickerProps) {
  const [search, setSearch] = useState('')
  const selected = new Set(value)

  const query = search.trim().toLowerCase()
  // Lowercasing happens on a throwaway copy, for matching only. Everything handed to onChange is
  // the raw `v.vendor` string — that value is stored and later compared byte-for-byte against
  // v_pnl_to.vendor, so normalising it anywhere on this path is a silent data bug.
  const filtered = query ? vendors.filter((v) => v.vendor.toLowerCase().includes(query)) : vendors

  const toggle = (vendor: string) =>
    onChange(selected.has(vendor) ? value.filter((v) => v !== vendor) : [...value, vendor])

  return (
    <div className="space-y-2">
      <input
        type="search"
        aria-label="Search vendors"
        placeholder="Cari vendor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {/* Counts `value`, not `filtered`, so narrowing the search never looks like it dropped picks. */}
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-3">
        {filtered.map((v) => (
          <label key={v.vendor} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={v.vendor}
              checked={selected.has(v.vendor)}
              onChange={() => toggle(v.vendor)}
            />
            <span className="truncate">{v.vendor}</span>
            {!v.hasData && (
              <span
                title="Belum ada TO yang memakai vendor ini"
                className="shrink-0 text-xs text-amber-600"
              >
                •
              </span>
            )}
            {!v.inMaster && (
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                ada data, tidak ada rate card
              </span>
            )}
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {vendors.length === 0 ? 'No vendors available.' : 'No vendor matches that search.'}
          </p>
        )}
      </div>
    </div>
  )
}
