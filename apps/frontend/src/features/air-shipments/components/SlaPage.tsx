'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Banner } from '@/components/shared/banner'
import { EmptyState } from '@/components/shared/empty-state'
import { FilterBar } from '@/components/shared/filter-bar'
import { FormField } from '@/components/shared/form-field'
import { ModeTabs, SubTabs } from '@/components/ui/segmented'
import {
  TableWrap,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
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
  batchCountAirShipments,
  excludeRow,
  restoreRow,
  excludeByLt,
  restoreByLt,
  fetchExcluded,
  fetchOffloadedAwbs,
  setAwbEvidence,
  clearAwbEvidence,
  fetchSlaColumnLayout,
  saveSlaColumnLayout,
  exportSlaExcel,
} from '@/features/air-shipments/hooks/useAirShipments'
import { triggerBlobDownload } from '@/shared/utils/file-download.util'
import { ExcludeModal } from '@/features/air-shipments/components/ExcludeModal'
import { ExcludeByLtModal } from '@/features/air-shipments/components/ExcludeByLtModal'
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { EvidenceModal } from '@/features/air-shipments/components/EvidenceModal'
import { OffloadedAwbTable } from '@/features/air-shipments/components/OffloadedAwbTable'
import { colLabel, frozenColWidth } from '@/features/air-shipments/columns.config'
import { type SlaMode } from '@/features/air-shipments/sla-mode.config'
import {
  AirShipmentRow,
  AirShipmentsResponse,
  OffloadedAwbResponse,
  OffloadedAwbRow,
  SortOrder,
} from '@/features/air-shipments/types'
import { Lock, Trash2, RotateCcw, Ban, GripVertical, Pin, PinOff, Download, ChevronDown } from 'lucide-react'
import { AxiosError } from 'axios'

/** One column's persisted layout: position (array order), visibility, and frozen/pinned state. */
type ColumnLayoutItem = { key: string; visible: boolean; frozen: boolean }

/** Frozen columns must render contiguously at the left — keep them ahead of the rest. */
function normalizeLayout(layout: ColumnLayoutItem[]): ColumnLayoutItem[] {
  return [...layout.filter((i) => i.frozen), ...layout.filter((i) => !i.frozen)]
}

