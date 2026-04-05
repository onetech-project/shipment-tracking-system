# Data Model: Google Sheets to PostgreSQL Sync Service

**Branch**: `004-sheets-postgres-sync`  
**Date**: 2026-04-04

This feature does **not** create new application domain tables. Its data model consists of:

1. A `last_synced_at` timestamp column added (via migration) to the target table.
2. An assumed `is_locked` boolean column on the same target table (pre-provisioned or added via migration).
3. A runtime-only `SyncCycleResult` object (never persisted) tracking per-cycle outcomes.

---

## 1. Target Table Additions (Migration)

The sync service requires two sentinel columns to exist on the target PostgreSQL table. A migration adds them if they are not already present.

### New Columns on `<target_table>` (configured via env var `SHEET_SYNC_TABLE`)

| Column           | Type          | Nullable | Default | Description                                                                                                                                               |
| ---------------- | ------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `last_synced_at` | `TIMESTAMPTZ` | YES      | `NULL`  | Timestamp of the most recent sync write for this row. Null means the row has never been written by the sync service. Updated only when a DB write occurs. |
| `is_locked`      | `BOOLEAN`     | NO       | `FALSE` | When true, the sync service skips this row entirely — no comparison and no write. Coerced from sheet string value before evaluation.                      |

> **Note**: The table itself, all domain columns, and its primary-key column are pre-provisioned externally. The sync service does not create or alter domain columns. The migration adds only `last_synced_at` and `is_locked` if they are absent.

---

## 2. SyncCycleResult (runtime object — not persisted)

Tracks the outcome of a single sync cycle. Passed to the logger and to the gateway emit call. Never written to the database.

```
SyncCycleResult {
  table:          string        // Target table name
  startedAt:      Date          // Cycle start timestamp
  syncedAt:       Date          // Cycle end timestamp (set after writes complete)
  totalRows:      number        // Sheet rows found (excluding header)
  skippedLocked:  number        // Rows skipped because is_locked = true
  skippedUnchanged: number      // Rows skipped because no field changed
  upsertedCount:  number        // Rows actually written to the database
  errors:         number        // Rows that threw an unexpected error during processing
}
```

---

## 3. Runtime Column Map (runtime object — not persisted)

Built from the first row of each sync cycle. Maps sheet header column names to database column names (currently 1:1). Cached schema metadata is used to filter out unmapped columns.

```
ColumnMap {
  valid:    string[]   // Sheet column names that have a matching DB column
  skipped:  string[]   // Sheet column names not found in the DB table (warned + skipped)
  pkColumn: string     // The column identified as the primary key for row matching
}
```

---

## 4. SyncNotificationPayload (emitted via WebSocket — not persisted)

Emitted as the `sheet:updated` Socket.IO event payload. Shared type lives in `packages/shared`.

```
SyncNotificationPayload {
  table:         string    // Target PostgreSQL table name
  upsertedCount: number    // Number of rows written in this cycle
  syncedAt:      string    // ISO 8601 timestamp of the cycle end
}
```

---

## 5. Entity Relationships

```
[Google Sheet]
    │
    │  (poll every 15s via googleapis)
    ▼
[SheetSyncService]
    │  reads header → builds ColumnMap
    │  reads data rows → type-coerce values → compare vs DB
    │  skip if is_locked = true
    │  skip if no fields changed
    │  upsert changed/new rows → set last_synced_at
    │
    ├──→ [Target PostgreSQL Table]
    │       + last_synced_at TIMESTAMPTZ
    │       + is_locked BOOLEAN DEFAULT FALSE
    │
    └──→ [SyncGateway]  (emit sheet:updated if upsertedCount > 0)
              │
              ▼
         [Socket.IO clients / useSheetSync() hook]
```

---

## 6. State Transitions for a Single Row

```
Status           Condition                         Next Action
───────────────────────────────────────────────────────────────────
is_locked=true   (any data state)                 → SKIP (no read, no write)
is_locked=false  row not in DB yet                → INSERT + set last_synced_at
is_locked=false  row in DB, fields unchanged      → SKIP (no write)
is_locked=false  row in DB, ≥ 1 field changed     → UPDATE + set last_synced_at
```

---

## 7. Migration Plan

**Migration file**: `apps/backend/src/database/migrations/<timestamp>-add-sheet-sync-columns.ts`

Operations:

1. Check if `last_synced_at` column exists on the target table; add as `TIMESTAMPTZ NULL` if absent.
2. Check if `is_locked` column exists on the target table; add as `BOOLEAN NOT NULL DEFAULT FALSE` if absent.

> Migration is conditional (check-before-add) because the target table may already have `is_locked` defined as part of its original schema.
