# Phase 0 Research: Multi Google Sheet Sync — Configuration, Dynamic Tables & Scheduler

**Branch**: `005-multi-google-sheet-sync` | **Date**: 2026-04-17
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

This document records architectural decisions and alternatives considered for the multi-spreadsheet sync feature.

---

## Topic A — Table Identifier Generation & Safety

### A1 — `table_name` generation
- Decision: Use the same `GENERATED ALWAYS` expression in DB and the backend normalization function:

  `'air_shipment_' || lower(regexp_replace(sheet_name, '[^a-zA-Z0-9]', '_', 'g'))`

  Rationale: Keeps UI preview and DB column consistent. Edge cases (leading/trailing underscores, repeated `_`) handled in normalization helper.

### A2 — Quoting & identifier safety
- Decision: Implement an internal quoting/validation helper rather than introducing a dependency. Helper will:
  - Validate the normalized identifier matches `^[a-z][a-z0-9_]*$` and length <= 200
  - Quote identifiers by wrapping with double-quotes and escaping inner double-quotes
  - Refuse creation if normalized identifier fails validation and log an operator-visible error

  Rationale: Prepared statement parameterization cannot be used for identifiers; we must quote safely. `pg-format` is acceptable, but a small in-repo helper gives control and reduces dependency surface.

Alternatives considered: `pg-format` (library) — heavier dependency but battle-tested for identifier quoting; chosen fallback: small helper + tests; `pg-format` can be added if future audit requests it.

---

## Topic B — Dynamic Table Creation Strategy

- Requirements: Idempotent creation, add unique key columns, add GIN index, then call `SheetsService.reloadTableSchemas()`.

- Decision: `DynamicTableService.ensureTable(sheetConfig)` will:
  1. Normalize and validate `table_name` (same logic as DB GENERATED column).
  2. Run `CREATE TABLE IF NOT EXISTS` with system columns.
  3. For each unique key column: `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> TEXT`.
  4. Add `UNIQUE` constraint if not present (create an index or constraint check first).
  5. `CREATE INDEX IF NOT EXISTS idx_<table>_extra_gin ON <table> USING GIN (extra_data)`.
  6. Call `SheetsService.reloadTableSchemas()`.
  7. On any SQL error: log using NestJS Logger and return a non-throwing status (do not block config save).

Rationale: Keeps config save fast and resilient; syncs are skipped until table exists.

---

## Topic C — Scheduler Architecture

- Decision: Global tick (every 1s) reading enabled spreadsheet configs from DB, with per-spreadsheet in-memory state (`lastRanAt`, `isSyncing`, `missedTicks`). Each spreadsheet sync is executed in its own async context; within a spreadsheet, sheets processed in parallel via `Promise.all()`.

Rationale: Matches spec requirements for per-spreadsheet intervals and isolation. Single-process assumption avoids distributed locks.

---

## Topic D — Error Handling & Observability

- Decision: All per-spreadsheet syncs wrapped in top-level try/catch. Use NestJS Logger with format:
  `[SyncScheduler] <SpreadsheetLabel> (<spreadsheetId>): <ErrorType> — <message>`

- Decision: Do not propagate errors out of per-spreadsheet contexts. Log failures, set sheet `status='not-ready'` where appropriate, and continue other work.

---

## Topic E — UI Preview & Validation

- Decision: The frontend will run the same normalization helper client-side to preview `table_name` as the admin types `sheet_name` (exact match to backend normalization). Backend will still validate on save; the preview is UX-only.

- Decision: On invalid normalized table_name (e.g., empty after normalization), allow save but mark sheet `status='error'` and surface an operator warning. The save should not fail to prevent blocking admin workflows.

---

## Topic F — Migration Strategy

- Decision: Provide an optional migration script to import existing `config/sheets.json` into `google_sheet_config` + `google_sheet_sheet_config`. This script runs once during rollout and logs mappings.

- Decision: Do not attempt to rename or drop existing manual tables; dynamic table creation only creates new `air_shipment_*` tables when a sheet is saved.

---

## Topic G — Security & Permissions

- Decision: Table creation requires DB user with `CREATE TABLE` and `ALTER TABLE` permissions. If not available, `ensureTable` logs the failure and marks sheet not-ready. Document required DB permissions in `quickstart.md`.

---

## Topic H — Alternatives Considered

- Using a centralized schema registry or template-based table per sheet vs dynamic CREATE TABLE: rejected because dynamic tables give independent backing storage per sheet and simpler queries for the frontend.

- Persisting scheduler state to DB to support multi-instance deployments: postponed — single-instance operation is acceptable for MVP; future work may add distributed locking.

---

## Actionable Outcomes

- Implement `normalizeTableName()` helper in `packages/shared` and reuse client/server.
- Implement `DynamicTableService.ensureTable()` with careful quoting and idempotent SQL.
- Add migration files for `google_sheet_config` label and `google_sheet_sheet_config` generated `table_name`.
- Add docs listing DB permissions required for runtime table creation.
