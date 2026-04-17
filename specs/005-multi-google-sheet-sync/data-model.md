# Data Model: Multi Google Sheet Sync — Configuration & Dynamic Tables

**Branch**: `005-multi-google-sheet-sync` | **Date**: 2026-04-17
**Research**: [research.md](research.md) | **Spec**: [spec.md](spec.md)

This feature introduces two persistent config tables plus dynamically-created per-sheet data tables. All dynamic tables follow a shared system column pattern so the sync pipeline and UI can treat them uniformly.

---

## 1. Config Tables (persistent)

### `google_sheet_config`
Stores one row per Google Spreadsheet (workbook).

| Column       | Type    | Constraints | Notes |
|--------------|---------|-------------|-------|
| `id`         | UUID    | PK, DEFAULT gen_random_uuid() | Internal PK |
| `spreadsheet_id` | TEXT | NOT NULL, UNIQUE | Google Sheets spreadsheet ID (from URL)
| `label`      | TEXT    | NOT NULL    | Admin-provided human label for UI and logs
| `interval_seconds` | INTEGER | NOT NULL DEFAULT 15 | Sync interval per-spreadsheet (seconds)
| `is_enabled` | BOOLEAN | NOT NULL DEFAULT true | Enable/disable spreadsheet sync
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Created timestamp
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Updated timestamp

Notes: add `label TEXT NOT NULL` via migration per spec.

### `google_sheet_sheet_config`
Stores one row per sheet/tab inside a spreadsheet.

| Column       | Type    | Constraints | Notes |
|--------------|---------|-------------|-------|
| `id`         | UUID    | PK, DEFAULT gen_random_uuid() | Internal PK |
| `spreadsheet_id` | UUID REFERENCES `google_sheet_config`(id) ON DELETE CASCADE | NOT NULL | Parent spreadsheet row |
| `sheet_name` | TEXT    | NOT NULL    | Sheet/tab name in Google Sheets |
| `table_name` | TEXT    | NOT NULL GENERATED ALWAYS AS (
  'air_shipment_' || lower(regexp_replace(sheet_name, '[^a-zA-Z0-9]', '_', 'g'))
) STORED | Auto-derived, read-only preview in UI |
| `unique_keys` | TEXT[] | NOT NULL DEFAULT '{}'
| `header_row` | INTEGER | NOT NULL DEFAULT 1 | 1-based header row index |
| `is_enabled` | BOOLEAN | NOT NULL DEFAULT true | Enable/disable per-sheet sync |
| `status`     | TEXT    | NULLABLE    | optional runtime status (e.g., `not-ready`, `ready`, `error`) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Updated timestamp

Notes: the `table_name` GENERATED expression must match the normalization logic used in the backend quoting/validation helper.

---

## 2. Dynamic Sheet Data Tables (per-sheet, created at runtime)

Table naming rule: `air_shipment_` + normalized sheet name (lowercased; non-alphanumeric → `_`). Example: `air_shipment_delivery_routes`.

All dynamically created tables must include the following fixed system columns:

```sql
CREATE TABLE IF NOT EXISTS <table_name> (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- dedicated unique-key columns added via ALTER TABLE ADD COLUMN IF NOT EXISTS
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  extra_data JSONB DEFAULT '{}'
);
```

Unique key columns (one or more) are added as dedicated TEXT NOT NULL columns and a `UNIQUE (...)` constraint is created:

- Single key example:
  - `to_number TEXT NOT NULL`, `UNIQUE (to_number)`
- Composite key example:
  - `origin_dc TEXT NOT NULL, destination_dc TEXT NOT NULL`, `UNIQUE (origin_dc, destination_dc)`

After table creation, create a GIN index on `extra_data` for JSONB query performance:

```sql
CREATE INDEX IF NOT EXISTS idx_<table_name>_extra_gin ON <table_name> USING GIN (extra_data);
```

Implementation notes:
- Table creation and column additions must be idempotent: use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Use a strict identifier validation and quoting helper when interpolating identifiers into SQL (double-quote and escape double-quotes) — never directly interpolate raw user input.
- After successful creation/update, the backend must call `SheetsService.reloadTableSchemas()` so DB-driven `knownColumns` are refreshed.
- If creation fails, log the error and mark the sheet config `status='not-ready'` but do not rollback the config save.

---

## 3. Indexes & Performance

- Dedicated `UNIQUE` constraint on unique-key columns per table (enables upsert semantics and fast lookups).
- GIN index on `extra_data` for JSONB queries.
- Consider additional B-tree indexes on frequently queried dedicated text columns.

---

## 4. Non-Persistent Runtime State

- Scheduler state (per-spreadsheet `isSyncing`, `lastRanAt`, `missedTicks`) is held in-memory only and not persisted to the DB.

---

## 5. Runtime Payloads (non-persisted)

**Sync Notification (Socket.IO)**: emitted after a productive sync cycle:

```ts
{
  spreadsheetLabel: string,    // new in Multi-Sheet feature
  tables: string[],            // list of table names processed
  totalUpserted: number,
  syncedAt: string (ISO 8601 UTC)
}
```

This shape is used by the frontend to refresh Air Shipments tabs and display last-synced timestamps.
