'use client'
import { useAirShipments } from '@/features/air-shipments/hooks/useAirShipments'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import { TableSkeleton } from '@/features/air-shipments/components/TableSkeleton'
import { SortOrder } from '@/features/air-shipments/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { COLUMN_KEYS, FROZEN_KEYS, colLabel } from '../columns.config'

interface AirShipmentsPageProps {
  endpoint: string
  tableName: string
  title: string
  defaultSortBy?: string
}

export function AirShipmentsPage({
  endpoint,
  tableName,
  title,
  defaultSortBy = 'date',
}: AirShipmentsPageProps) {
  const { isConnected, lastSyncAt, affectedTables } = useSyncNotification()
  const { data, isLoading, query, setPage, setSort, setSearch } = useAirShipments(
    endpoint,
    tableName,
    affectedTables,
    defaultSortBy
  )

  // Search state with debounce
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput)
    }, 700)
    return () => clearTimeout(handler)
  }, [searchInput, setSearch])

  // Column visibility state
  const isAirShipmentTable = tableName.startsWith('air_shipments_')
  const allColumns = useMemo(() => COLUMN_KEYS[tableName] || [], [tableName])
  const frozenColumns = isAirShipmentTable ? FROZEN_KEYS : []
  const toggleableColumns = allColumns.filter((col) => !frozenColumns.includes(col))
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    ...frozenColumns,
    ...toggleableColumns,
  ])
  useEffect(() => {
    setVisibleColumns([...frozenColumns, ...toggleableColumns])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns, tableName])

  // Dropdown state for column toggle
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      document.removeEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const handleColumnToggle = (col: string) => {
    if (frozenColumns.includes(col)) return
    setVisibleColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )
  }

  const handleSort = (col: string, order: SortOrder) => setSort(col, order)

  // Determine if search should be shown
  const showSearch = !/rate|route/i.test(title)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
      </div>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search input (hidden for Rate and Routes menu) */}
          {showSearch && (
            <input
              type="text"
              className="border rounded px-2 py-1 min-w-[200px]"
              placeholder="Search shipments..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          )}
        </div>
        {/* Column visibility controls in dropdown, right-aligned */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="border rounded px-2 py-1 text-xs bg-background hover:bg-accent flex items-center gap-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            onClick={() => setDropdownOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            <span className="font-medium">Columns</span>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="ml-1">
              <path
                d="M5 8L10 13L15 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 min-w-[180px] max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/10 z-[100] animate-fade-in"
              style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18)' }}
            >
              <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground bg-muted rounded-t-lg sticky top-0 z-10">
                Toggle Columns
              </div>
              <div className="flex flex-col gap-1 px-3 py-2">
                {toggleableColumns.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/30 rounded px-1 py-1 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col)}
                      onChange={() => handleColumnToggle(col)}
                      className="accent-accent h-3 w-3 rounded border border-border focus:ring-1 focus:ring-accent"
                    />
                    <span className="truncate" title={colLabel(col)}>
                      {colLabel(col)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <TableSkeleton />
      ) : data ? (
        <AirShipmentTable
          data={data.data}
          meta={data.meta}
          sortBy={query.sortBy}
          sortOrder={query.sortOrder}
          onSort={handleSort}
          onPageChange={setPage}
          tableName={tableName}
          visibleColumns={visibleColumns}
        />
      ) : null}
    </div>
  )
}
