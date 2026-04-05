# Tasks: Google Sheets to PostgreSQL Sync Service

**Input**: Design documents from `/specs/004-sheets-postgres-sync/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Per the project constitution (§VI), **automation tests are MANDATORY** — every feature MUST include unit, integration, and Playwright E2E test tasks. All tests MUST pass before the feature is considered complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: Install new dependencies, create shared types, update environment config.

- [x] T001 Install new backend npm packages: `googleapis`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io` in `apps/backend/package.json`
- [x] T002 [P] Install new frontend npm package: `socket.io-client` in `apps/frontend/package.json`
- [x] T003 [P] Create `SyncNotificationPayload` shared interface in `packages/shared/src/sync.ts` and re-export from `packages/shared/src/index.ts`
- [x] T004 [P] Add all `SHEET_SYNC_*` and `FRONTEND_ORIGIN` env var entries to `apps/backend/.env.example` with documented descriptions per `contracts/sync.config.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migration and NestJS module scaffold. MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Create TypeORM migration `<timestamp>-add-sheet-sync-columns.ts` in `apps/backend/src/database/migrations/` that conditionally adds `last_synced_at TIMESTAMPTZ NULL` and `is_locked BOOLEAN NOT NULL DEFAULT FALSE` to the configured target table if they don't already exist
- [x] T006 [P] Create `SheetSyncModule` scaffold in `apps/backend/src/modules/sheet-sync/sheet-sync.module.ts` with empty `providers`, `exports` arrays and module class
- [x] T007 Register `ScheduleModule.forRoot()` and `SheetSyncModule` in `apps/backend/src/app.module.ts`
- [x] T008 [P] Add Joi validation schema for all `SHEET_SYNC_*` and `FRONTEND_ORIGIN` env vars (types, required flags, min values) inside the existing `ConfigModule.forRoot()` validation schema in `apps/backend/src/app.module.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Automatic Background Data Synchronization (Priority: P1) 🎯 MVP

**Goal**: A NestJS scheduled service polls a configured Google Sheet every 15 seconds, maps columns from the header row, coerces string values to typed values, compares each row against the existing database record, and upserts only changed or new rows. A smart concurrency guard (`isSyncing` boolean + `SchedulerRegistry` pause) prevents overlapping cycles. `last_synced_at` is updated on every write.

**Independent Test**: Change a non-locked row in the configured Google Sheet. Within 30 seconds confirm via database query that the record was updated and `last_synced_at` was set. Confirm that rerunning without further sheet changes produces zero additional DB writes.

### Tests for User Story 1 (MANDATORY per constitution §VI)

- [x] T009 [P] [US1] Write unit tests covering all type coercion paths (boolean, integer, float, ISO date, fallback string) in `apps/backend/src/modules/sheet-sync/type-coercion.util.spec.ts`
- [x] T010 [P] [US1] Write unit tests for column mapper: valid column pass-through, unknown columns added to `skipped` list, `pkColumn` correctly identified in `apps/backend/src/modules/sheet-sync/column-mapper.spec.ts`
- [x] T011 [US1] Write integration tests for `SheetSyncService`: scheduler fires, mocked Sheets API returns rows, mocked DB returns existing rows, only changed rows trigger `upsert`, `last_synced_at` is set on writes only in `apps/backend/src/modules/sheet-sync/sheet-sync.service.spec.ts`

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement `GoogleSheetsService` in `apps/backend/src/modules/sheet-sync/google-sheets.service.ts`: `GoogleAuth` using `GOOGLE_APPLICATION_CREDENTIALS`, `sheets.spreadsheets.values.get` with open-ended `A:Z` range and `FORMATTED_VALUE` render, `gaxios` retry config (retries: 3, 1s backoff, factor 2), empty sheet guard returning `[]`
- [x] T013 [P] [US1] Implement `coerceValue()` utility function in `apps/backend/src/modules/sheet-sync/type-coercion.util.ts`: coercion order boolean → integer → float → ISO 8601 date → string fallback
- [x] T014 [P] [US1] Implement `buildColumnMap()` in `apps/backend/src/modules/sheet-sync/column-mapper.ts`: reads header row array, queries target table column metadata once (cached), returns `ColumnMap` with `valid`, `skipped`, and `pkColumn` fields
- [x] T015 [US1] Implement `SheetSyncService` in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`: `@Interval`-driven scheduler registered by name via `SchedulerRegistry`, `isSyncing` boolean guard, `pendingTickCount` tracker (pauses scheduler interval via `deleteInterval` when > 1 missed tick), fetch all current DB rows once per cycle, per-row: map columns, coerce values, compare against DB row, skip if unchanged, `upsert` if changed or new, update `last_synced_at` only on write, accumulate `SyncCycleResult` counts
- [x] T016 [US1] Implement `OnModuleDestroy` in `SheetSyncService` to stop the interval via `SchedulerRegistry` on app shutdown in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`

