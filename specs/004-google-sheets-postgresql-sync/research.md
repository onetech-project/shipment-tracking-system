# Phase 0 Research: Google Sheets → PostgreSQL Sync Service

**Branch**: `copilot/add-google-sheets-sync-service` | **Date**: 2026-04-08  
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

All NEEDS CLARIFICATION items resolved. Decisions documented below with rationale and rejected alternatives.

---

## Topic A — Google Sheets API Integration

### A1 — Client Library Choice

|                             |                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `googleapis` npm package (`google-auth-library` + `sheets.values.batchGet`)                                                                                                                                                                                      |
| **Rationale**               | The spec explicitly mandates service-account credentials (`GOOGLE_CREDENTIALS_PATH`, `GOOGLE_SHEET_ID`). The official `googleapis` SDK is the canonical way to authenticate with a service account and call the Google Sheets API from Node.js. It handles token refresh transparently, supports `FORMATTED_VALUE` + `FORMATTED_STRING` rendering modes (FR-007), and uses `batchGet` for a single API call per cycle (FR-006). No alternative reaches the same breadth of functionality with the same maintenance guarantees. |
| **Alternatives considered** | **node-google-spreadsheet**: higher-level wrapper; abstracts too much (no direct `batchGet`; adds unnecessary dependency); project-maintained, not Google-official. **axios + raw REST**: duplicates auth, token refresh, and error handling already solved by the SDK. |

### A2 — Authentication Strategy

|                             |                                                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `GoogleAuth` with `keyFilename` pointing to `GOOGLE_CREDENTIALS_PATH`; scope `https://www.googleapis.com/auth/spreadsheets.readonly`                                                                                        |
| **Rationale**               | Read-only scope minimizes blast radius if credentials leak. Service-account file path is supplied as an env var and excluded from version control. Token refresh is fully managed by `GoogleAuth`.                           |
| **Alternatives considered** | OAuth 2.0 user consent flow: requires interactive browser login — incompatible with a background service. Hardcoded credentials: violates §XV Security. |

### A3 — Batch API Call Design

|                             |                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Single `spreadsheets.values.batchGet` call with all sheet ranges (e.g., `CompileAirCGK!A:ZZ`, `SUB!A:ZZ`, …) per cycle; use `valueRenderOption: FORMATTED_VALUE` and `dateTimeRenderOption: FORMATTED_STRING`        |
| **Rationale**               | FR-006 mandates minimum API calls. One `batchGet` costs 1 quota unit vs. 5 separate `get` calls costing 5 units. `FORMATTED_VALUE` returns human-readable cell values; `FORMATTED_STRING` formats dates as strings for deterministic parsing. |
| **Alternatives considered** | Per-sheet `spreadsheets.values.get` calls: multiplies quota usage proportionally; rejected. |

---

## Topic B — NestJS Scheduler

### B1 — Scheduler Implementation

|                             |                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `@nestjs/schedule` with `@Interval()` decorator and a manual `isSyncing` flag plus consecutive-skip counter for concurrency guard                                                                                                                             |
| **Rationale**               | `@nestjs/schedule` wraps `node-schedule` (cron) and provides `@Interval()` for fixed-interval polling — exactly what FR-001 requires. The `isSyncing` boolean guard (FR-002) and consecutive-skip counter (FR-003) are trivial to implement as class-level state. No external locking infrastructure (Redis, DB) is needed because the service is single-instance. |
| **Alternatives considered** | **BullMQ repeatable jobs**: already in the project but adds unnecessary broker round-trip for a single-process scheduler; designed for distributed workers, not single-instance polling. **`setInterval` directly**: less idiomatic in NestJS; harder to test and to hook into `onApplicationShutdown` lifecycle. **`@Cron()` with 15s cron expression**: cron minimum resolution is 1 second; `@Interval(15000)` is the correct primitive for millisecond-precision intervals. |

### B2 — Graceful Shutdown

|                             |                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Implement `OnApplicationShutdown` hook; call `SchedulerRegistry.deleteInterval()` inside `onApplicationShutdown()` to stop the interval before the process exits                            |
| **Rationale**               | FR-005 mandates graceful shutdown. NestJS fires `onApplicationShutdown` when SIGTERM/SIGINT is received. Removing the interval prevents a new cycle from starting after the shutdown signal. |
| **Alternatives considered** | `process.on('SIGTERM')` directly: works but bypasses the NestJS lifecycle — harder to test. |

