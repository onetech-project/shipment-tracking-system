# SLA Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated SLA Monitoring page, remove the shipment table from the dashboard, apply odd/even row coloring to all tables, and fix sidebar height independence.

**Architecture:** URL-driven filter state on the new SLA page; `DashboardAlertCards` and `AirShipmentTable` are reused unchanged; filter behavior differs only in the `onRouteSelect` callback passed by each page's caller. Dashboard navigation pushes to `/sla`, SLA page updates its own URL in-place.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, lucide-react, TanStack React Query not used here (direct axios), TypeScript.

---

## File Map

**Create:**
- `apps/frontend/src/app/(dashboard)/sla/page.tsx` — route entry; wraps `SlaPage` in `<Suspense>` (required by `useSearchParams`)
- `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` — full SLA monitoring page component

**Modify:**
- `apps/frontend/src/components/layout/dashboard-shell.tsx` — sidebar height fix
- `apps/frontend/src/components/layout/sidebar.tsx` — add SLA nav link
- `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx` — odd/even row coloring (sticky-aware)
- `apps/frontend/src/app/(dashboard)/settings/users/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/settings/roles/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/settings/permissions/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/settings/organizations/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/settings/invitations/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/audit/page.tsx` — odd/even rows
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` — remove table section, simplify state, change `onRouteSelect` to navigate to `/sla`

---

## Task 1: Fix Sidebar Height

**Files:**
- Modify: `apps/frontend/src/components/layout/dashboard-shell.tsx`

- [ ] **Step 1: Open dashboard-shell.tsx and make the two className changes**

  File: `apps/frontend/src/components/layout/dashboard-shell.tsx`

  Change the root div from `flex min-h-screen` to `flex h-screen overflow-hidden`:
  ```tsx
  // Before (line 21):
  <div className="flex min-h-screen">

  // After:
  <div className="flex h-screen overflow-hidden">
  ```

  Change the sidebar wrapper div to add `h-full`:
  ```tsx
  // Before (line 22):
  <div className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0">

  // After:
  <div className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 h-full">
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/components/layout/dashboard-shell.tsx
  git commit -m "fix(layout): lock sidebar to viewport height, independent of content overflow"
  ```

---

## Task 2: Add SLA Nav Link to Sidebar

**Files:**
- Modify: `apps/frontend/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add `ShieldAlert` to the lucide-react import**

  File: `apps/frontend/src/components/layout/sidebar.tsx`

  ```tsx
  // Before (line 9-20):
  import {
    LayoutDashboard,
    Users,
    Shield,
    Building2,
    Mail,
    Key,
    ClipboardList,
    LogOut,
    Plane,
    TrendingUp,
  } from 'lucide-react'

  // After:
  import {
    LayoutDashboard,
    Users,
    Shield,
    Building2,
    Mail,
    Key,
    ClipboardList,
    LogOut,
    Plane,
    TrendingUp,
    ShieldAlert,
  } from 'lucide-react'
  ```

- [ ] **Step 2: Add the SLA nav link after the P&L Analysis link**

  File: `apps/frontend/src/components/layout/sidebar.tsx`

  ```tsx
  // Before (lines 82-95):
            <NavLink
              href="/pnl"
              icon={<TrendingUp size={16} />}
              label="P&L Analysis"
              onClick={onNavClick}
            />
            {hasPermission('read.google_sheet_config') && (

  // After:
            <NavLink
              href="/pnl"
              icon={<TrendingUp size={16} />}
              label="P&L Analysis"
              onClick={onNavClick}
            />
            <NavLink
              href="/sla"
              icon={<ShieldAlert size={16} />}
              label="SLA Monitoring"
              onClick={onNavClick}
            />
            {hasPermission('read.google_sheet_config') && (
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/frontend/src/components/layout/sidebar.tsx
  git commit -m "feat(nav): add SLA Monitoring link under Air Shipments section"
  ```

---