**Checkpoint**: User Story 1 is fully functional. Run `npm test -- --testPathPattern=sheet-sync` to verify all US1 tests pass. Validate end-to-end per quickstart.md Step 7.

---

## Phase 4: User Story 2 — Row-Level Locking Protection (Priority: P2)

**Goal**: Before any comparison or write, the sync service checks the `is_locked` flag on each sheet row. Locked rows are completely skipped (no DB read, no comparison, no write). The count of skipped locked rows is tracked and logged per cycle.

**Independent Test**: Set `is_locked = TRUE` on a sheet row and change its data. Run a sync cycle. Verify the database record is unchanged and the log shows "Skipped N locked row(s)". Then unset the lock and verify the row is processed normally on the next cycle.

### Tests for User Story 2 (MANDATORY per constitution §VI)

- [x] T017 [P] [US2] Write unit tests for `is_locked` coercion edge cases ("TRUE", "true", "1", true boolean, absent/null) and confirm locked rows increment `skippedLocked` count in `apps/backend/src/modules/sheet-sync/sheet-sync.service.spec.ts`
- [x] T018 [P] [US2] Write integration tests verifying locked rows are never passed to `upsert` even when sheet data differs from DB in `apps/backend/src/modules/sheet-sync/sheet-sync.integration.spec.ts`

### Implementation for User Story 2

- [x] T019 [US2] Add `is_locked` string-to-boolean coercion and early-skip guard as the first step of the per-row processing block in `SheetSyncService.runSyncCycle()` in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`
- [x] T020 [US2] Increment `SyncCycleResult.skippedLocked` for each skipped-locked row and add end-of-cycle log "Skipped N locked row(s)" in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`

**Checkpoint**: User Story 2 is complete. Locked rows are protected. Run `npm test -- --testPathPattern=sheet-sync` to confirm all US1 + US2 tests pass.

---

## Phase 5: User Story 3 — Real-Time Dashboard Notifications (Priority: P3)

**Goal**: After each sync cycle where at least one row was written, a NestJS Socket.IO gateway emits a `sheet:updated` event to all connected clients with `{ table, upsertedCount, syncedAt }`. A `useSheetSync()` React hook connects to the gateway on mount, listens for the event, and triggers a data re-fetch via a provided `onUpdate` callback. The hook exposes `connected` status and the latest event payload.

**Independent Test**: Open the dashboard with the browser dev tools network tab showing WebSocket frames. Change a non-locked sheet row. Confirm the `sheet:updated` frame arrives within 5 seconds and the dashboard data refreshes. Close the tab and confirm the WebSocket connection is closed (no lingering open sockets).

### Tests for User Story 3 (MANDATORY per constitution §VI)

- [x] T021 [P] [US3] Write unit tests for `SyncGateway`: verify `server.emit('sheet:updated', payload)` is called after a cycle with `upsertedCount > 0` and NOT called when `upsertedCount === 0` in `apps/backend/src/modules/sheet-sync/sync.gateway.spec.ts`
- [x] T022 [P] [US3] Write unit tests for `useSheetSync` hook: mock `socket.io-client`, verify `onUpdate` is called on `sheet:updated` event, `connected` transitions on `connect`/`disconnect`, socket is disconnected on unmount in `apps/frontend/src/features/sheet-sync/hooks/use-sheet-sync.spec.ts`
- [x] T023 [US3] Write Playwright E2E test: navigate to dashboard page using `useSheetSync`, mock or trigger a `sheet:updated` WebSocket event, assert dashboard data area reflects the update without a page reload in `apps/frontend/e2e/sheet-sync/live-update.spec.ts`

### Implementation for User Story 3