---

## Topic C — WebSocket Real-Time Notifications

### C1 — WebSocket Library

|                             |                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `@nestjs/websockets` + `@nestjs/platform-socket.io` (Socket.IO) as the NestJS WebSocket gateway                                                                                                                                        |
| **Rationale**               | Neither `@nestjs/websockets` nor Socket.IO are currently in the project, so both must be added. Socket.IO is chosen over raw `ws` because: (a) it handles reconnection automatically, satisfying FR-043/User Story 2 Scenario 4; (b) it provides namespaces and rooms for future extensibility; (c) the NestJS `@WebSocketGateway()` decorator integrates cleanly with the module system; (d) the frontend can use `socket.io-client` for a consistent API. |
| **Alternatives considered** | **raw `ws`**: lighter, but no built-in reconnection, no rooms, requires manual heartbeat handling. **Server-Sent Events (SSE)**: spec explicitly rules it out (Out of Scope). **Redis pub/sub**: spec explicitly rules it out (Out of Scope). |

### C2 — Gateway Architecture

|                             |                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Decision**                | A single `SyncNotificationGateway` in a dedicated `air-shipments` NestJS module; emits to the default namespace  (no custom namespace) on a `sync:update` event         |
| **Rationale**               | KISS: a single namespace is sufficient for the current notification contract (FR-031). Keeping the gateway in the same module as the sync service avoids cross-module coupling. |
| **Alternatives considered** | Separate gateway module: premature abstraction (YAGNI) since there is only one gateway in scope. |

---

## Topic D — Change Detection & Upsert Strategy

### D1 — Change Detection Approach

|                             |                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Decision**                | Per-row application-level diff: fetch all existing rows for the sheet's target table in one query, build an in-memory map keyed by `uniqueKey`, compare incoming normalized values field-by-field, write only deltas |
| **Rationale**               | FR-022–FR-024: only changed rows must be written. A bulk fetch + in-memory map is a single DB round-trip per sheet per cycle (not N+1), which scales to thousands of rows. The comparison logic is deterministic and testable in isolation. |
| **Alternatives considered** | **Per-row `SELECT` then `UPDATE`**: N+1 queries — violates §III; unacceptable at scale. **Database-side `INSERT … ON CONFLICT DO UPDATE` always**: always updates `last_synced_at` even when unchanged — violates FR-024. **Hash-based comparison** (hash all fields into a checksum column): adds DB complexity and schema coupling; application-level diff is simpler. |

### D2 — Upsert Implementation

|                             |                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | TypeORM `Repository.save()` for inserts; `Repository.update()` with explicit column list for updates; all targeting the unique key. No raw SQL unless TypeORM cannot express the need.           |
| **Rationale**               | Stays within the existing TypeORM pattern (§II). `save()` issues an INSERT; `update()` issues a targeted UPDATE only for the columns that changed. Both are idiomatic and testable.              |
| **Alternatives considered** | Raw `INSERT … ON CONFLICT DO UPDATE`: more efficient for bulk but bypasses TypeORM entity hooks and makes testing harder. Acceptable as an optimization if performance targets are not met under load. |

---

## Topic E — Header Normalization Pipeline

### E1 — Normalization Algorithm

|                             |                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Pure function `normalizeHeader(raw: string): string` implementing the exact pipeline from FR-012: strip `\n` → remove non-alphanumeric/space chars → trim → collapse spaces → prefix with `_` if empty → lowercase → deduplicate with suffix counter per FR-013 |
| **Rationale**               | A single pure function is easy to unit-test exhaustively (all edge cases from spec). Keeping it pure (no side effects) means it is usable from both the sync service and any tooling/tests. |
| **Alternatives considered** | Regex chain in-line: same logic, harder to test and name. |

---

## Topic F — Type Coercion Pipeline

### F1 — Coercion Order and Rules

