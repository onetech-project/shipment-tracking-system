# Implementation Plan: Google Sheets to PostgreSQL Sync Service

**Branch**: `004-sheets-postgres-sync` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-sheets-postgres-sync/spec.md`

## Summary

Add a background sync service (`SheetSyncModule`) to the NestJS backend that polls a configured Google Sheet every 15 seconds, performs row-level change detection and lock-flag checking before writing to PostgreSQL, and emits real-time `sheet:updated` events to connected Next.js dashboard clients via Socket.IO. The frontend receives updates through a `useSheetSync()` React hook that connects to the Socket.IO gateway and triggers TanStack Query cache invalidation on every write cycle.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 LTS  
**Primary Dependencies**: NestJS 10.4 (`@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`), TypeORM 0.3.20, `googleapis` (Google Sheets API v4), `socket.io` (backend gateway), `socket.io-client` (frontend hook)  
**Storage**: PostgreSQL 16.x via TypeORM (no new migrations needed — target table pre-provisioned externally)  
**Testing**: Jest (unit/integration), Playwright (E2E) — Playwright mandatory per constitution §VI  
**Target Platform**: Linux server (backend), Web browser (frontend)  
**Project Type**: Web service — monorepo (`apps/backend` + `apps/frontend` + `packages/shared`)  
**Performance Goals**: Sheet poll-to-DB-write latency ≤ 30s end-to-end; WebSocket notification delivered to connected client within 5s of DB write  
**Constraints**: Single sheet / single table per service instance; concurrency guard prevents overlapping sync cycles; locked rows never written  
**Scale/Scope**: Internal operational tool; small-to-medium sheets (hundreds of rows); org-scoped deployment

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                         | Status  | Notes                                                                                                                                                |
| ------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| §I Monorepo Architecture                          | ✅ PASS | New code stays in `apps/backend/src/modules/sheet-sync/`, `apps/frontend/src/features/sheet-sync/`, and `packages/shared` for event types            |
| §II Tech Stack (NestJS/TypeScript/PostgreSQL)     | ✅ PASS | `SheetSyncModule` implemented as NestJS module with TypeORM; frontend in Next.js/TypeScript                                                          |
| §III Database (migrations, timestamps, indexes)   | ✅ PASS | No new tables created by this service — target table is pre-provisioned; `last_synced_at` is a timestamp column added to that table via a migration  |
| §IV DRY/KISS/YAGNI                                | ✅ PASS | Generic column-mapping logic kept in one service; no speculative multi-sheet support; `isSyncing` boolean is the simplest possible concurrency guard |
| §V Modular Architecture                           | ✅ PASS | New `SheetSyncModule` is fully isolated; gateway injectable for cross-module use if needed                                                           |
| §VI Testing (Unit + Integration + Playwright E2E) | ✅ PASS | Unit tests for coercion/diff logic; integration tests for scheduler + DB writes; Playwright E2E for dashboard live-update flow                       |
| §VII Fail-Safe / Fault-Tolerant                   | ✅ PASS | Row-level errors are caught and logged; a single bad row does not abort the cycle; Google Sheets API errors gracefully skip the cycle                |
| §VIII Retryable System                            | ✅ PASS | Google Sheets API calls will use exponential backoff per constitution; individual cycle failures are retried on the next scheduled tick              |
| §IX Idempotency                                   | ✅ PASS | Change detection (diff before upsert) ensures repeated polls on unchanged data produce zero writes; upsert is idempotent by design                   |
| §X Observability                                  | ✅ PASS | NestJS `Logger` records cycle start, per-row outcomes (processed / skipped-unchanged / skipped-locked / upserted), and any errors with row context   |
| §XI Rate Limiting                                 | ✅ PASS | No new REST endpoints exposed; inherits global throttler; Google Sheets polling rate is bounded by the 15s interval                                  |
| §XII Event-Driven                                 | ✅ PASS | `sheet:updated` WebSocket event follows the project's event-driven pattern; could be extended to the EventEmitter bus if needed                      |
| §XIV CI/CD                                        | ✅ PASS | No new Dockerfiles or Jenkinsfiles required; new module builds and tests inside the existing backend and frontend pipelines                          |
| §XV Security                                      | ✅ PASS | Google credentials stored as env vars (never in repo); Socket.IO CORS origin configurable via env; no new unauthenticated REST endpoints             |

## Project Structure

### Documentation (this feature)

```text
specs/004-sheets-postgres-sync/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/
│   ├── sync.ws.md       # WebSocket event contract (SyncGateway ↔ useSheetSync hook)
│   └── sync.config.md   # Environment variable configuration contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/backend/
├── src/
│   ├── modules/
│   │   └── sheet-sync/                   # New: SheetSyncModule
│   │       ├── sheet-sync.module.ts       # Module definition; exports SyncGateway
│   │       ├── sheet-sync.service.ts      # Scheduler + Google Sheets polling + upsert logic
│   │       ├── sync.gateway.ts            # NestJS WebSocket gateway (Socket.IO)
│   │       ├── google-sheets.service.ts   # Google Sheets API client wrapper
│   │       ├── column-mapper.ts           # Header row → ColumnMap builder
│   │       ├── type-coercion.util.ts      # String → typed value coercion
│   │       └── dto/
│   │           └── sync-notification.dto.ts
│   └── database/
│       └── migrations/
│           └── <timestamp>-add-sheet-sync-columns.ts  # Adds last_synced_at, is_locked
└── ...

apps/frontend/
├── src/
│   ├── features/
│   │   └── sheet-sync/                   # New: frontend sheet sync feature
│   │       └── hooks/
│   │           └── use-sheet-sync.ts      # useSheetSync() React hook
│   └── ...
└── e2e/
    └── sheet-sync/
        └── live-update.spec.ts            # Playwright E2E: dashboard live refresh

packages/shared/
└── src/
    └── sync.ts                            # SyncNotificationPayload shared type
```

**Structure Decision**: Web application structure (Option 2) — `apps/backend` for the NestJS sync module and gateway, `apps/frontend` for the React hook and E2E tests, `packages/shared` for the `SyncNotificationPayload` type shared between gateway emit and hook event handler.

## Complexity Tracking

No constitution violations. All principles satisfied as documented in the Constitution Check table above.