## Task 3: Odd/Even Row Colors — AirShipmentTable

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx`

The frozen sticky `<td>` cells use an explicit `bg-background` class to cover scrolling content behind them. For alternating rows, sticky cells must use an opaque class (`bg-muted` not `bg-muted/70`) to stay opaque. Non-sticky cells use `bg-muted/70` via the `<tr>` class.

- [ ] **Step 1: Add `idx` to the data `.map()` and derive row background variables**

  File: `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx`

  ```tsx
  // Before (line 158):
              data.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td
                    style={{
                      left: FROZEN_LEFT['#'],
                      minWidth: FROZEN_WIDTH['#'],
                      maxWidth: FROZEN_WIDTH['#'],
                    }}
                    className="xl:sticky z-10 bg-background text-center"

  // After:
              data.map((row, idx) => {
                const isOdd = idx % 2 === 1
                const frozenBg = isOdd ? 'bg-muted' : 'bg-background'
                return (
                <tr key={row.id} className={`hover:bg-muted/30 ${isOdd ? 'bg-muted/70' : ''}`}>
                  <td
                    style={{
                      left: FROZEN_LEFT['#'],
                      minWidth: FROZEN_WIDTH['#'],
                      maxWidth: FROZEN_WIDTH['#'],
                    }}
                    className={`xl:sticky z-10 ${frozenBg} text-center`}
  ```

- [ ] **Step 2: Apply `frozenBg` to frozen column cells and close the arrow function**

  File: `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx`

  ```tsx
  // Before (lines 184-189):
                      className={[
                        'whitespace-nowrap px-4 py-2',
                        isFrozen(col) ? 'xl:sticky z-10 bg-background' : '',
                        col === 'is_locked' ? 'text-center' : '',
                      ].join(' ')}

  // After:
                      className={[
                        'whitespace-nowrap px-4 py-2',
                        isFrozen(col) ? `xl:sticky z-10 ${frozenBg}` : '',
                        col === 'is_locked' ? 'text-center' : '',
                      ].join(' ')}
  ```

  Also close the arrow function: the old code ends with `))` at line 213. After the edit, the map callback is a block `{}` so add `return` before the `<tr>` opening tag (already in Step 1) and close with `}` before the final `)`:

  ```tsx
  // Before (line 213):
              ))
            )}

  // After:
              )})
            )}
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx
  git commit -m "feat(table): apply odd/even row striping to AirShipmentTable"
  ```

---

## Task 4: Odd/Even Row Colors — Settings Tables

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/settings/users/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/settings/roles/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/settings/permissions/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/settings/organizations/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/settings/invitations/page.tsx`

Pattern for all: change `.map((item) => (` to `.map((item, idx) => (` and add `className={idx % 2 === 1 ? 'bg-muted/70' : ''}` merged into the existing `<tr>` className.

