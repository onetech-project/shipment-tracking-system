# Tasks: PDF Line Haul Trip Extraction & QR Lookup

**Input**: Design documents from `/specs/002-pdf-upload-qr-scan/`
**Branch**: `002-pdf-upload-qr-scan`
**Prerequisites**: ✅ plan.md, ✅ spec.md, ✅ research.md, ✅ data-model.md, ✅ contracts/shipments.api.md, ✅ contracts/linehaul.api.md

**Tests**: Per constitution §VI, automation tests are **MANDATORY** — every story includes unit, integration, and Playwright E2E test tasks. All tests must pass before the feature is considered complete.

**Context**: The base shipment upload pipeline (entities, import processor, BullMQ queue, frontend upload/scan UI) was completed in the prior iteration (T001–T048 below). This updated task list adds **Line Haul Trip** PDF extraction and QR lookup by `to_number` as specified in the updated plan.md.

**Suggested MVP Scope**: Phases 1–3 (completed) + Phase 7 + Phase 8 + Phase 9 (Line Haul US1 — PDF extraction) delivers the core linehaul data ingestion independently from QR scan extension.

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

---

# Line Haul Trip Extension (Added 2026-03-19)

The following phases extend the completed shipment upload pipeline with Line Haul Trip PDF extraction using `pdf2json` positional parsing, new database tables, and QR scanner dual-lookup by `to_number`.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on in-progress tasks)
- **[US-LH1]**: Line Haul PDF Extraction (maps to spec US1 linehaul extension)
- **[US-LH2]**: Line Haul QR Lookup (maps to spec US2 linehaul extension)
- **[US-LH3]**: Line Haul Upload History (maps to spec US3 linehaul extension)

---

## Phase 7: Line Haul Setup

**Purpose**: Install `pdf2json` dependency and create shared types for Line Haul Trip data used by all linehaul user stories.

- [x] T049 Install `pdf2json` dependency in `apps/backend/` via `npm install --workspace=apps/backend pdf2json`
- [x] T050 [P] Add Line Haul shared response types (`LinehaulTripItemResponse`, `LinehaulTripResponse`, `LinehaulLookupResponse`) to `packages/shared/src/shipments/dto.ts` and export from `packages/shared/src/shipments/index.ts`
- [x] T051 [P] Create `LinehaulTripDto` class with class-validator decorators (tripCode required matching `LT\w+`, origin required, destination required, schedule/vendor/plateNumber/driverName/std/sta/ata/totalWeight optional) in `apps/backend/src/modules/shipments/imports/linehaul/dto/linehaul-trip.dto.ts`
- [x] T052 [P] Create `LinehaulTripItemDto` class with class-validator decorators (toNumber required non-empty, weight/destination/dgType/toType optional) in `apps/backend/src/modules/shipments/imports/linehaul/dto/linehaul-trip-item.dto.ts`

---

## Phase 8: Line Haul Foundational (Blocking Prerequisites)

**Purpose**: Database migrations and TypeORM entities for `linehaul_trips` and `linehaul_trip_items` tables. Must complete before any linehaul user story work.

**⚠️ CRITICAL**: No linehaul user story work can begin until this phase is complete.

- [x] T053 Create TypeORM migration `20260319000001-create-linehaul-trips.ts` in `apps/backend/src/database/migrations/` — `linehaul_trips` table with all columns per data-model.md §4; UNIQUE on `(organization_id, trip_code)`; indexes on `(organization_id, trip_code)` and `(organization_id, created_at DESC)`; FK to `organizations(id)` CASCADE and `shipment_uploads(id)` SET NULL
- [x] T054 Create TypeORM migration `20260319000002-create-linehaul-trip-items.ts` in `apps/backend/src/database/migrations/` — `linehaul_trip_items` table with all columns per data-model.md §5; FK to `linehaul_trips(id)` CASCADE; UNIQUE on `(linehaul_trip_id, to_number)`; index on `(to_number)` for QR lookup; index on `(linehaul_trip_id)`
- [x] T055 [P] Create `LinehaulTrip` TypeORM entity in `apps/backend/src/modules/shipments/entities/linehaul-trip.entity.ts` — all columns from data-model.md §4; `@ManyToOne` to Organization; `@ManyToOne` to ShipmentUpload (nullable); `@OneToMany` to LinehaulTripItem (cascade); unique constraint on `['organization_id', 'trip_code']`
- [x] T056 [P] Create `LinehaulTripItem` TypeORM entity in `apps/backend/src/modules/shipments/entities/linehaul-trip-item.entity.ts` — all columns from data-model.md §5; `@ManyToOne` to LinehaulTrip; unique constraint on `['linehaul_trip_id', 'to_number']`
- [x] T057 Register `LinehaulTrip` and `LinehaulTripItem` entities in `TypeOrmModule.forFeature()` imports array in `apps/backend/src/modules/shipments/shipments.module.ts`