|                             |                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | A `coerceValue(value: string, context): unknown` function applying checks in this priority order: (1) spreadsheet error → null; (2) numeric → Number; (3) boolean string → boolean; (4) duration string → integer seconds; (5) date/datetime string → Date; (6) fallback → plain string |
| **Rationale**               | FR-016–FR-021 define mutually exclusive coercion rules in priority order. Applying them in a fixed sequence prevents ambiguity (e.g., `"1"` is numeric before it could be a date). Warnings with context are logged for error values per FR-016. |
| **Alternatives considered** | Using `date-fns` or `moment` for date parsing: adds dependency; the spec defines a small, fixed set of date formats that can be parsed with targeted regex + native `Date`. |

---

## Topic G — Frontend Real-Time Integration

### G1 — Socket.IO Client and Hook

|                             |                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Decision**                | `socket.io-client` in a custom React hook `useSyncNotification()` that connects on mount, disconnects on unmount, and exposes `{ isConnected, lastSyncAt, affectedTables }`                                 |
| **Rationale**               | FR-043 mandates connect-on-mount / disconnect-on-unmount. A dedicated hook encapsulates all socket lifecycle logic, preventing resource leaks, and follows the existing Next.js `features/` pattern (§V). The hook is stateful: updates `isConnected` for the "Live" badge (FR-040) and triggers re-fetch on `sync:update` events (FR-042). |
| **Alternatives considered** | Global socket store (Zustand/Redux): more complex; unnecessary since only Air Shipments pages consume this channel. **`useEffect` directly in each page component**: would duplicate connect/disconnect logic across five pages — violates DRY (§IV). |

### G2 — Data Fetching Strategy

|                             |                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Server-side `fetch` via Next.js API routes (or direct client `fetch` to backend) with cursor/page-based pagination; manual re-fetch triggered by socket notification             |
| **Rationale**               | FR-036–FR-037: pagination and sorting must be supported. The backend exposes dedicated REST endpoints per table. No SWR or React Query is currently in the project; a simple client `fetch` + local state keeps the dependency footprint minimal (YAGNI §IV). |
| **Alternatives considered** | SWR / React Query with `revalidate`: valid but adds a dependency not currently in the project. Can be adopted later if caching requirements grow. |

---

## Topic H — New Dependencies

| Package                     | Where          | Purpose                                      |
| --------------------------- | -------------- | -------------------------------------------- |
| `googleapis`                | backend        | Google Sheets API client + service-account auth |
| `@nestjs/schedule`          | backend        | `@Interval()` decorator for polling scheduler |
| `@nestjs/websockets`        | backend        | WebSocket gateway decorators                 |
| `@nestjs/platform-socket.io`| backend        | Socket.IO adapter for NestJS                 |
| `socket.io`                 | backend        | Socket.IO server runtime                     |
| `socket.io-client`          | frontend       | Socket.IO client for real-time notifications |

All packages are typed; `@types/*` packages added where needed.

---

## Topic I — Environment Variables

| Variable                 | Required | Description                                                          |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `GOOGLE_CREDENTIALS_PATH`| Yes      | Absolute path to the service account JSON key file                   |
| `GOOGLE_SHEET_ID`        | Yes      | Google Spreadsheet ID (from the sheet URL)                           |
| `SHEET_CONFIG_PATH`      | Yes      | Absolute path to `config/sheets.json`                                |
| `SYNC_INTERVAL_MS`       | No       | Polling interval in ms; defaults to `15000`                          |
| `WEBSOCKET_CORS_ORIGIN`  | Yes      | Allowed origin for WebSocket CORS (e.g., `http://localhost:3000`)    |
| `NEXT_PUBLIC_API_URL`    | Yes      | Frontend: base URL for backend API and Socket.IO connection          |

---

## Topic J — Sheet Configuration File (`config/sheets.json`)

The five configured sheets map to the following targets:

| Sheet Tab Name   | Target Table         | `uniqueKey`  | `headerRow` | `skipNullCols` |
| ---------------- | -------------------- | ------------ | ----------- | -------------- |
| `CompileAirCGK`  | `air_shipments_cgk`  | `to_number`  | 1           | true           |
| `SUB`            | `air_shipments_sub`  | `to_number`  | 1           | true           |
| `SDA`            | `air_shipments_sda`  | `to_number`  | 1           | true           |
| `Data`           | `rate_per_station`   | `concat`     | 1           | false          |
| `Master Data`    | `route_master`       | `concat`     | 1           | false          |

The file is excluded from version control; an example file (`config/sheets.example.json`) is committed instead.
