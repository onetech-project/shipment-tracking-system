# Implementation Plan: Google Sheets → PostgreSQL Sync Service

**Branch**: `copilot/add-google-sheets-sync-service` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/004-google-sheets-postgresql-sync/spec.md`

## Summary

Implement a background sync service that continuously polls five Google Sheets tabs every 15 seconds, normalizes and type-coerces cell data, performs row-level change detection against PostgreSQL, and upserts only changed rows. A Socket.IO WebSocket gateway notifies connected browser clients after any cycle that produces upserted rows. Five dedicated dashboard sub-pages (Air Shipments: CGK, SUB, SDA, Rate, Routes) are added to the existing frontend sidebar, each with paginated/sortable tables and a "Live" sync-status indicator.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 LTS  
**Primary Dependencies**: NestJS 10.4, TypeORM 0.3.20, `googleapis` (new), `@nestjs/schedule` (new), `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io` (new), `socket.io-client` (frontend, new)  
**Storage**: PostgreSQL 16.x — five pre-existing tables (`air_shipments_cgk`, `air_shipments_sub`, `air_shipments_sda`, `rate_per_station`, `route_master`) created via migrations; no schema inference by the sync service  
**Testing**: Jest (unit/integration), Playwright (E2E automation) — Playwright mandatory per constitution §VI  
**Target Platform**: Linux server (backend), Web browser (frontend)  
**Project Type**: Web service (monorepo: apps/backend + apps/frontend + packages/shared)  
**Performance Goals**: Full sync cycle for 5 sheets (thousands of rows each) completes within 15 seconds to avoid cycle overlap  
**Constraints**: Single spreadsheet ID; polling only (no webhooks); no auth on WebSocket gateway (Out of Scope)  
**Scale/Scope**: 5 Google Sheets tabs → 5 PostgreSQL tables; 15 s polling interval; one backend instance (no distributed lock needed)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                         | Status  | Notes                                                                                                    |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| §I Monorepo Architecture                          | ✅ PASS | New code in `apps/backend`, `apps/frontend`, `packages/shared` only                                      |
| §II Tech Stack (NestJS/TypeScript/PostgreSQL)     | ✅ PASS | New `air-shipments` NestJS module; TypeORM entities; Next.js frontend pages                              |
| §III Database (migrations, timestamps, indexes)   | ✅ PASS | Five target tables created via migrations with `created_at`, `updated_at`, `last_synced_at`; indexes on unique-key columns |
| §IV DRY/KISS/YAGNI                                | ✅ PASS | Normalizer and coercion are single pure functions; no speculative features; no multi-spreadsheet scope   |
| §V Modular Architecture                           | ✅ PASS | New `AirShipmentsModule`; sync logic isolated; gateway in same module; frontend in `features/air-shipments/` |
| §VI Testing (Unit + Integration + Playwright E2E) | ✅ PASS | Unit: normalizer, coercer, scheduler guard logic; Integration: upsert pipeline; Playwright: dashboard pages + live badge |
| §VII Fail-Safe / Fault-Tolerant                   | ✅ PASS | Empty-sheet retry (FR-008); API errors end cycle without crash (edge case); missing uniqueKey skips sheet |
| §VIII Retryable System                            | ✅ PASS | Per-sheet exponential backoff for empty-data retries (2 s, 4 s, 6 s); cycle-level recovery on next tick |
| §IX Idempotency                                   | ✅ PASS | Change detection ensures no duplicate writes; DB `uniqueKey` column drives upsert idempotently           |
| §X Observability                                  | ✅ PASS | Structured cycle logs: start time, per-sheet stats, cycle duration, lock counts, coercion warnings       |
| §XI Rate Limiting                                 | ✅ PASS | REST endpoints inherit global throttler; single `batchGet` per cycle minimizes Sheets API quota          |
| §XII Event-Driven                                 | ✅ PASS | Socket.IO `sync:update` event after each productive cycle                                                |
| §XIV CI/CD                                        | ✅ PASS | Existing `Dockerfile` and `Jenkinsfile`; no new deployables                                              |
| §XV Security                                      | ✅ PASS | Service-account credentials via env var; read-only scope; REST endpoints behind `JwtAuthGuard`; WS CORS configurable |

**Post-Design Re-check** (after Phase 1):

| Principle | Status  | Notes                                                                     |
| --------- | ------- | ------------------------------------------------------------------------- |
| §III      | ✅ PASS | All five tables include `created_at`, `updated_at`, `last_synced_at`, unique-key index |
| §V        | ✅ PASS | `AirShipmentsModule` encapsulates all sync, gateway, controller, and entity concerns |

## Project Structure

### Documentation (this feature)

```text
specs/004-google-sheets-postgresql-sync/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── air-shipments.api.md     # REST endpoints for dashboard data
│   └── sync-notifications.ws.md # WebSocket notification contract
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created here)
```

### Source Code (repository root)

```text
# Backend — new air-shipments module
apps/backend/src/
├── modules/
│   └── air-shipments/                        # NEW module
│       ├── air-shipments.module.ts           # Module declaration
│       ├── air-shipments.controller.ts       # REST endpoints (FR-035–FR-037)
│       ├── air-shipments.service.ts          # Sync cycle orchestrator
│       ├── sync-notification.gateway.ts      # Socket.IO WebSocket gateway (FR-031–FR-034)
│       ├── scheduler.service.ts              # @Interval scheduler + concurrency guard (FR-001–FR-005)
│       ├── sheets.service.ts                 # Google Sheets API client (FR-006–FR-008)
│       ├── normalizer.ts                     # Pure header normalizer (FR-012–FR-015)
│       ├── coercer.ts                        # Pure type coercer (FR-016–FR-021)
│       ├── config/
│       │   └── sheets.example.json           # Example sheet config (FR-009–FR-011)
│       ├── dto/
│       │   ├── air-shipment-query.dto.ts     # Pagination + sort query params
│       │   └── sync-notification.dto.ts      # Notification payload shape
│       └── entities/
│           ├── air-shipment-cgk.entity.ts    # Maps air_shipments_cgk
│           ├── air-shipment-sub.entity.ts    # Maps air_shipments_sub
│           ├── air-shipment-sda.entity.ts    # Maps air_shipments_sda
│           ├── rate-per-station.entity.ts    # Maps rate_per_station
│           └── route-master.entity.ts        # Maps route_master
├── database/
│   └── migrations/
│       ├── XXXXXX-create-air-shipments-cgk.ts    # NEW
│       ├── XXXXXX-create-air-shipments-sub.ts    # NEW
│       ├── XXXXXX-create-air-shipments-sda.ts    # NEW
│       ├── XXXXXX-create-rate-per-station.ts     # NEW
│       └── XXXXXX-create-route-master.ts         # NEW
└── app.module.ts                                 # MODIFIED — import AirShipmentsModule

