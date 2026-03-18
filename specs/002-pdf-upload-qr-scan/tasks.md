# Tasks: PDF Shipment Upload & QR Code Scan

**Input**: Design documents from `/specs/002-pdf-upload-qr-scan/`
**Branch**: `002-pdf-upload-qr-scan`
**Prerequisites**: ✅ plan.md, ✅ spec.md, ✅ research.md, ✅ data-model.md, ✅ contracts/shipments.api.md

**Tests**: Per constitution §VI, automation tests are **MANDATORY** — every story includes unit, integration, and Playwright E2E test tasks. All tests must pass before the feature is considered complete.

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 — PDF upload) delivers standalone value independently from QR scanning.

---

## Phase 1: Setup

**Purpose**: Install feature-specific dependencies and create shared package types used by all user stories.

- [x] T001 Install backend PDF parsing dependencies (`pdf-parse`, `pdfjs-dist`) in `apps/backend/package.json`
- [x] T002 [P] Install frontend QR decoding dependencies (`jsqr`, `@types/jsqr`) in `apps/frontend/package.json`
- [x] T003 [P] Create shared shipments type file `packages/shared/src/shipments/dto.ts` (shipment response type, import status type, error row type) and export from `packages/shared/src/shipments/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: TypeORM entities, database migrations, and the NestJS module scaffold that all user story phases depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Create `Shipment` TypeORM entity with all columns and indexes per data-model.md in `apps/backend/src/modules/shipments/entities/shipment.entity.ts`
- [x] T005 [P] Create `ShipmentUpload` TypeORM entity with status enum and all columns per data-model.md in `apps/backend/src/modules/shipments/entities/shipment-upload.entity.ts`
- [x] T006 [P] Create `ShipmentUploadError` TypeORM entity with error type enum and all columns per data-model.md in `apps/backend/src/modules/shipments/entities/shipment-upload-error.entity.ts`
- [x] T007 Create TypeORM migration `20260318000001-create-shipments.ts` (table + UNIQUE `(organization_id, shipment_id)` + indexes) in `apps/backend/src/database/migrations/20260318000001-create-shipments.ts`
- [x] T008 Create TypeORM migration `20260318000002-create-shipment-uploads.ts` (table + partial unique index + indexes) in `apps/backend/src/database/migrations/20260318000002-create-shipment-uploads.ts`
- [x] T009 Create TypeORM migration `20260318000003-create-shipment-upload-errors.ts` (table + FKs + indexes) in `apps/backend/src/database/migrations/20260318000003-create-shipment-upload-errors.ts`
- [x] T010 Scaffold `ShipmentsModule` — register all three entities, BullMQ `shipment-import` queue, import controllers/services/processor — in `apps/backend/src/modules/shipments/shipments.module.ts`
- [x] T011 Register `ShipmentsModule` in `apps/backend/src/app.module.ts`

**Checkpoint**: Foundation ready — all three user story phases can now proceed in parallel.

---

## Phase 3: User Story 1 — PDF Shipment Data Upload & Extraction (Priority: P1) 🎯 MVP

**Goal**: Authenticated users upload a shipment PDF; the system parses it asynchronously, imports valid rows, flags duplicates for manual review, and reports results.

**Independent Test**: Upload a sample internal-template PDF → verify extracted records appear in the `shipments` table. No QR scanner needed.

### Tests for User Story 1 (MANDATORY — write before implementation)

- [x] T012 [P] [US1] Write unit tests for `ImportProcessor` covering: PDF parse success, invalid PDF rejection, row DTO validation (missing fields), preflight duplicate detection, batch insert, conflict row creation, audit event emission — in `apps/backend/src/modules/shipments/imports/import.processor.spec.ts`
- [x] T013 [P] [US1] Write unit tests for `ShipmentRowDto` (valid row passes, missing origin fails, missing destination fails, missing status fails) and `ResolveConflictDto` (valid overwrite/skip, invalid action rejected) in `apps/backend/src/modules/shipments/imports/dto/`
- [x] T014 [P] [US1] Write integration tests for `ImportController` covering: `POST /shipments/imports` returns 202 for valid PDF; 400 for non-PDF; 400 for corrupt PDF; 401 for unauthenticated; `GET /shipments/imports/:id` returns status transitions; `GET /shipments/imports/:id/errors` returns duplicate and validation rows; `POST /shipments/imports/:id/conflicts/resolve` completes upload — in `apps/backend/src/modules/shipments/imports/import.controller.spec.ts`
- [x] T015 [P] [US1] Write Playwright E2E upload spec (Page Object Model): valid PDF upload → status polling → success summary; non-PDF → immediate error; PDF with duplicates → conflict review UI shown; resolve conflicts → final summary; upload requires login (redirect if not authenticated) — in `apps/frontend/e2e/shipments/upload.spec.ts`

### Implementation for User Story 1

- [x] T016 [P] [US1] Implement `ShipmentRowDto` with `class-validator` decorators for all shipment fields (shipmentId, origin, destination, status required; carrier, estimatedDeliveryDate, contentsDescription optional) in `apps/backend/src/modules/shipments/imports/dto/shipment-row.dto.ts`
- [x] T017 [P] [US1] Implement `ResolveConflictDto` (decisions array with errorId UUID and action enum `overwrite|skip`) with `class-validator` in `apps/backend/src/modules/shipments/imports/dto/resolve-conflict.dto.ts`
- [x] T018 [US1] Implement `ImportService` — create upload record with SHA-256 file hash, idempotency check (same org + hash in last 24h returns existing), status query by upload ID, error/conflict row query, conflict resolution applying overwrite/skip decisions and updating upload status — in `apps/backend/src/modules/shipments/imports/import.service.ts`
- [x] T019 [US1] Implement `ImportProcessor` BullMQ worker — read file buffer from job data, run `pdf-parse` (catch parse errors → set upload `failed`), detect template signature (reject unknown layouts), map rows to `ShipmentRowDto`, validate each row, run batch preflight IN-query against `(organization_id, shipment_id)`, insert valid non-duplicate rows in batches of 100, write `ShipmentUploadError` rows for validation failures and duplicate conflicts, transition upload status to `completed | partial | awaiting_conflict_review`, emit `shipment.import.started` and `shipment.import.completed` audit events — in `apps/backend/src/modules/shipments/imports/import.processor.ts`
- [x] T020 [US1] Implement `ImportController` — `POST /shipments/imports` with Multer multipart pipe (MIME + extension validation, file size limit), `GET /shipments/imports/:id`, `GET /shipments/imports/:id/errors`, `POST /shipments/imports/:id/conflicts/resolve`; all routes require `JwtAuthGuard`; responses match contracts/shipments.api.md — in `apps/backend/src/modules/shipments/imports/import.controller.ts`
- [x] T021 [P] [US1] Implement `shipments.api.ts` frontend API client functions: `uploadPdf`, `getImportStatus`, `getImportErrors`, `resolveConflicts` using `axios` with bearer token — in `apps/frontend/src/features/shipments/api/shipments.api.ts`
- [x] T022 [P] [US1] Implement `useImportStatus` hook — poll `getImportStatus` every 2s while status is `queued | processing`; stop on terminal status; expose `upload`, `status`, `errors`, `resolveConflicts` — in `apps/frontend/src/features/shipments/hooks/useImportStatus.ts`
- [x] T023 [US1] Implement `PdfUploader` component — file picker and drag-drop area, PDF-only client-side filter, size display, upload on submit, show uploading spinner — in `apps/frontend/src/features/shipments/components/PdfUploader.tsx`
- [x] T024 [US1] Implement `ImportStatus` component — display status badge (`queued | processing | completed | partial | awaiting_conflict_review | failed`), row count summary (imported / failed / conflicted), progress indicator while processing — in `apps/frontend/src/features/shipments/components/ImportStatus.tsx`
- [x] T025 [US1] Implement `ConflictReview` component — list each duplicate `ShipmentUploadError` row with incoming payload, allow per-row `overwrite | skip` radio selection, submit all decisions, disable submit until all rows are decided — in `apps/frontend/src/features/shipments/components/ConflictReview.tsx`
- [x] T026 [US1] Implement upload page composing `PdfUploader` → `ImportStatus` → `ConflictReview` using `useImportStatus`; render `ConflictReview` only when status is `awaiting_conflict_review` — in `apps/frontend/src/app/(dashboard)/shipments/upload/page.tsx`

**Checkpoint**: User Story 1 is independently testable. Upload a valid PDF, verify import completes, verify duplicate review flow works.

---

## Phase 4: User Story 2 — QR Code Camera Scan & Shipment Lookup (Priority: P2)

**Goal**: Users open the QR scanner, grant camera access, scan a QR code on a package, and see the matching shipment detail — or a clear error if the ID is not found or the format is invalid.

**Independent Test**: Pre-seed a known shipment ID in the DB, generate its QR code, scan it with the scanner, verify the shipment detail card appears — no PDF upload needed.

### Tests for User Story 2 (MANDATORY — write before implementation)

- [x] T027 [P] [US2] Write unit tests for `ShipmentsService` covering: found shipment by org+ID, not found (returns null → 404), invalid format (throws 400), format regex validation — in `apps/backend/src/modules/shipments/shipments.service.spec.ts`
- [x] T028 [P] [US2] Write integration tests for `ShipmentsController` covering: `GET /shipments/:shipmentId` returns 200 with payload for existing ID; 404 with `SHIPMENT_NOT_FOUND` for unknown ID; 400 with `INVALID_SHIPMENT_ID_FORMAT` for malformed ID; 401 for unauthenticated — in `apps/backend/src/modules/shipments/shipments.controller.spec.ts`
- [x] T029 [P] [US2] Write Playwright E2E scan spec (POM): scan page renders "Start Scanner" button; clicking shows camera permission prompt (mocked via `page.context().grantPermissions`); valid QR (injected via canvas mock) → shipment detail shown; unknown ID → "not found" message; invalid format → "unrecognized" message; permission denied → guidance message — in `apps/frontend/e2e/shipments/scan.spec.ts`

### Implementation for User Story 2

- [x] T030 [US2] Implement `ShipmentsService` — `findByShipmentId(orgId, shipmentId)` validates format against configured regex, queries `shipments` by `(organization_id, shipment_id)`, returns entity or null — in `apps/backend/src/modules/shipments/shipments.service.ts`
- [x] T031 [US2] Implement `ShipmentsController` — `GET /shipments/:shipmentId` requires `JwtAuthGuard`, reads `organizationId` from JWT/CLS, calls `ShipmentsService.findByShipmentId`, returns 200 with shipment payload, 400 on invalid format, 404 on not found — in `apps/backend/src/modules/shipments/shipments.controller.ts`
- [x] T032 [P] [US2] Add `lookupShipment(shipmentId)` API function to `apps/frontend/src/features/shipments/api/shipments.api.ts`
- [x] T033 [US2] Implement `useQrScanner` hook — `startScanner()` calls `getUserMedia({ video: { facingMode: 'environment' } })`, classifies `NotAllowedError / NotFoundError / NotReadableError` into typed permission states; `requestAnimationFrame` decode loop runs `jsQR` on canvas frame; skips if last scan < 800ms ago; 5s cooldown per unique ID; extracts ID from URL payloads (tries `new URL()`, falls back to raw string); validates against shipment ID regex; calls `lookupShipment`; `stopScanner()` releases all tracks and cancels animation frame — in `apps/frontend/src/features/shipments/hooks/useQrScanner.ts`
- [x] T034 [US2] Implement `QrScanner` component — renders "Start Scanner" button before permission; `<video>` element with live camera feed and `<canvas>` overlay after grant; inline infobar showing decode state; distinct inline messages for `NotAllowedError` (denied + browser settings link), `NotFoundError` (no camera), `NotReadableError` (camera in use); no `waitForTimeout` in any related code — in `apps/frontend/src/features/shipments/components/QrScanner.tsx`
- [x] T035 [P] [US2] Implement `ShipmentDetail` component — display all shipment fields (ID, origin, destination, status badge, carrier, estimated delivery, contents); loading skeleton; "Shipment not found" state with scanned ID shown; "Unrecognised QR code" state — in `apps/frontend/src/features/shipments/components/ShipmentDetail.tsx`
- [x] T036 [US2] Implement scan page composing `QrScanner` + `ShipmentDetail` using `useQrScanner`; pass scanned result to `ShipmentDetail` — in `apps/frontend/src/app/(dashboard)/shipments/scan/page.tsx`

**Checkpoint**: User Story 2 independently testable with a pre-seeded shipment ID and a generated QR code.

---

## Phase 5: User Story 3 — Upload History & Import Audit (Priority: P3)

**Goal**: Users can view a paginated chronological list of past PDF uploads with status, record counts, and per-row failure details.

**Independent Test**: Upload three PDFs (success, partial, failed), navigate to upload history, verify each entry shows the correct status and counts.

### Tests for User Story 3 (MANDATORY — write before implementation)

- [x] T037 [P] [US3] Write integration tests for `GET /shipments/imports/history` covering: authenticated user sees own org uploads ordered by `created_at DESC`; pagination returns `nextCursor`; unauthenticated returns 401 — in `apps/backend/src/modules/shipments/imports/import.controller.spec.ts`
- [x] T038 [P] [US3] Extend Playwright upload E2E spec with history assertions: navigate to `/shipments/history` after three uploads → list shows correct entries; click entry → error details visible for partial/failed imports — in `apps/frontend/e2e/shipments/upload.spec.ts`

### Implementation for User Story 3

- [x] T039 [US3] Add `getHistory(orgId, { limit, cursor })` cursor-paginated query to `ImportService` — orders by `created_at DESC`, returns items + `nextCursor` — in `apps/backend/src/modules/shipments/imports/import.service.ts`
- [x] T040 [US3] Add `GET /shipments/imports/history` endpoint to `ImportController` with `limit` and `cursor` query params, response matching contracts/shipments.api.md §5 — in `apps/backend/src/modules/shipments/imports/import.controller.ts`
- [x] T041 [P] [US3] Add `getImportHistory(limit?, cursor?)` function to `apps/frontend/src/features/shipments/api/shipments.api.ts`
- [x] T042 [US3] Implement `UploadHistory` component — paginated list of upload rows (filename, status badge, date, imported/failed/conflicted counts), "Load more" pagination button, click row to expand error details — in `apps/frontend/src/features/shipments/components/UploadHistory.tsx`
- [x] T043 [US3] Implement history page using `UploadHistory` component in `apps/frontend/src/app/(dashboard)/shipments/history/page.tsx`
- [x] T044 [US3] Verify audit events (`shipment.import.started`, `shipment.import.completed`, `shipment.import.partial`, `shipment.import.failed`) are emitted via existing `AuditService` inside `ImportProcessor`; confirm FR-016 fields (filename, userId, timestamp, rowsImported) are present in event metadata — in `apps/backend/src/modules/shipments/imports/import.processor.ts`

**Checkpoint**: All three user stories are independently functional. History page reflects real import outcomes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Navigation, environment docs, and quickstart validation affecting the whole feature.

- [x] T045 [P] Add "Upload PDF", "Upload History", and "Scan QR" navigation links to the dashboard sidebar component in `apps/frontend/src/`
- [x] T046 [P] Add feature-specific environment variables (`SHIPMENT_IMPORT_MAX_FILE_MB`, `SHIPMENT_IMPORT_CONCURRENCY`, `SHIPMENT_ID_REGEX`, `REDIS_HOST`, `REDIS_PORT`) to `apps/backend/.env.example`
- [ ] T047 Run quickstart.md manual walkthrough end-to-end (install deps → migrate → upload PDF → poll status → scan QR lookup) and fix any discrepancies (manual step — skipped in automated implementation)
- [x] T048 [P] Code review pass: remove any `console.log` debug statements, ensure no unused imports, confirm all endpoints match contracts/shipments.api.md response shapes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **blocks all user story phases**
- **Phase 3 (US1 — P1)**: Depends on Phase 2 — MVP deliverable; no dependency on US2/US3
- **Phase 4 (US2 — P2)**: Depends on Phase 2 — independent of US1; `ShipmentsController` and `ShipmentsService` are separate files from import pipeline
- **Phase 5 (US3 — P3)**: Depends on Phase 2 and extends Phase 3 implementation (adds history endpoint and UI to import module)
- **Phase 6 (Polish)**: Depends on all desired stories being complete

### User Story Dependencies

| User Story | Depends On | Notes |
|---|---|---|
| US1 — PDF Upload (P1) | Phase 2 only | Standalone; no US2/US3 dependency |
| US2 — QR Scan (P2) | Phase 2 only | `shipments` table must exist (T004/T007) but no US1 code needed |
| US3 — History (P3) | Phase 2 + Phase 3 complete | Extends import module; requires US1 service/controller already implemented |

### Parallel Opportunities per Phase

**Phase 1**: T001, T002, T003 all in parallel.

**Phase 2**: T004, T005, T006 in parallel (entity files); T007→T008→T009 sequential (migrations depend on prior table existing); T010 after entities; T011 after T010.

**Phase 3 (US1)**:
- Tests T012, T013, T014, T015 all in parallel (write-first, different files)
- T016, T017 in parallel (DTO files)
- T018 → T019 → T020 sequential (processor depends on service; controller depends on both)
- T021, T022 in parallel (API client and hook are independent)
- T023, T024, T025 in parallel (components are independent from each other; depend on T021/T022)
- T026 after T023, T024, T025

**Phase 4 (US2)**:
- Tests T027, T028, T029 all in parallel
- T030 → T031 sequential (controller depends on service)
- T032 in parallel with T030 (API client function independent)
- T033 → T034 sequential (component wraps hook)
- T035 in parallel with T033 (ShipmentDetail is independent)
- T036 after T033, T034, T035

**Phase 5 (US3)**: T037, T038 in parallel (tests); T039 → T040 sequential; T041 in parallel with T039; T042 after T041; T043 after T042; T044 in parallel at any point after T019.

**Phase 6**: T045, T046, T048 all in parallel; T047 last.

---

## Implementation Strategy

1. **MVP first** — Complete Phases 1–3 (US1 PDF upload) in full before starting US2 or US3. Delivers standalone production value.
2. **Test-first** — Write and run tests (T012–T015 for US1, T027–T029 for US2, T037–T038 for US3) before implementing the corresponding code. Tests should fail initially.
3. **Incremental delivery** — Each phase checkpoint produces an independently deployable and testable increment.
4. **Backend-first within each story** — Implement DTOs → service → processor/controller → integration test green → then front-end components.

---

## Summary

| Phase | Stories | Tasks | Test Layers |
|---|---|---|---|
| Phase 1 — Setup | — | T001–T003 | — |
| Phase 2 — Foundational | — | T004–T011 | — |
| Phase 3 — PDF Upload | US1 (P1) | T012–T026 | Unit + Integration + Playwright |
| Phase 4 — QR Scan | US2 (P2) | T027–T036 | Unit + Integration + Playwright |
| Phase 5 — History | US3 (P3) | T037–T044 | Integration + Playwright |
| Phase 6 — Polish | — | T045–T048 | — |
| **Total** | **3 stories** | **48 tasks** | **All 3 layers** |

**Parallel opportunities**: 20+ tasks marked `[P]` across all phases.  
**MVP scope**: Phases 1–3 (T001–T026) — 26 tasks delivering the complete PDF upload story.
