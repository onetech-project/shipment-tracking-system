# Alert Formula: ata_vendor_wh_destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `completed_time` with `ata_vendor_wh_destination` as the alert completion signal, and exclude rows where `ata_vendor_wh_destination = 'VOID'` from all alert and OTP calculations.

**Architecture:** Two-file change. The alert evaluator reads `ata_vendor_wh_destination` directly for completion time. The service adds a static `isVoidRow` helper and applies it as a pre-filter at three call sites before any alert evaluation loop, and swaps the OTP field in two summary methods.

**Tech Stack:** NestJS, TypeScript, Jest

---

## File Map

| File | Change |
|---|---|
| `apps/backend/src/modules/air-shipments/alert-evaluator.ts` | Swap field read: `completed_time` → `ata_vendor_wh_destination` |
| `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts` | Update test fixtures: replace `completed_time` with `ata_vendor_wh_destination`; add VOID guard tests |
| `apps/backend/src/modules/air-shipments/air-shipments.service.ts` | Add `isVoidRow` helper; apply at 3 call sites; swap OTP field in 2 methods |

---

### Task 1: Update `alert-evaluator.ts` — swap completion field + update tests

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.ts:76`
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`

- [ ] **Step 1: Update existing `melewatiSla` tests to use `ata_vendor_wh_destination`**

In `alert-evaluator.spec.ts`, find the three tests in the `melewatiSla` describe block that use `completed_time`. Replace the field name in those test fixtures:

```ts
// Line ~208 — was: { ...baseRow, completed_time: '2025-01-01T10:30:00Z' }
evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T10:30:00Z' }, N, M).melewatiSla

// Line ~215 — was: { ...baseRow, completed_time: '2025-01-01T09:30:00Z' }
evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T09:30:00Z' }, N, M).melewatiSla
```

- [ ] **Step 2: Update existing `melewatiTjph` tests to use `ata_vendor_wh_destination`**

In `alert-evaluator.spec.ts`, find the two tests in the `melewatiTjph` describe block that use `completed_time`:

```ts
// Line ~280 — was: { ...baseRow, completed_time: '2025-01-01T13:00:00Z' }
evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T13:00:00Z' }, N, M).melewatiTjph

// Line ~288 — was: { ...baseRow, completed_time: '2025-01-01T11:00:00Z' }
evaluateAlerts({ ...baseRow, ata_vendor_wh_destination: '2025-01-01T11:00:00Z' }, N, M).melewatiTjph
```

- [ ] **Step 3: Run the tests — expect them to FAIL (field not swapped yet)**

```bash
cd apps/backend && npx jest alert-evaluator --no-coverage 2>&1 | tail -20
```

Expected: failures on the 4 tests you just updated, plus the `reads fields from extra_fields JSONB` test is still green.

- [ ] **Step 4: Swap the field in `alert-evaluator.ts`**

In `apps/backend/src/modules/air-shipments/alert-evaluator.ts`, change line 76:

```ts
// Before
const completedTime = parseDate(getFieldValue(row, 'completed_time'))

// After
const completedTime = parseDate(getFieldValue(row, 'ata_vendor_wh_destination'))
```

- [ ] **Step 5: Run the evaluator tests — expect all to PASS**

```bash
cd apps/backend && npx jest alert-evaluator --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (the 4 updated tests now match the new field read).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.ts \
        apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts
git commit -m "feat(alerts): use ata_vendor_wh_destination as completion time in alert evaluator"
```

---

### Task 2: Add `isVoidRow` helper + apply VOID pre-filter at 3 call sites

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts`

- [ ] **Step 1: Add the `isVoidRow` static helper to `AirShipmentsService`**

Place it immediately after the existing `getFieldValueFromRow` static method (around line 452):

```ts
private static isVoidRow(row: Record<string, unknown>): boolean {
  const val = AirShipmentsService.getFieldValueFromRow(row, 'ata_vendor_wh_destination')
  return typeof val === 'string' && val.trim().toUpperCase() === 'VOID'
}
```

- [ ] **Step 2: Apply VOID filter in `filterRowsByAlert`**

Find `filterRowsByAlert` (around line 497). Change:

```ts
// Before
return rows.filter((row) => {
  const alerts = evaluateAlerts(row, nHours, mHours)

// After
return rows
  .filter((row) => !AirShipmentsService.isVoidRow(row))
  .filter((row) => {
    const alerts = evaluateAlerts(row, nHours, mHours)
```

The closing brace/parenthesis structure stays the same — you're adding one chained `.filter` before the existing one.

- [ ] **Step 3: Apply VOID filter in `getAlertSummaryForTable`**

Find the line `for (const row of rows) {` inside `getAlertSummaryForTable` (around line 195). Add the filter on `rows` just before the loop:

```ts
// Before
for (const row of rows) {

// After
const alertRows = rows.filter((row) => !AirShipmentsService.isVoidRow(row))
for (const row of alertRows) {
```

Also in the same method, swap the OTP field (around line 211):

```ts
// Before
const completedTimeRaw = getFieldValue(row, 'completed_time')
const isCompleted =
  completedTimeRaw !== null &&
  completedTimeRaw !== undefined &&
  String(completedTimeRaw).trim() !== ''

// After
const completedTimeRaw = getFieldValue(row, 'ata_vendor_wh_destination')
const isCompleted =
  completedTimeRaw !== null &&
  completedTimeRaw !== undefined &&
  String(completedTimeRaw).trim() !== ''
```

Note: `getFieldValue` here is the local alias `AirShipmentsService.getFieldValueFromRow` assigned at the top of the method — no change to the call itself, just the string argument.

- [ ] **Step 4: Apply VOID filter in `getRouteAlertSummary`**

Find the line `for (const row of rows) {` inside `getRouteAlertSummary` (around line 349). Add the filter just before the loop:

```ts
// Before
for (const row of rows) {

// After
const alertRows = rows.filter((row) => !AirShipmentsService.isVoidRow(row))
for (const row of alertRows) {
```

Also swap the OTP field in the same method (around line 374):

```ts
// Before
const completedTimeRaw = getFieldValue(row, 'completed_time')
const isCompleted = completedTimeRaw !== null && completedTimeRaw !== undefined && String(completedTimeRaw).trim() !== ''

// After
const completedTimeRaw = getFieldValue(row, 'ata_vendor_wh_destination')
const isCompleted = completedTimeRaw !== null && completedTimeRaw !== undefined && String(completedTimeRaw).trim() !== ''
```

- [ ] **Step 5: Run the full backend test suite to confirm nothing is broken**

```bash
cd apps/backend && npx jest --no-coverage 2>&1 | tail -30
```

Expected: all tests pass. No new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.ts
git commit -m "feat(alerts): exclude VOID ata_vendor_wh_destination rows from alert and OTP calculations"
```

---

## Verification

After both tasks:

```bash
cd apps/backend && npx jest --no-coverage 2>&1 | tail -10
```

Expected output:
```
Test Suites: X passed, X total
Tests:       X passed, X total
```

No failures.
