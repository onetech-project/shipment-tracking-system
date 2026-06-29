'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { MultiRouteFilter } from '@/features/air-shipments/components/MultiRouteFilter'
import { EvidenceModal } from '@/features/air-shipments/components/EvidenceModal'
import { OffloadedAwbTable } from '@/features/air-shipments/components/OffloadedAwbTable'
import { SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE, colLabel, frozenColWidth } from '@/features/air-shipments/columns.config'
import {
  AirShipmentRow,
  AirShipmentsResponse,
  OffloadedAwbResponse,
  OffloadedAwbRow,
  SortOrder,
} from '@/features/air-shipments/types'
import { Lock, Trash2, RotateCcw, Ban, GripVertical, Pin, PinOff, Download } from 'lucide-react'
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
  { value: 'spxSlaAlert', label: 'SPX SLA Alert' },
]

/** Map from alert key → human-readable label (derived from ALERT_OPTIONS) */
const ALERT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ALERT_OPTIONS.filter((o) => o.value !== null).map((o) => [o.value as string, o.label])
)

/** Selectable alert types for the exclude/restore-by-LT modal (no "All Alerts" option). */
const LT_ALERT_TYPE_OPTIONS = ALERT_OPTIONS.filter(
  (o): o is { value: AlertFilterOption; label: string } => o.value !== null
).map((o) => ({ value: o.value, label: o.label }))

/** Alert badge colours (matching DashboardAlertCards) */
const ALERT_BADGE_COLORS: Record<string, string> = {
  reservasiPenerbangan: '#F97316',
  flightTracking: '#3B82F6',
  potensiMelebihiSla: '#EAB308',
  melewatiSla: '#EF4444',
  potensiMelebihiTjph: '#8B5CF6',
  melewatiTjph: '#DC2626',
  spxTjphAlert: '#0D9488',
  spxSlaAlert: '#0891B2',
}

type BatchOp = 'lock' | 'delete' | null

