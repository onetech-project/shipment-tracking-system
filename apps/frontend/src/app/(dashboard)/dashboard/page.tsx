'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import {
  lockAirShipmentRow,
  batchLockAirShipments,
  batchDeleteAirShipments,
} from '@/features/air-shipments/hooks/useAirShipments'
import { DEFAULT_HIDDEN, FROZEN_KEYS, colLabel } from '@/features/air-shipments/columns.config'
import { AirShipmentsResponse, SortOrder } from '@/features/air-shipments/types'
import { Lock, Trash2, Settings } from 'lucide-react'
import { AxiosError } from 'axios'

interface RouteOption {
  label: string
  origin: string
  destination: string
}

const TABLE_NAME = 'air_shipments_compileaircgk'
const TABLE_ENDPOINT = `/air-shipments/${TABLE_NAME}`

type AlertFilterOption = DashboardAlertKey | 'normal'

const ALERT_OPTIONS: Array<{ value: AlertFilterOption | null; label: string }> = [
  { value: null, label: 'Semua Alert' },
  { value: 'reservasiPenerbangan', label: 'Reservasi Penerbangan' },
  { value: 'potensiMelebihiSla', label: 'Potensi Melebihi SLA' },
  { value: 'melewatiSla', label: 'Melewati SLA' },
  { value: 'potensiMelebihiTjph', label: 'Potensi Melebihi TJPH' },
  { value: 'melewatiTjph', label: 'Melewati TJPH' },
  { value: 'normal', label: 'Normal' },
]

