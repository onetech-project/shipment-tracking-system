'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { RouteAlertTable, RouteAlertRow } from '@/features/air-shipments/components/RouteAlertTable'
import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import {
  lockAirShipmentRow,
  batchLockAirShipments,
  batchDeleteAirShipments,
} from '@/features/air-shipments/hooks/useAirShipments'
import { SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE, colLabel } from '@/features/air-shipments/columns.config'
import { AirShipmentsResponse, SortOrder } from '@/features/air-shipments/types'
import { Lock, Trash2 } from 'lucide-react'
import { AxiosError } from 'axios'

const SLA_COLUMNS_STORAGE_KEY = 'sla-columns-v1'

function loadStoredColumns(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SLA_COLUMNS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function saveStoredColumns(cols: Record<string, boolean>): void {
  try {
    localStorage.setItem(SLA_COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  } catch {
    // localStorage unavailable (SSR, private mode) — silently skip
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDateRange(): { start: string; end: string } {
  const today = new Date()
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() // 0-indexed
  if (today.getUTCDate() <= 15) {
    return {
      start: toDateStr(new Date(Date.UTC(y, m, 1))),
      end: toDateStr(new Date(Date.UTC(y, m, 15))),
    }
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return {
    start: toDateStr(new Date(Date.UTC(y, m, 16))),
    end: toDateStr(new Date(Date.UTC(y, m, lastDay))),
  }
}


interface RouteOption {
  label: string
  origin: string
  destination: string
}

const TABLE_NAME = 'air_shipments_compileaircgk'
const TABLE_ENDPOINT = `/air-shipments/${TABLE_NAME}`

type AlertFilterOption = DashboardAlertKey

const ALERT_OPTIONS: Array<{ value: AlertFilterOption | null; label: string }> = [
  { value: null, label: 'All Alerts' },
  { value: 'reservasiPenerbangan', label: 'Flight Reservations' },
  { value: 'flightTracking', label: 'Flight Tracking' },
  { value: 'potensiMelebihiSla', label: 'Potential SLA Breach' },
  { value: 'melewatiSla', label: 'SLA Breach' },
  { value: 'potensiMelebihiTjph', label: 'Potential TJPH Breach' },
  { value: 'melewatiTjph', label: 'TJPH Breach' },
  { value: 'spxTjphAlert', label: 'SPX TJPH Alert' },
]

type BatchOp = 'lock' | 'delete' | null

export function SlaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()

  const tableRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const shouldScrollOnLoad = useRef(!!(searchParams.get('alert') || searchParams.get('route')))
  const pendingScrollRef = useRef(false)

  const [startDate, setStartDate] = useState(() => defaultDateRange().start)
  const [endDate, setEndDate] = useState(() => defaultDateRange().end)
  const [dateError, setDateError] = useState<string | null>(null)

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [data, setData] = useState<AirShipmentsResponse | null>(null)
  const [routeAlertData, setRouteAlertData] = useState<RouteAlertRow[]>([])
  const [routeAlertLoading, setRouteAlertLoading] = useState(false)
  const [activeAlert, setActiveAlert] = useState<AlertFilterOption | null>(
    () => (searchParams.get('alert') as AlertFilterOption) || null
  )
  const [activeRoute, setActiveRoute] = useState<string>(
    () => searchParams.get('route') ?? ''
  )
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

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await apiClient.get<DashboardAlertSummary>(
        `${TABLE_ENDPOINT}/alert-summary?startDate=${startDate}&endDate=${endDate}`
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
        `${TABLE_ENDPOINT}/routes?startDate=${startDate}&endDate=${endDate}`
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
        startDate,
        endDate,
        sortBy,
        sortOrder,
      })
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      params.set('alertFilter', activeAlert ?? 'any')
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

  const fetchRouteAlerts = async () => {
    setRouteAlertLoading(true)
    try {
      const response = await apiClient.get<RouteAlertRow[]>(
        `${TABLE_ENDPOINT}/route-alert-summary?startDate=${startDate}&endDate=${endDate}`
      )
      setRouteAlertData(response.data ?? [])
    } catch {
      setRouteAlertData([])
    } finally {
      setRouteAlertLoading(false)
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!paramsLoaded) return
    // Validate date range: max 60 days
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    if (diffDays < 0) {
      setDateError('End date must be after start date.')
      return
    }
    if (diffDays > 60) {
      setDateError('Date range cannot exceed 60 days.')
      return
    }
    setDateError(null)
    void fetchAlertSummary()
    void fetchRoutes()
    void fetchRouteAlerts()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, paramsLoaded])

  useEffect(() => {
    if (!isLoading && data && shouldScrollOnLoad.current) {
      shouldScrollOnLoad.current = false
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (!isLoading && data && pendingScrollRef.current) {
      pendingScrollRef.current = false
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isLoading, data])

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 700)
    return () => window.clearTimeout(handler)
  }, [searchInput])

  useEffect(() => {
    if (!paramsLoaded || dateError) return
    void fetchTableData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder, activeAlert, activeRoute, searchQuery, startDate, endDate, paramsLoaded, dateError])

  useEffect(() => {
    if (lastCompletedSheet !== 'compileaircgk') return
    // Silent refresh — bypass loading-state setters to prevent layout shifts that move the scroll position
    void Promise.all([
      apiClient.get<DashboardAlertSummary>(`${TABLE_ENDPOINT}/alert-summary?startDate=${startDate}&endDate=${endDate}`)
        .then(r => setSummary(r.data)).catch(() => setSummary(null)),
      apiClient.get<{ routes: RouteOption[] }>(`${TABLE_ENDPOINT}/routes?startDate=${startDate}&endDate=${endDate}`)
        .then(r => setRoutes(r.data.routes ?? [])).catch(() => setRoutes([])),
      apiClient.get<RouteAlertRow[]>(`${TABLE_ENDPOINT}/route-alert-summary?startDate=${startDate}&endDate=${endDate}`)
        .then(r => setRouteAlertData(r.data ?? [])).catch(() => setRouteAlertData([])),
    ])
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCompletedSheet])

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

  // ── Column management ───────────────────────────────────────────────────────

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
      ...SLA_FROZEN_KEYS.filter((col) => cols.has(col.key)).map((c) => c.key),
      ...Array.from(cols).filter((col) => !SLA_FROZEN_KEYS.some((c) => c.key === col)),
    ]
  }, [data])

  const frozenColumns = useMemo(
    () => SLA_FROZEN_KEYS.filter((col) => allColumns.includes(col.key)).map((c) => c.key),
    [allColumns]
  )
  const toggleableColumns = useMemo(
    () => allColumns.filter((col) => !SLA_FROZEN_KEYS.some((c) => c.key === col)),
    [allColumns]
  )

  useEffect(() => {
    const stored = loadStoredColumns()
    setVisibleColumns((prev) => {
      const next = { ...prev }
      for (const col of frozenColumns) next[col] = true
      for (const col of toggleableColumns) {
        if (col in stored) {
          next[col] = stored[col]
        } else if (!(col in next)) {
          next[col] = SLA_DEFAULT_VISIBLE.has(col)
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns])

  const handleColumnToggle = (col: string) => {
    if (frozenColumns.includes(col)) return
    setVisibleColumns((prev) => {
      const next = { ...prev, [col]: !prev[col] }
      const toStore = Object.fromEntries(
        Object.entries(next).filter(([k]) => !frozenColumns.includes(k))
      )
      saveStoredColumns(toStore)
      return next
    })
  }

  const handleToggleAllColumns = (show: boolean) => {
    setVisibleColumns((prev) => {
      const next = { ...prev }
      for (const col of toggleableColumns) next[col] = show
      const toStore = Object.fromEntries(
        Object.entries(next).filter(([k]) => !frozenColumns.includes(k))
      )
      saveStoredColumns(toStore)
      return next
    })
  }

  // ── Sort ────────────────────────────────────────────────────────────────────

  const handleSort = (col: string, order: SortOrder) => {
    setSortBy(col)
    setSortOrder(order)
    setPage(1)
  }

  // ── Lock / batch operations ─────────────────────────────────────────────────

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

  // ── Alert filter helpers ────────────────────────────────────────────────────

  const applyRouteAlertFilter = (alertKey: DashboardAlertKey, route: string) => {
    pendingScrollRef.current = true
    setActiveAlert(alertKey)
    setActiveRoute(route)
    setPage(1)
    const params = new URLSearchParams()
    params.set('alert', alertKey)
    params.set('route', route)
    router.replace(`/sla?${params.toString()}`, { scroll: false })
  }

  const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) =>
    applyRouteAlertFilter(alertKey, route)

  const handleAlertDropdownChange = (value: string) => {
    pendingScrollRef.current = true
    const newAlert = value === 'null' ? null : (value as AlertFilterOption)
    setActiveAlert(newAlert)
    setPage(1)
    const params = new URLSearchParams()
    if (newAlert) params.set('alert', newAlert)
    if (activeRoute) params.set('route', activeRoute)
    router.replace(`/sla?${params.toString()}`, { scroll: false })
  }


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader title="SLA Monitoring" />

      <section className="space-y-6">
        <DashboardAlertCards
          summary={summary}
          activeAlert={activeAlert}
          onRouteSelect={handleRouteSelect}
          isLoading={summaryLoading}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(d) => { setStartDate(d); setPage(1) }}
          onEndDateChange={(d) => { setEndDate(d); setPage(1) }}
          dateError={dateError}
          lastUpdated={lastUpdated}
          syncNote="Live refresh is active for Compile Air CGK synchronization."
          onConfigure={() => setShowConfigModal(true)}
          isConnected={isConnected}
          lastSyncAt={lastSyncAt}
        />

        <GeneralParamsModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            void reloadGeneralParams().then(() => {
              void fetchAlertSummary()
              void fetchRoutes()
              void fetchRouteAlerts()
              void fetchTableData()
              setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
            })
          }}
        />
      </section>

      <section className="space-y-4">
        <RouteAlertTable
          data={routeAlertData}
          isLoading={routeAlertLoading}
          onAlertClick={(route, alertKey) =>
            applyRouteAlertFilter(alertKey as DashboardAlertKey, route)
          }
        />
      </section>

      <section ref={tableRef} className="space-y-4">
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
                pendingScrollRef.current = true
                const newRoute = e.target.value
                setActiveRoute(newRoute)
                setPage(1)
                const params = new URLSearchParams()
                if (activeAlert) params.set('alert', activeAlert)
                if (newRoute) params.set('route', newRoute)
                router.replace(`/sla?${params.toString()}`, { scroll: false })
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative ml-auto flex items-center gap-2" ref={dropdownRef}>
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
                <div className="px-3 py-2 border-b border-border bg-muted rounded-t-lg sticky top-0 z-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Toggle Columns</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleAllColumns(true)}
                      className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAllColumns(false)}
                      className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors"
                    >
                      None
                    </button>
                  </div>
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
