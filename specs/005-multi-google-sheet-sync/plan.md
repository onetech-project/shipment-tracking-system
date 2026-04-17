# Implementation Plan: Multi Google Sheet Sync — Configuration UI, Dynamic Table Creation & Async Multi-Sheet Processing

Spec: [specs/005-multi-google-sheet-sync/spec.md](specs/005-multi-google-sheet-sync/spec.md)

Overview
- Goal: Replace static sheet config with DB-driven configs, dynamically create per-sheet Postgres tables, run independent async syncs per spreadsheet, and expose a management UI + dynamic Air Shipments surface.
- Deliverables: DB migrations, `SyncConfigModule`, `DynamicTableService.ensureTable()`, multi-spreadsheet scheduler, dynamic `GET /air-shipments/:tableName`, NextJS admin UI, tests, and docs.

Phases

Phase 0 — Research & Clarify (1–2 days)
- Confirm Postgres extensions available (pgcrypto/gen_random_uuid) and required permissions for runtime table creation.
- Decide on quoting strategy for identifiers (use `pg-format` vs. internal quoting helper). Prefer minimal-deps internal quoting + rigorous validation.
- Clarify whether we should migrate existing `config/sheets.json` entries into DB automatically (recommended migration script).
- Deliverable: `research.md` (short notes), final decisions recorded in spec folder.

Phase 1 — DB Migrations & Data Model (2–3 days)
- Tasks:
  - Add migration: `google_sheet_config` add `label TEXT NOT NULL`.
  - Add/adjust migration: ensure `google_sheet_sheet_config.table_name` GENERATED column definition matches the normalization rule in the spec.
  - Create optional migration script to import `config/sheets.json` into the new tables (run once during rollout).
  - Add DB tests for migrations where possible.
- Acceptance:
  - Migrations run locally and in CI; `table_name` values are deterministic.

Phase 2 — Backend Core (5–8 days)
- 2.1 SyncConfigModule (CRUD API)
  - Implement entities / DB access for `google_sheet_config` and `google_sheet_sheet_config`.
  - Implement controllers and services for endpoints:
    - `GET /sync-config/spreadsheets` (include nested sheets and `table_name`)
    - `POST/PATCH/DELETE` for spreadsheets and sheets per spec
    - `GET /sync-config/spreadsheets/:id/sheets`
  - Input validation: spreadsheet URL format, `intervalSeconds` >= 5, `headerRowNumber` >= 1, uniqueKeys non-empty, snake_case guidance.
  - Acceptance: API returns nested objects and proper HTTP statuses.

- 2.2 DynamicTableService.ensureTable(sheetConfig)
  - Implement `ensureTable(sheetConfig)` in a new `DynamicTableService`.
  - Responsibilities:
    - Normalize `sheetName` to `table_name` using the same regex rule used in the DB GENERATED column.
    - Validate normalized identifier against allowed pattern.
    - Safely quote identifiers (double-quote + escape double-quotes inside names) when building SQL for identifiers.
    - Execute idempotent SQL via `DataSource.query()`:
      - `CREATE TABLE IF NOT EXISTS <table> (...)` with system columns
      - `ALTER TABLE ADD COLUMN IF NOT EXISTS` for each unique key (TEXT NOT NULL)
      - Add `UNIQUE` constraint if not exists on unique key columns
      - `CREATE INDEX IF NOT EXISTS idx_<table>_extra_gin ON <table> USING GIN (extra_data)`
    - After successful creation/update, call `SheetsService.reloadTableSchemas()`.
    - On failure: log using NestJS Logger and return a non-throwing status so the config save still succeeds.
  - Acceptance: `ensureTable` is idempotent and does not crash the request flow on error.

- 2.3 Hook ensureTable on sheet save
  - Call `DynamicTableService.ensureTable()` after DB save on `POST /sync-config/spreadsheets/:id/sheets` and `PATCH /sync-config/sheets/:id` (when uniqueKeys changed).
  - Display and return status to API callers; frontend shows success/failure toast.

Phase 3 — Scheduler & Sync Runtime (4–7 days)
- Replace single-spreadsheet scheduler with a `MultiSpreadsheetSchedulerService`:
  - Global tick every 1s reading enabled spreadsheet configs from DB.
  - Per-spreadsheet state (in-memory): `lastRanAt`, `isSyncing`, `missedTicks`.
  - Trigger per-spreadsheet sync if `now - lastRanAt >= intervalSeconds * 1000`.
  - Per-spreadsheet sync runs in its own async context and sets `isSyncing` to true.
  - Within a spreadsheet sync: call existing `SheetsService.fetchAllSheets()` (batchGet) and process each sheet via `processSingleSheet()` using `Promise.all()`.
  - Wrap each spreadsheet sync in try/catch and log errors with format: `[SyncScheduler] <SpreadsheetLabel> (<spreadsheetId>): <ErrorType> — <message>`.
  - Pause per-spreadsheet scheduling if several consecutive ticks were missed until in-flight completes.
  - Implement `OnModuleDestroy` to stop global tick and await in-flight tasks (with timeout).