type BatchOp = 'lock' | 'delete' | null

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams } = useGeneralParams()
  const days = useMemo(() => {
    const p = generalParams.find((p) => p.key === 'days_range')
    return p ? parseInt(p.value, 10) || 30 : 30
  }, [generalParams])

  const tableRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [data, setData] = useState<AirShipmentsResponse | null>(null)
  const [activeAlert, setActiveAlert] = useState<AlertFilterOption | null>(null)
  const [activeRoute, setActiveRoute] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [isLoading, setIsLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({})
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [lockState, setLockState] = useState<Record<string, boolean>>({})
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [batchDialog, setBatchDialog] = useState<{
    op: BatchOp
    start: string
    end: string
    loading: boolean
  }>({ op: null, start: '', end: '', loading: false })

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await apiClient.get<DashboardAlertSummary>(
        `${TABLE_ENDPOINT}/alert-summary?days=${days}`
      )
      setSummary(response.data)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  const fetchRoutes = async () => {
    try {
      const response = await apiClient.get<{ routes: RouteOption[] }>(
        `${TABLE_ENDPOINT}/routes?days=${days}`
      )
      setRoutes(response.data.routes ?? [])
    } catch {
      setRoutes([])
    }
  }

  const fetchTableData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        days: String(days),
        sortBy,
        sortOrder,
      })
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (activeAlert) params.set('alertFilter', activeAlert)
      if (activeRoute) params.set('routeFilter', activeRoute)

      const response = await apiClient.get<AirShipmentsResponse>(
        `${TABLE_ENDPOINT}?${params.toString()}`
      )
      setData(response.data)
    } catch {
      setError('Unable to load shipment table')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshAll = async () => {
    await Promise.all([fetchAlertSummary(), fetchRoutes(), fetchTableData()])
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
  }

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 700)
    return () => window.clearTimeout(handler)
  }, [searchInput])

  useEffect(() => {
    void fetchTableData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder, activeAlert, activeRoute, searchQuery, days])

  useEffect(() => {
    if (lastCompletedSheet === 'compileaircgk') {
      void refreshAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCompletedSheet])

  // Close column dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    else document.removeEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  // ── Column management ────────────────────────────────────────────────────────

  const allColumns = useMemo(() => {
    const cols = new Set<string>()
    if (data?.data) {
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
      ...FROZEN_KEYS.filter((col) => cols.has(col.key)).map((c) => c.key),
      ...Array.from(cols).filter((col) => !FROZEN_KEYS.some((c) => c.key === col)),
    ]
  }, [data])

  const frozenColumns = FROZEN_KEYS.filter((col) => allColumns.includes(col.key)).map((c) => c.key)
  const toggleableColumns = allColumns.filter((col) => !FROZEN_KEYS.some((c) => c.key === col))

  useEffect(() => {
    setVisibleColumns((prev) => {
      const next = { ...prev }
      // Frozen columns are always visible
      for (const col of frozenColumns) next[col] = true
      // New non-frozen columns get their default visibility
      for (const col of toggleableColumns) {
        if (!(col in next)) next[col] = !DEFAULT_HIDDEN.includes(col)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns])

  const handleColumnToggle = (col: string) => {
    if (frozenColumns.includes(col)) return
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }))
  }

  // ── Sort ─────────────────────────────────────────────────────────────────────

  const handleSort = (col: string, order: SortOrder) => {
    setSortBy(col)
    setSortOrder(order)
    setPage(1)
  }

  // ── Lock / batch operations ───────────────────────────────────────────────────

  const handleToggleLock = async (id: string, locked: boolean) => {
    setLockState((prev) => ({ ...prev, [id]: locked }))
    try {
      await lockAirShipmentRow(TABLE_NAME, id, locked)
    } catch (err) {
      setLockState((prev) => ({ ...prev, [id]: !locked }))
      window.alert(
        `Failed to ${locked ? 'lock' : 'unlock'} row: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

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
          TABLE_NAME,
          batchDialog.start,
          batchDialog.end,
          true
        )
        window.alert(`Locked ${affected} row(s)`)
      } else {
        const deleted = await batchDeleteAirShipments(
          TABLE_NAME,
          batchDialog.start,
          batchDialog.end
        )
        window.alert(`Deleted ${deleted} row(s)`)
      }
      void fetchTableData()
    } catch (err: AxiosError | unknown) {
      window.alert(
        `Operation failed: ${err instanceof AxiosError ? err.response?.data?.message : String(err)}`
      )
    } finally {
      closeBatch()
    }
  }

  // ── Alert filter helpers ──────────────────────────────────────────────────────

  const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) => {
    setActiveAlert(alertKey)
    setActiveRoute(route)
    setPage(1)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleAlertDropdownChange = (value: string) => {
    setActiveAlert(value === 'null' ? null : (value as AlertFilterOption))
    setPage(1)
  }

  const handleClearAlert = () => {
    setActiveAlert(null)
    setPage(1)
  }

  const activeAlertLabel = activeAlert
    ? ALERT_OPTIONS.find((option) => option.value === activeAlert)?.label
    : ''

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      <section className="space-y-6">
        <div className="rounded-3xl border border-border bg-panel p-6 shadow-sm">
          <div className="text-xl font-semibold text-foreground">Welcome back</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Operational monitoring for the last {days} days.
          </p>
        </div>

        <DashboardAlertCards
          summary={summary}
          activeAlert={activeAlert !== 'normal' ? activeAlert : null}
          onRouteSelect={handleRouteSelect}
          isLoading={summaryLoading}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {lastUpdated ? `Last updated: ${lastUpdated}` : 'Waiting for data...'}
            </p>
            <p className="text-sm text-muted-foreground">
              Live refresh is active for Compile Air CGK synchronization.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Settings size={14} />
              Configure
            </button>
            <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
          </div>
        </div>

        <GeneralParamsModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            reloadGeneralParams().then(() => {
              void fetchAlertSummary()
              void fetchTableData()
            })
          }}
        />
      </section>

      <section ref={tableRef} className="space-y-4">
        {/* Row 1: Search / Alert / Route filters */}
        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr_1fr]">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search shipments..."
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Alert</span>
            <select
              value={activeAlert ?? 'null'}
              onChange={(e) => handleAlertDropdownChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {ALERT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value ?? 'null'}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Route</span>
            <select
              value={activeRoute}
              onChange={(e) => {
                setActiveRoute(e.target.value)
                setPage(1)
              }}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Routes</option>
              {routes.map((route) => (
                <option key={route.label} value={route.label}>
                  {route.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Row 2: Column toggle + batch actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {activeAlert && (
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span>Filter: {activeAlertLabel}</span>
              <button
                type="button"
                className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300"
                onClick={handleClearAlert}
                aria-label="Hapus filter alert"
              >
                ×
              </button>
            </div>
          )}

          <div className="relative ml-auto flex items-center gap-2" ref={dropdownRef}>
            {/* Column visibility toggle */}
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
                className="absolute right-0 top-full mt-2 min-w-[180px] max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/10 z-[100]"
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
                        checked={visibleColumns[col] ?? false}
                        onChange={() => handleColumnToggle(col)}
                        disabled={frozenColumns.includes(col)}
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

            {/* Batch lock / delete — only when table has a date column */}
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

            {/* Batch dialog */}
            {batchDialog.op && (
              <div className="absolute right-0 top-full mt-2 w-[300px] p-3 rounded-lg border border-border bg-popover shadow-lg z-50">
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
                    className="rounded border px-3 py-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBatch}
                    disabled={batchDialog.loading || !batchDialog.start || !batchDialog.end}
                    className="rounded border px-3 py-1 text-sm flex items-center gap-1"
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

        {error ? (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-panel p-4 shadow-sm">
            <AirShipmentTable
              data={
                data?.data.map((row) =>
                  row.id in lockState ? { ...row, is_locked: lockState[row.id] } : row
                ) ?? []
              }
              meta={data?.meta ?? { page: 1, limit: 50, total: 0, totalPages: 1 }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onPageChange={setPage}
              visibleColumns={visibleColumns}
              onToggleLock={handleToggleLock}
            />
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            Loading table data…
          </div>
        )}
      </section>
    </div>
  )
}
