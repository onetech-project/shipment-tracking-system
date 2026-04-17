# Tasks: Multi Google Sheet Sync — Implementation Checklist

**Input**: Design documents in /specs/005-multi-google-sheet-sync/
**Branch**: `005-multi-google-sheet-sync` | **Date**: 2026-04-17

---

## Phase 1 — Setup & Shared Helpers

- [ ] T001 [P] Create research doc in specs/005-multi-google-sheet-sync/research.md
- [ ] T002 [P] Add `normalizeTableName` helper in packages/shared/src/normalizeTableName.ts
- [ ] T003 [P] Add `quoteIdentifier` helper in packages/shared/src/quoteIdentifier.ts

## Phase 2 — DB Migrations

- [ ] T010 Create migration `apps/backend/src/migrations/20260417_create_google_sheet_config.ts`
- [ ] T011 Create migration `apps/backend/src/migrations/20260417_add_label_google_sheet_config.ts`
- [ ] T012 Create migration `apps/backend/src/migrations/20260417_alter_google_sheet_sheet_config_table_name.ts`
- [ ] T013 Create migration for indexes `apps/backend/src/migrations/20260417_add_indexes_google_sheet_config.ts`

## Phase 3 — DynamicTableService & DB helpers

- [ ] T020 Implement `DynamicTableService.ensureTable` in apps/backend/src/modules/sync/dynamic-table.service.ts
- [ ] T021 Add unit tests for ensureTable in apps/backend/test/dynamic-table.service.spec.ts
- [ ] T022 Implement `SheetsService.reloadTableSchemas()` in apps/backend/src/modules/sync/sheets.service.ts

## Phase 4 — SyncConfigModule (REST API)

- [ ] T030 Add TypeORM entities in apps/backend/src/modules/sync/entities/google-sheet-config.entity.ts and apps/backend/src/modules/sync/entities/google-sheet-sheet-config.entity.ts
- [ ] T031 Implement DTOs and validation in apps/backend/src/modules/sync/dto/
- [ ] T032 Implement `SyncConfigService` in apps/backend/src/modules/sync/sync-config.service.ts
- [ ] T033 Implement `SyncConfigController` in apps/backend/src/modules/sync/sync-config.controller.ts
- [ ] T034 Add integration tests apps/backend/test/sync-config.controller.spec.ts

## Phase 5 — Scheduler & Sync Runtime

- [ ] T040 Implement `MultiSpreadsheetSchedulerService` in apps/backend/src/modules/sync/multi-spreadsheet-scheduler.service.ts
- [ ] T041 Update `SheetsService.fetchAllSheets()` signature in apps/backend/src/modules/sync/sheets.service.ts
- [ ] T042 Add unit tests for scheduler in apps/backend/test/multi-spreadsheet-scheduler.spec.ts

## Phase 6 — Dynamic Air Shipments Endpoint

- [ ] T050 Implement `GET /air-shipments/:tableName` endpoint in apps/backend/src/modules/air-shipments/air-shipments.dynamic.controller.ts
- [ ] T051 Implement service for dynamic endpoint in apps/backend/src/modules/air-shipments/air-shipments.dynamic.service.ts
- [ ] T052 Add integration tests apps/backend/test/air-shipments.dynamic.spec.ts

## Phase 7 — Frontend (Next.js)

- [ ] T060 Implement `google-sheet-config` UI page in apps/frontend/src/app/google-sheet-config/page.tsx
- [ ] T061 Implement Air Shipments dynamic tabs in apps/frontend/src/components/air-shipments-tabs.tsx
- [ ] T062 Add e2e tests apps/frontend/e2e/google-sheet-config.spec.ts

## Phase 8 — SyncGateway Update

- [ ] T070 Extend `SyncGateway` emission in apps/backend/src/modules/sync/sync.gateway.ts
- [ ] T071 Add gateway emission tests in apps/backend/test/sync.gateway.spec.ts

## Phase 9 — Observability, Tests & Docs

- [ ] T080 Add structured logs for per-spreadsheet cycles in apps/backend/src/modules/sync/logging.ts
- [ ] T081 Add unit tests for helpers in packages/shared/test/
- [ ] T082 Add e2e tests for end-to-end sync flow in apps/backend/test/e2e/sync-flow.spec.ts and apps/frontend/e2e/sync-flow.spec.ts
- [ ] T083 Finalize docs: specs/005-multi-google-sheet-sync/quickstart.md and specs/005-multi-google-sheet-sync/data-model.md

## Phase 10 — Release & Cleanup

- [ ] T090 Add import script scripts/import-sheets.ts (optional)
- [ ] T091 Remove legacy config loader in apps/backend/src/modules/sync/legacy-loader.ts
- [ ] T092 Create PR, run CI, request reviews (no file path)

---

All tasks follow the checklist format with unique Task IDs. Each task should be created as a ticket with acceptance criteria and a short test plan.
