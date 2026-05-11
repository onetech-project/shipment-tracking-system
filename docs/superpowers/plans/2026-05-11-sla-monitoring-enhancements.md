# SLA Monitoring Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 enhancements to SLA Monitoring: completed-shipment alert exclusion, half-month date default, SLA-specific column defaults with localStorage persistence, toggle-all column button, "All Alerts" filters to alert-only rows, and scroll preservation on websocket sync.

**Architecture:** Backend changes are isolated to `alert-evaluator.ts` (new guard + `'any'` filter) and `air-shipments.service.ts` (handle `'any'`). Frontend changes are split between `columns.config.ts` (new SLA constants) and `SlaPage.tsx` (all UX behaviour). Each task is independently committable.

**Tech Stack:** NestJS + TypeORM (backend), Next.js + React (frontend), Jest (backend tests), localStorage API, `window.scrollY` / `requestAnimationFrame`.

---

## Files changed

| File | Change |
|------|--------|
| `apps/backend/src/modules/air-shipments/alert-evaluator.ts` | Add `completedTime` guard; add `'any'` to `AlertFilter` and `ALERT_FILTERS` |
| `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts` | Tests for the two new behaviours |
| `apps/backend/src/modules/air-shipments/air-shipments.service.ts` | Handle `alertFilter === 'any'` in `filterRowsByAlert` |
| `apps/frontend/src/features/air-shipments/columns.config.ts` | Export `SLA_FROZEN_KEYS` and `SLA_DEFAULT_VISIBLE` |
| `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` | Half-month date default, SLA column defaults, localStorage, toggle-all, `alertFilter=any`, scroll preservation |

---