/** Parse the comma-joined `route` URL param into distinct route labels. */
function parseRoutesParam(raw: string | null): string[] {
  if (!raw) return []
  return Array.from(new Set(raw.split(',').map((r) => r.trim()).filter(Boolean)))
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Initial date range from URL params (set when navigating from the Dashboard),
 * falling back to the default split-month range when absent or invalid.
 */
function initialDateRange(sp: URLSearchParams): { start: string; end: string } {
  const s = sp.get('startDate')
  const e = sp.get('endDate')
  const valid = (v: string | null): v is string => !!v && DATE_RE.test(v) && !isNaN(new Date(v).getTime())
  return valid(s) && valid(e) ? { start: s, end: e } : defaultDateRange()
}


interface RouteOption {
  label: string
  origin: string
  destination: string
}

interface SlaOverviewResponse {
  summary: DashboardAlertSummary
  routes: { routes: RouteOption[] }
  routeAlerts: RouteAlertRow[]
}

type AlertFilterOption = DashboardAlertKey

type BatchOp = 'lock' | 'delete' | null

export function SlaPage({ mode }: { mode: SlaMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()

  const TABLE_NAME = mode.tableName
  const TABLE_ENDPOINT = `/air-shipments/${TABLE_NAME}`
  const ALERT_OPTIONS = useMemo(
    () => [
      { value: null as AlertFilterOption | null, label: 'All Alerts' },
      ...mode.alerts.map((a) => ({ value: a.key as AlertFilterOption, label: a.label })),
    ],
    [mode]
  )
  const ALERT_TYPE_LABELS = useMemo(
    () => Object.fromEntries(mode.alerts.map((a) => [a.key, a.label])),
    [mode]
  )
  const LT_ALERT_TYPE_OPTIONS = useMemo(
    () => mode.alerts.map((a) => ({ value: a.key as AlertFilterOption, label: a.label })),
    [mode]
  )
  const ALERT_BADGE_COLORS = useMemo(
    () => Object.fromEntries(mode.alerts.map((a) => [a.key, a.color])),
    [mode]
  )

  const tableRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dragColRef = useRef<string | null>(null)
  /** Serialized snapshot of the last layout persisted to the DB — guards redundant saves. */
  const lastSavedLayoutRef = useRef<string | null>(null)
  const shouldScrollOnLoad = useRef(!!(searchParams.get('alert') || searchParams.get('route')))
  const pendingScrollRef = useRef(false)

  const [startDate, setStartDate] = useState(() => initialDateRange(searchParams).start)
  const [endDate, setEndDate] = useState(() => initialDateRange(searchParams).end)
  const [dateError, setDateError] = useState<string | null>(null)

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [data, setData] = useState<AirShipmentsResponse | null>(null)
  const [routeAlertData, setRouteAlertData] = useState<RouteAlertRow[]>([])
  const [routeAlertLoading, setRouteAlertLoading] = useState(false)
  const [activeAlert, setActiveAlert] = useState<AlertFilterOption | null>(
    () => (searchParams.get('alert') as AlertFilterOption) || null
  )
  const [activeRoutes, setActiveRoutes] = useState<string[]>(
    () => parseRoutesParam(searchParams.get('route'))
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
  const [columnLayout, setColumnLayout] = useState<ColumnLayoutItem[]>([])
  const [layoutLoaded, setLayoutLoaded] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [lockState, setLockState] = useState<Record<string, boolean>>({})
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [batchDialog, setBatchDialog] = useState<{
    op: BatchOp
    start: string
    end: string
    loading: boolean
  }>({ op: null, start: '', end: '', loading: false })

  const [isExporting, setIsExporting] = useState(false)

  // ── Excluded tab state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'active' | 'excluded'>('active')
  const [excludeModal, setExcludeModal] = useState<{
    row: AirShipmentRow
    alertType: string
    alertTypeLabel: string
  } | null>(null)
  const [excludedRows, setExcludedRows] = useState<AirShipmentRow[]>([])
  const [excludedMeta, setExcludedMeta] = useState<{ total: number; page: number; limit: number } | null>(null)
  const [excludedPage, setExcludedPage] = useState(1)
  const [excludedAlertTypeFilter, setExcludedAlertTypeFilter] = useState<string>('all')
  const [ltModal, setLtModal] = useState<'exclude' | 'restore' | null>(null)

  // ── Flight Tracking (Tracking_SMU offload) state ──────────────────────────────
  // The Flight Tracking alert is driven by offloaded AWBs (one row per AWB), not TOs.
  const isFlightTracking = activeAlert === 'flightTracking'
  const [offloadedData, setOffloadedData] = useState<OffloadedAwbResponse | null>(null)
  const [offloadedPage, setOffloadedPage] = useState(1)
  const [excludedOffloaded, setExcludedOffloaded] = useState<OffloadedAwbResponse | null>(null)
  const [evidenceModal, setEvidenceModal] = useState<{ awb: string; initial: string } | null>(null)

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  // Single request replacing the former alert-summary + routes + route-alert-summary trio —
  // the backend computes all three in one table scan.
  const fetchSlaOverview = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setSummaryLoading(true)
      setRouteAlertLoading(true)
    }
    try {
      // The route filter scopes the table only — the panel (cards / route-alert / OTP)
      // always reflects every route in the selected period.
      const response = await apiClient.get<SlaOverviewResponse>(
        `${TABLE_ENDPOINT}/sla-overview?startDate=${startDate}&endDate=${endDate}`
      )
      setSummary(response.data.summary)
      setRoutes(response.data.routes?.routes ?? [])
      setRouteAlertData(response.data.routeAlerts ?? [])
    } catch {
      setSummary(null)
      setRoutes([])
      setRouteAlertData([])
    } finally {
      if (!options?.silent) {
        setSummaryLoading(false)
        setRouteAlertLoading(false)
      }
    }
  }

  // When every route is selected, sending them all as query params can blow past URL
  // length limits — treat "all selected" the same as "no filter" on the wire while the
  // checkboxes stay checked in the UI.
  const effectiveRouteFilter = useCallback(
    (list: string[]): string[] => (list.length > 0 && list.length === routes.length ? [] : list),
    [routes.length]
  )

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
      for (const r of effectiveRouteFilter(activeRoutes)) params.append('routeFilter', r)

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

  const fetchExcludedRows = useCallback(async () => {
    try {
      const result = await fetchExcluded(TABLE_NAME, {
        alertType: excludedAlertTypeFilter !== 'all' ? excludedAlertTypeFilter : undefined,
        page: excludedPage,
        limit: 50,
        startDate,
        endDate,
      })
      setExcludedRows(result.data)
      setExcludedMeta(result.meta)
    } catch {
      setExcludedRows([])
      setExcludedMeta(null)
    }
  }, [excludedAlertTypeFilter, excludedPage, startDate, endDate])

  const fetchOffloadedActive = useCallback(async () => {
    try {
      const res = await fetchOffloadedAwbs({ page: offloadedPage, limit: 50, search: searchQuery, withEvidence: false, startDate, endDate, routeFilter: effectiveRouteFilter(activeRoutes) })
      setOffloadedData(res)
    } catch {
      setOffloadedData(null)
    }
  }, [offloadedPage, searchQuery, startDate, endDate, activeRoutes, effectiveRouteFilter])

  const fetchOffloadedExcluded = useCallback(async () => {
    try {
      const res = await fetchOffloadedAwbs({ page: excludedPage, limit: 50, search: searchQuery, withEvidence: true, startDate, endDate, routeFilter: effectiveRouteFilter(activeRoutes) })
      setExcludedOffloaded(res)
    } catch {
      setExcludedOffloaded(null)
    }
  }, [excludedPage, searchQuery, startDate, endDate, activeRoutes, effectiveRouteFilter])

  const refresh = useCallback(() => {
    void fetchTableData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder, activeAlert, activeRoutes, searchQuery, startDate, endDate, paramsLoaded, dateError])

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
    void fetchSlaOverview()
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
      setOffloadedPage(1)
    }, 700)
    return () => window.clearTimeout(handler)
  }, [searchInput])

  useEffect(() => {
    if (!paramsLoaded || dateError) return
    void fetchTableData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder, activeAlert, activeRoutes, searchQuery, startDate, endDate, paramsLoaded, dateError])

  useEffect(() => {
    if (activeTab === 'excluded') {
      void fetchExcludedRows()
    }
  }, [activeTab, fetchExcludedRows])

  // Flight Tracking shows offloaded AWBs (per-AWB) instead of the per-TO table.
  useEffect(() => {
    if (activeTab === 'active' && isFlightTracking) void fetchOffloadedActive()
  }, [activeTab, isFlightTracking, fetchOffloadedActive])

  useEffect(() => {
    if (activeTab === 'excluded' && isFlightTracking) void fetchOffloadedExcluded()
  }, [activeTab, isFlightTracking, fetchOffloadedExcluded])

  useEffect(() => {
    if (lastCompletedSheet !== mode.syncSheetKey) return
    // Silent refresh — bypass loading-state setters to prevent layout shifts that move the scroll position
    void fetchSlaOverview({ silent: true })
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

  // Set of every column key discovered in the current data (real columns + extra_fields).
  const allDataColumns = useMemo(() => {
    const cols = new Set<string>()
    if (data?.data) {
      for (const row of data.data) {
        Object.keys(row)
          .filter((k) => k !== 'extra_fields')
          .forEach((k) => cols.add(k))
        if (row.extra_fields && typeof row.extra_fields === 'object') {
          Object.keys(row.extra_fields as Record<string, unknown>).forEach((k) => cols.add(k))
        }
      }
    }
    return cols
  }, [data])

  // Load the app-wide column layout from the DB once (after auth/params are ready).
  useEffect(() => {
    if (!paramsLoaded) return
    let cancelled = false
    void fetchSlaColumnLayout(mode.key)
      .then((stored) => {
        if (cancelled) return
        const norm = normalizeLayout(stored ?? [])
        setColumnLayout(norm)
        lastSavedLayoutRef.current = JSON.stringify(norm)
      })
      .catch(() => {
        // No saved config / load failed — fall back to defaults derived from the data.
      })
      .finally(() => {
        if (!cancelled) setLayoutLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [paramsLoaded])

  // Reconcile the saved layout with the columns present in the data: keep all saved
  // entries (in their order — retained even if absent from the current page so config
  // survives pagination), and append any newly-discovered columns at the end.
  useEffect(() => {
    if (!layoutLoaded || allDataColumns.size === 0) return
    setColumnLayout((prev) => {
      const kept = [...prev]
      const seen = new Set(kept.map((i) => i.key))
      const frozenDefaults = mode.frozenKeys.map((c) => c.key).filter(
        (k) => allDataColumns.has(k) && !seen.has(k)
      )
      const others = Array.from(allDataColumns).filter(
        (k) => !seen.has(k) && !frozenDefaults.includes(k)
      )
      for (const key of [...frozenDefaults, ...others]) {
        const isFrozenDefault = mode.frozenKeys.some((c) => c.key === key)
        kept.push({
          key,
          frozen: isFrozenDefault,
          visible: isFrozenDefault || mode.defaultVisibleColumns.has(key),
        })
      }
      return normalizeLayout(kept)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDataColumns, layoutLoaded])

  // Persist the layout to the DB (app-wide) shortly after a change — debounced, and
  // skipped until the initial load completes or when nothing actually changed.
  useEffect(() => {
    if (!layoutLoaded || columnLayout.length === 0) return
    const serialized = JSON.stringify(columnLayout)
    if (serialized === lastSavedLayoutRef.current) return
    const handle = window.setTimeout(() => {
      lastSavedLayoutRef.current = serialized
      void saveSlaColumnLayout(columnLayout, mode.key).catch(() => {
        // Save failed — clear the snapshot so the next change retries.
        lastSavedLayoutRef.current = null
      })
    }, 800)
    return () => window.clearTimeout(handle)
  }, [columnLayout, layoutLoaded])

  // Derived views consumed by the table + dropdown.
  const orderedVisibleColumns = useMemo(
    () => columnLayout.filter((i) => i.visible).map((i) => i.key),
    [columnLayout]
  )
  const frozenTableColumns = useMemo(
    () =>
      columnLayout
        .filter((i) => i.frozen && i.visible)
        .map((i) => ({ key: i.key, width: frozenColWidth(i.key) })),
    [columnLayout]
  )

  const handleColumnToggle = (col: string) => {
    setColumnLayout((prev) =>
      prev.map((i) => (i.key === col ? { ...i, visible: !i.visible } : i))
    )
  }

  const handleColumnToggleFrozen = (col: string) => {
    setColumnLayout((prev) =>
      normalizeLayout(prev.map((i) => (i.key === col ? { ...i, frozen: !i.frozen } : i)))
    )
  }

  const handleToggleAllColumns = (show: boolean) => {
    setColumnLayout((prev) => prev.map((i) => ({ ...i, visible: show })))
  }

  // Native HTML5 drag-and-drop reorder within the columns dropdown.
  const handleColumnDrop = (targetKey: string) => {
    const dragKey = dragColRef.current
    dragColRef.current = null
    if (!dragKey || dragKey === targetKey) return
    setColumnLayout((prev) => {
      const arr = [...prev]
      const from = arr.findIndex((i) => i.key === dragKey)
      if (from < 0) return prev
      const [moved] = arr.splice(from, 1)
      const to = arr.findIndex((i) => i.key === targetKey)
      if (to < 0) return prev
      arr.splice(to, 0, moved)
      return normalizeLayout(arr)
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
        const count = await batchCountAirShipments(TABLE_NAME, batchDialog.start, batchDialog.end)
        if (
          !window.confirm(
            `This will permanently delete ${count} row(s) from "${TABLE_NAME}". Continue?`
          )
        ) {
          return
        }
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

  // ── Exclude / restore handlers ───────────────────────────────────────────────

  async function handleExcludeConfirm(reason: string) {
    if (!excludeModal) return
    try {
      await excludeRow(TABLE_NAME, excludeModal.row.id, excludeModal.alertType, reason)
      setExcludeModal(null)
      refresh()
      void fetchExcludedRows()
    } catch (err) {
      window.alert(
        `Failed to exclude row: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      // re-throw so ExcludeModal's loading state is cleared by its own finally block
      throw err
    }
  }

  async function handleRestoreRow(row: AirShipmentRow, alertType: string) {
    try {
      await restoreRow(TABLE_NAME, row.id, alertType)
      refresh()
      void fetchExcludedRows()
    } catch (err) {
      window.alert(
        `Failed to restore row: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  // ── Exclude / restore by LT number (global, above the table) ──────────────────

  const handleSearchLtNumbers = useCallback(
    async (query: string): Promise<string[]> => {
      const params = new URLSearchParams({ limit: '50', startDate, endDate })
      if (query) params.set('search', query)

      if (ltModal === 'restore') {
        params.set('excluded', 'true')
        if (excludedAlertTypeFilter !== 'all') params.set('alertType', excludedAlertTypeFilter)
      } else {
        if (activeAlert) params.set('alertFilter', activeAlert)
        for (const r of effectiveRouteFilter(activeRoutes)) params.append('routeFilter', r)
      }

      const response = await apiClient.get<{ ltNumbers: string[] }>(
        `${TABLE_ENDPOINT}/lt-numbers?${params.toString()}`
      )
      return response.data.ltNumbers
    },
    [ltModal, startDate, endDate, activeAlert, activeRoutes, excludedAlertTypeFilter, effectiveRouteFilter]
  )

  async function handleLtConfirm(ltNumbers: string[], alertType: string, reason: string) {
    try {
      if (ltModal === 'exclude') {
        const affected = await excludeByLt(TABLE_NAME, ltNumbers, alertType, reason)
        window.alert(`Excluded ${affected} row(s)`)
      } else {
        const affected = await restoreByLt(TABLE_NAME, ltNumbers, alertType)
        window.alert(`Restored ${affected} row(s)`)
      }
      setLtModal(null)
      refresh()
      void fetchSlaOverview()
      void fetchExcludedRows()
    } catch (err) {
      window.alert(
        `Operation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      // re-throw so the modal's loading state is cleared by its own finally block
      throw err
    }
  }

  // ── Flight Tracking evidence (per-AWB) ───────────────────────────────────────

  async function handleSaveEvidence(evidence: string) {
    if (!evidenceModal) return
    try {
      await setAwbEvidence(evidenceModal.awb, evidence)
      setEvidenceModal(null)
      // Refresh both AWB lists, the cards/route tonnage, and the per-TO table.
      void fetchOffloadedActive()
      void fetchOffloadedExcluded()
      void fetchSlaOverview()
      void fetchTableData()
    } catch (err) {
      window.alert(
        `Failed to save evidence: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      // re-throw so EvidenceModal's loading state is cleared by its own finally block
      throw err
    }
  }

  async function handleRestoreOffloaded(row: OffloadedAwbRow) {
    try {
      await clearAwbEvidence(String(row.awb))
      void fetchOffloadedActive()
      void fetchOffloadedExcluded()
      void fetchSlaOverview()
      void fetchTableData()
    } catch (err) {
      window.alert(
        `Failed to clear evidence: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  // ── Alert filter helpers ────────────────────────────────────────────────────

  /** Rewrites the current tab's URL (/sla/air or /sla/sea) to reflect the alert + routes + dates. */
  const syncUrl = (alertKey: AlertFilterOption | null, routesList: string[]) => {
    const params = new URLSearchParams()
    if (alertKey) params.set('alert', alertKey)
    const urlRoutes = effectiveRouteFilter(routesList)
    if (urlRoutes.length) params.set('route', urlRoutes.join(','))
    params.set('startDate', startDate)
    params.set('endDate', endDate)
    router.replace(`/sla/${mode.key}?${params.toString()}`, { scroll: false })
  }

  // Drill-down from a card / route-alert table: focus a single route (replaces selection).
  const applyRouteAlertFilter = (alertKey: DashboardAlertKey, route: string) => {
    pendingScrollRef.current = true
    setActiveAlert(alertKey)
    setActiveRoutes([route])
    setPage(1)
    setOffloadedPage(1)
    syncUrl(alertKey, [route])
  }

  const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) =>
    applyRouteAlertFilter(alertKey, route)

  // Multi-select route filter (panel + table dropdowns share this).
  const handleRoutesChange = (next: string[]) => {
    setActiveRoutes(next)
    setPage(1)
    setOffloadedPage(1)
    syncUrl(activeAlert, next)
  }

  const handleAlertDropdownChange = (value: string) => {
    pendingScrollRef.current = true
    const newAlert = value === 'null' ? null : (value as AlertFilterOption)
    setActiveAlert(newAlert)
    setPage(1)
    setOffloadedPage(1)
    syncUrl(newAlert, activeRoutes)
  }

  const routeLabels = useMemo(() => routes.map((r) => r.label), [routes])

  // ── Excel export (Active Alert + Exclude sheets, current filters) ─────────────

  const handleExport = async () => {
    if (dateError || isExporting) return
    setIsExporting(true)
    try {
      const blob = await exportSlaExcel(TABLE_NAME, {
        startDate,
        endDate,
        alertFilter: activeAlert ?? 'any',
        routeFilter: effectiveRouteFilter(activeRoutes),
        search: searchQuery,
        excludedAlertType: excludedAlertTypeFilter !== 'all' ? excludedAlertTypeFilter : undefined,
        columns: orderedVisibleColumns,
        sortBy,
        sortOrder,
      })
      triggerBlobDownload(blob, `sla-monitoring-${startDate}_${endDate}.xlsx`)
    } catch (err) {
      window.alert(
        `Failed to export: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setIsExporting(false)
    }
  }


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader title={mode.pageTitle} />

      <section className="space-y-6">
        <DashboardAlertCards
          summary={summary}
          activeAlert={activeAlert}
          onRouteSelect={handleRouteSelect}
          alertCards={mode.alerts}
          isLoading={summaryLoading}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(d) => { setStartDate(d); setPage(1); setExcludedPage(1) }}
          onEndDateChange={(d) => { setEndDate(d); setPage(1); setExcludedPage(1) }}
          dateError={dateError}
          lastUpdated={lastUpdated}
          syncNote={mode.syncNote}
          onConfigure={() => setShowConfigModal(true)}
          isConnected={isConnected}
          lastSyncAt={lastSyncAt}
        />

        <GeneralParamsModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            void reloadGeneralParams().then(() => {
              void fetchSlaOverview()
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
          cols={mode.alerts.map(({ key, shortLabel, color }) => ({ key, label: shortLabel, color }))}
          onAlertClick={(route, alertKey) =>
            applyRouteAlertFilter(alertKey as DashboardAlertKey, route)
          }
        />
      </section>

      <section ref={tableRef} className="space-y-4">
        {/* ── Tab Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ModeTabs
            aria-label="Alerts view"
            value={activeTab}
            onValueChange={setActiveTab}
            items={[
              { value: 'active', label: 'Active Alerts' },
              {
                value: 'excluded',
                label: 'Excluded',
                count: (() => {
                  const excludedCount = isFlightTracking
                    ? excludedOffloaded?.meta.total ?? 0
                    : excludedMeta?.total ?? 0
                  return excludedCount > 0 ? excludedCount : undefined
                })(),
              },
            ]}
          />

          {/* Exports BOTH tables (Active Alert + Exclude) to one .xlsx, honoring current filters. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={isExporting || !!dateError}
            title="Export Active Alert & Exclude tables to Excel"
          >
            <Download size={14} /> {isExporting ? 'Exporting…' : 'Export Excel'}
          </Button>
        </div>

        {/* ── Active Alerts Tab ── */}
        {activeTab === 'active' && (
          <>
            <FilterBar>
              <FormField label="Search" className="min-w-[260px] flex-1">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search shipments..."
                />
              </FormField>

              <FormField label="Alert" className="min-w-[180px]">
                <select
                  value={activeAlert ?? 'null'}
                  onChange={(e) => handleAlertDropdownChange(e.target.value)}
                  className="w-full rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12.5px] font-medium outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40"
                >
                  {ALERT_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value ?? 'null'}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Route" className="min-w-[180px]">
                <MultiRouteFilter
                  routes={routeLabels}
                  selected={activeRoutes}
                  onChange={handleRoutesChange}
                />
              </FormField>
            </FilterBar>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative ml-auto flex items-center gap-2" ref={dropdownRef}>
                {/* Column config doesn't apply to the AWB-based Flight Tracking table. */}
                {!isFlightTracking && (
                <>
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
                  <div className="absolute right-0 top-full z-[100] mt-2 max-h-72 min-w-[180px] overflow-auto rounded-md border bg-popover shadow-soft-md">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-table-head px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Columns · drag to reorder</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleAllColumns(true)}
                          className="rounded-sm border px-2 py-0.5 text-xs motion-safe:transition-colors hover:bg-surface-2"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleAllColumns(false)}
                          className="rounded-sm border px-2 py-0.5 text-xs motion-safe:transition-colors hover:bg-surface-2"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 px-2 py-2">
                      {columnLayout.map((item) => (
                        <div
                          key={item.key}
                          draggable
                          onDragStart={() => {
                            dragColRef.current = item.key
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleColumnDrop(item.key)}
                          className="flex items-center gap-2 rounded-sm px-1 py-1 text-xs motion-safe:transition-colors hover:bg-surface-2"
                        >
                          <span className="cursor-grab text-muted-foreground active:cursor-grabbing" title="Drag to reorder">
                            <GripVertical size={13} />
                          </span>
                          <input
                            type="checkbox"
                            checked={item.visible}
                            onChange={() => handleColumnToggle(item.key)}
                            className="h-3 w-3 rounded-sm border border-border accent-brand-2 focus:ring-1 focus:ring-brand/40"
                          />
                          <span className="flex-1 truncate" title={colLabel(item.key)}>
                            {colLabel(item.key)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleColumnToggleFrozen(item.key)}
                            title={item.frozen ? 'Unpin column' : 'Pin column (freeze on scroll)'}
                            className={`rounded-sm p-0.5 motion-safe:transition-colors hover:bg-surface-2 ${
                              item.frozen ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          >
                            {item.frozen ? <Pin size={13} /> : <PinOff size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>
                )}

                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="danger-soft" size="sm" onClick={() => setLtModal('exclude')}>
                    <Ban size={14} /> Exclude LT
                  </Button>
                  {/* Batch lock/delete operate on the per-TO table, not the AWB Flight Tracking view. */}
                  {!isFlightTracking && (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => openBatch('lock')}>
                        <Lock size={14} /> Batch Lock
                      </Button>
                      <Button type="button" variant="danger-soft" size="sm" onClick={() => openBatch('delete')}>
                        <Trash2 size={14} /> Batch Delete
                      </Button>
                    </>
                  )}
                </div>

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
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirmBatch}
                        disabled={batchDialog.loading || !batchDialog.start || !batchDialog.end}
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
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <Banner tone="danger">{error}</Banner>
            ) : isFlightTracking ? (
              <OffloadedAwbTable
                data={offloadedData?.data ?? []}
                meta={offloadedData?.meta ?? { total: 0, page: 1, limit: 50 }}
                mode="active"
                onAddEvidence={(row) =>
                  setEvidenceModal({ awb: String(row.awb), initial: '' })
                }
                onPageChange={setOffloadedPage}
              />
            ) : (
              <div className="rounded-lg border bg-card p-4">
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
                  columns={orderedVisibleColumns}
                  frozenColumns={frozenTableColumns}
                  onToggleLock={handleToggleLock}
                  alertFilter={activeAlert ?? undefined}
                  onExclude={
                    activeAlert != null
                      ? (row) => {
                          setExcludeModal({
                            row,
                            alertType: activeAlert,
                            alertTypeLabel: ALERT_TYPE_LABELS[activeAlert] ?? activeAlert,
                          })
                        }
                      : undefined
                  }
                />
              </div>
            )}

            {isLoading && (
              <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
                Loading table data…
              </div>
            )}
          </>
        )}

        {/* ── Excluded Tab: Flight Tracking shows evidenced AWBs (per-AWB) ── */}
        {activeTab === 'excluded' && isFlightTracking && (
          <OffloadedAwbTable
            data={excludedOffloaded?.data ?? []}
            meta={excludedOffloaded?.meta ?? { total: 0, page: 1, limit: 50 }}
            mode="excluded"
            onEditEvidence={(row) =>
              setEvidenceModal({ awb: String(row.awb), initial: String(row.evidence ?? '') })
            }
            onRestore={handleRestoreOffloaded}
            onPageChange={setExcludedPage}
          />
        )}

        {/* ── Excluded Tab: per-TO exclusions for all other alert types ── */}
        {activeTab === 'excluded' && !isFlightTracking && (() => {
          // Expand each row into one entry per alert-type exclusion
          const expandedExcludedRows = excludedRows.flatMap((row) => {
            const reasons = row['excluded_reasons'] as Record<string, string> | null
            if (!reasons) return []
            return Object.entries(reasons).map(([alertType, reason]) => ({
              row,
              alertType,
              reason,
            }))
          })
          const uniqueAlertTypes = Array.from(new Set(expandedExcludedRows.map((e) => e.alertType))).filter(Boolean)

          return (
          <>
            {/* Alert type filter chips + Restore LT */}
            {expandedExcludedRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SubTabs
                  aria-label="Filter excluded alerts by type"
                  value={excludedAlertTypeFilter}
                  onValueChange={(v) => { setExcludedAlertTypeFilter(v); setExcludedPage(1) }}
                  items={[
                    { value: 'all', label: 'All' },
                    ...uniqueAlertTypes.map((at) => ({ value: at, label: ALERT_TYPE_LABELS[at] ?? at })),
                  ]}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setLtModal('restore')}>
                  <RotateCcw size={14} /> Restore LT
                </Button>
              </div>
            )}

            {expandedExcludedRows.length === 0 ? (
              <EmptyState title="No excluded alerts" />
            ) : (
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TO Number</TableHead>
                      <TableHead>LT Number</TableHead>
                      <TableHead>Alert Type</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expandedExcludedRows
                      .filter(({ alertType }) => excludedAlertTypeFilter === 'all' || alertType === excludedAlertTypeFilter)
                      .map(({ row, alertType, reason }, idx) => {
                        // Categorical color sourced from sla-mode.config (CHART_COLORS); faint token as fallback.
                        const badgeColor = ALERT_BADGE_COLORS[alertType] ?? '#8a9a8a'
                        return (
                          <TableRow key={`${row.id}-${alertType}-${idx}`}>
                            <TableCell className="whitespace-nowrap">{String(row['to_number'] ?? '—')}</TableCell>
                            <TableCell className="whitespace-nowrap">{String(row['lt_number'] ?? '—')}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                                style={{ backgroundColor: `${badgeColor}22`, color: badgeColor }}
                              >
                                {ALERT_TYPE_LABELS[alertType] ?? alertType}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[280px]">
                              <span className="block truncate text-muted-foreground" title={reason}>
                                {reason.length > 60 ? reason.slice(0, 60) + '…' : reason}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRestoreRow(row, alertType)}
                              >
                                <RotateCcw size={12} />
                                Restore
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </TableWrap>
            )}

            {/* Excluded pagination */}
            {excludedMeta && excludedMeta.total > excludedMeta.limit && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular">
                  {`${(excludedMeta.page - 1) * excludedMeta.limit + 1}–${Math.min(excludedMeta.page * excludedMeta.limit, excludedMeta.total)} of ${excludedMeta.total}`}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExcludedPage((p) => Math.max(1, p - 1))}
                    disabled={excludedMeta.page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExcludedPage((p) => p + 1)}
                    disabled={excludedMeta.page * excludedMeta.limit >= excludedMeta.total}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
          )
        })()}
      </section>

      {/* ── Exclude Modal ── */}
      <ExcludeModal
        open={excludeModal !== null}
        row={excludeModal?.row ?? null}
        alertType={excludeModal?.alertType ?? ''}
        alertTypeLabel={excludeModal?.alertTypeLabel ?? ''}
        onConfirm={handleExcludeConfirm}
        onClose={() => setExcludeModal(null)}
      />

      {/* ── Evidence Modal (Flight Tracking offload) ── */}
      <EvidenceModal
        open={evidenceModal !== null}
        awb={evidenceModal?.awb ?? null}
        initialEvidence={evidenceModal?.initial ?? ''}
        onConfirm={handleSaveEvidence}
        onClose={() => setEvidenceModal(null)}
      />

      {/* ── Exclude / Restore by LT number ── */}
      <ExcludeByLtModal
        open={ltModal !== null}
        mode={ltModal ?? 'exclude'}
        alertTypes={LT_ALERT_TYPE_OPTIONS}
        searchLtNumbers={handleSearchLtNumbers}
        defaultAlertType={activeAlert ?? ''}
        onConfirm={handleLtConfirm}
        onClose={() => setLtModal(null)}
      />

    </div>
  )
}
