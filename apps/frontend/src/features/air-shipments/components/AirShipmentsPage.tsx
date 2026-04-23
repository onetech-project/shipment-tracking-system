'use client'
import { useAirShipments } from '@/features/air-shipments/hooks/useAirShipments'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
import {
  AlertPieChart,
  AlertType,
  ALERT_TYPE_LABELS,
} from '@/features/air-shipments/components/AlertPieChart'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import { TableSkeleton } from '@/features/air-shipments/components/TableSkeleton'
import { SortOrder } from '@/features/air-shipments/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  lockAirShipmentRow,
  batchLockAirShipments,
  batchDeleteAirShipments,
} from '@/features/air-shipments/hooks/useAirShipments'
import { DEFAULT_HIDDEN, FROZEN_KEYS, colLabel } from '../columns.config'
import { Lock, Trash2 } from 'lucide-react'
import { AxiosError } from 'axios'

interface AirShipmentsPageProps {
  endpoint: string
  tableName: string
  title: string
  defaultSortBy?: string
}

interface VisibleColumns {
  [column: string]: boolean
}

export function AirShipmentsPage({
  endpoint,
  tableName,
  title,
  defaultSortBy = 'date',
}: AirShipmentsPageProps) {
  const { isConnected, lastSyncAt, affectedTables } = useSyncNotification()
  const { data, isLoading, query, setPage, setSort, setSearch, setAlertFilter, refresh } =
    useAirShipments(endpoint, tableName, affectedTables, defaultSortBy)

  type BatchOp = 'lock' | 'delete' | null
  const [batchDialog, setBatchDialog] = useState<{
    op: BatchOp
    start: string
    end: string
    loading: boolean
  }>({ op: null, start: '', end: '', loading: false })

  const openBatch = (op: Exclude<BatchOp, null>) =>
    setBatchDialog({ op, start: '', end: '', loading: false })
  const closeBatch = () => setBatchDialog({ op: null, start: '', end: '', loading: false })

  const handleConfirmBatch = async () => {
    if (!batchDialog.op) return
    if (!batchDialog.start || !batchDialog.end) {
      window.alert('Please select both start and end dates')
      return
    }
    setBatchDialog((s) => ({ ...s, loading: true }))
    try {
      if (batchDialog.op === 'lock') {
        const affected = await batchLockAirShipments(
          tableName,
          batchDialog.start,
          batchDialog.end,
          true
        )
        window.alert(`Locked ${affected} row(s)`)
      } else {
        const deleted = await batchDeleteAirShipments(tableName, batchDialog.start, batchDialog.end)
        window.alert(`Deleted ${deleted} row(s)`)
      }
      // refresh table data
      try {
        refresh()
      } catch (e) {
        console.error('Failed to refresh table data', e)
        // ignore refresh errors
      }
    } catch (err: AxiosError | unknown) {
      window.alert(
        `Operation failed: ${err instanceof AxiosError ? err.response?.data?.message : String(err)}`
      )
    } finally {
      closeBatch()
    }
  }

  // Search state with debounce
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput)
    }, 700)
    return () => clearTimeout(handler)
  }, [searchInput, setSearch])

  // Compute all columns including extra_fields keys from data
  const allColumns = useMemo(() => {
    const cols = new Set<string>()

    if (Array.isArray(data?.data)) {
      for (const row of data.data) {
        Object.keys(row)
          .filter((k) => k !== 'extra_fields')
          .forEach((k) => cols.add(k))
        if (row.extra_fields && typeof row.extra_fields === 'object') {
          Object.keys(row.extra_fields).forEach((k) => cols.add(k))
        }
      }
    }

    return [
      ...FROZEN_KEYS.filter((col) => cols.has(col.key)).map((c) => c.key), // Ensure frozen keys are included if present in data
      ...Array.from(cols).filter((col) => !FROZEN_KEYS.some((c) => c.key === col)),
    ]
  }, [data])

  const frozenColumns = FROZEN_KEYS.filter((col) => allColumns.includes(col.key)).map((c) => c.key)
  const toggleableColumns = allColumns.filter((col) => !FROZEN_KEYS.some((c) => c.key === col))
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    ...frozenColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
    ...toggleableColumns.reduce(
      (acc, col) => ({ ...acc, [col]: !DEFAULT_HIDDEN.includes(col) }),
      {}
    ),
  })

  useEffect(() => {
    setVisibleColumns({
      ...frozenColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
      ...toggleableColumns.reduce(
        (acc, col) => ({ ...acc, [col]: !DEFAULT_HIDDEN.includes(col) }),
        {}
      ),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName])

  useEffect(() => {
    setVisibleColumns((prev) => {
      // Preserve currently visible columns that still exist, add new ones, but never remove (except by user toggle)
      const newCols = allColumns.filter((col) => !(col in prev)) // new columns not in previous state
      const updated = { ...prev }
      newCols.forEach((col) => {
        updated[col] = !DEFAULT_HIDDEN.includes(col) // default visibility for new columns
      })
      return updated
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns])

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
    setVisibleColumns((prev) => ({
      ...prev,
      [col]: !prev[col],
    }))
  }

  const handleSort = (col: string, order: SortOrder) => setSort(col, order)

  const [lockState, setLockState] = useState<Record<string, boolean>>({})
  const activeAlert = (query.alertFilter ?? null) as AlertType | null

  const handleAlertSelect = (alertType: AlertType | null) => {
    if (query.alertFilter === alertType) {
      setAlertFilter(null)
      return
    }
    setAlertFilter(alertType)
  }

  const handleToggleLock = async (id: string, locked: boolean) => {
    setLockState((prev) => ({ ...prev, [id]: locked }))
    try {
      await lockAirShipmentRow(tableName, id, locked)
    } catch (error) {
      setLockState((prev) => ({ ...prev, [id]: !locked }))
      // Optionally show a toast/notification here
      window.alert(
        `Failed to ${locked ? 'lock' : 'unlock'} row: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
      </div> */}

      {title.includes('compileaircgk') && (
        <>
          <AlertPieChart
            tableName={tableName}
            activeAlert={activeAlert}
            onAlertSelect={handleAlertSelect}
            affectedTables={affectedTables}
          />

          {activeAlert && (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700">
              <span>Filtered by: {ALERT_TYPE_LABELS[activeAlert]}</span>
              <button
                type="button"
                onClick={() => handleAlertSelect(null)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
                aria-label="Clear alert filter"
              >
                ×
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search input (hidden for Rate and Routes menu) */}
          <input
            type="text"
            className="border rounded px-2 py-1 min-w-[200px]"
            placeholder="Search shipments..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {/* Column visibility controls in dropdown, right-aligned */}
        <div className="relative flex items-center gap-2" ref={dropdownRef}>
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
                {allColumns.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/30 rounded px-1 py-1 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col] || false}
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
          {allColumns.includes('date') && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openBatch('lock')}
                className="border rounded px-2 py-1 text-xs bg-background hover:bg-accent flex items-center gap-1"
              >
                <Lock size={14} /> Batch Lock
              </button>
              <button
                type="button"
                onClick={() => openBatch('delete')}
                className="border border-destructive rounded px-2 py-1 text-xs bg-background hover:bg-accent text-destructive flex items-center gap-1"
              >
                <Trash2 size={14} /> Batch Delete
              </button>
            </div>
          )}
          <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
          {batchDialog.op && (
            <div className="absolute right-0 mt-12 w-[300px] p-3 rounded-lg border border-border bg-popover shadow-lg z-50">
              <div className="text-sm font-medium mb-2">
                {batchDialog.op === 'lock' ? 'Batch Lock Rows' : 'Batch Delete Rows'}
              </div>
              <label className="text-xs block mb-1">Start</label>
              <input
                type="date"
                value={batchDialog.start}
                onChange={(e) => setBatchDialog((s) => ({ ...s, start: e.target.value }))}
                className="w-full border rounded px-2 py-1 mb-2"
              />
              <label className="text-xs block mb-1">End</label>
              <input
                type="date"
                value={batchDialog.end}
                onChange={(e) => setBatchDialog((s) => ({ ...s, end: e.target.value }))}
                className="w-full border rounded px-2 py-1 mb-3"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeBatch}
                  disabled={batchDialog.loading}
                  className="rounded border px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBatch}
                  disabled={batchDialog.loading || !batchDialog.start || !batchDialog.end}
                  className="rounded border px-3 py-1 flex items-center gap-1"
                >
                  {batchDialog.loading ? (
                    'Working...'
                  ) : batchDialog.op === 'lock' ? (
                    <>
                      <Lock size={14} /> Lock
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} /> Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <TableSkeleton />
      ) : data ? (
        <AirShipmentTable
          data={data.data.map((row) =>
            row.id in lockState ? { ...row, is_locked: lockState[row.id] } : row
          )}
          meta={data.meta}
          sortBy={query.sortBy}
          sortOrder={query.sortOrder}
          onSort={handleSort}
          onPageChange={setPage}
          visibleColumns={visibleColumns}
          onToggleLock={handleToggleLock}
        />
      ) : null}
    </div>
  )
}
