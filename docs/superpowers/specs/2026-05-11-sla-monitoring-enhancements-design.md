# SLA Monitoring Enhancements — Design Spec

**Date**: 2026-05-11  
**Status**: Approved

---

## Overview

Seven enhancements to the SLA Monitoring page and its supporting backend. All changes are scoped to the SLA Monitoring context; the Shipments page is unaffected except where explicitly noted.

---

## 1. Exclude completed shipments from three alert types

**File**: `apps/backend/src/modules/air-shipments/alert-evaluator.ts`

**Current behaviour**: `ata_vendor_wh_destination` is already used as `completedTime`; `effectiveTime = completedTime ?? now` is fed into `melewatiSla` / `melewatiTjph`. However, the three "in-flight" alert types (`reservasiPenerbangan`, `potensiMelebihiSla`, `potensiMelebihiTjph`) still evaluate regardless.

**New behaviour**: After the `melewatiTjph` early-return, add a second guard:

```
if (completedTime !== null) {
  return {
    reservasiPenerbangan: false,
    potensiMelebihiSla:   false,
    melewatiSla:          melewatiSla,   // still evaluated normally
    potensiMelebihiTjph:  false,
    melewatiTjph:         false,         // already checked above
  }
}
```

Priority chain remains: `melewatiTjph` → `completedTime guard` → normal evaluation.

---

## 2. Half-month default date range

**File**: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`

**Current behaviour**: Initial date range is `today - daysRange` (from general params, default 15).

**New behaviour**: Replace `defaultStartDate()` / `defaultEndDate()` + the `initialDateSet` effect with a single `defaultDateRange()`:

```
if (today.getDate() <= 15):
  start = YYYY-MM-01,  end = YYYY-MM-15
else:
  start = YYYY-MM-16,  end = YYYY-MM-{lastDayOfMonth}
```

`useState` is initialised directly from `defaultDateRange()`. The `initialDateSet` ref and the effect that reads `daysRange` are removed. The `daysRange` general param is no longer consumed on the SLA page (it can remain in the DB without harm).

---

## 3. SLA Monitoring — default visible columns

**Files**: `apps/frontend/src/features/air-shipments/columns.config.ts`, `SlaPage.tsx`

### SLA_FROZEN_KEYS (replaces FROZEN_KEYS in SlaPage only)

```
date (150px), lt_number (170px), to_number (170px)
```

`awb` and `is_locked` are removed from the frozen set on this page; they become regular toggleable columns, hidden by default.

### SLA_DEFAULT_VISIBLE

```
date, lt_number, to_number, sla, tjph, issue, remarks,
ata_flight, atd_flight, ata_origin, atd_origin,
remarks_sla, ata_vendor_wh_destination
```

### Initialization logic (SlaPage)

```
frozenColumns  → always true, toggle disabled
new column not yet in localStorage → SLA_DEFAULT_VISIBLE.includes(col)
column already in localStorage → use stored value
```

`AirShipmentsPage` continues to import `FROZEN_KEYS` and `DEFAULT_HIDDEN` unchanged.

---

## 4. Persist column visibility in localStorage

**File**: `SlaPage.tsx`

**Key**: `sla-columns-v1`

- **On init**: read from localStorage. For columns already present in storage, use stored value. For new columns not yet in storage, fall back to `SLA_DEFAULT_VISIBLE`.
- **On toggle**: write updated `visibleColumns` to localStorage immediately after state update.
- Frozen columns are always `true` and are never written to storage (they can't be toggled anyway).

Column visibility is no longer re-derived from data changes — the `useEffect` that sets `visibleColumns` only runs for columns that aren't already in the stored map, preventing resets on filter/search.

---

## 5. Toggle All in column dropdown

**File**: `SlaPage.tsx`

Two buttons rendered at the top of the column dropdown (above the column list), affecting only toggleable (non-frozen) columns:

- **Show All** — sets all toggleable columns to `true`, persists to localStorage.
- **Hide All** — sets all toggleable columns to `false`, persists to localStorage.

---

## 6. "All Alerts" shows only rows with an active alert

### Backend

**Files**: `alert-evaluator.ts`, `air-shipments.service.ts`, `dto/air-shipment-query.dto.ts`

- Add `'any'` to `AlertFilter` union type and `ALERT_FILTERS` array in `alert-evaluator.ts`.
- In `filterRowsByAlert()`: add case `alertFilter === 'any'` → return rows where **any** alert flag is `true` (inverse of `'normal'`).
- `AirShipmentQueryDto` uses `@IsIn(ALERT_FILTERS)`, so it automatically accepts `'any'` once it's in the array.

### Frontend

**File**: `SlaPage.tsx`

- When `activeAlert === null` (All Alerts selected), pass `alertFilter=any` in the table fetch query params instead of omitting the param.
- The "All Alerts" UI label is unchanged.

---

## 7. Preserve scroll position on websocket sync

**File**: `SlaPage.tsx`

**Root cause**: The sync effect calls `fetchAlertSummary()`, `fetchRoutes()`, and `fetchRouteAlerts()`, each flipping loading state (`setSummaryLoading`, `setRouteAlertLoading`). Height changes in DashboardAlertCards / RouteAlertTable during loading cause layout shift and apparent scroll jumps.

**Fix**: In the sync handler, save `window.scrollY` before the fetches and restore it after all three complete:

```typescript
const savedY = window.scrollY
await Promise.all([fetchAlertSummary(), fetchRoutes(), fetchRouteAlerts()])
requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }))
```

User-initiated fetches (page change, filter, search) are unaffected — no save/restore there.

---

## Files changed summary

| File | Scope |
|------|-------|
| `apps/backend/src/modules/air-shipments/alert-evaluator.ts` | Req 1, 6 |
| `apps/backend/src/modules/air-shipments/air-shipments.service.ts` | Req 6 |
| `apps/frontend/src/features/air-shipments/columns.config.ts` | Req 3 |
| `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` | Req 2, 3, 4, 5, 6, 7 |

No changes to `AirShipmentsPage.tsx`, `AirShipmentTable.tsx`, or the DTO beyond the filter array.
