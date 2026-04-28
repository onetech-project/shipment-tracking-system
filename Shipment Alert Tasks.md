# Shipment Alert Tasks

## Overview

Add a Pie Chart above the search bar and table on the Shipment menu that shows total count per alert type (5 slices). When a slice is clicked, the table filters to only show rows matching that alert. Clicking the same slice again clears the filter (toggle behavior).

---

## Backend

### B1: Create Alert Evaluator Utility

- **File:** `apps/backend/src/modules/air-shipments/alert-evaluator.ts`
- **Task:** Create isolated utility function `evaluateAlerts(row)` that returns `AlertFlags` interface
- **Logic (PLACEHOLDER/MOCK):**
  - `slaAlert`: row.sla is null or empty
  - `tjphAlert`: row.tjph is null or empty
  - `ataFlightAlert`: row.ata_flight is null or empty
  - `atdFlightAlert`: row.atd_flight is null or empty
  - `smuAlert`: row.tracking_smu is null or empty
- **Constraints:** Must be self-contained with no side effects for easy replacement later
- **Acceptance:** Function exported, interface exported, unit tests written

### B2: Create Alert Summary Endpoint

- **File:** `apps/backend/src/modules/air-shipments/air-shipments.controller.ts`
- **Endpoint:** `GET /shipments/alert-summary`
- **Task:** Loop all active shipment rows, run `evaluateAlerts()` per row, return aggregated counts
- **Response shape:**
  ```json
  {
    "slaAlert": 12,
    "tjphAlert": 7,
    "ataFlightAlert": 5,
    "atdFlightAlert": 9,
    "smuAlert": 3
  }
  ```
- **Acceptance:** Endpoint returns correct aggregated counts, unit tests written

### B3: Extend Shipment List with Alert Filter

- **File:** `apps/backend/src/modules/air-shipments/air-shipments.controller.ts`
- **Endpoint:** `GET /shipments?alertFilter=slaAlert`
- **Task:** If `alertFilter` param present, only return rows where `evaluateAlerts(row)[alertFilter] === true`
- **Constraints:** If no param, return all rows (existing behavior unchanged)
- **Acceptance:** Filter works correctly, existing behavior unchanged, unit tests written

### B4: Write Unit Tests for Alert Evaluator

- **File:** `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`
- **Task:** Cover all 5 alert types with null, empty, and valid value cases

### B5: Write Unit Tests for Alert Summary Endpoint

- **File:** `apps/backend/src/modules/air-shipments/air-shipments.controller.spec.ts`
- **Task:** Test alert-summary endpoint returns correct aggregated counts

### B6: Write Unit Tests for Alert Filter

- **File:** `apps/backend/src/modules/air-shipments/air-shipments.controller.spec.ts`
- **Task:** Test shipment list with alertFilter query param filters correctly

---

## Frontend

### F1: Create AlertPieChart Component

- **File:** `apps/frontend/src/app/(dashboard)/air-shipments/components/AlertPieChart.tsx`
- **Task:** Create component that fetches from `GET /shipments/alert-summary` on mount
- **Rendering:** Use Recharts (already in project)
- **Colors:**
  - SLA Alert → `#EF4444`
  - TJPH Alert → `#F97316`
  - ATA Flight Alert → `#EAB308`
  - ATD Flight Alert → `#3B82F6`
  - SMU Alert → `#8B5CF6`
- **Features:**
  - Legend displayed beside the chart
  - Tooltip shows: label, count, percentage
  - Active/selected slice has visual highlight (opacity or stroke)
- **Acceptance:** Pie chart renders with 5 slices and correct counts

### F2: Implement Click Behavior (Toggle Filter)

- **File:** `apps/frontend/src/app/(dashboard)/air-shipments/components/AlertPieChart.tsx`
- **Task:**
  - Click a slice → set `activeAlert` state to that alert key
  - Table re-fetches with `?alertFilter=<activeAlert>`
  - Click same slice again → clear `activeAlert`, table shows all rows
  - Selected slice remains visually highlighted
- **Acceptance:** Clicking a slice filters the table; clicking same slice again clears filter

### F3: Integrate Chart into Shipment Page Layout