**Checkpoint**: Linehaul database schema and entity layer ready — linehaul user story implementation can now begin.

---

## Phase 9: Line Haul US1 — PDF Upload & Extraction (Priority: P1) 🎯 MVP

**Goal**: The existing `POST /shipments/imports` endpoint auto-detects Line Haul Trip PDFs (via "Nomor TO" + "Surat Jalan" sentinel markers), extracts header and table data using `pdf2json` positional parsing, and persists to `linehaul_trips` / `linehaul_trip_items`. Falls back to regex-based parsing if positional extraction fails.

**Independent Test**: Upload a Line Haul Trip PDF via `POST /shipments/imports`, verify the import processor detects the linehaul template, extracts trip header fields (trip_code, schedule, origin, destination, vendor, plate_number, etc.) and table rows (to_number, weight, destination, dg_type, to_type), and persists them. Verify `GET /shipments/imports/:uploadId` shows `completed` with correct counters. No QR scanner needed.

### Tests for Line Haul US1 (MANDATORY — write before implementation)

- [x] T058 [P] [US-LH1] Unit test for `LinehaulParserService` in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-parser.service.spec.ts` — test cases: header field extraction (trip_code, schedule, origin, destination, vendor, plate_number, driver_name, STD/STA/ATA, total_weight) from mock pdf2json positional output; table row reconstruction via x-coordinate clustering; multi-line cell merging; fallback to regex parsing when positional data is unreliable; empty/corrupt PDF returns parse error
- [x] T059 [P] [US-LH1] Unit test for `LinehaulImportService` in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-import.service.spec.ts` — test cases: new trip inserted with all items; duplicate trip_code detected and flagged; items with missing to_number generate upload error rows; upload status transitions to `completed` / `partial` / `awaiting_conflict_review`; audit events emitted
- [x] T060 [P] [US-LH1] Unit test for template detection in `apps/backend/src/modules/shipments/imports/import.processor.spec.ts` — extend existing test file with cases: PDF text containing "Nomor TO" + "Surat Jalan" dispatches to linehaul parser; existing `TEMPLATE_MARKERS` still dispatches to shipment parser; unknown markers reject with INVALID_PDF
- [x] T061 [P] [US-LH1] Integration test for linehaul import pipeline in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-import.integration.spec.ts` — full pipeline: PDF buffer → pdf2json parse → header + table extraction → persist to DB → verify `linehaul_trips` row with correct fields → verify `linehaul_trip_items` rows → verify `shipment_uploads` status and counters
- [x] T062 [P] [US-LH1] Playwright E2E test for Line Haul Trip PDF upload in `apps/frontend/e2e/shipments/upload.spec.ts` — extend existing upload spec: upload a linehaul PDF file → verify import status shows `completed` → verify trip data is accessible via linehaul trips list

### Implementation for Line Haul US1

- [x] T063 [US-LH1] Implement `LinehaulParserService` in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-parser.service.ts` — accept PDF buffer; use `pdf2json` to extract `Pages[].Texts[]` with x/y coordinates; segment at "Nomor TO" y-threshold into header vs table sections; parse header using hybrid regex + keyword-proximity + position strategy (trip_code via `LT\w+`, plate_number via `B\d{4,}`, datetime for STD/STA/ATA, keyword-proximity for vendor/driver); reconstruct table rows via dynamic x-coordinate clustering (tolerance ~10 units), y-axis sort, multi-line cell merge; validate parsed data against `LinehaulTripDto` / `LinehaulTripItemDto`; implement fallback to regex-based line-by-line parsing if x-clusters are degenerate (all cluster to same x); return parsed `LinehaulTripDto` with items array or throw structured parse error
- [x] T064 [US-LH1] Implement `LinehaulImportService` in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-import.service.ts` — receive parsed `LinehaulTripDto` + `uploadId` + `organizationId`; check duplicate `trip_code` within org via `UNIQUE (organization_id, trip_code)` preflight query; insert new `LinehaulTrip` row linked to upload via `last_import_upload_id`; insert `LinehaulTripItem` rows; generate `ShipmentUploadError` rows (type `validation`) for items missing required fields; generate `ShipmentUploadError` rows (type `duplicate`) for duplicate `trip_code`; update `ShipmentUpload` counters and status (`completed` / `partial` / `awaiting_conflict_review`); emit audit events via existing `AuditService` (`shipment.import.started`, `shipment.import.completed/partial/failed` with metadata)
- [x] T065 [US-LH1] Add template detection and linehaul dispatch to `apps/backend/src/modules/shipments/imports/import.processor.ts` — on job pickup, do a first-pass text extraction (use `pdf2json` or `pdf-parse` for raw text); check for "Nomor TO" AND "Surat Jalan" sentinel markers → if found, delegate to `LinehaulParserService.parse()` then `LinehaulImportService.import()`; else check existing `TEMPLATE_MARKERS` → delegate to existing shipment parser; else reject with `INVALID_PDF` error and set upload status `failed`
- [x] T066 [US-LH1] Register `LinehaulParserService` and `LinehaulImportService` as providers in `apps/backend/src/modules/shipments/shipments.module.ts`

**Checkpoint**: Line Haul Trip PDF upload and extraction is fully functional. Uploading a linehaul PDF via `POST /shipments/imports` auto-detects, parses, and persists trip data. Existing shipment PDF uploads continue to work unchanged.

---

## Phase 10: Line Haul US2 — QR Code Line Haul Trip Item Lookup (Priority: P2)

**Goal**: Extend the QR scanner to look up scanned `to_number` values against `linehaul_trip_items`, returning trip item details with parent trip header. Falls back to existing shipment lookup if no linehaul match. New `LinehaulController` serves dedicated linehaul endpoints per `contracts/linehaul.api.md`.

**Independent Test**: Pre-seed database with a known `linehaul_trip` + `linehaul_trip_item` record. Scan a QR code containing the `to_number`. Verify the `LinehaulDetail` component displays the correct trip item and parent trip details. Also test the 404 fallback to shipment lookup.

### Tests for Line Haul US2 (MANDATORY — write before implementation)

- [x] T067 [P] [US-LH2] Unit test for `LinehaulController` in `apps/backend/src/modules/shipments/linehaul.controller.spec.ts` — test `GET /shipments/linehaul/items/:toNumber`: returns 200 with item + parent trip for valid to_number within org; returns 400 `INVALID_TO_NUMBER_FORMAT` for malformed value; returns 404 `TRIP_ITEM_NOT_FOUND` when not found in org; test `GET /shipments/linehaul/trips`: returns paginated list; test `GET /shipments/linehaul/trips/:tripId`: returns trip + items for own org, 403 for cross-org, 404 for missing
- [x] T068 [P] [US-LH2] Integration test for QR dual-lookup flow in `apps/backend/src/modules/shipments/linehaul.controller.integration.spec.ts` — seed DB with linehaul trip + items AND a shipment record; verify linehaul lookup endpoint returns correct response; verify shipment lookup still works; verify 404 for unknown values
- [x] T069 [P] [US-LH2] Playwright E2E test for QR scan linehaul lookup in `apps/frontend/e2e/shipments/scan.spec.ts` — extend existing scan spec: scan `to_number` QR code → `LinehaulDetail` component renders with trip item + trip header; scan unknown value → "not found" message; scan shipment ID → existing `ShipmentDetail` renders (backward compat)

### Implementation for Line Haul US2

- [x] T070 [US-LH2] Implement `LinehaulController` in `apps/backend/src/modules/shipments/linehaul.controller.ts` — `@Controller('shipments/linehaul')` with `JwtAuthGuard`; `GET items/:toNumber` validates format, queries `linehaul_trip_items` JOIN `linehaul_trips` WHERE `trip.organization_id = currentOrg`, returns `{ item, trip }` or 400/404; `GET trips` with cursor pagination via `LinehaulImportService` or direct repository query; `GET trips/:tripId` returns trip + items, 403 cross-org, 404 not found — all response shapes per `contracts/linehaul.api.md`
- [x] T071 [US-LH2] Register `LinehaulController` in controllers array of `apps/backend/src/modules/shipments/shipments.module.ts`
- [x] T072 [P] [US-LH2] Create `LinehaulDetail` component in `apps/frontend/src/features/shipments/components/LinehaulDetail.tsx` — display trip item fields (toNumber, weight, destination, dgType, toType) in a card; display parent trip header (tripCode, schedule, origin, destination, vendor, plateNumber, driverName, STD/STA/ATA, totalWeight) in a collapsible section; loading skeleton state; "not found" state
- [x] T073 [P] [US-LH2] Add linehaul API calls to `apps/frontend/src/features/shipments/api/shipments.api.ts` — `lookupLinehaulItem(toNumber): Promise<LinehaulLookupResponse>` calling `GET /shipments/linehaul/items/:toNumber`; `listLinehaulTrips(cursor?, limit?)` calling `GET /shipments/linehaul/trips`; `getLinehaulTrip(tripId)` calling `GET /shipments/linehaul/trips/:tripId`
- [x] T074 [US-LH2] Extend `useQrScanner` hook in `apps/frontend/src/features/shipments/hooks/useQrScanner.ts` — on QR decode, first call `lookupLinehaulItem(decodedValue)`; if 404, fall back to existing `lookupShipment(decodedValue)`; if both 404, show "not found"; set result type (`linehaul` | `shipment` | `not_found`) to control which detail component renders
- [x] T075 [US-LH2] Update scan page in `apps/frontend/src/app/(dashboard)/shipments/scan/page.tsx` — conditionally render `LinehaulDetail` when result type is `linehaul`, `ShipmentDetail` when result type is `shipment`, "not found" message otherwise

**Checkpoint**: QR scanner supports dual-lookup (linehaul `to_number` first, shipment `shipment_id` fallback). Scanning a `to_number` shows trip item + trip details; scanning a shipment ID still works as before.

---

## Phase 11: Line Haul US3 — Upload History for Line Haul Imports (Priority: P3)

**Goal**: Ensure the existing upload history view correctly displays Line Haul Trip import jobs alongside shipment imports — both template types share the `shipment_uploads` table, so the main task is verifying correct row counts and status for linehaul imports.

**Independent Test**: Upload multiple Line Haul Trip PDFs, navigate to upload history, verify each entry shows correct filename, status, and row counts.

### Tests for Line Haul US3 (MANDATORY — write before implementation)

- [x] T076 [P] [US-LH3] Integration test verifying upload history includes linehaul imports in `apps/backend/src/modules/shipments/imports/import.controller.spec.ts` — seed DB with both shipment and linehaul uploads; `GET /shipments/imports/history` returns both types with correct statuses and counters
- [x] T077 [P] [US-LH3] Playwright E2E test for upload history with linehaul entries in `apps/frontend/e2e/shipments/upload.spec.ts` — upload a linehaul PDF → navigate to history → verify linehaul entry appears with correct row counts

### Implementation for Line Haul US3

- [x] T078 [US-LH3] Verify `LinehaulImportService` correctly updates `ShipmentUpload` counters (`total_rows_detected`, `rows_imported`, `rows_failed`, `rows_conflicted`) in `apps/backend/src/modules/shipments/imports/linehaul/linehaul-import.service.ts` — `total_rows_detected` = number of parsed trip items; `rows_imported` = successfully inserted items; `rows_failed` = items failing validation; `rows_conflicted` = duplicate trip_code count
- [x] T079 [US-LH3] Verify `UploadHistory` component in `apps/frontend/src/features/shipments/components/UploadHistory.tsx` renders linehaul import entries correctly — no changes expected since both template types use the same `ImportStatusResponse` shape; confirm UI displays correctly

**Checkpoint**: Upload history displays both shipment and linehaul import jobs correctly. All linehaul user stories are independently functional.

---

## Phase 12: Line Haul Polish & Cross-Cutting Concerns

**Purpose**: Input validation hardening, export cleanup, and final quickstart validation for the linehaul extension.

- [x] T080 [P] Add `toNumber` path parameter validation pipe (configurable format regex) to `LinehaulController` in `apps/backend/src/modules/shipments/linehaul.controller.ts`
- [x] T081 [P] Update `packages/shared/src/shipments/index.ts` to export all new linehaul types
- [ ] T082 Run quickstart.md validation for linehaul — install pdf2json, run new migrations, start dev servers, upload a linehaul PDF, poll status, verify trip data persisted, scan QR code with `to_number`, verify lookup response
- [x] T083 [P] Code review pass for linehaul files: confirm all new endpoints match `contracts/linehaul.api.md` response shapes; remove debug statements; ensure no unused imports

---

## Dependencies & Execution Order (Line Haul Extension)

### Phase Dependencies

- **Phase 7 (LH Setup)**: No dependencies on prior incomplete tasks — can start immediately
- **Phase 8 (LH Foundational)**: Depends on Phase 7 — **blocks all linehaul user story phases**
- **Phase 9 (LH US1)**: Depends on Phase 8 — MVP linehaul deliverable; no dependency on LH US2/US3
- **Phase 10 (LH US2)**: Depends on Phase 8 — independently testable with pre-seeded data; does NOT require LH US1 code
- **Phase 11 (LH US3)**: Depends on Phase 8 + Phase 9 (verification requires linehaul import to work)
- **Phase 12 (LH Polish)**: Depends on all linehaul user stories being complete

### User Story Dependencies

| User Story | Depends On | Notes |
|---|---|---|
| LH US1 — PDF Extraction (P1) | Phase 8 only | Standalone; extends existing import processor |
| LH US2 — QR Lookup (P2) | Phase 8 only | Entities must exist; pre-seed data for independent testing |
| LH US3 — Upload History (P3) | Phase 8 + Phase 9 | Verifies counters set by LinehaulImportService |

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- DTOs before services
- Services before controllers
- Backend before frontend
- Core implementation before integration hooks

### Parallel Opportunities

**Phase 7**: T050, T051, T052 in parallel (different files, no dependencies).

**Phase 8**: T053 → T054 sequential (migration order matters); T055, T056 in parallel after migrations; T057 after entities.

**Phase 9 (LH US1)**: T058, T059, T060, T061, T062 all in parallel (test files); T063 → T064 → T065 sequential (parser → import service → processor dispatch); T066 after T063+T064.

**Phase 10 (LH US2)**: T067, T068, T069 all in parallel (test files); T070 → T071 sequential; T072, T073 in parallel (different files); T074 after T072+T073; T075 after T074.

**Phase 11 (LH US3)**: T076, T077 in parallel; T078, T079 can run in parallel.

**Phase 12**: T080, T081, T083 in parallel; T082 last.

**Cross-story**: Once Phase 8 completes, LH US1 and LH US2 can be worked on simultaneously by different developers.

---

## Implementation Strategy (Line Haul Extension)

### MVP First (LH US1 Only)

1. Complete Phase 7: LH Setup (install pdf2json, add shared types and DTOs)
2. Complete Phase 8: LH Foundational (migrations, entities, module registration)
3. Complete Phase 9: LH US1 (parser + import service + template detection)
4. **STOP and VALIDATE**: Upload a Line Haul Trip PDF and verify extraction + persistence
5. Deploy/demo if ready — core linehaul data ingestion is functional

### Incremental Delivery

1. LH Setup + LH Foundational → Infrastructure ready
2. Add LH US1 → Test independently → Deploy/Demo (**MVP!** — linehaul PDF extraction works)
3. Add LH US2 → Test independently → Deploy/Demo (QR scan finds linehaul items)
4. Add LH US3 → Test independently → Deploy/Demo (upload history covers linehaul)
5. LH Polish → Final validation, quickstart check

---

## Full Summary (Original + Line Haul Extension)

| Phase | Stories | Tasks | Status |
|---|---|---|---|
| Phase 1 — Setup | — | T001–T003 | ✅ Complete |
| Phase 2 — Foundational | — | T004–T011 | ✅ Complete |
| Phase 3 — PDF Upload | US1 (P1) | T012–T026 | ✅ Complete |
| Phase 4 — QR Scan | US2 (P2) | T027–T036 | ✅ Complete |
| Phase 5 — History | US3 (P3) | T037–T044 | ✅ Complete |
| Phase 6 — Polish | — | T045–T048 | ✅ Complete (T047 pending manual) |
| **Phase 7 — LH Setup** | **—** | **T049–T052** | **Not started** |
| **Phase 8 — LH Foundational** | **—** | **T053–T057** | **Not started** |
| **Phase 9 — LH PDF Extraction** | **LH US1 (P1)** | **T058–T066** | **Not started** |
| **Phase 10 — LH QR Lookup** | **LH US2 (P2)** | **T067–T075** | **Not started** |
| **Phase 11 — LH Upload History** | **LH US3 (P3)** | **T076–T079** | **Not started** |
| **Phase 12 — LH Polish** | **—** | **T080–T083** | **Not started** |
| **Total** | **6 stories** | **83 tasks** | **48 done, 35 new** |

**New task count**: 35 tasks (T049–T083)
**New tasks per story**: LH US1: 9 tasks, LH US2: 9 tasks, LH US3: 4 tasks
**Parallel opportunities**: 18 new tasks marked `[P]`
**MVP scope**: Phases 7–9 (T049–T066) — 18 tasks delivering complete linehaul PDF extraction
