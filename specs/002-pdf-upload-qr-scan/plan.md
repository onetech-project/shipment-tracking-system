# Implementation Plan: PDF Shipment Upload & QR Code Scan

**Branch**: `002-pdf-upload-qr-scan` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-pdf-upload-qr-scan/spec.md`

## Summary

Implement two complementary shipment data-ingestion flows within the existing fullstack monorepo. First, authenticated users upload shipment-template PDFs; the backend parses and validates rows asynchronously via BullMQ, persists valid records to PostgreSQL, and flags duplicate shipment IDs for explicit overwrite confirmation before touching existing records. Second, users open a browser-based QR scanner that accesses device camera, decodes shipment IDs in real time using `jsqr`, and fetches the matching shipment record, with clear messaging for denied permissions, unrecognized codes, and not-found results. Every upload event is captured in the existing audit log. All three test layers (unit, integration, Playwright E2E) are mandatory per constitution.

## Technical Context

**Language/Version**: TypeScript 5.5.x  
**Primary Dependencies**: NestJS 10.x, Next.js 14.x, TypeORM 0.3.x, BullMQ 5.x, `pdf-parse` (PDF text extraction), `pdfjs-dist` (underlying PDF.js engine), `jsqr` (browser QR decode), class-validator 0.14.x, Playwright 1.44.x  
**Storage**: PostgreSQL 16 (primary — shipments, import jobs, errors); Redis (BullMQ queue + job state)  
**Testing**: Jest + Supertest (unit + integration), Playwright (E2E automation — mandatory per constitution §VI)  
**Target Platform**: Linux containers (backend/frontend), modern desktop and mobile browsers with `getUserMedia` camera API  
**Project Type**: Fullstack web application — monorepo (`/apps/backend`, `/apps/frontend`, `/packages/shared`)  
**Performance Goals**: ≤30s import completion for up to 200 shipment rows; ≤5s QR scan-to-detail end-to-end; ≤3s user-facing error feedback  
**Constraints**: Non-blocking upload UI (async worker + polling); duplicate shipment IDs must not overwrite until explicit user confirmation; all endpoints restricted to authenticated users; camera denial handled gracefully with recovery guidance  
**Scale/Scope**: Single internal PDF template; 200-row target throughput; 500-row edge-case tolerance with partial success; multiple users per organisation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Repository Architecture (Monorepo) | ✅ PASS | All work inside existing `/apps` and `/packages/shared`. |
| II. Technology Stack (NestJS + TypeScript + Next.js) | ✅ PASS | No deviation from mandated stack. |
| III. Database (PostgreSQL + migrations + timestamps) | ✅ PASS | New tables delivered via TypeORM migrations; all include `created_at`/`updated_at`. |
| IV. DRY / KISS / YAGNI | ✅ PASS | Reuse existing BullMQ, audit service, and tenant-CLS patterns from feature 001. |
| V. Modular Architecture | ✅ PASS | New `shipments` NestJS module; new `shipments` frontend feature folder. |
| VI. Testing (Unit + Integration + Playwright) | ✅ PASS | Plan mandates all three layers for both P1 upload and P2 scan journeys. |
| VII. Fail-Safe / Fault-Tolerant | ✅ PASS | Worker failures isolated per-job; partial extraction supported; bad rows quarantined. |
| VIII. Retryable System | ✅ PASS | BullMQ job retries on transient failures with configured attempt limits. |
| IX. Idempotency | ✅ PASS | Upload idempotency enforced via SHA-256 file hash; unique `(org_id, shipment_id)` DB constraint. |
| X. Observability | ✅ PASS | Audit events on import lifecycle; structured logs on worker and controller. |
| XI. Rate Limiting | ✅ PASS | Upload and lookup endpoints inherit existing `@nestjs/throttler` guard. |
| XII. Event-Driven Readiness | ✅ PASS | Worker emits `shipment.import.started` and `shipment.import.completed` domain events. |
| XIII. Cost Efficiency | ✅ PASS | Leverages existing Redis + PostgreSQL; no new managed services required. |
| XIV. CI/CD (Dockerfile + Jenkinsfile) | ✅ PASS | No infra changes; existing Dockerfiles and Jenkinsfile cover new modules. |
| XV. Security Baseline | ✅ PASS | File-type + MIME validation before parsing; auth required; input sanitised through DTOs. |
| XVI. Documentation | ✅ PASS | `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` all produced. |
| XVII. OCR / QR Reliability | ✅ PASS | Async import handles parse failures per-row; scanner handles all error states from spec. |

**Pre-Design Gate: PASS — no violations. Complexity Tracking not required.**

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| III. Database | ✅ PASS | Data model defines all tables with `created_at`/`updated_at` and correct indexes. |
| VI. Testing | ✅ PASS | Playwright E2E planned for upload (P1) and scan (P2) critical journeys. |
| XVII. OCR / QR Reliability | ✅ PASS | Conflict review flow, import retry, and all QR error states are fully specified. |

**Post-Design Gate: PASS**

## Project Structure

### Documentation (this feature)

```text
specs/002-pdf-upload-qr-scan/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── shipments.api.md # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/backend/
├── src/
│   ├── modules/
│   │   └── shipments/                       # new NestJS module
│   │       ├── shipments.module.ts
│   │       ├── shipments.controller.ts      # GET /shipments/:shipmentId (QR lookup)
│   │       ├── shipments.service.ts
│   │       ├── entities/
│   │       │   ├── shipment.entity.ts
│   │       │   ├── shipment-upload.entity.ts
│   │       │   └── shipment-upload-error.entity.ts
│   │       └── imports/
│   │           ├── import.controller.ts     # POST /shipments/imports + upload history
│   │           ├── import.service.ts
│   │           ├── import.processor.ts      # BullMQ worker
│   │           └── dto/
│   │               ├── resolve-conflict.dto.ts
│   │               └── shipment-row.dto.ts
│   └── database/
│       └── migrations/
│           ├── 20260318000001-create-shipments.ts
│           ├── 20260318000002-create-shipment-uploads.ts
│           └── 20260318000003-create-shipment-upload-errors.ts

