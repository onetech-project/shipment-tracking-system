# Research: Google Sheets to PostgreSQL Sync Service

**Date**: 2026-04-04  
**Branch**: `004-sheets-postgres-sync`

All unknowns from the Technical Context are resolved below.

---

## Decision 1: Google Sheets Client Library

**Decision**: Use `googleapis` (the official Google meta-client) with native `gaxios` retry configuration.

**Rationale**: The project already uses TypeScript with strict typing. `googleapis` provides full TypeScript types, is actively maintained, and its built-in `gaxios` HTTP layer supports configurable retry with exponential backoff — satisfying constitution §VIII without a third-party retry wrapper. `google-spreadsheet` would be simpler but introduces an unofficial abstraction layer that is single-maintainer-maintained; `@googleapis/sheets` is in maintenance mode.

**Alternatives considered**:

- `google-spreadsheet` — good DX but single maintainer, adds unnecessary abstraction layer (KISS/YAGNI violation for this scope)
- `@googleapis/sheets` — scoped version of `googleapis`, partially in maintenance mode

**Retry configuration**: Use `gaxios` `retryConfig` on the `google.sheets()` constructor with `retry: 3`, initial delay 1000ms, factor 2 (1s → 2s → 4s), capped at 30s, for 429/500/503 status codes. This satisfies constitution §VIII default schedule `1s → 3s → 10s → 30s` within acceptable margin.

---

## Decision 2: Google Sheets Authentication

**Decision**: Service Account authenticated via `GOOGLE_APPLICATION_CREDENTIALS` environment variable (path to the JSON key file) using `google.auth.GoogleAuth`.

**Rationale**: Service Account is the standard pattern for server-to-server access. Storing only the file path in the env var (not the key contents) keeps secrets out of the codebase (§XV) and out of process memory unnecessarily. The `GoogleAuth` class automatically reads `GOOGLE_APPLICATION_CREDENTIALS` and handles token refresh transparently.

**Scope**: `https://www.googleapis.com/auth/spreadsheets.readonly` is sufficient for polling; using the more restrictive read-only scope is a security best practice.

**Alternatives considered**:

- Inline JSON key contents as env var — works but increases risk of accidental logging; file path is safer
- OAuth2 user credentials — not appropriate for an automated background service

---

## Decision 3: Sheet Range Format

**Decision**: Use open-ended range `'Sheet1'!A:Z` (or the configured sheet tab name) with `valueRenderOption: 'FORMATTED_VALUE'`.

**Rationale**: The API automatically omits trailing empty rows and columns, so requesting `A:Z` safely returns all data rows without requiring foreknowledge of the row count. `FORMATTED_VALUE` returns cell values as they appear to the user, which is appropriate since type coercion is handled downstream in the service (not by the Sheets API).

**Header row**: Row index 0 of `response.data.values` is always the header; data rows start at index 1. An empty `values` array or a `values` array of length ≤ 1 (header only) means the sheet has no data rows — the cycle logs a warning and exits early without error.

**Alternatives considered**:

- `UNFORMATTED_VALUE` — returns raw numeric serial numbers for dates; coercion logic would need to handle serial → ISO conversion, adding unnecessary complexity
- Fixed range like `A1:Z1000` — brittle; breaks when sheet grows beyond bound

---

## Decision 4: Concurrency Guard Design

**Decision**: Implement the concurrency guard using a single `private isSyncing = false` boolean class property, checked synchronously at the start of each tick, wrapped in `try/finally` to guarantee reset.

**Rationale**: This is the simplest correct solution (KISS). JavaScript/Node.js has a single-threaded event loop, so the check-and-set at the start of an async method is atomic from the perspective of the scheduler (the `@Interval` callback fires on the event loop only when the current synchronous frame completes). No mutex or atomic primitive is needed.

**Pause-on-multiple-missed-ticks**: Implemented by tracking a `pendingTickCount` counter that increments each time a tick is skipped while `isSyncing` is true. When count exceeds 1 (i.e., more than one tick missed), the scheduler interval is stopped via `SchedulerRegistry.deleteInterval()`. On cycle completion, if there were pending ticks, the interval is re-registered from scratch.

**Alternatives considered**:

- Job queue (BullMQ) — over-engineered for a single scheduled task; spec explicitly mandates a boolean lock flag approach
- `AsyncLocalStorage` mutex — unnecessary complexity in a single-process Node.js service

---

## Decision 5: Dynamic Column Mapping and Type Coercion

**Decision**: Column mapping is derived fresh at the start of each sync cycle by reading the first row of the sheet. The mapping is a `Map<string, string>` of `sheetColumnName → dbColumnName` (initially a 1:1 pass-through). Coercion is applied per-value before database write using a pure utility function.

**Coercion precedence**:

