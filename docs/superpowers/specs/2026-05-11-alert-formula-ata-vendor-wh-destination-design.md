# Alert Formula: Use `ata_vendor_wh_destination` + Exclude VOID

**Date:** 2026-05-11  
**Status:** Approved

## Summary

Update the SLA alert calculation to use `ata_vendor_wh_destination` as the completion time signal instead of `completed_time`, and exclude shipments where `ata_vendor_wh_destination = 'VOID'` entirely from all alert calculations and OTP metrics.

## Motivation

The `completed_time` column is a generated DB fallback that sources from `extra_fields->>'completed_time'` first, then `ata_vendor_wh_destination`. The business requirement is to use `ata_vendor_wh_destination` directly and consistently, while treating the explicit `'VOID'` value as "not a real completion" — those rows should be invisible to all alert logic.

## Scope

Two files:
- `apps/backend/src/modules/air-shipments/alert-evaluator.ts`
- `apps/backend/src/modules/air-shipments/air-shipments.service.ts`

No frontend changes. No database migrations. No API contract changes.

## Changes

### 1. `alert-evaluator.ts` — swap completion field

**Line 76:** Change the field read from `completed_time` to `ata_vendor_wh_destination`.

```ts
// Before
const completedTime = parseDate(getFieldValue(row, 'completed_time'))

// After
const completedTime = parseDate(getFieldValue(row, 'ata_vendor_wh_destination'))
```

The fallback `effectiveTime = completedTime ?? now` is unchanged. VOID rows never reach this function because they are filtered upstream.

### 2. `air-shipments.service.ts` — VOID filter helper + 3 call sites

**New private helper:**

```ts
private static isVoidRow(row: Record<string, unknown>): boolean {
  const val = AirShipmentsService.getFieldValueFromRow(row, 'ata_vendor_wh_destination')
  return typeof val === 'string' && val.trim().toUpperCase() === 'VOID'
}
```

**Apply filter at 3 call sites:**

| Method | Where to filter | Additional change |
|---|---|---|
| `filterRowsByAlert` | Filter `rows` before passing to `evaluateAlerts` | — |
| `getAlertSummaryForTable` | Filter `rows` before the `for` loop | Swap OTP field: `completed_time` → `ata_vendor_wh_destination` |
| `getRouteAlertSummary` | Filter `rows` before the `for` loop | Swap OTP field: `completed_time` → `ata_vendor_wh_destination` |

**OTP field swap (same in both summary methods):**

```ts
// Before
const completedTimeRaw = getFieldValue(row, 'completed_time')
const isCompleted = completedTimeRaw !== null && completedTimeRaw !== undefined && String(completedTimeRaw).trim() !== ''

// After
const completedTimeRaw = getFieldValue(row, 'ata_vendor_wh_destination')
const isCompleted = completedTimeRaw !== null && completedTimeRaw !== undefined && String(completedTimeRaw).trim() !== ''
// Note: VOID rows are already excluded by pre-filter, so no extra VOID check needed here
```

## Behaviour After Change

- Rows with `ata_vendor_wh_destination = 'VOID'` (case-insensitive): excluded from all alert counts, OTP totals, and alert-filtered table rows. Still visible in unfiltered table view.
- Rows with a valid date in `ata_vendor_wh_destination`: that date is used as the completion time for `melewatiSla` / `melewatiTjph` and OTP.
- Rows with empty/null `ata_vendor_wh_destination`: treated as in-progress (`effectiveTime = now`), same as before.

## Out of Scope

- Frontend changes
- Database schema changes
- Changes to `completed_time` generated column (left as-is; no longer used by alert logic)
- Test file updates (test suite changes follow implementation)