- Acceptance: multiple spreadsheets with different intervals run independently; errors isolated.

Phase 4 — Dynamic Air Shipments Endpoint (3–4 days)
- Implement `GET /air-shipments/:tableName` controller + service.
  - Validate `:tableName` exists in `sync_config_sheets` to prevent arbitrary table access.
  - Determine dedicated columns for the table from `information_schema` or `SheetsService` knownColumns.
  - Build a dynamic, safe SELECT that returns system columns + dedicated columns + `extra_data` as raw JSON and (optionally) flattened fields for front-end convenience.
  - Support query params: `page` (1), `limit` (50), `sortBy`, `sortOrder` (asc|desc), `search` — implement `ILIKE` across TEXT columns and stringified `extra_data` values.
  - Ensure queries use safe quoting for identifiers and parameterized values for user inputs.
- Acceptance: endpoint validates table, returns paginated results with dedicated columns and `extra_data` object.

Phase 5 — Frontend (NextJS) (4–6 days)
- 5.1 Google Sheet Config UI (`/google-sheet-config`)
  - Spreadsheet list view with expand/collapse to show sheets
  - Spreadsheet fields: Label, Google Sheet URL, Sync Interval, Enabled
  - Sheet fields: Sheet Name, Table Name (read-only preview), Unique Key(s), Header Row Number, Enabled
  - Real-time `tableName` preview implemented client-side using same normalization algorithm as backend
  - Save triggers API call; show loading state and success/error toast
  - Confirm dialogs for deletes with warning about retained data
- 5.2 Air Shipments dynamic tabs
  - Fetch enabled sheet configs via `GET /sync-config/spreadsheets` and render tabs
  - Tab content loads data from `GET /air-shipments/:tableName` with pagination, sorting, search
  - Re-fetch tabs list on navigation and in response to `sheet:updated` WebSocket event
- Acceptance: admin can create config and end-users see tabs; toasts and previews present.

Phase 6 — Observability, Tests & Docs (3–5 days)
- Observability:
  - Use NestJS Logger with the specified format for scheduler logs per spreadsheet cycle
  - Log cycle start, sheets processed, total rows upserted, duration ms, and errors
- Tests:
  - Unit tests for `DynamicTableService.ensureTable()` (mock DataSource), `SyncConfigModule` controllers, scheduler state machine
  - Integration tests for `GET /air-shipments/:tableName` (test DB)
  - E2E: simulate create spreadsheet + sheet and verify data flow (may use mocks for external Google API)
- Docs:
  - `specs/005-multi-google-sheet-sync/quickstart.md` — how to run migrations, import legacy config, run local sync, required env vars
  - Developer notes on quoting/identifier safety and rollback steps
- Acceptance: tests pass in CI, docs added.

Phase 7 — Rollout & Cleanup (1–2 days)
- Deploy to staging and run migration to import `config/sheets.json` if chosen
- Monitor logs/metrics for errors
- When stable, remove `config/sheets.json` and related code

Risks & Mitigations
- Runtime table creation may require elevated DB permissions — mitigate by validating permissions in Phase 0 and adding a graceful fallback if not allowed.
- Identifier quoting errors leading to SQL injection — mitigate by strict normalization and quoting helpers, plus unit tests for edge cases.
- Large numbers of sheets/tables may stress DB with many indexes — monitor index impact and add rate limits/constraints if needed.

Owner & Estimated Effort (rough)
- Backend engineer (primary): 12–18d
- Frontend engineer: 6–8d
- QA/Testing: 3–5d
- Total: 3–5 sprints depending on team size

Artifacts to create
- `specs/005-multi-google-sheet-sync/plan.md` (this file)
- `specs/005-multi-google-sheet-sync/research.md`
- `specs/005-multi-google-sheet-sync/quickstart.md`
- Backend code: `SyncConfigModule`, `DynamicTableService`, `MultiSpreadsheetSchedulerService`, `air-shipments` dynamic controller
- Frontend pages: `/google-sheet-config`, Air Shipments tab changes

Next action
- If you want, I can scaffold the DB migration and `DynamicTableService.ensureTable()` implementation next (backend-first approach). Otherwise I can scaffold the NextJS UI first.