1. Boolean: case-insensitive `"true"` / `"false"` → JS boolean
2. Integer: string matching `/^\d+$/` → `parseInt`
3. Float: string matching `/^[\d.]+$/` or `/^-?\d+\.?\d*$/` → `parseFloat`
4. ISO 8601 date: string matching `/^\d{4}-\d{2}-\d{2}/` and parseable as `new Date()` → JS `Date`
5. Fallback: raw string

**Unknown columns**: If a sheet column has no counterpart in the target table (detected by catching TypeORM column-not-found errors or by comparing against queried column metadata), a `WARN` log is emitted and the column is silently excluded from the upsert payload.

**Alternatives considered**:

- Fetching schema metadata on every cycle — adds an extra DB roundtrip; instead, column metadata is fetched once on module init and cached
- Strict schema validation on startup — spec explicitly prohibits it (FR-021); warn-and-skip is enough

---

## Decision 6: Upsert Strategy (Change Detection + Write)

**Decision**: Use TypeORM `Repository.upsert()` with a conflict target on the primary-key column, but only after comparing the incoming mapped row against the existing row fetched in the same cycle.

**Change detection**: Fetch all existing rows from the target table once per cycle (or use a keyed lookup). Serialize each field pair to string and compare; if all fields are equal, skip the write. `last_synced_at` is excluded from the comparison (it is always updated on write) and `is_locked` skip happens before comparison (FR-007).

**`last_synced_at` tracking**: A dedicated `last_synced_at` timestamp column must exist on the target table. The migration for this column is added as part of this feature (see data-model.md).

**Alternatives considered**:

- Hash-based comparison (MD5 of serialized row) — adds complexity with no significant benefit at small-to-medium row counts
- Always upsert without comparison — violates FR-004

---

## Decision 7: WebSocket Gateway Pattern

**Decision**: `SyncGateway` is a standard NestJS `@WebSocketGateway()` with `@WebSocketServer() server: Server`. `SheetSyncService` receives `SyncGateway` via constructor injection and calls a `notifyClients()` method on it after each successful write cycle.

**CORS**: Gateway CORS origin is configured at decorator time using a factory function that reads `process.env.FRONTEND_ORIGIN`. Since the decorator executes at startup, the env var value is read once at bootstrap.

**Dependency direction**: `SheetSyncService → SyncGateway` (service injects gateway). This is one-way and creates no circular dependency.

**Alternatives considered**:

- Emitting via NestJS EventEmitter bus and having the gateway listen — adds an extra layer for no benefit in a single-module context (YAGNI)
- Service injects `Server` directly from gateway — overly tight coupling; calling a named gateway method is cleaner and more testable

---

## Decision 8: Frontend Hook Design

**Decision**: `useSheetSync(onUpdate?: () => void)` — a React client hook using `socket.io-client`, initializing the socket inside `useEffect` (not at module level) to avoid SSR issues. Connection status is tracked via `connect` / `disconnect` events. TanStack Query invalidation is triggered by calling `queryClient.invalidateQueries()` (or calling the provided `onUpdate` callback) when `sheet:updated` fires.

**SSR safety**: Hook file is annotated `'use client'`. Socket initialization deferred to `useEffect` with empty dependency array. No `typeof window` guard needed since `useEffect` is client-only by specification.

**Alternatives considered**:

- Passing a specific query key into the hook — over-engineered; `onUpdate` callback gives the consumer full control without coupling the hook to specific TanStack Query keys
- Using `useRef` for socket vs module-level singleton — `useRef` is safer for component-scoped connections; module-level singleton would prevent multiple components listening simultaneously

---

## Resolved Unknowns Summary

| Unknown                          | Resolution                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Which Google Sheets library?     | `googleapis` with `gaxios` retry config                                                          |
| Auth mechanism                   | Service Account via `GOOGLE_APPLICATION_CREDENTIALS` path env var                                |
| Sheet range format               | Open-ended `A:Z` with `FORMATTED_VALUE` render                                                   |
| Concurrency guard implementation | `isSyncing` boolean + `pendingTickCount` + `SchedulerRegistry` pause/resume                      |
| Column mapping strategy          | Fresh header-row read each cycle; 1:1 pass-through; cached schema metadata for column validation |
| Type coercion order              | Boolean → Int → Float → ISO date → string fallback                                               |
| Upsert strategy                  | Fetch-compare-then-upsert; skip unchanged rows; `last_synced_at` updated on write only           |
| WebSocket emit pattern           | `SheetSyncService` injects `SyncGateway`; calls `notifyClients()` after write cycle              |
| Frontend socket hook             | `useEffect`-initialized `socket.io-client`; `onUpdate` callback; `'use client'` directive        |
| New packages needed (backend)    | `googleapis`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`             |
| New packages needed (frontend)   | `socket.io-client`                                                                               |