- **File:** `apps/frontend/src/app/(dashboard)/air-shipments/page.tsx`
- **Task:** Place AlertPieChart above the search bar and table
- **Layout:**
  ```
  ┌─────────────────────────────────┐
  │ Alert Pie Chart                 │
  └─────────────────────────────────┘
  ┌─────────────────────────────────┐
  │ [ Search Bar ]                  │
  └─────────────────────────────────┘
  ┌─────────────────────────────────┐
  │ [ Shipment Table ]              │
  └─────────────────────────────────┘
  ```
- **Acceptance:** Chart displays above search bar and table

### F4: Auto-Refresh Chart on WebSocket Event

- **File:** `apps/frontend/src/app/(dashboard)/air-shipments/page.tsx` or component
- **Task:** Listen for WebSocket event `sync.completed` and re-fetch alert-summary when fired
- **Note:** WebSocket is already implemented — just add listener
- **Acceptance:** Chart refreshes after sync completes

### F5: Show Filter Badge When Active

- **File:** `apps/frontend/src/app/(dashboard)/air-shipments/page.tsx`
- **Task:** When `alertFilter` is active, show visible indicator/badge like: "Filtered by: SLA Alert ✕"
- **Behavior:** Clicking ✕ clears the filter
- **Acceptance:** Filter badge visible when active, clicking ✕ clears filter

---

## QA

### Q1: Write Test Plan for Alert Pie Chart Feature

- **Task:** Create test plan covering:
  - Backend API tests (alert-summary endpoint, alertFilter param)
  - Frontend component tests (rendering, click behavior)
  - Integration tests (full flow: chart click → table filter)
  - Edge cases (no alerts, all alerts, toggle behavior)

### Q2: Write E2E Tests for Alert Filter Flow

- **File:** `apps/frontend/e2e/alert-filter.spec.ts` (or similar)
- **Task:**
  - Test pie chart renders with 5 slices
  - Test clicking a slice filters the table
  - Test clicking same slice clears filter
  - Test filter badge displays when active
  - Test chart refreshes after sync.completed event

### Q3: Write Unit Tests for Backend

- **Task:** Ensure unit tests exist for:
  - `evaluateAlerts()` function (all 5 alert types)
  - `GET /shipments/alert-summary` endpoint
  - `GET /shipments?alertFilter` param behavior

### Q4: Verify Alert Evaluator Isolation

- **Task:** Confirm `alert-evaluator.ts` has no side effects and can be swapped without changes elsewhere

---

## Technical Writer

### T1: Document Alert Summary API

- **File:** `apps/backend/src/modules/air-shipments/` or `specs/contracts/`
- **Task:** Document `GET /shipments/alert-summary` endpoint
- **Include:** Request params (none), Response shape, example response

### T2: Document Alert Filter Query Param

- **File:** Existing shipment list API documentation
- **Task:** Document `alertFilter` query param for `GET /shipments`
- **Include:** Valid values (`slaAlert`, `tjphAlert`, `ataFlightAlert`, `atdFlightAlert`, `smuAlert`), behavior when omitted

### T3: Update Frontend Component Documentation

- **Task:** Document `AlertPieChart` component props and usage
- **Include:** How to integrate, WebSocket event handling, filter badge behavior

---

## Dependencies

```
B1 (alert-evaluator) ──┬── B2 (alert-summary endpoint)
                       │
                       └── B3 (alertFilter param)

F1 (AlertPieChart) ──┬── F2 (click behavior)
                     │
                     ├── F3 (layout integration)
                     ├── F4 (WebSocket refresh)
                     └── F5 (filter badge)

Q1 (test plan) ─────── Q2 (e2e tests)
       │
       └── Q3, Q4 (backend/unit tests)

T1, T2, T3 (documentation) ── can start after B1-B3 and F1-F5 are implemented
```

---

## Acceptance Criteria Checklist

- [ ] `evaluateAlerts()` utility created and isolated
- [ ] `GET /shipments/alert-summary` returns aggregated counts
- [ ] `GET /shipments?alertFilter` filters correctly
- [ ] Pie chart renders with 5 slices and correct counts
- [ ] Clicking a slice filters the table
- [ ] Clicking same slice again clears filter
- [ ] Filter badge visible when active
- [ ] Chart refreshes after sync completes
- [ ] Swapping `alert-evaluator.ts` logic requires no other changes
- [ ] Unit tests written for backend
- [ ] E2E tests written for frontend
- [ ] API documentation updated