- [x] T024 [P] [US3] Implement `SyncGateway` in `apps/backend/src/modules/sheet-sync/sync.gateway.ts`: `@WebSocketGateway({ cors: { origin: process.env.FRONTEND_ORIGIN } })`, `@WebSocketServer() server: Server`, public `notifyClients(payload: SyncNotificationPayload)` method that calls `this.server.emit('sheet:updated', payload)`; add to `SheetSyncModule` providers and exports
- [x] T025 [US3] Inject `SyncGateway` into `SheetSyncService` constructor and call `this.syncGateway.notifyClients(...)` at the end of `runSyncCycle()` when `result.upsertedCount > 0`, using the `SyncNotificationPayload` shape from `packages/shared/src/sync.ts` in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`
- [x] T026 [P] [US3] Implement `useSheetSync(onUpdate?: () => void)` hook in `apps/frontend/src/features/sheet-sync/hooks/use-sheet-sync.ts`: `'use client'` directive, `socket.io-client` initialized inside `useEffect` using `NEXT_PUBLIC_API_URL`, listens for `sheet:updated`, sets `connected` state on `connect`/`disconnect`, calls `onUpdate()` and stores latest event on `sheet:updated`, disconnects cleanly on unmount; returns `{ connected, lastEvent }`

**Checkpoint**: User Story 3 is complete. Run Playwright tests with `npx playwright test e2e/sheet-sync/`. Confirm `sheet:updated` events reach the browser and `onUpdate` fires.

---

## Phase 6: User Story 4 — Operational Visibility and Logging (Priority: P4)

**Goal**: The sync service uses NestJS `Logger` throughout the cycle lifecycle. Every cycle logs its start, its final outcome counts (processed/skipped-unchanged/skipped-locked/upserted/errors), and any per-row errors with row context. Unknown sheet columns generate a WARN log entry. The service never swallows errors silently.

**Independent Test**: Run a sync cycle against a sheet with changed rows, unchanged rows, locked rows, and at least one column not in the DB. Inspect the logs and confirm: one "Starting sync cycle" entry, per-column WARN for unknown columns, one summary entry with correct counts for every category, and no silent failures.

### Tests for User Story 4 (MANDATORY per constitution §VI)

- [x] T027 [P] [US4] Write unit tests verifying Logger calls: "Starting sync cycle" on cycle start, summary log with all four counts on cycle end, per-row error logged with row PK context when an individual row throws in `apps/backend/src/modules/sheet-sync/sheet-sync.service.spec.ts`
- [x] T028 [P] [US4] Write unit tests verifying `columnMapper` emits a `Logger.warn()` entry for each column present in the sheet but absent from the DB in `apps/backend/src/modules/sheet-sync/column-mapper.spec.ts`

### Implementation for User Story 4

- [x] T029 [US4] Add `this.logger.log('Starting sync cycle for table: ...')` at the start of `runSyncCycle()` in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`
- [x] T030 [US4] Add per-cycle end summary log with all `SyncCycleResult` counts (`processed`, `skippedUnchanged`, `skippedLocked`, `upserted`, `errors`) in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`
- [x] T031 [US4] Wrap the per-row processing block in a `try/catch` that logs the row PK and error message and increments `result.errors` instead of throwing, ensuring the cycle continues to the next row in `apps/backend/src/modules/sheet-sync/sheet-sync.service.ts`
- [x] T032 [US4] Add `Logger.warn('Unknown sheet column: <name> — skipping')` inside `buildColumnMap()` for each column in `skipped` array in `apps/backend/src/modules/sheet-sync/column-mapper.ts`

**Checkpoint**: All four user stories are complete. Run the full test suite: `npm test -- --testPathPattern=sheet-sync` and `npx playwright test e2e/sheet-sync/` — all must pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T033 [P] Add `apps/backend/src/modules/sheet-sync/README.md` documenting: module purpose, env vars (link to `contracts/sync.config.md`), how to run tests, and how to wire into another NestJS module (per constitution §XVI)
- [ ] T034 [P] Run quickstart.md end-to-end validation: install deps, run migration, start backend + frontend, change a sheet row, confirm DB update, confirm WebSocket notification, confirm dashboard refresh

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — all four tasks can start immediately and run in parallel
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story phases (3–6)**: All depend on Phase 2 completion; US1 must be complete before US2 (locking logic builds on the sync loop); US3 and US4 can start once US1 is complete; US4 logging tasks can also be interleaved with US1–US3 implementation
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependency on other stories
- **US2 (P2)**: Depends on US1 complete — adds lock-skip logic to the same sync loop
- **US3 (P3)**: Depends on US1 complete — adds gateway emit to the end of `runSyncCycle()`
- **US4 (P4)**: Largely cross-cutting — logging tasks can be woven into US1–US3 implementation; phase 6 formalizes what remains

### Within Each User Story

- Tests written before implementation (TDD); confirm tests fail before writing implementation code
- Models / utilities (`T012`, `T013`, `T014`) before the main service (`T015`)
- Core implementation before integration / gateway wiring
- Story complete and tests passing before moving to next priority

### Parallel Opportunities

- **Phase 1**: T001, T002, T003, T004 — all fully parallel
- **Phase 2**: T005, T006, T008 — parallel; T007 depends on T006
- **Phase 3 tests**: T009, T010 — parallel; T011 after T009/T010
- **Phase 3 implementation**: T012, T013, T014 — parallel; T015 depends on T012+T013+T014; T016 depends on T015
- **Phase 4**: T017, T018 — parallel; T019/T020 after T015
- **Phase 5 tests**: T021, T022 — parallel; T023 after T024+T025+T026
- **Phase 5 implementation**: T024, T026 — parallel; T025 after T024
- **Phase 6**: T027, T028 — parallel; T029, T030, T031, T032 — parallel (different lines in same file or different files)
- **Phase 7**: T033, T034 — parallel

---

## Parallel Execution Examples

### Phase 3 (US1) — launch together after T005–T008 complete

```bash
# Batch 1: parallel test scaffolds
Task T009: unit tests for type-coercion.util.spec.ts
Task T010: unit tests for column-mapper.spec.ts

