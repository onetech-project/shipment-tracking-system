'use client'
import { useAirShipments } from '@/features/air-shipments/hooks/useAirShipments'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
// import {
//   AlertPieChart,
//   AlertType,
//   ALERT_TYPE_LABELS,
// } from '@/features/air-shipments/components/AlertPieChart'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import { TableSkeleton } from '@/features/air-shipments/components/TableSkeleton'
import { SortOrder } from '@/features/air-shipments/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  lockAirShipmentRow,
  batchLockAirShipments,
  batchDeleteAirShipments,
  batchCountAirShipments,
} from '@/features/air-shipments/hooks/useAirShipments'
import { DEFAULT_HIDDEN, FROZEN_KEYS, colLabel } from '../columns.config'
import { Lock, Trash2, ChevronDown } from 'lucide-react'
import { AxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  // title,
  defaultSortBy = 'date',
}: AirShipmentsPageProps) {
  const { isConnected, lastSyncAt, lastSyncAtByTable, affectedTables } = useSyncNotification()
  const { data, isLoading, query, setPage, setSort, setSearch, /*setAlertFilter, */ refresh } =
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
        const count = await batchCountAirShipments(tableName, batchDialog.start, batchDialog.end)
        if (
          !window.confirm(
            `This will permanently delete ${count} row(s) from "${tableName}". Continue?`
          )
        ) {
          return
        }
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
  // const activeAlert = (query.alertFilter ?? null) as AlertType | null

  // const handleAlertSelect = (alertType: AlertType | null) => {
  //   if (query.alertFilter === alertType) {
  //     setAlertFilter(null)
  //     return
  //   }
  //   setAlertFilter(alertType)
  // }

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

      {/* The per-table AlertPieChart + alert filter chip were disabled for this generic page —
          see AlertPieChart.tsx, which is still used elsewhere. */}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 p-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input (hidden for Rate and Routes menu) */}
          <Input
            type="text"
            className="min-w-[200px]"
            placeholder="Search shipments..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {/* Column visibility controls in dropdown, right-aligned */}
        <div className="relative flex items-center gap-2" ref={dropdownRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDropdownOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            Columns
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full z-[100] mt-2 max-h-72 min-w-[180px] overflow-auto rounded-md border bg-popover shadow-soft-md"
            >
              <div className="sticky top-0 z-10 border-b bg-table-head px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Toggle Columns
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-2">
                {allColumns.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 rounded-sm px-1 py-1 text-xs motion-safe:transition-colors hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col] || false}
                      onChange={() => handleColumnToggle(col)}
                      className="h-3 w-3 rounded-sm border border-border accent-brand-2 focus:ring-1 focus:ring-brand/40"
                    />
                    <span className="truncate" title={colLabel(col)}>
                      {colLabel(col)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => openBatch('lock')}>
              <Lock size={14} /> Batch Lock
            </Button>
            <Button type="button" variant="danger-soft" size="sm" onClick={() => openBatch('delete')}>
              <Trash2 size={14} /> Batch Delete
            </Button>
          </div>
          <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAtByTable[tableName] ?? lastSyncAt} />
          {batchDialog.op && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[300px] rounded-md border bg-popover p-3 shadow-soft-md">
              <div className="mb-2 font-display text-sm font-bold">
                {batchDialog.op === 'lock' ? 'Batch Lock Rows' : 'Batch Delete Rows'}
              </div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Start</label>
              <input
                type="date"
                value={batchDialog.start}
                onChange={(e) => setBatchDialog((s) => ({ ...s, start: e.target.value }))}
                className="mb-2 w-full rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
              />
              <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">End</label>
              <input
                type="date"
                value={batchDialog.end}
                onChange={(e) => setBatchDialog((s) => ({ ...s, end: e.target.value }))}
                className="mb-3 w-full rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeBatch} disabled={batchDialog.loading}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleConfirmBatch} disabled={batchDialog.loading || !batchDialog.start || !batchDialog.end}>
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
                </Button>
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