export function SlaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const { params: generalParams, reload: reloadGeneralParams, loaded: paramsLoaded } = useGeneralParams()

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
      for (const r of activeRoutes) params.append('routeFilter', r)

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
      const res = await fetchOffloadedAwbs({ page: offloadedPage, limit: 50, search: searchQuery, withEvidence: false, startDate, endDate })
      setOffloadedData(res)
    } catch {
      setOffloadedData(null)
    }
  }, [offloadedPage, searchQuery, startDate, endDate])

  const fetchOffloadedExcluded = useCallback(async () => {
    try {
      const res = await fetchOffloadedAwbs({ page: excludedPage, limit: 50, search: searchQuery, withEvidence: true, startDate, endDate })
      setExcludedOffloaded(res)
    } catch {
      setExcludedOffloaded(null)
    }
  }, [excludedPage, searchQuery, startDate, endDate])

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
    if (lastCompletedSheet !== 'compileaircgk') return
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
    void fetchSlaColumnLayout()
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
      const frozenDefaults = SLA_FROZEN_KEYS.map((c) => c.key).filter(
        (k) => allDataColumns.has(k) && !seen.has(k)
      )
      const others = Array.from(allDataColumns).filter(
        (k) => !seen.has(k) && !frozenDefaults.includes(k)
      )
      for (const key of [...frozenDefaults, ...others]) {
        const isFrozenDefault = SLA_FROZEN_KEYS.some((c) => c.key === key)
        kept.push({
          key,
          frozen: isFrozenDefault,
          visible: isFrozenDefault || SLA_DEFAULT_VISIBLE.has(key),
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
      void saveSlaColumnLayout(columnLayout).catch(() => {
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

  /** Rewrites the `/sla` URL to reflect the current alert + routes + date range. */
  const syncUrl = (alertKey: AlertFilterOption | null, routesList: string[]) => {
    const params = new URLSearchParams()
    if (alertKey) params.set('alert', alertKey)
    if (routesList.length) params.set('route', routesList.join(','))
    params.set('startDate', startDate)
    params.set('endDate', endDate)
    router.replace(`/sla?${params.toString()}`, { scroll: false })
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
        routeFilter: activeRoutes,
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
      <PageHeader title="SLA Monitoring" />

      <section className="space-y-6">
        <DashboardAlertCards
          summary={summary}
          activeAlert={activeAlert}
          onRouteSelect={handleRouteSelect}
          isLoading={summaryLoading}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(d) => { setStartDate(d); setPage(1); setExcludedPage(1) }}
          onEndDateChange={(d) => { setEndDate(d); setPage(1); setExcludedPage(1) }}
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
          onAlertClick={(route, alertKey) =>
            applyRouteAlertFilter(alertKey as DashboardAlertKey, route)
          }
        />
      </section>

      <section ref={tableRef} className="space-y-4">
        {/* ── Tab Bar ── */}
        <div className="flex items-center justify-between border-b border-border mb-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'active'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Active Alerts
            </button>
            <button
              onClick={() => setActiveTab('excluded')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'excluded'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Excluded
              {(() => {
                const excludedCount = isFlightTracking
                  ? excludedOffloaded?.meta.total ?? 0
                  : excludedMeta?.total ?? 0
                return excludedCount > 0 ? (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {excludedCount}
                  </span>
                ) : null
              })()}
            </button>
          </div>

          {/* Exports BOTH tables (Active Alert + Exclude) to one .xlsx, honoring current filters. */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || !!dateError}
            title="Export Active Alert & Exclude tables to Excel"
            className="mb-1 inline-flex items-center gap-1 rounded border border-border bg-background px-3 py-1.5 text-xs shadow-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} /> {isExporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>

        {/* ── Active Alerts Tab ── */}
        {activeTab === 'active' && (
          <>
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
                <div className="mt-1">
                  <MultiRouteFilter
                    routes={routeLabels}
                    selected={activeRoutes}
                    onChange={handleRoutesChange}
                  />
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative ml-auto flex items-center gap-2" ref={dropdownRef}>
                {/* Column config doesn't apply to the AWB-based Flight Tracking table. */}
                {!isFlightTracking && (
                <>
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
                      <span className="text-xs font-semibold text-muted-foreground">Columns · drag to reorder</span>
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
                          className="flex items-center gap-2 text-xs rounded px-1 py-1 hover:bg-accent/30 transition-colors"
                        >
                          <span className="cursor-grab text-muted-foreground active:cursor-grabbing" title="Drag to reorder">
                            <GripVertical size={13} />
                          </span>
                          <input
                            type="checkbox"
                            checked={item.visible}
                            onChange={() => handleColumnToggle(item.key)}
                            className="accent-accent h-3 w-3 rounded border border-border focus:ring-1 focus:ring-accent"
                          />
                          <span className="flex-1 truncate" title={colLabel(item.key)}>
                            {colLabel(item.key)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleColumnToggleFrozen(item.key)}
                            title={item.frozen ? 'Unpin column' : 'Pin column (freeze on scroll)'}
                            className={`rounded p-0.5 transition-colors hover:bg-accent ${
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLtModal('exclude')}
                    className="border border-destructive rounded px-2 py-1 text-xs bg-background hover:bg-accent text-destructive flex items-center gap-1"
                  >
                    <Ban size={14} /> Exclude LT
                  </button>
                  {/* Batch lock/delete operate on the per-TO table, not the AWB Flight Tracking view. */}
                  {!isFlightTracking && (
                    <>
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
                    </>
                  )}
                </div>

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
              <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setExcludedAlertTypeFilter('all'); setExcludedPage(1) }}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      excludedAlertTypeFilter === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    All
                  </button>
                  {uniqueAlertTypes.map((at) => (
                    <button
                      key={at}
                      type="button"
                      onClick={() => { setExcludedAlertTypeFilter(at); setExcludedPage(1) }}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        excludedAlertTypeFilter === at
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {ALERT_TYPE_LABELS[at] ?? at}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLtModal('restore')}
                  className="border rounded px-2 py-1 text-xs bg-background hover:bg-accent flex items-center gap-1"
                >
                  <RotateCcw size={14} /> Restore LT
                </button>
              </div>
            )}

            {expandedExcludedRows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                No excluded alerts
              </div>
            ) : (
              <div className="rounded-3xl border border-border bg-panel p-4 shadow-sm overflow-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">TO Number</th>
                      <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">LT Number</th>
                      <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">Alert Type</th>
                      <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">Evidence</th>
                      <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expandedExcludedRows
                      .filter(({ alertType }) => excludedAlertTypeFilter === 'all' || alertType === excludedAlertTypeFilter)
                      .map(({ row, alertType, reason }, idx) => {
                        const badgeColor = ALERT_BADGE_COLORS[alertType] ?? '#6B7280'
                        return (
                          <tr key={`${row.id}-${alertType}-${idx}`} className={idx % 2 === 1 ? 'bg-muted/70' : ''}>
                            <td className="whitespace-nowrap px-4 py-2">{String(row['to_number'] ?? '—')}</td>
                            <td className="whitespace-nowrap px-4 py-2">{String(row['lt_number'] ?? '—')}</td>
                            <td className="whitespace-nowrap px-4 py-2">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: `${badgeColor}22`, color: badgeColor }}
                              >
                                {ALERT_TYPE_LABELS[alertType] ?? alertType}
                              </span>
                            </td>
                            <td className="px-4 py-2 max-w-[280px]">
                              <span className="block truncate text-muted-foreground" title={reason}>
                                {reason.length > 60 ? reason.slice(0, 60) + '…' : reason}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2">
                              <button
                                type="button"
                                onClick={() => void handleRestoreRow(row, alertType)}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <RotateCcw size={12} />
                                Restore
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Excluded pagination */}
            {excludedMeta && excludedMeta.total > excludedMeta.limit && (
              <div className="flex items-center justify-between text-sm">
                <span>
                  {`${(excludedMeta.page - 1) * excludedMeta.limit + 1}–${Math.min(excludedMeta.page * excludedMeta.limit, excludedMeta.total)} of ${excludedMeta.total}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExcludedPage((p) => Math.max(1, p - 1))}
                    disabled={excludedMeta.page <= 1}
                    className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setExcludedPage((p) => p + 1)}
                    disabled={excludedMeta.page * excludedMeta.limit >= excludedMeta.total}
                    className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
                  >
                    Next
                  </button>
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
        defaultAlertType={activeAlert ?? ''}
        onConfirm={handleLtConfirm}
        onClose={() => setLtModal(null)}
      />

    </div>
  )
}