## Task 1 — completedTime guard in evaluateAlerts (backend)

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.ts`
- Test: `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe('evaluateAlerts', ...)` in `alert-evaluator.spec.ts`, after the existing `melewatiSla` describe block:

```typescript
describe('ata_vendor_wh_destination exclusion', () => {
  it('suppresses reservasiPenerbangan when ata_vendor_wh_destination is filled', () => {
    // Without completedTime, reservasiPenerbangan would fire (now > ataOrigin+nH, no flights)
    jest.setSystemTime(new Date('2025-01-01T09:30:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          atd_flight: '',
          ata_flight: '',
          ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
        },
        N,
        M,
      ).reservasiPenerbangan,
    ).toBe(false)
  })

  it('suppresses potensiMelebihiSla when ata_vendor_wh_destination is filled', () => {
    // ata_flight + m > maxSla would normally fire, but completedTime blocks it
    jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          ata_flight: '2025-01-01T09:30:00Z',
          ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
        },
        N,
        M,
      ).potensiMelebihiSla,
    ).toBe(false)
  })

  it('suppresses potensiMelebihiTjph when ata_vendor_wh_destination is filled', () => {
    // ata_flight + m > maxTjph would normally fire, but completedTime blocks it
    jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          tjph: '03:00:00',
          ata_flight: '2025-01-01T10:30:00Z',
          ata_vendor_wh_destination: '2025-01-01T09:00:00Z',
        },
        N,
        M,
      ).potensiMelebihiTjph,
    ).toBe(false)
  })

  it('still evaluates melewatiSla normally when ata_vendor_wh_destination is filled', () => {
    // completedTime=09:30 > maxSla=10:00? No — 09:30 < 10:00 → melewatiSla stays false
    jest.setSystemTime(new Date('2025-01-01T10:30:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          ata_vendor_wh_destination: '2025-01-01T09:30:00Z',
        },
        N,
        M,
      ).melewatiSla,
    ).toBe(false)
  })

  it('still evaluates melewatiSla as true when completedTime > maxSla', () => {
    // completedTime=10:30 > maxSla=10:00 → melewatiSla true despite completedTime guard
    jest.setSystemTime(new Date('2025-01-01T09:00:00Z'))
    expect(
      evaluateAlerts(
        {
          ...baseRow,
          ata_vendor_wh_destination: '2025-01-01T10:30:00Z',
        },
        N,
        M,
      ).melewatiSla,
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/backend && npx jest alert-evaluator --testNamePattern="ata_vendor_wh_destination exclusion" --no-coverage
```

Expected: 5 failures — the guard doesn't exist yet.

- [ ] **Step 3: Add the completedTime guard to evaluateAlerts**

In `apps/backend/src/modules/air-shipments/alert-evaluator.ts`, replace the existing code between the `melewatiTjph` early-return block and the final `return` statement:

```typescript
  // existing melewatiTjph early-return stays unchanged:
  if (melewatiTjph) {
    return {
      reservasiPenerbangan: false,
      potensiMelebihiSla: false,
      melewatiSla: false,
      potensiMelebihiTjph: false,
      melewatiTjph: true,
    }
  }

  // NEW: shipment already delivered — suppress in-flight alerts
  if (completedTime !== null) {
    return {
      reservasiPenerbangan: false,
      potensiMelebihiSla: false,
      melewatiSla,
      potensiMelebihiTjph: false,
      melewatiTjph: false,
    }
  }

  return {
    reservasiPenerbangan: ...  // unchanged
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/backend && npx jest alert-evaluator --no-coverage
```

Expected: all existing + 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.ts \
        apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts
git commit -m "feat(alerts): suppress in-flight alerts when ata_vendor_wh_destination is filled"
```

---

## Task 2 — Add 'any' AlertFilter type (backend)

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.ts`
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts`
- Test: `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`

- [ ] **Step 1: Write the failing test**

Add inside `describe('evaluateAlerts', ...)` in `alert-evaluator.spec.ts`:

```typescript
it("ALERT_FILTERS array contains all 5 alert types plus 'normal' and 'any'", () => {
  const { ALERT_FILTERS } = require('./alert-evaluator')
  expect(ALERT_FILTERS).toEqual([
    'reservasiPenerbangan',
    'potensiMelebihiSla',
    'melewatiSla',
    'potensiMelebihiTjph',
    'melewatiTjph',
    'normal',
    'any',
  ])
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/backend && npx jest alert-evaluator --testNamePattern="ALERT_FILTERS" --no-coverage
```

Expected: FAIL — `'any'` is not in the array yet.

- [ ] **Step 3: Add 'any' to alert-evaluator.ts**

In `apps/backend/src/modules/air-shipments/alert-evaluator.ts`, make these two changes:

Change the `AlertFilter` type:
```typescript
export type AlertFilter = AlertType | 'normal' | 'any'
```

Change `ALERT_FILTERS`:
```typescript
export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal', 'any']
```

- [ ] **Step 4: Handle 'any' in filterRowsByAlert**

In `apps/backend/src/modules/air-shipments/air-shipments.service.ts`, update `filterRowsByAlert`:

```typescript
private filterRowsByAlert(
  rows: Record<string, unknown>[],
  alertFilter: AlertFilter,
  nHours: number,
  mHours: number,
) {
  return rows
    .filter((row) => !AirShipmentsService.isVoidRow(row))
    .filter((row) => {
      const alerts = evaluateAlerts(row, nHours, mHours)
      if (alertFilter === 'normal') {
        return !Object.values(alerts).some(Boolean)
      }
      if (alertFilter === 'any') {
        return Object.values(alerts).some(Boolean)
      }
      return alerts[alertFilter as AlertType]
    })
}
```

- [ ] **Step 5: Run all backend tests**

```bash
cd apps/backend && npx jest alert-evaluator --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.ts \
        apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts \
        apps/backend/src/modules/air-shipments/air-shipments.service.ts
git commit -m "feat(alerts): add 'any' filter type that returns rows with any active alert"
```

---

## Task 3 — SLA column constants (frontend)

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/columns.config.ts`

No automated tests for this task — it's pure constants.

- [ ] **Step 1: Add SLA_FROZEN_KEYS and SLA_DEFAULT_VISIBLE to columns.config.ts**

Replace the entire file content with:

```typescript
/**
 * Ordered column keys per table, matching the DB entity definitions exactly.
 * Labels are auto-derived as uppercase words; override via COLUMN_LABELS if needed.
 */

export const DEFAULT_HIDDEN = ['id', 'last_synced_at', 'created_at', 'updated_at']

/** Convert snake_case key to a human-readable uppercase label. */
export function colLabel(key: string): string {
  return key.replace(/_/g, ' ').toUpperCase()
}

export const FROZEN_KEYS = [
  { key: 'date', width: 150 },
  { key: 'lt_number', width: 170 },
  { key: 'to_number', width: 170 },
  { key: 'awb', width: 130 },
  { key: 'is_locked', width: 110 },
]

/** Frozen columns for the SLA Monitoring page only — awb and is_locked are toggleable there. */
export const SLA_FROZEN_KEYS = [
  { key: 'date', width: 150 },
  { key: 'lt_number', width: 170 },
  { key: 'to_number', width: 170 },
]

/** Default-visible columns for the SLA Monitoring page. All others start hidden. */
export const SLA_DEFAULT_VISIBLE = new Set([
  'date',
  'lt_number',
  'to_number',
  'sla',
  'tjph',
  'issue',
  'remarks',
  'ata_flight',
  'atd_flight',
  'ata_origin',
  'atd_origin',
  'remarks_sla',
  'ata_vendor_wh_destination',
])
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "columns\.config" || echo "No errors in columns.config"
```

Expected: no errors referencing `columns.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/air-shipments/columns.config.ts
git commit -m "feat(sla): add SLA_FROZEN_KEYS and SLA_DEFAULT_VISIBLE column constants"
```

---

## Task 4 — Half-month date default (frontend)

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

- [ ] **Step 1: Replace the date default functions and remove daysRange initialisation**

In `SlaPage.tsx`:

**Remove** these three functions near the top of the file:
```typescript
function toDateStr(d: Date): string { ... }
function defaultStartDate(): string { ... }
function defaultEndDate(): string { ... }
```

**Replace** them with:
```typescript
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDateRange(): { start: string; end: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() // 0-indexed
  if (today.getDate() <= 15) {
    return {
      start: toDateStr(new Date(y, m, 1)),
      end: toDateStr(new Date(y, m, 15)),
    }
  }
  const lastDay = new Date(y, m + 1, 0).getDate()
  return {
    start: toDateStr(new Date(y, m, 16)),
    end: toDateStr(new Date(y, m, lastDay)),
  }
}
```

- [ ] **Step 2: Update useState initialisation**

Find and replace the two `useState` declarations for dates:

**Before:**
```typescript
const [startDate, setStartDate] = useState(defaultStartDate)
const [endDate, setEndDate] = useState(defaultEndDate)
```

**After:**
```typescript
const [startDate, setStartDate] = useState(() => defaultDateRange().start)
const [endDate, setEndDate] = useState(() => defaultDateRange().end)
```

- [ ] **Step 3: Remove the daysRange initialisation effect**

Find and **delete** this entire `useEffect` block (it reads `daysRange` and sets dates):

```typescript
const initialDateSet = useRef(false)
useEffect(() => {
  if (!paramsLoaded || initialDateSet.current) return
  initialDateSet.current = true
  const d = new Date()
  d.setDate(d.getDate() - daysRange)
  setStartDate(toDateStr(d))
  setEndDate(defaultEndDate())
}, [paramsLoaded, daysRange])
```

Also delete the `const initialDateSet = useRef(false)` line if it's separate.

- [ ] **Step 4: Remove now-unused daysRange variable**

Find and delete:
```typescript
const daysRange = useMemo(() => {
  const p = generalParams.find((p) => p.key === 'days_range')
  return p ? parseInt(p.value, 10) || 15 : 15
}, [generalParams])
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "SlaPage" || echo "No errors in SlaPage"
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/air-shipments/components/SlaPage.tsx
git commit -m "feat(sla): default date range to current half-month instead of last N days"
```

---

## Task 5 — SLA column defaults + localStorage persistence + toggle-all (frontend)

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

This task rewrites the column visibility initialisation and the column dropdown UI. Do all steps before committing.

- [ ] **Step 1: Update imports at top of SlaPage.tsx**

Find the existing import line:
```typescript
import { DEFAULT_HIDDEN, FROZEN_KEYS, colLabel } from '@/features/air-shipments/columns.config'
```

Replace with:
```typescript
import { SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE, colLabel } from '@/features/air-shipments/columns.config'
```

- [ ] **Step 2: Add the localStorage helpers — insert after the imports, before the component**

```typescript
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
```

- [ ] **Step 3: Replace FROZEN_KEYS with SLA_FROZEN_KEYS in the allColumns and frozenColumns memos**

Find:
```typescript
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

const frozenColumns = useMemo(
  () => FROZEN_KEYS.filter((col) => allColumns.includes(col.key)).map((c) => c.key),
  [allColumns]
)
const toggleableColumns = useMemo(
  () => allColumns.filter((col) => !FROZEN_KEYS.some((c) => c.key === col)),
  [allColumns]
)
```

Replace with:
```typescript
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
```

- [ ] **Step 4: Replace the column visibility initialisation useEffect**

Find the existing effect that initialises `visibleColumns`:
```typescript
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
```

Replace with:
```typescript
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
```

- [ ] **Step 5: Persist on toggle — update handleColumnToggle**

Find:
```typescript
const handleColumnToggle = (col: string) => {
  if (frozenColumns.includes(col)) return
  setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }))
}
```

Replace with:
```typescript
const handleColumnToggle = (col: string) => {
  if (frozenColumns.includes(col)) return
  setVisibleColumns((prev) => {
    const next = { ...prev, [col]: !prev[col] }
    saveStoredColumns(next)
    return next
  })
}
```

- [ ] **Step 6: Add handleToggleAllColumns helper — insert after handleColumnToggle**

```typescript
const handleToggleAllColumns = (show: boolean) => {
  setVisibleColumns((prev) => {
    const next = { ...prev }
    for (const col of toggleableColumns) next[col] = show
    saveStoredColumns(next)
    return next
  })
}
```

- [ ] **Step 7: Add Show All / Hide All buttons to the column dropdown**

Inside the dropdown, find the section that renders the column list header:
```tsx
<div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground bg-muted rounded-t-lg sticky top-0 z-10">
  Toggle Columns
</div>
```

Replace it with:
```tsx
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
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "SlaPage" || echo "No errors in SlaPage"
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/air-shipments/components/SlaPage.tsx
git commit -m "feat(sla): SLA column defaults, localStorage persistence, and toggle-all button"
```

---

## Task 6 — "All Alerts" sends alertFilter=any (frontend)

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

- [ ] **Step 1: Update fetchTableData to always send alertFilter**

Find inside `fetchTableData`:
```typescript
if (searchQuery.trim()) params.set('search', searchQuery.trim())
if (activeAlert) params.set('alertFilter', activeAlert)
if (activeRoute) params.set('routeFilter', activeRoute)
```

Replace with:
```typescript
if (searchQuery.trim()) params.set('search', searchQuery.trim())
params.set('alertFilter', activeAlert ?? 'any')
if (activeRoute) params.set('routeFilter', activeRoute)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "SlaPage" || echo "No errors in SlaPage"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/air-shipments/components/SlaPage.tsx
git commit -m "feat(sla): All Alerts filter now shows only rows with an active alert"
```

---

## Task 7 — Preserve scroll position on websocket sync (frontend)

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

- [ ] **Step 1: Extract sync fetch logic into a helper**

Find the existing sync `useEffect` that fires on `lastCompletedSheet`:
```typescript
useEffect(() => {
  if (lastCompletedSheet === 'compileaircgk') {
    void fetchAlertSummary()
    void fetchRoutes()
    void fetchRouteAlerts()
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [lastCompletedSheet])
```

Replace with:
```typescript
useEffect(() => {
  if (lastCompletedSheet !== 'compileaircgk') return
  const savedY = window.scrollY
  void Promise.all([fetchAlertSummary(), fetchRoutes(), fetchRouteAlerts()]).then(() => {
    requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }))
  })
  setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [lastCompletedSheet])
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "SlaPage" || echo "No errors in SlaPage"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/air-shipments/components/SlaPage.tsx
git commit -m "fix(sla): preserve scroll position when websocket sync triggers refresh"
```

---

## Self-review

**Spec coverage:**

| Req | Task |
|-----|------|
| 1. completedTime guard | Task 1 |
| 2. Half-month date default | Task 4 |
| 3. SLA column defaults (SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE, awb/is_locked not frozen) | Tasks 3 + 5 |
| 4. localStorage persistence | Task 5 (steps 2, 4, 5) |
| 5. Toggle all columns | Task 5 (steps 6, 7) |
| 6. All Alerts → alertFilter=any | Tasks 2 + 6 |
| 7. Scroll preservation on sync | Task 7 |

**Placeholder scan:** No TBDs. All code blocks are complete. ✓

**Type consistency:**
- `SLA_FROZEN_KEYS` defined in Task 3, consumed in Task 5 — same name. ✓
- `SLA_DEFAULT_VISIBLE` is a `Set<string>` in Task 3, used with `.has()` in Task 5. ✓
- `AlertFilter` type updated in Task 2; `filterRowsByAlert` receives it in same task. ✓
- `loadStoredColumns`, `saveStoredColumns`, `handleToggleAllColumns` defined and consumed in Task 5. ✓
- `fetchAlertSummary`, `fetchRoutes`, `fetchRouteAlerts` return `Promise<void>` (they have no return statement after setting state) — `Promise.all` on them is valid. ✓
