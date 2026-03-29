# Implementation Plan: PDF Line Haul Trip Extraction & QR Lookup

**Branch**: `002-pdf-upload-qr-scan` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-pdf-upload-qr-scan/spec.md` + Line Haul Trip extraction design

## Summary

Extend the existing shipments module with a Line Haul Trip PDF extraction pipeline. The system will:

1. Accept Line Haul Trip PDFs via the existing upload flow
2. Use `pdf2json` to extract positional text data (x, y coordinates) from the PDF
3. Segment the PDF into header (trip metadata) and table (trip items) sections
4. Parse header fields using hybrid regex + keyword + position strategy
5. Reconstruct table rows from positional data using column detection and y-axis alignment
6. Persist extracted data into new `linehaul_trips` and `linehaul_trip_items` tables
7. Extend the existing QR scanner to look up scanned `to_number` values against `linehaul_trip_items`

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 LTS  
**Primary Dependencies**: NestJS 10.4, TypeORM 0.3.20, BullMQ, pdf2json (new), pdf-parse (existing), jsQR (frontend)  
**Storage**: PostgreSQL 16.x (TypeORM migrations), Redis 7.x (BullMQ)  
**Testing**: Jest (unit/integration), Playwright (E2E) — Playwright mandatory per constitution §VI  
**Target Platform**: Linux server (backend), Web browser (frontend)  
**Project Type**: Web service (monorepo: apps/backend + apps/frontend + packages/shared)  
**Performance Goals**: PDF extraction ≤ 30s for up to 200 items; QR lookup ≤ 3s  
**Constraints**: Max file size 5MB; async processing via BullMQ queue  
**Scale/Scope**: Single internal Line Haul Trip PDF template; org-scoped multi-tenant

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                         | Status  | Notes                                                                                 |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| §I Monorepo Architecture                          | ✅ PASS | New code stays in `apps/backend`, `apps/frontend`, `packages/shared`                  |
| §II Tech Stack (NestJS/TypeScript/PostgreSQL)     | ✅ PASS | All new code uses NestJS module + TypeORM entities                                    |
| §III Database (migrations, timestamps, indexes)   | ✅ PASS | New tables via migrations with `created_at`/`updated_at`; indexes on lookup columns   |
| §IV DRY/KISS/YAGNI                                | ✅ PASS | Extends existing import pipeline; reuses BullMQ/audit; no speculative features        |
| §V Modular Architecture                           | ✅ PASS | New linehaul functionality added within shipments module (same import domain)         |
| §VI Testing (Unit + Integration + Playwright E2E) | ✅ PASS | Unit tests for parsers; integration tests for DB; Playwright E2E for upload + QR scan |
| §VII Fail-Safe / Fault-Tolerant                   | ✅ PASS | Parser errors don't crash pipeline; fallback to regex-based parsing                   |
| §VIII Retryable System                            | ✅ PASS | BullMQ retries with exponential backoff (existing)                                    |
| §IX Idempotency                                   | ✅ PASS | SHA-256 file hash dedup (existing); `trip_code` unique constraint                     |
| §X Observability                                  | ✅ PASS | Structured logging via existing audit events                                          |
| §XI Rate Limiting                                 | ✅ PASS | Inherits global throttler                                                             |
| §XII Event-Driven                                 | ✅ PASS | Reuses existing import event emissions                                                |
| §XIV CI/CD                                        | ✅ PASS | Existing Dockerfile/Jenkinsfile; no new deployables                                   |
| §XV Security                                      | ✅ PASS | Auth guards on all endpoints; input validation                                        |
| §XVII OCR/QR Reliability                          | ✅ PASS | pdf2json extraction with validation; QR lookup uses existing jsQR + database lookup   |

## Project Structure

### Documentation (this feature)

```text
specs/002-pdf-upload-qr-scan/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── shipments.api.md
│   └── linehaul.api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/backend/src/modules/shipments/
├── entities/
│   ├── shipment.entity.ts                 # (existing)
│   ├── shipment-upload.entity.ts          # (existing)
│   ├── shipment-upload-error.entity.ts    # (existing)
│   ├── linehaul-trip.entity.ts            # NEW
│   └── linehaul-trip-item.entity.ts       # NEW
├── imports/
│   ├── import.processor.ts                # MODIFIED — template detection + dispatch
│   ├── dto/
│   │   └── shipment-row.dto.ts            # (existing)
│   └── linehaul/
│       ├── linehaul-parser.service.ts     # NEW — pdf2json extraction + table reconstruction
│       ├── linehaul-import.service.ts     # NEW — persistence logic
│       └── dto/
│           ├── linehaul-trip.dto.ts       # NEW
│           └── linehaul-trip-item.dto.ts  # NEW
├── linehaul.controller.ts                 # NEW — QR lookup endpoint for to_number
├── shipments.controller.ts                # (existing)
├── import.controller.ts                   # (existing)
├── shipments.service.ts                   # (existing)
├── import.service.ts                      # (existing)
└── shipments.module.ts                    # MODIFIED — register new entities + services

apps/frontend/src/features/shipments/
├── components/
│   └── LinehaulDetail.tsx                 # NEW — display linehaul trip item details
├── hooks/
│   └── useQrScanner.ts                   # MODIFIED — add linehaul lookup mode
└── api/
    └── shipments.api.ts                   # MODIFIED — add linehaul lookup call

packages/shared/src/shipments/
└── dto.ts                                 # MODIFIED — add linehaul response types

apps/backend/src/database/migrations/
├── 20260319000001-create-linehaul-trips.ts       # NEW
└── 20260319000002-create-linehaul-trip-items.ts   # NEW
```

**Structure Decision**: Extend the existing `shipments` module rather than creating a separate `linehaul` module. Both PDF types share the same import pipeline infrastructure (BullMQ queue, upload tracking, audit events, error handling). The import processor gains template detection logic to dispatch to the appropriate parser.

## Complexity Tracking

> No constitution violations. All new functionality fits within existing patterns.