apps/frontend/
├── src/
│   ├── app/
│   │   └── (dashboard)/
│   │       └── shipments/
│   │           ├── upload/page.tsx          # PDF upload UI
│   │           ├── history/page.tsx         # Upload history UI
│   │           └── scan/page.tsx            # QR scanner UI
│   ├── features/
│   │   └── shipments/
│   │       ├── components/
│   │       │   ├── PdfUploader.tsx
│   │       │   ├── ImportStatus.tsx
│   │       │   ├── ConflictReview.tsx
│   │       │   ├── UploadHistory.tsx
│   │       │   ├── QrScanner.tsx
│   │       │   └── ShipmentDetail.tsx
│   │       ├── hooks/
│   │       │   ├── useImportStatus.ts
│   │       │   └── useQrScanner.ts
│   │       └── api/
│   │           └── shipments.api.ts
│   └── shared/api/
└── e2e/
    └── shipments/
        ├── upload.spec.ts                   # Playwright — upload journey
        └── scan.spec.ts                     # Playwright — QR scan journey

packages/shared/
└── src/
    └── shipments/
        ├── dto.ts                           # shared request/response types
        └── index.ts
```

**Structure Decision**: Option 2 (fullstack web app) per constitution §§I–II. Feature logic is isolated in a new `shipments` NestJS module and a new `shipments` frontend feature folder. Shared types live in `packages/shared/src/shipments/` to avoid duplication. Playwright E2E specs co-located under `apps/frontend/e2e/shipments/` per constitution §VI rule 5.

## Testing Strategy

### Layer 1 — Unit Tests (Jest)

Located alongside source files as `*.spec.ts`. Cover:
- `import.processor.ts`: PDF parse, row validation, duplicate detection, batch insert
- `shipments.service.ts`: QR lookup, not-found handling, format validation
- `shipment-row.dto.ts`: class-validator rules for each shipment field
- `resolve-conflict.dto.ts`: valid action values, required fields

### Layer 2 — Integration Tests (Jest + Supertest)

Located in `apps/backend/src/modules/shipments/**/*.controller.spec.ts`. Cover:
- `POST /shipments/imports` — valid PDF returns 202; non-PDF returns 400; unauthenticated returns 401
- `GET /shipments/imports/:id` — status transitions across job lifecycle
- `GET /shipments/imports/:id/errors` — conflict rows returned
- `POST /shipments/imports/:id/conflicts/resolve` — overwrite and skip paths
- `GET /shipments/:shipmentId` — found, not-found, invalid format cases
- RBAC: unauthenticated users blocked on every endpoint

### Layer 3 — E2E / Automation Tests (Playwright)

Located in `apps/frontend/e2e/shipments/`. POM pattern. Cover:
1. **upload.spec.ts**:
   - Upload valid PDF → status polling → success summary
   - Upload non-PDF → immediate error
   - Upload PDF with duplicate IDs → conflict review UI displayed
   - Resolve conflicts (overwrite/skip) → final summary updates
   - Upload history page shows past uploads with correct status
2. **scan.spec.ts**:
   - Scanner page renders "Start Scanner" before permission granted
   - Permission denied → clear message with recovery guidance
   - Valid QR scan → shipment detail shown (mocked camera in CI)
   - Unknown shipment ID → "not found" message displayed
   - Invalid QR format → "unrecognized" message displayed

No `page.waitForTimeout`. DB state seeded and cleaned via API fixtures per test.

## Complexity Tracking

*No constitution violations — table intentionally empty.*
