# Tasks: Google Sheets → PostgreSQL Sync Service

**Input**: Design documents from `/specs/004-google-sheets-postgresql-sync/`  
**Branch**: `copilot/add-google-sheets-sync-service` | **Date**: 2026-04-08  
**Prerequisites**: [plan.md](plan.md) ✅ | [spec.md](spec.md) ✅ | [research.md](research.md) ✅ | [data-model.md](data-model.md) ✅ | [contracts/](contracts/) ✅

**Tests**: Automation tests are **MANDATORY** per constitution §VI. Unit, integration, and Playwright E2E tests are included in each user story phase and must pass before the feature is considered complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Each phase produces a complete, independently testable increment.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (operates on different files, no unresolved dependencies)
- **[US#]**: Which user story this task belongs to
- Exact file paths are included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new packages and create shared types that all user stories depend on.

- [X] T001 Install backend npm packages: `googleapis @nestjs/schedule @nestjs/websockets @nestjs/platform-socket.io socket.io` in `apps/backend/package.json`
- [X] T002 [P] Install frontend npm package: `socket.io-client` in `apps/frontend/package.json`
- [X] T003 [P] Create shared SyncNotification payload type in `packages/shared/src/air-shipments/index.ts` (export `SyncUpdatePayload` interface with `affectedTables: string[]`, `totalUpserted: number`, `syncedAt: string`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migrations and the bare module skeleton that all user stories build on.

**⚠️ CRITICAL**: No user story implementation can begin until all five migrations are in place and the module is registered in `app.module.ts`.

- [X] T004 Create TypeORM migration for `air_shipments_cgk` table (fixed system columns: `id UUID PK`, `to_number VARCHAR(100) NOT NULL UNIQUE`, `is_locked BOOLEAN NULLABLE`, `last_synced_at TIMESTAMPTZ`, `created_at`, `updated_at`; index `idx_air_shipments_cgk_to_number`) in `apps/backend/src/database/migrations/XXXXXX-create-air-shipments-cgk.ts`
- [X] T005 [P] Create TypeORM migration for `air_shipments_sub` table (same fixed columns; unique key `to_number`; index `idx_air_shipments_sub_to_number`) in `apps/backend/src/database/migrations/XXXXXX-create-air-shipments-sub.ts`
- [X] T006 [P] Create TypeORM migration for `air_shipments_sda` table (same fixed columns; unique key `to_number`; index `idx_air_shipments_sda_to_number`) in `apps/backend/src/database/migrations/XXXXXX-create-air-shipments-sda.ts`
- [X] T007 [P] Create TypeORM migration for `rate_per_station` table (fixed columns; unique key `concat VARCHAR(255)`; index `idx_rate_per_station_concat`) in `apps/backend/src/database/migrations/XXXXXX-create-rate-per-station.ts`
- [X] T008 [P] Create TypeORM migration for `route_master` table (fixed columns; unique key `concat VARCHAR(255)`; index `idx_route_master_concat`) in `apps/backend/src/database/migrations/XXXXXX-create-route-master.ts`
- [X] T009 Create `AirShipmentsModule` skeleton (empty providers/controllers arrays, no imports yet) in `apps/backend/src/modules/air-shipments/air-shipments.module.ts`
- [X] T010 Register `AirShipmentsModule` in `apps/backend/src/app.module.ts` imports array
- [X] T011 [P] Create sheet config example file with all five sheet entries (CompileAirCGK, SUB, SDA, Data, Master Data) in `apps/backend/src/modules/air-shipments/config/sheets.example.json`; add `config/sheets.json` to `.gitignore`

**Checkpoint**: Five tables exist in the database; `AirShipmentsModule` is registered — user story implementation can begin.

---

## Phase 3: User Story 1 — Automated Data Sync from Google Sheets (Priority: P1) 🎯 MVP

**Goal**: Background service polls all five Google Sheets tabs every 15 seconds, normalizes headers, coerces cell values, performs row-level change detection, and upserts only changed rows to PostgreSQL.

**Independent Test**: Start the sync service with valid Google credentials. Verify that rows from `CompileAirCGK`, `SUB`, `SDA`, `Data`, and `Master Data` appear in their respective PostgreSQL tables within one polling cycle, and that editing a row in the sheet causes only that row to be updated in the next cycle.

### Tests for User Story 1 (MANDATORY — write first, verify they FAIL before implementing)

- [X] T012 [P] [US1] Unit tests for `normalizeHeader()` covering: newline stripping, non-alphanumeric removal, trim, space-to-underscore collapse, lowercase, empty-header result, duplicate-suffix logic (`_2`, `_3`) — in `apps/backend/src/modules/air-shipments/normalizer.spec.ts`
- [X] T013 [P] [US1] Unit tests for `coerceValue()` covering: spreadsheet error strings → null, numeric strings → number, boolean strings → boolean, duration strings → integer seconds, date/datetime strings → Date, unknown → plain string — in `apps/backend/src/modules/air-shipments/coercer.spec.ts`
- [X] T014 [P] [US1] Unit tests for `AirShipmentsService` sync cycle: missing uniqueKey skips sheet, locked row is skipped, unchanged row produces no write, changed row triggers upsert, `last_synced_at` updated only on write — in `apps/backend/src/modules/air-shipments/air-shipments.service.spec.ts`
- [X] T015 [P] [US1] Integration test for the full upsert pipeline against a real test database: insert new rows, verify counts; update a row in sheet data, verify only that row is written; confirm `last_synced_at` advances only for changed rows — in `apps/backend/src/modules/air-shipments/air-shipments.integration.spec.ts`

### Implementation for User Story 1

- [X] T016 [P] [US1] Create `AirShipmentCgk` TypeORM entity (map `air_shipments_cgk`; columns: `id`, `to_number`, `is_locked`, `last_synced_at`, `created_at`, `updated_at`; `@Unique(['to_number'])`) in `apps/backend/src/modules/air-shipments/entities/air-shipment-cgk.entity.ts`
- [X] T017 [P] [US1] Create `AirShipmentSub` TypeORM entity (map `air_shipments_sub`; same column pattern; unique on `to_number`) in `apps/backend/src/modules/air-shipments/entities/air-shipment-sub.entity.ts`
- [X] T018 [P] [US1] Create `AirShipmentSda` TypeORM entity (map `air_shipments_sda`; same column pattern; unique on `to_number`) in `apps/backend/src/modules/air-shipments/entities/air-shipment-sda.entity.ts`
- [X] T019 [P] [US1] Create `RatePerStation` TypeORM entity (map `rate_per_station`; unique on `concat`) in `apps/backend/src/modules/air-shipments/entities/rate-per-station.entity.ts`
- [X] T020 [P] [US1] Create `RouteMaster` TypeORM entity (map `route_master`; unique on `concat`) in `apps/backend/src/modules/air-shipments/entities/route-master.entity.ts`
- [X] T021 [P] [US1] Implement `normalizeHeader(raw: string): string` pure function (FR-012–FR-015: strip `\n` → remove non-alphanumeric/space → trim → collapse spaces to `_` → lowercase) and `makeUniqueHeaders(headers: string[]): string[]` (FR-013: suffix `_2`, `_3` for duplicates) in `apps/backend/src/modules/air-shipments/normalizer.ts`
- [X] T022 [P] [US1] Implement `coerceValue(value: string, context: { sheet: string; row: number; col: string }): unknown` pure function applying FR-016–FR-021 priority order: spreadsheet errors → null; numeric → Number; boolean strings → boolean; duration strings (`"N day, HH:MM:SS"`) → seconds integer; date/datetime strings (ISO 8601, `dd-mmm-yyyy`, `dd/mm/yyyy hh:mm`) → Date; fallback → string — log warnings for error values — in `apps/backend/src/modules/air-shipments/coercer.ts`
- [X] T023 [US1] Implement `SheetsService` with: `GoogleAuth` using `keyFilename: GOOGLE_CREDENTIALS_PATH`, readonly scope; `fetchAllSheets(configs: SheetConfig[])` calling `spreadsheets.values.batchGet` with all ranges, `valueRenderOption: FORMATTED_VALUE`, `dateTimeRenderOption: FORMATTED_STRING`; per-sheet empty-response retry (up to 3×, backoff 2 s / 4 s / 6 s, FR-008); load `SheetConfig[]` once from `SHEET_CONFIG_PATH` on `onModuleInit` (FR-009–FR-011); throw on missing/malformed config file — in `apps/backend/src/modules/air-shipments/sheets.service.ts`
- [X] T024 [US1] Implement `AirShipmentsService.runSyncCycle()`: fetch all sheets via `SheetsService`; for each sheet: normalize headers, validate uniqueKey present (FR-026), bulk-fetch existing rows into a `Map<uniqueKey, record>`, iterate rows (skip locked FR-027–FR-030, coerce values FR-016–FR-021, diff vs existing FR-022–FR-024, upsert changed rows via TypeORM `save`/`update` and refresh `last_synced_at` FR-025); log per-sheet stats (FR-045); log cycle duration (FR-046); return `{ affectedTables, totalUpserted }` — in `apps/backend/src/modules/air-shipments/air-shipments.service.ts`
- [X] T025 [US1] Update `AirShipmentsModule` to import `TypeOrmModule.forFeature([ AirShipmentCgk, AirShipmentSub, AirShipmentSda, RatePerStation, RouteMaster ])` and register `SheetsService` and `AirShipmentsService` as providers in `apps/backend/src/modules/air-shipments/air-shipments.module.ts`

**Checkpoint**: `AirShipmentsService.runSyncCycle()` can be called manually and syncs all five sheets to PostgreSQL correctly.

---

## Phase 4: User Story 2 — Real-Time Dashboard Notification (Priority: P2)

**Goal**: After each productive sync cycle, all connected browser sessions receive a `sync:update` Socket.IO event with `affectedTables`, `totalUpserted`, and `syncedAt`. Zero-upsert cycles produce no notification.

**Independent Test**: Open a Socket.IO client connected to the backend. Edit a cell in the Google Sheet. Wait one polling cycle. Verify the client receives `sync:update` with the correct table name and a non-zero `totalUpserted`. Then run a cycle with no changes and verify no event is emitted.

### Tests for User Story 2 (MANDATORY — write first, verify they FAIL before implementing)

- [X] T026 [P] [US2] Unit tests for `SyncNotificationGateway`: verify `handleConnection` and `handleDisconnect` log client ID; verify `notifyClients()` calls `server.emit('sync:update', payload)` with correct shape; verify gateway does not emit when called with zero upserted rows — in `apps/backend/src/modules/air-shipments/sync-notification.gateway.spec.ts`
- [X] T027 [P] [US2] Unit tests for `useSyncNotification` React hook: renders with `isConnected: false` initially; transitions to `isConnected: true` on mock `connect` event; updates `lastSyncAt` and `affectedTables` on mock `sync:update` event; disconnects socket on unmount — in `apps/frontend/src/features/air-shipments/hooks/useSyncNotification.spec.ts`

### Implementation for User Story 2

- [X] T028 [P] [US2] Create `SyncNotificationDto` (mirrors `SyncUpdatePayload` from shared package: `affectedTables: string[]`, `totalUpserted: number`, `syncedAt: string`) in `apps/backend/src/modules/air-shipments/dto/sync-notification.dto.ts`
- [X] T029 [US2] Implement `SyncNotificationGateway` with `@WebSocketGateway({ cors: { origin: WEBSOCKET_CORS_ORIGIN } })`; `@WebSocketServer() server: Server`; `handleConnection(client)` and `handleDisconnect(client)` logging client ID (FR-033); `notifyClients(payload: SyncNotificationDto): void` that calls `this.server.emit('sync:update', payload)` — in `apps/backend/src/modules/air-shipments/sync-notification.gateway.ts`
- [X] T030 [US2] Inject `SyncNotificationGateway` into `AirShipmentsService`; after `runSyncCycle()` completes, call `gateway.notifyClients(payload)` only when `totalUpserted > 0` (FR-031–FR-032) — in `apps/backend/src/modules/air-shipments/air-shipments.service.ts`
- [X] T031 [US2] Register `SyncNotificationGateway` as a provider in `AirShipmentsModule`; import `@nestjs/platform-socket.io` adapter in `apps/backend/src/main.ts` (`app.useWebSocketAdapter(new IoAdapter(app))`) — in `apps/backend/src/modules/air-shipments/air-shipments.module.ts` and `apps/backend/src/main.ts`

**Checkpoint**: Start the backend, connect a Socket.IO client, trigger a sync cycle with a sheet change, and verify the `sync:update` event arrives.

---

## Phase 5: User Story 3 — Air Shipments Dashboard Pages (Priority: P3)

**Goal**: Five sub-pages (CGK, SUB, SDA, Rate, Routes) under an "Air Shipments" sidebar section, each with a paginated/sortable data table, loading skeleton, sync-status badge, and automatic data refresh on `sync:update`.

**Independent Test**: Navigate to each of the five sub-pages. Verify the table loads, pagination controls work, a column header click re-sorts the data, and the "Live" badge appears when the backend is running. Edit a sheet row, wait one cycle, and confirm the table refreshes without a manual page reload.

### Tests for User Story 3 (MANDATORY — write first, verify they FAIL before implementing)

- [X] T032 [P] [US3] Playwright E2E tests covering: sidebar shows "Air Shipments" with five sub-links; CGK page shows paginated table; column header click re-sorts; pagination next-page loads new rows; "Live" badge visible when connected; table auto-refreshes after `sync:update` event; last-synced timestamp updates — in `apps/frontend/e2e/air-shipments/sync-dashboard.spec.ts`

### Implementation for User Story 3 — Backend

- [X] T033 [P] [US3] Create `AirShipmentQueryDto` with `@IsOptional` fields: `page: number` (default 1), `limit: number` (default 50, max 200), `sortBy: string` (default `'id'`), `sortOrder: 'asc' | 'desc'` (default `'asc'`); use `class-validator` decorators — in `apps/backend/src/modules/air-shipments/dto/air-shipment-query.dto.ts`
- [X] T034 [US3] Implement `AirShipmentsController` with five `@Get()` routes: `/cgk`, `/sub`, `/sda`, `/rate`, `/routes`; each applies `@Query() query: AirShipmentQueryDto`, delegates to `AirShipmentsService` methods returning `{ data, meta: { page, limit, total, totalPages } }` (FR-035–FR-037); apply `JwtAuthGuard` — in `apps/backend/src/modules/air-shipments/air-shipments.controller.ts`
- [X] T035 [US3] Add five `findAll*` service methods to `AirShipmentsService` (one per table) that accept `AirShipmentQueryDto`, use TypeORM `findAndCount` with `skip`/`take` + `order` (FR-036–FR-037); register controller in `AirShipmentsModule` — in `apps/backend/src/modules/air-shipments/air-shipments.service.ts` and `air-shipments.module.ts`

### Implementation for User Story 3 — Frontend

- [X] T036 [P] [US3] Create frontend TypeScript types: `AirShipmentRow`, `PaginationMeta`, `AirShipmentsResponse`, `SortOrder`, `SyncStatus` — in `apps/frontend/src/features/air-shipments/types.ts`
- [X] T037 [P] [US3] Implement `useSyncNotification(): { isConnected: boolean; lastSyncAt: string | null; affectedTables: string[] }` hook using `socket.io-client`; connect on mount to `NEXT_PUBLIC_API_URL`; listen for `sync:update`; disconnect on unmount (FR-043) — in `apps/frontend/src/features/air-shipments/hooks/useSyncNotification.ts`
- [X] T038 [P] [US3] Implement `useAirShipments(endpoint: string, tableName: string, query)` hook: fetches data from backend REST endpoint; supports pagination and sort state; re-fetches when `affectedTables` from `useSyncNotification` includes `tableName` (FR-042) — in `apps/frontend/src/features/air-shipments/hooks/useAirShipments.ts`
- [X] T039 [P] [US3] Implement `AirShipmentTable` component: renders rows with sortable column headers (click toggles asc/desc, FR-039); pagination controls (previous/next page, FR-039); accepts `data`, `meta`, `sortBy`, `sortOrder`, `onSort`, `onPageChange` props — in `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx`
- [X] T040 [P] [US3] Implement `SyncStatusBadge` component: shows "Live" green badge when `isConnected=true`, grey "Offline" when false; displays `lastSyncAt` formatted as relative time (FR-040) — in `apps/frontend/src/features/air-shipments/components/SyncStatusBadge.tsx`
- [X] T041 [P] [US3] Implement `TableSkeleton` component: renders animated placeholder rows matching the table layout shown while data is loading (FR-041) — in `apps/frontend/src/features/air-shipments/components/TableSkeleton.tsx`
- [X] T042 [US3] Create Air Shipments layout with sidebar sub-navigation (links to CGK, SUB, SDA, Rate, Routes) and page title in `apps/frontend/src/app/(dashboard)/air-shipments/layout.tsx`
- [X] T043 [P] [US3] Implement CGK sub-page: uses `useAirShipments('/api/air-shipments/cgk', 'air_shipments_cgk', ...)`, renders `TableSkeleton` while loading then `AirShipmentTable`, includes `SyncStatusBadge` — in `apps/frontend/src/app/(dashboard)/air-shipments/cgk/page.tsx`
- [X] T044 [P] [US3] Implement SUB sub-page (mirrors CGK; endpoint `/api/air-shipments/sub`, table `air_shipments_sub`) — in `apps/frontend/src/app/(dashboard)/air-shipments/sub/page.tsx`
- [X] T045 [P] [US3] Implement SDA sub-page (mirrors CGK; endpoint `/api/air-shipments/sda`, table `air_shipments_sda`) — in `apps/frontend/src/app/(dashboard)/air-shipments/sda/page.tsx`
- [X] T046 [P] [US3] Implement Rate sub-page (endpoint `/api/air-shipments/rate`, table `rate_per_station`) — in `apps/frontend/src/app/(dashboard)/air-shipments/rate/page.tsx`
- [X] T047 [P] [US3] Implement Routes sub-page (endpoint `/api/air-shipments/routes`, table `route_master`) — in `apps/frontend/src/app/(dashboard)/air-shipments/routes/page.tsx`
- [X] T048 [US3] Add "Air Shipments" top-level nav item with five sub-links (CGK, SUB, SDA, Rate, Routes) to the existing sidebar component (FR-038) — in `apps/frontend/src/components/sidebar/` (modify existing sidebar file)

**Checkpoint**: All five dashboard pages load data, sort, paginate, and show the Live badge. Auto-refresh works end-to-end.

---

## Phase 6: User Story 4 — Concurrency-Safe Polling Scheduler (Priority: P4)

**Goal**: A `SchedulerService` wraps `runSyncCycle()` with an `isSyncing` flag, a consecutive-skip counter, and self-pause/resume logic. Graceful shutdown stops the interval before the process exits.

**Independent Test**: Configure the sync cycle to simulate a slow run (> 15 s). Verify via logs that the next scheduled tick is skipped while the cycle is in progress. Verify the scheduler pauses after two consecutive skips. Verify it resumes after the in-flight cycle completes. Verify `onApplicationShutdown` stops the interval cleanly.

### Tests for User Story 4 (MANDATORY — write first, verify they FAIL before implementing)

- [X] T049 [P] [US4] Unit tests for `SchedulerService`: tick while `isSyncing=true` is skipped; second skip sets paused state; after cycle completes, paused scheduler resumes interval; `onApplicationShutdown` calls `SchedulerRegistry.deleteInterval()` — in `apps/backend/src/modules/air-shipments/scheduler.service.spec.ts`

### Implementation for User Story 4

- [X] T050 [US4] Implement `SchedulerService` decorated with `@Injectable()`; use `@Interval('air-shipments-sync', SYNC_INTERVAL_MS)` method `tick()`; maintain `private isSyncing = false` and `private consecutiveSkips = 0`; on tick: if `isSyncing`, increment skip count (if ≥ 2, call `schedulerRegistry.deleteInterval()` to pause), then return; else set `isSyncing = true`, reset skip count, call `airShipmentsService.runSyncCycle()`, set `isSyncing = false`, re-register interval if was paused; implement `OnApplicationShutdown.onApplicationShutdown()` to delete the interval (FR-001–FR-005); log cycle start (FR-044) and duration (FR-046) — in `apps/backend/src/modules/air-shipments/scheduler.service.ts`
- [X] T051 [US4] Register `SchedulerService` in `AirShipmentsModule` providers; add `ScheduleModule.forRoot()` to `AirShipmentsModule` imports (or to `AppModule` if not already present) — in `apps/backend/src/modules/air-shipments/air-shipments.module.ts` and `apps/backend/src/app.module.ts`

**Checkpoint**: The full sync pipeline now runs automatically every 15 seconds with concurrency protection and graceful shutdown.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Environment validation, security hardening, and final quickstart verification.

- [X] T052 [P] Add Joi validation for new environment variables (`GOOGLE_CREDENTIALS_PATH`, `GOOGLE_SHEET_ID`, `SHEET_CONFIG_PATH`, `SYNC_INTERVAL_MS` optional with default, `WEBSOCKET_CORS_ORIGIN`) to the existing `ConfigModule.forRoot({ validationSchema })` in `apps/backend/src/app.module.ts`
- [X] T053 [P] Verify `config/sheets.json` is listed in `apps/backend/.gitignore`; update or create the entry if missing; confirm `sheets.example.json` is committed but `sheets.json` is excluded
- [ ] T054 Run the full backend test suite (`npm test` in `apps/backend`) and the Playwright suite (`npx playwright test e2e/air-shipments/` in `apps/frontend`); validate all scenarios from `quickstart.md` end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001 and T002 are independent; T003 is independent.
- **Foundational (Phase 2)**: Depends on Phase 1 completion. T004–T008 can all run in parallel. T009 can start any time. T010 depends on T009. T011 is independent.
- **US1 (Phase 3)**: Depends on Phase 2 completion (entities need migrations; module needs to exist).
- **US2 (Phase 4)**: Depends on Phase 3 completion (gateway emits after `runSyncCycle()` in AirShipmentsService).
- **US3 (Phase 5)**: Backend tasks (T033–T035) depend on Phase 3. Frontend tasks (T036–T048) depend on Phase 4 (need `useSyncNotification`). T032 (Playwright tests) should be written after T034–T035 are scaffolded.
- **US4 (Phase 6)**: Depends on Phase 3 (SchedulerService calls `runSyncCycle()`).
- **Polish (Phase 7)**: Depends on all phases complete.

### User Story Dependencies

| Story | Depends on | Can start in parallel with |
|-------|-----------|---------------------------|
| US1 (P1) | Phase 2 | — |
| US2 (P2) | US1 complete (AirShipmentsService exists) | — |
| US3 (P3) backend | US1 complete | US2 |
| US3 (P3) frontend | US2 complete (gateway + hook) | — |
| US4 (P4) | US1 complete | US2, US3 backend |

### Within Each User Story

1. Write tests first; verify they FAIL
2. Entities / pure functions (parallelizable)
3. Services (depend on entities)
4. Controllers / gateway (depend on services)
5. Module registration (depends on all providers)
6. Frontend components (parallelizable)
7. Frontend pages (depend on components and hooks)

---

## Parallel Opportunities

### Phase 2 (Migrations — all parallel after T009)

```
T004 ──┐
T005 ──┤
T006 ──┼── all run simultaneously
T007 ──┤
T008 ──┘
T011 ── independent
```

### Phase 3 (User Story 1 — parallel within groups)

```
# Tests (write simultaneously):
T012  T013  T014  T015

# Entities (create simultaneously):
T016  T017  T018  T019  T020

# Pure functions (create simultaneously):
T021  T022

# Then sequential:
T023 (SheetsService) → T024 (AirShipmentsService) → T025 (module update)
```

### Phase 5 (User Story 3 — frontend fully parallel)

```
# Frontend components (all simultaneously):
T036  T037  T038  T039  T040  T041

# Then pages (simultaneously after components):
T043  T044  T045  T046  T047

# Then sidebar update:
T048
```

---

## Implementation Strategy

### MVP Scope (User Story 1 Only — Phases 1–3)

1. Complete Phase 1: Install packages, create shared types
2. Complete Phase 2: Run migrations, register module
3. Complete Phase 3: Sync pipeline working end-to-end (normalizer → coercer → change-detect → upsert)

**Outcome**: Data syncs from Google Sheets to PostgreSQL every 15 seconds (manually triggered; scheduler added in US4).

### Incremental Delivery

| Milestone | Phases | Outcome |
|-----------|--------|---------|
| MVP       | 1 + 2 + 3 | Sync pipeline working; manual cycle trigger |
| Live Notifications | + 4 | Socket.IO `sync:update` events reaching clients |
| Dashboard | + 5 | Five sub-pages with live data and auto-refresh |
| Production-ready | + 6 + 7 | Concurrency-safe scheduler; env validation; all tests green |

---

## Task Summary

| Phase | Story | Task Count |
|-------|-------|------------|
| Phase 1 — Setup | — | 3 |
| Phase 2 — Foundational | — | 8 |
| Phase 3 — US1 (P1) | Automated Sync | 14 |
| Phase 4 — US2 (P2) | Real-Time Notification | 6 |
| Phase 5 — US3 (P3) | Dashboard Pages | 17 |
| Phase 6 — US4 (P4) | Scheduler | 3 |
| Phase 7 — Polish | — | 3 |
| **Total** | | **54** |

**Parallelizable tasks**: 32 of 54 are marked `[P]`  
**Suggested MVP**: Phases 1–3 (25 tasks, US1 only)