# Frontend — new Air Shipments feature
apps/frontend/src/
├── features/
│   └── air-shipments/                       # NEW feature area
│       ├── hooks/
│       │   ├── useSyncNotification.ts       # Socket.IO connect/disconnect + state
│       │   └── useAirShipments.ts           # Data fetching + pagination + sort
│       ├── components/
│       │   ├── AirShipmentTable.tsx         # Sortable paginated table
│       │   ├── SyncStatusBadge.tsx          # "Live" badge + last-synced time
│       │   └── TableSkeleton.tsx            # Loading skeleton
│       └── types.ts                         # Shared frontend types
├── app/
│   └── (dashboard)/
│       └── air-shipments/
│           ├── layout.tsx                   # Air Shipments layout
│           ├── cgk/page.tsx                 # CGK sub-page
│           ├── sub/page.tsx                 # SUB sub-page
│           ├── sda/page.tsx                 # SDA sub-page
│           ├── rate/page.tsx                # Rate sub-page
│           └── routes/page.tsx              # Routes sub-page
└── components/
    └── sidebar/                             # MODIFIED — add Air Shipments nav item

# E2E tests
apps/frontend/e2e/
└── air-shipments/
    ├── sync-dashboard.spec.ts               # Playwright: sync flow + live badge

# Shared types
packages/shared/src/
└── air-shipments/
    └── index.ts                             # Shared payload types (SyncNotification)
```

**Structure Decision**: Monorepo web application (Option 2). Backend extends existing NestJS module tree under `src/modules/air-shipments/`. Frontend uses Next.js App Router `(dashboard)/air-shipments/` segment. No new deployment units.

## Complexity Tracking

_No constitution violations requiring justification._
