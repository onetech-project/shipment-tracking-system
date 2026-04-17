# Tasks: Multi Google Sheet Sync — Configuration UI, Dynamic Table Creation & Async Multi-Sheet Processing

**Input**: Design documents in `/specs/005-multi-google-sheet-sync/`  
**Branch**: `005-multi-google-sheet-sync` | **Date**: 2026-04-17

**Tests**: Unit + Integration + Playwright E2E mandatory. Write tests early (test-first) for critical pure functions and public APIs.

---

## Phase 1 — Setup & Research

- T001 Install any optional utilities (decided in research) and add shared helper for `normalizeTableName()` in `packages/shared`.
- T002 Add database migration scaffolding for config tables.
- T003 Create `specs/005-multi-google-sheet-sync/research.md` (done).

## Phase 2 — DB Migrations

- T010 Create migration to add `label TEXT NOT NULL` to `google_sheet_config`.
- T011 Create migration to alter `google_sheet_sheet_config.table_name` to be GENERATED ALWAYS AS (the normalization expression) STORED.
- T012 Create migration to create `google_sheet_config` and `google_sheet_sheet_config` if they don't already exist (idempotent). Include indexes as needed.
- T013 Optional: create migration/script to import `config/sheets.json` into the new config tables (one-off run during rollout).

## Phase 3 — DynamicTableService & DB helpers

- T020 [P] Implement `normalizeTableName(sheetName: string)` in `packages/shared` (client+server use).
- T021 [P] Implement `quoteIdentifier(name: string)` helper that validates and safely double-quotes SQL identifiers.
- T022 Implement `DynamicTableService.ensureTable(sheetConfig)` in `apps/backend`:
  - Creates table if not exists
  - Adds unique key columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - Adds UNIQUE constraint if not exists
  - Creates GIN index on `extra_data`
  - Calls `SheetsService.reloadTableSchemas()`
  - Logs errors and returns non-throwing status
- T023 Unit tests for `ensureTable` (mock DataSource), include invalid table name, DB error, success cases.

## Phase 4 — SyncConfigModule (REST API)

- T030 Implement TypeORM entities for `google_sheet_config` and `google_sheet_sheet_config`.
- T031 Implement DTOs and validation for spreadsheet and sheet inputs.
- T032 Implement `SyncConfigService` for DB operations (list, create, update, delete).
- T033 Implement `SyncConfigController` endpoints:
  - `GET /sync-config/spreadsheets` — list with nested sheets and `table_name` visible
  - `POST /sync-config/spreadsheets`
  - `PATCH /sync-config/spreadsheets/:id`
  - `DELETE /sync-config/spreadsheets/:id`
  - `GET /sync-config/spreadsheets/:id/sheets`
  - `POST /sync-config/spreadsheets/:id/sheets` — after save call `DynamicTableService.ensureTable()`
  - `PATCH /sync-config/sheets/:id` — call `ensureTable()` when uniqueKeys changed
  - `DELETE /sync-config/sheets/:id` — config-only delete
- T034 Integration tests for `SyncConfigController` (CRUD flows) and ensure `table_name` appears in responses.

## Phase 5 — Scheduler & Sync Runtime

- T040 Implement `MultiSpreadsheetSchedulerService` with:
  - Global tick every 1s
  - In-memory per-spreadsheet state: `lastRanAt`, `isSyncing`, `missedTicks`
  - Trigger per-spreadsheet sync when `now - lastRanAt >= interval_seconds * 1000`
  - Per-spreadsheet try/catch + log format `[SyncScheduler] <Label> (<id>): <ErrorType> — <message>`
  - Pause/resume logic for missed ticks
  - `OnModuleDestroy` to stop tick and await in-flight tasks
- T041 Update `SheetsService.fetchAllSheets()` usage so it accepts a spreadsheet and list of enabled sheets, preserving batchGet behavior
- T042 Unit tests for scheduler guard logic (skips, pauses, shutdown)

## Phase 6 — Dynamic Air Shipments Endpoint

- T050 Implement `GET /air-shipments/:tableName` controller + service:
  - Validate `tableName` exists in `google_sheet_sheet_config` and is enabled (prevents arbitrary table access)
  - Support `page` (default 1), `limit` (default 50), `sortBy`, `sortOrder` (`asc` | `desc`), `search` optional (ILIKE across TEXT columns)
  - Return dedicated columns and `extra_data` object (or optionally flattened fields)
- T051 Integration tests validating tableName validation, pagination, and search behavior

## Phase 7 — Frontend (NextJS)

- T060 Implement `GET /google-sheet-config` UI page (route `/google-sheet-config`): list spreadsheets, expand to show sheets, create/edit forms
  - Realtime `table_name` preview while typing `sheet_name` (use shared `normalizeTableName` helper client-side)
  - Validation: Google Sheet URL, header row >=1, uniqueKeys present
  - Save triggers loading state and toast; saving a sheet triggers `ensureTable()` on backend (API shows success/failure)
- T061 Implement Air Shipments dynamic tabs:
  - Fetch `GET /sync-config/spreadsheets` (filter is_enabled) to build tabs
  - For each tab, load data from `GET /air-shipments/:tableName`
  - Re-fetch tabs when `sheet:updated` WS event arrives or on navigation
- T062 Unit/e2e tests for UI flows: create spreadsheet+sheet, confirm create triggers table creation, tabs appear, data loads

## Phase 8 — SyncGateway Update

- T070 Extend `SyncGateway` `sheet:updated` event payload to include `{ spreadsheetLabel, tables, totalUpserted, syncedAt }`.
- T071 Update frontend listener to use `spreadsheetLabel` as needed.
- T072 Tests for gateway emission shape and frontend handling.

## Phase 9 — Observability, Tests & Docs

- T080 Add structured logs for each per-spreadsheet cycle: cycle start, sheets processed, total rows upserted, duration ms, and errors.
- T081 Add unit tests for normalize/quote helpers, scheduler, ensureTable edge cases.
- T082 Add integration tests for end-to-end create-config → ensureTable → sync run → dynamic endpoint read.
- T083 Create `quickstart.md`, `research.md`, `data-model.md` and finalize `spec.md` (done).

## Phase 10 — Release & Cleanup

- T090 Optional: run `config/sheets.json` import migration (if chosen)
- T091 Remove legacy `config/sheets.json` usage from `SheetSyncModule` and switch runtime to read from DB
- T092 Create PR, run CI, request reviews

---

Each task above should include a short list of acceptance criteria and a test plan in the ticket created for it.