# Batch 2: parallel utility implementations (after tests fail)
Task T012: google-sheets.service.ts
Task T013: type-coercion.util.ts
Task T014: column-mapper.ts

# Sequential: main service (depends on T012 + T013 + T014)
Task T015: sheet-sync.service.ts
Task T016: OnModuleDestroy in sheet-sync.service.ts
```

### Phase 5 (US3) — launch together after T015 complete

```bash
# Batch 1: parallel test scaffolds
Task T021: sync.gateway.spec.ts
Task T022: use-sheet-sync.spec.ts (frontend)

# Batch 2: parallel implementations (after tests fail)
Task T024: sync.gateway.ts (backend)
Task T026: use-sheet-sync.ts (frontend hook)

# Sequential: wire gateway into service (depends on T024)
Task T025: inject SyncGateway into SheetSyncService

# Sequential: E2E test (depends on T024 + T025 + T026)
Task T023: Playwright live-update.spec.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (automated sync, change detection, concurrency guard)
4. **STOP and VALIDATE**: Confirm rows sync from sheet to DB; confirm no duplicate writes on unchanged data
5. Deploy or demo as minimal working sync service

### Incremental Delivery

1. **Setup + Foundational** → dependencies installed, migration run, module scaffolded
2. **+ User Story 1** → automated polling, change detection, upsert, concurrency guard (**MVP!**)
3. **+ User Story 2** → locked rows protected (operational safety gate)
4. **+ User Story 3** → real-time dashboard notifications
5. **+ User Story 4** → full structured logging (observability complete)

Each story is independently testable and adds value without breaking previous behavior.

---

## Summary

| Metric                                 | Value                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| **Total tasks**                        | 34                                                                                   |
| **Setup (Phase 1)**                    | 4 tasks                                                                              |
| **Foundational (Phase 2)**             | 4 tasks                                                                              |
| **US1 — Background Sync (P1)**         | 8 tasks (3 tests + 5 implementation)                                                 |
| **US2 — Row Locking (P2)**             | 4 tasks (2 tests + 2 implementation)                                                 |
| **US3 — Dashboard Notifications (P3)** | 6 tasks (3 tests + 3 implementation)                                                 |
| **US4 — Operational Logging (P4)**     | 6 tasks (2 tests + 4 implementation)                                                 |
| **Polish (Phase 7)**                   | 2 tasks                                                                              |
| **Parallelizable tasks [P]**           | 20                                                                                   |
| **Suggested MVP scope**                | Phases 1–3 (US1 only) — 16 tasks                                                     |
| **New backend packages**               | `googleapis`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io` |
| **New frontend packages**              | `socket.io-client`                                                                   |