- [ ] **Step 1: Update users/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/settings/users/page.tsx`

  ```tsx
  // Before:
    {users.map((u) => (
      <tr key={u.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {users.map((u, idx) => (
      <tr key={u.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 2: Update roles/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/settings/roles/page.tsx`

  ```tsx
  // Before:
    {roles.map((role) => (
      <tr key={role.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {roles.map((role, idx) => (
      <tr key={role.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 3: Update permissions/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/settings/permissions/page.tsx`

  ```tsx
  // Before:
    {filtered.map((p) => (
      <tr key={p.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {filtered.map((p, idx) => (
      <tr key={p.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 4: Update organizations/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/settings/organizations/page.tsx`

  ```tsx
  // Before:
    {orgs.map((org) => (
      <tr key={org.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {orgs.map((org, idx) => (
      <tr key={org.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 5: Update invitations/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/settings/invitations/page.tsx`

  ```tsx
  // Before:
    {invitations.map((inv) => (
      <tr key={inv.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {invitations.map((inv, idx) => (
      <tr key={inv.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 6: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add \
    apps/frontend/src/app/\(dashboard\)/settings/users/page.tsx \
    apps/frontend/src/app/\(dashboard\)/settings/roles/page.tsx \
    apps/frontend/src/app/\(dashboard\)/settings/permissions/page.tsx \
    apps/frontend/src/app/\(dashboard\)/settings/organizations/page.tsx \
    apps/frontend/src/app/\(dashboard\)/settings/invitations/page.tsx
  git commit -m "feat(tables): apply odd/even row striping to all settings tables"
  ```

---

## Task 5: Odd/Even Row Colors — Audit Table

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/audit/page.tsx`

- [ ] **Step 1: Update audit/page.tsx**

  File: `apps/frontend/src/app/(dashboard)/audit/page.tsx`

  ```tsx
  // Before:
    {logs.map((log) => (
      <tr key={log.id} className="border-t hover:bg-muted/30 motion-safe:transition-colors">

  // After:
    {logs.map((log, idx) => (
      <tr key={log.id} className={`border-t hover:bg-muted/30 motion-safe:transition-colors ${idx % 2 === 1 ? 'bg-muted/70' : ''}`}>
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/app/\(dashboard\)/audit/page.tsx
  git commit -m "feat(table): apply odd/even row striping to audit logs table"
  ```

---

## Task 6: Create SlaPage Component

**Files:**
- Create: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

This is the main SLA monitoring page component. It is a near-copy of the dashboard page's logic with two differences: filter state is initialized from URL `searchParams`, and `handleRouteSelect` updates the URL in-place instead of filtering a local table.

- [ ] **Step 1: Create the file**

  Create `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` with this content:

  ```tsx
  'use client'
  import { useEffect, useMemo, useRef, useState } from 'react'
  import { useRouter, useSearchParams } from 'next/navigation'
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
    { value: null, label: 'All Alerts' },
    { value: 'reservasiPenerbangan', label: 'Flight Reservations' },
    { value: 'potensiMelebihiSla', label: 'Potential SLA Breach' },
    { value: 'melewatiSla', label: 'SLA Breach' },
    { value: 'potensiMelebihiTjph', label: 'Potential TJPH Breach' },
    { value: 'melewatiTjph', label: 'TJPH Breach' },
  ]

  type BatchOp = 'lock' | 'delete' | null

  export function SlaPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
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

    // ── Effects ─────────────────────────────────────────────────────────────────

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
        ...FROZEN_KEYS.filter((col) => cols.has(col.key)).map((c) => c.key),
        ...Array.from(cols).filter((col) => !FROZEN_KEYS.some((c) => c.key === col)),
      ]
    }, [data])

    const frozenColumns = FROZEN_KEYS.filter((col) => allColumns.includes(col.key)).map((c) => c.key)
    const toggleableColumns = allColumns.filter((col) => !FROZEN_KEYS.some((c) => c.key === col))

    useEffect(() => {
      setVisibleColumns((prev) => {
        const next = { ...prev }
        for (const col of frozenColumns) next[col] = true
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

    const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) => {
      setActiveAlert(alertKey)
      setActiveRoute(route)
      setPage(1)
      const params = new URLSearchParams()
      params.set('alert', alertKey)
      params.set('route', route)
      router.replace(`/sla?${params.toString()}`)
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

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
      <div className="space-y-8">
        <PageHeader title="SLA Monitoring" />

        <section className="space-y-6">
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            {activeAlert && (
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span>Filter: {activeAlertLabel}</span>
                <button
                  type="button"
                  className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300"
                  onClick={handleClearAlert}
                  aria-label="Clear alert filter"
                >
                  ×
                </button>
              </div>
            )}

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
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/features/air-shipments/components/SlaPage.tsx
  git commit -m "feat(sla): add SlaPage component with URL-driven filter state"
  ```

---

## Task 7: Create `/sla` Route

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/sla/page.tsx`

`useSearchParams()` in `SlaPage` requires a `<Suspense>` boundary at the nearest page or layout. The route file provides this.

- [ ] **Step 1: Create the route file**

  Create `apps/frontend/src/app/(dashboard)/sla/page.tsx`:

  ```tsx
  import { Suspense } from 'react'
  import { SlaPage } from '@/features/air-shipments/components/SlaPage'

  export default function SlaRoute() {
    return (
      <Suspense>
        <SlaPage />
      </Suspense>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/app/\(dashboard\)/sla/page.tsx
  git commit -m "feat(sla): add /sla route wrapping SlaPage in Suspense"
  ```

---

## Task 8: Simplify Dashboard — Remove Table, Add SLA Navigation

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

The dashboard page retains: welcome card, alert cards, sync status, configure button, GeneralParamsModal. Everything table-related is removed. `onRouteSelect` navigates to `/sla` instead of filtering a local table.

- [ ] **Step 1: Replace dashboard/page.tsx with the simplified version**

  Replace the full contents of `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` with:

  ```tsx
  'use client'
  import { useEffect, useMemo, useState } from 'react'
  import { useRouter } from 'next/navigation'
  import { apiClient } from '@/shared/api/client'
  import { PageHeader } from '@/components/shared/page-header'
  import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
  import {
    DashboardAlertCards,
    DashboardAlertKey,
    DashboardAlertSummary,
  } from '@/features/air-shipments/components/DashboardAlertCards'
  import { GeneralParamsModal } from '@/features/general-params/components/GeneralParamsModal'
  import { useGeneralParams } from '@/features/general-params/hooks/useGeneralParams'
  import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
  import { Settings } from 'lucide-react'
  import { useAuth } from '@/features/auth/auth.context'

  const TABLE_ENDPOINT = `/air-shipments/air_shipments_compileaircgk`

  export default function DashboardPage() {
    const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
    const { params: generalParams, reload: reloadGeneralParams } = useGeneralParams()
    const { user } = useAuth()
    const router = useRouter()

    const days = useMemo(() => {
      const p = generalParams.find((p) => p.key === 'days_range')
      return p ? parseInt(p.value, 10) || 30 : 30
    }, [generalParams])

    const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [showConfigModal, setShowConfigModal] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<string | null>(null)

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

    useEffect(() => {
      void fetchAlertSummary()
      setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days])

    useEffect(() => {
      if (lastCompletedSheet === 'compileaircgk') {
        void fetchAlertSummary()
        setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastCompletedSheet])

    const handleRouteSelect = (alertKey: DashboardAlertKey, route: string) => {
      const params = new URLSearchParams()
      params.set('alert', alertKey)
      params.set('route', route)
      router.push(`/sla?${params.toString()}`)
    }

    return (
      <div className="space-y-8">
        <PageHeader title="Dashboard" />

        <section className="space-y-6">
          <div className="rounded-3xl border border-border bg-panel p-6 shadow-sm">
            <div className="text-xl font-semibold text-foreground">
              Welcome back, {user?.username}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Operational monitoring for the last {days} days.
            </p>
          </div>

          <DashboardAlertCards
            summary={summary}
            activeAlert={null}
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
              })
            }}
          />
        </section>
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/app/\(dashboard\)/dashboard/page.tsx
  git commit -m "feat(dashboard): remove shipment table, route card clicks navigate to /sla"
  ```

---

## Final Verification

- [ ] **Start the dev server and verify all 5 features work**

  Run from repo root or `apps/frontend/`:
  ```bash
  npm run dev
  # or: pnpm dev
  ```

  Check:
  1. **Sidebar height** — resize the browser; sidebar should stay full viewport height without stretching when content is long
  2. **SLA Monitoring nav link** — appears under Air Shipments in sidebar; clicking navigates to `/sla`
  3. **Dashboard** — shows welcome card + 5 alert cards, no table. Clicking a route in a card navigates to `/sla?alert=X&route=Y`
  4. **SLA page** — loads at `/sla`; pre-filters table if `?alert` and `?route` params are present; alert cards + full table with all features
  5. **Odd/even row coloring** — visible on AirShipmentTable, settings tables (users, roles, permissions, organizations, invitations), and audit logs
