Feature: Multi Google Sheet Sync — Configuration UI, Dynamic Table Creation & Async Multi-Sheet Processing

## Preconditions (Existing System — Do Not Modify Unless Stated)

The following already exist and must not be changed unless explicitly required by this spec:

- NestJS + PostgreSQL + NextJS stack
- SheetSyncModule with:
  - Smart concurrency guard (isSyncing flag + scheduler pause)
  - fetchAllSheets() with batchGet, FORMATTED_VALUE, per-sheet retry with backoff
  - processSingleSheet() with batch upsert (chunk 500), fallback row-by-row, error collector
  - DB-driven knownColumns via information_schema (loadTableSchemas / reloadTableSchemas)
  - Hybrid JSONB: dedicated known columns + extra_data for unknown columns
  - Row-level lock protection: is_locked checked from DB existing row, not from sheet
  - Skip empty rows and rows with empty uniqueKey before upsert
  - normalizeForDiff() for change detection before write
  - SyncGateway (Socket.IO) emitting sheet:updated event
- SheetConfig loaded from config/sheets.json at module init
- Air Shipments menu with 5 static tabs: CGK, SUB, SDA, Rate, Routes
- PostgreSQL tables: air_shipments_cgk, air_shipments_sub, air_shipments_sda,
  rate_per_station, route_master — created manually via migration scripts,
  all non-uniqueKey columns stored in extra_data JSONB

---

## Overview of This Feature

Introduce multi Google Sheet sync support. Instead of a static config/sheets.json,
sync configurations are stored in PostgreSQL and managed via a new UI menu
"Google Sheet Config". Each config entry represents one Google Spreadsheet,
which can contain multiple sheet tabs to sync. PostgreSQL tables for synced sheets
are created dynamically based on the config. The Air Shipments menu dynamically
renders tabs based on active sync configurations.

---

## Functional Requirements

### 1. Google Sheet Config — Database Schema Update

A table `google_sheet_config` stores one row per Google Spreadsheet:

```sql
ALTER TABLE google_sheet_config
ADD label TEXT NOT NULL;
```

A table `google_sheet_sheet_config` stores one row per sheet tab within a spreadsheet:

```sql
ALTER TABLE google_sheet_config
ALTER COLUMN table_name        TEXT NOT NULL GENERATED ALWAYS AS (
  'air_shipment_' ||
  lower(regexp_replace(sheet_name, '[^a-zA-Z0-9]', '_', 'g'))
) STORED;                  -- auto-generated, read-only in UI
```

Both tables must be updated via a migration script.

---

### 2. Dynamic PostgreSQL Table Creation

When a new `google_sheet_sheet_config` row is saved (INSERT or UPDATE), the backend
must automatically create the corresponding PostgreSQL table if it does not
already exist.

Table naming rule: `air_shipment_` + lowercase(sheet*name with non-alphanumeric → `*`).
This matches the GENERATED column `table_name`in`google_sheet_sheet_config`.

Every dynamically created table must include these system columns:

```sql
CREATE TABLE IF NOT EXISTS air_shipment_<normalized_sheet_name> (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_locked        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at   TIMESTAMPTZ,
  extra_data       JSONB DEFAULT '{}'
  -- uniqueKey columns are added as dedicated TEXT columns (see below)
);
```

Unique key columns must be added as dedicated TEXT columns (NOT NULL) alongside
the system columns. All other sheet data goes into extra_data JSONB.

Example: if unique_keys = ["to_number"], the generated table includes:
`to_number TEXT NOT NULL` + `UNIQUE (to_number)`

Example: if unique_keys = ["origin_dc", "destination_dc"], the generated table includes:
`origin_dc TEXT NOT NULL, destination_dc TEXT NOT NULL` +
`UNIQUE (origin_dc, destination_dc)`

Table creation must be:

- Executed inside a NestJS service method `DynamicTableService.ensureTable(sheetConfig)`
- Idempotent: use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`
- Executed via `DataSource.query()` with parameterized identifiers — never
  concatenate user input directly into SQL. Use `pgformat` or manual quoting
  with double-quotes for identifiers.
- Followed immediately by a call to `SheetsService.reloadTableSchemas()` so the
  DB-driven knownColumns picks up the new columns without restart.
- After table creation, create a GIN index on extra*data for query performance:
  `CREATE INDEX IF NOT EXISTS idx*<table_name>\_extra_gin ON <table_name> USING GIN (extra_data)`

If table creation fails (e.g. invalid table name after normalization), the error
must be logged, the config save must still succeed, and the sync for that sheet
must be skipped until the table exists.

---

### 3. Google Sheet Config — REST API (NestJS)

A new NestJS module `SyncConfigModule` exposes:

```
GET    /sync-config/spreadsheets             → list all spreadsheets with their sheets
POST   /sync-config/spreadsheets             → create spreadsheet config
PATCH  /sync-config/spreadsheets/:id         → update spreadsheet config
DELETE /sync-config/spreadsheets/:id         → delete (cascades to sheets + drops nothing in PG — table retained)
GET    /sync-config/spreadsheets/:id/sheets  → list sheets for a spreadsheet
POST   /sync-config/spreadsheets/:id/sheets  → create sheet config + trigger ensureTable()
PATCH  /sync-config/sheets/:id               → update sheet config + trigger ensureTable() if uniqueKeys changed
DELETE /sync-config/sheets/:id               → delete sheet config (PG table is NOT dropped automatically)
```

POST and PATCH for sheets must trigger `DynamicTableService.ensureTable()` after
successful DB save.

Response for GET spreadsheets must include nested sheets array and the
auto-generated `table_name` for each sheet (read from GENERATED column).

---

### 4. Google Sheet Config — Frontend UI (NextJS)

An existing top-level sidebar menu item "Google Sheet Config" with route `/google-sheet-config`.

The page displays a list of configured Google Spreadsheets. Each entry is
expandable to show its sheet configs.

#### Spreadsheet-level form fields:

- Label (text input, required)
- Google Sheet URL (text input, required, validated as valid Google Sheets URL)
- Sync Interval in Seconds (number input, min 5, default 15)
- Enable Sync (toggle switch)

#### Sheet-level form fields (per sheet tab):

- Sheet Name (text input, required)
- Table Name (text input, disabled, read-only, value auto-derived:
  `air_shipment_` + lowercase(sheet*name with non-alphanumeric → `*`),
  displayed so user can see the generated table name)
- Unique Key(s) (text input with comma delimiter if unique key is more than one, at least 1 required. the convention should be to use snake_case for unique keys since they become column names in PG and must represent column names in the Google Sheet)
- Header Row Number (number input, min 1, default 1)
- Enable Sheet (toggle switch)

UI behaviour:

- Table Name field updates in real-time as user types the Sheet Name,
  showing the preview of the generated PostgreSQL table name.
- Saving a sheet config triggers table creation on the backend. The UI
  must show a loading state and display a success/error toast accordingly.
- Deleting a spreadsheet config shows a confirmation dialog warning that
  synced data in PostgreSQL will not be deleted automatically.
- Deleting a sheet config shows a confirmation dialog with the same warning.

---

### 5. Multi Google Sheet Async Sync

The existing single-spreadsheet scheduler must be replaced with a
multi-spreadsheet scheduler.

#### Scheduler behaviour:

- On each global tick (every 1 second), the scheduler checks all
  enabled spreadsheet configs from `sync_config_spreadsheets`.
- Each spreadsheet has its own `interval_seconds` and its own `lastRanAt`
  timestamp tracked in memory.
- A spreadsheet's sync cycle is triggered when:
  `now - lastRanAt >= interval_seconds * 1000`
- Each spreadsheet sync runs in its own async execution context — one
  spreadsheet's sync does not block another's.
- Each spreadsheet maintains its own `isSyncing` boolean flag.
  If a spreadsheet's previous cycle is still running when its interval fires,
  that tick is skipped for that spreadsheet only — other spreadsheets are
  not affected.
- If two or more consecutive ticks are missed for a spreadsheet, its
  individual scheduler is paused until the in-flight cycle completes.

#### Within each spreadsheet sync:

- Fetch all enabled sheets for that spreadsheet in a single batchGet call
  (existing behaviour preserved).
- Process each sheet tab asynchronously via `Promise.all()` — one sheet
  does not block another within the same spreadsheet.
- Each sheet's processSingleSheet() runs independently.

---

### 6. Error Handling — Isolation and Logging

All errors must be caught, logged, and isolated. No error in one sync context
must stop or affect another.

#### Error types and expected behaviour:

| Error                               | Detection                                       | Behaviour                                                                                   |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Spreadsheet not found (404)         | Google API returns 404                          | Log error with spreadsheet label + URL, skip entire spreadsheet this cycle, continue others |
| No access / permission denied (403) | Google API returns 403                          | Log error with spreadsheet label, skip entire spreadsheet, continue others                  |
| Sheet tab not found                 | valueRanges[i] returns null/empty after retries | Log warn with sheet name, skip that sheet, continue other sheets                            |
| Table not yet created in PG         | ensureTable not yet run or failed               | Log warn with table name, skip that sheet, continue others                                  |
| Upsert chunk error                  | Caught in try-catch in processSingleSheet       | Existing fallback row-by-row behaviour (unchanged)                                          |
| Google API quota exceeded (429)     | HTTP 429                                        | Log error, skip spreadsheet this cycle, do not retry immediately                            |
| Unknown API error                   | Any other non-2xx                               | Log full error with status code, skip spreadsheet this cycle                                |

All errors must be logged using NestJS Logger with the format:
`[SyncScheduler] <SpreadsheetLabel> (<spreadsheetId>): <ErrorType> — <message>`

No error must propagate out of the per-spreadsheet async execution context.
Each context must be wrapped in try-catch at the top level.

---

### 7. Dynamic Air Shipments Menu (NextJS)

The existing static Air Shipments menu with 5 hardcoded tabs (CGK, SUB, SDA,
Rate, Routes) must be replaced with a dynamic tab menu.

Tabs are rendered based on the list of enabled sheet configs fetched from:
`GET /sync-config/spreadsheets` (reuse existing endpoint, filter is_enabled=true)

Each tab:

- Label: `sheet_name` value from config
- Content: paginated, sortable table showing data from the corresponding
  `table_name` PostgreSQL table
- Data fetched from: `GET /air-shipments/:tableName`
  where `:tableName` is the generated table name from config

The existing 5 static tabs and their corresponding static REST endpoints
(`/air-shipments/cgk`, `/air-shipments/sub`, etc.) must be replaced by a
single dynamic endpoint:
`GET /air-shipments/:tableName` — queries the specified table dynamically

The dynamic endpoint must:

- Validate that `:tableName` matches a known table name from `sync_config_sheets`
  to prevent arbitrary table access.
- Support query params: `page` (default 1), `limit` (default 50),
  `sortBy`, `sortOrder` (asc | desc), `search` (optional, searches across
  all TEXT columns in the table).
- Return both dedicated columns and flattened extra_data fields in the response
  so the frontend can render all columns regardless of whether they are dedicated
  or in JSONB.

The Air Shipments tab list must re-fetch from `/sync-config/spreadsheets` when:

- A `sheet:updated` WebSocket event is received.
- The user navigates to the Air Shipments menu.

If no sheet configs are enabled, the Air Shipments menu shows an empty state
with a link to "Google Sheet Config" to add configurations.

---

## Non-Functional Requirements

- `SyncConfigModule` and `DynamicTableService` must be self-contained NestJS
  modules, independent of `SheetSyncModule` except for calling
  `SheetsService.reloadTableSchemas()` after table creation.
- `SheetSyncModule` must read its runtime config from `sync_config_spreadsheets`
  and `sync_config_sheets` via DB query on each scheduler tick — not from
  config/sheets.json. The config/sheets.json file is no longer used and can
  be removed.
- Scheduler state (isSyncing, lastRanAt per spreadsheet) must be held in memory
  only — not persisted to DB.
- All DB queries for dynamic table operations must use parameterized queries or
  properly quoted identifiers. Direct string interpolation of user-supplied values
  into SQL is not permitted.
- NestJS Logger must be used for all log output. Per sync cycle per spreadsheet,
  log at minimum: cycle start, sheets processed, total rows upserted, duration ms,
  and any errors.
- The scheduler must stop all per-spreadsheet sync cleanly on app shutdown via
  OnModuleDestroy.
- WebSocket SyncGateway sheet:updated event payload must now include the
  spreadsheet label in addition to existing fields:
  { spreadsheetLabel, tables, totalUpserted, syncedAt }
- All new REST endpoints must follow existing project conventions for response
  shape, error handling, and HTTP status codes.

---

## Out of Scope

- OAuth / user-level Google authentication (service account credentials only,
  one credential file for all spreadsheets).
- Role-based access control on sync config endpoints.
- Dropping PostgreSQL tables when a sheet config is deleted.
- Editing or writing data back to Google Sheets from the dashboard.
- Full-text search indexing beyond basic ILIKE on TEXT columns.
- Audit log for config changes.
- Real-time config reload without app restart for credential changes.
