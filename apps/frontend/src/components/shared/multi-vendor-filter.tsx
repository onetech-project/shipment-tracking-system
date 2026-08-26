'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Truck, X } from 'lucide-react'

export interface MultiVendorFilterProps {
  /** All selectable vendor names, raw and already ordered by the caller. */
  vendors: string[]
  /** Currently selected vendor names. */
  selected: string[]
  onChange: (selected: string[]) => void
  /** Optional className for the trigger button wrapper. */
  className?: string
  /** Which edge the dropdown panel aligns to. */
  align?: 'left' | 'right'
}

/**
 * Multi-select vendor filter rendered as a searchable checkbox list inside a dropdown.
 *
 * Deliberately a sibling of MultiRouteFilter rather than a generalisation of it: routes carry a
 * label/pair translation and a MapPin affordance that mean nothing here, and vendors carry free
 * text that needs the search box to be usable. Two small components beat one with a mode flag.
 *
 * Names are passed through untouched — no trim, no case folding — because they have to stay
 * byte-identical to v_pnl_to.vendor all the way to the SQL join.
 */
export function MultiVendorFilter({
  vendors,
  selected,
  onChange,
  className,
  align = 'left',
}: MultiVendorFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    else document.removeEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedSet = new Set(selected)
  const filtered = search.trim()
    ? vendors.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()))
    : vendors

  const toggle = (vendor: string) => {
    if (selectedSet.has(vendor)) onChange(selected.filter((v) => v !== vendor))
    else onChange([...selected, vendor])
  }

  const label =
    selected.length === 0
      ? 'All Vendors'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} vendors`

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate text-left">
          <Truck size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear vendors"
              title="Clear vendors"
              onClick={(e) => {
                // Without stopPropagation the click also toggles the dropdown open, so clearing
                // from the collapsed trigger would leave the panel hanging open.
                e.stopPropagation()
                onChange([])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onChange([])
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-[100] mt-2 max-h-80 w-[260px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/10 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18)' }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Filter Vendors</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange([...vendors])}
                className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              >
                None
              </button>
            </div>
          </div>

          <div className="border-b border-border px-2 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-52 overflow-auto px-2 py-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No vendors</p>
            ) : (
              filtered.map((vendor) => (
                <label
                  key={vendor}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs transition-colors hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    aria-label={vendor}
                    checked={selectedSet.has(vendor)}
                    onChange={() => toggle(vendor)}
                    className="h-3 w-3 rounded border border-border accent-accent focus:ring-1 focus:ring-accent"
                  />
                  <span className="truncate" title={vendor}>
                    {vendor}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
