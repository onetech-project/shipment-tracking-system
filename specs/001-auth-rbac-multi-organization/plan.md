# Implementation Plan: Authentication & Authorization System

**Branch**: `001-auth-rbac-multi-organization` | **Date**: 2026-03-14 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-auth-rbac-multi-organization/spec.md`

## Summary

Implement a multi-tenant RBAC authentication and authorization system for the Shipment Tracking System. The backend will be built as a NestJS module suite (`auth`, `organizations`, `users`, `roles`, `permissions`, `invitations`, `audit`) within the existing monorepo. The frontend will provide corresponding pages via Next.js. PostgreSQL persists all entities with TypeORM migrations. JWT access tokens (short-lived, stateless) and database-stored refresh tokens handle sessions. RBAC is enforced via NestJS Guards and custom decorators at the API and service layers.

## Technical Context

**Language/Version**: TypeScript 5.x  
**Primary Dependencies**: NestJS 10.x (backend), Next.js 14.x (frontend), TypeORM, Passport.js, @nestjs/jwt, @nestjs/passport, @nestjs/throttler, bcrypt, nodemailer  
**Storage**: PostgreSQL 16 (primary), in-process token blacklist or DB-backed refresh token table  
**Testing**: Jest + Supertest (backend unit + integration), Jest (frontend)  
**Target Platform**: Linux server (Docker), Web browser  
**Project Type**: Web application — fullstack monorepo (`/apps/backend`, `/apps/frontend`, `/packages/shared`)  
**Performance Goals**: <200ms p95 for login/token-refresh endpoints; RBAC guard overhead <5ms per request  
**Constraints**: Multi-tenant isolation mandatory; no cross-org data access; stateless access tokens; refresh tokens revocable; invitation links single-use  
**Scale/Scope**: Multiple organizations (~10–1000 users/org), platform-wide Super Admin

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Repository Architecture (Monorepo `/apps`, `/packages/shared`) | ✅ PASS | Auth modules placed in `apps/backend/src/modules/auth`, `organizations`, `users`, `roles`, `permissions`, `invitations`, `audit`. Shared DTOs/types in `packages/shared/src/auth`. |
| II. Technology Stack (NestJS + TypeScript backend, Next.js frontend) | ✅ PASS | Backend: NestJS 10, TypeScript. Frontend: Next.js 14, TypeScript. |
| III. Database (PostgreSQL, migrations, `created_at`/`updated_at`) | ✅ PASS | All tables include `created_at`, `updated_at`. Schema changes via TypeORM migrations. |
| IV. Core Engineering Principles (DRY, KISS, YAGNI) | ✅ PASS | Single RBAC guard reused across all modules. Permission check extracted to shared service. No speculative features. |
| V. Modular Architecture (Feature-Based NestJS Modules) | ✅ PASS | Each domain (auth, users, organizations, roles, permissions, invitations, audit) is its own NestJS module. Cross-module via injected services only. |
| VI. Testing Requirements (Unit + Integration) | ✅ PASS | Unit tests for guards, services, password hashing, token logic. Integration tests for login flow, RBAC enforcement, invitation flow. |
| VII. Fail-Safe Design | ✅ PASS | Auth failures return structured errors. Locked accounts return clear messages. Invalid tokens return 401, not 500. |
| VIII. Retryable System | ✅ PASS | Invitation email delivery must support retry with exponential backoff. |
| IX. Idempotency | ✅ PASS | Invitation token redemption is idempotent (single-use enforced at DB level with unique constraint + used_at timestamp). |
| X. Observability (Structured Logging, Metrics) | ✅ PASS | Audit log captures all critical events. Structured logs on all auth operations include `request_id`, `user_id`, `timestamp`. |
| XI. Rate Limiting | ✅ PASS | Login and invitation endpoints protected by `@nestjs/throttler`. |
| XII. Event-Driven Readiness | ✅ PASS | Domain events: `user.invited`, `user.activated`, `auth.login`, `auth.logout`, `org.created`, `org.deactivated` designed for future async processing. |
| XIII. Cost Efficiency | ✅ PASS | Stateless JWT access tokens avoid Redis/session DB for every request. Refresh tokens stored in PostgreSQL (no additional managed service). |
| XIV. CI/CD (Dockerfile + Jenkinsfile) | ✅ PASS | `Jenkinsfile` in repo root. `apps/backend/Dockerfile` and `apps/frontend/Dockerfile` per service. No new infra required. |
| XV. Security Baseline | ✅ PASS | bcrypt for passwords, JWT signing secrets via env vars, no secrets in repo, input validation via class-validator DTOs, RBAC enforced at API + service layer. |
| XVI. Documentation | ✅ PASS | `quickstart.md` covers setup. `contracts/` contains full API specification. Module READMEs required per constitution. |
| XVII. OCR/QR Reliability | ✅ N/A | Auth feature does not touch OCR/QR pipelines. |

**Constitution Gate: PASS** — No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-rbac-multi-organization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── auth.api.md
│   ├── organizations.api.md
│   ├── users.api.md
│   ├── roles.api.md
│   ├── permissions.api.md
│   └── invitations.api.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
Jenkinsfile                     # CI/CD pipeline (repo root)

apps/backend/
├── src/
│   ├── modules/
│   │   ├── auth/               # Login, logout, token refresh, guards, strategies
│   │   ├── organizations/      # Org CRUD, deactivation
│   │   ├── users/              # User CRUD, role assignment, unlock
│   │   ├── roles/              # Role CRUD, permission assignment
│   │   ├── permissions/        # Permission master data
│   │   ├── invitations/        # Invite, verify, activate
│   │   └── audit/              # Audit log write/read
│   ├── common/
│   │   ├── guards/             # JwtAuthGuard, RbacGuard
│   │   ├── decorators/         # @RequirePermission(), @CurrentUser()
│   │   └── filters/            # Global exception filters
│   └── database/
│       └── migrations/         # TypeORM migration files
└── Dockerfile

apps/frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/          # Login page
│   │   ├── (dashboard)/
│   │   │   ├── organizations/  # Org management pages
│   │   │   ├── users/          # User management pages
│   │   │   ├── roles/          # Roles management pages
│   │   │   ├── permissions/    # Permissions management pages
│   │   │   └── invitations/    # Invite user pages
│   │   └── invitations/
│   │       └── accept/         # Accept invite page (public)
│   ├── features/               # Feature co-located logic (hooks, actions, components)
│   │   ├── auth/
│   │   ├── organizations/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── permissions/
│   │   └── invitations/
│   └── shared/
│       └── api/                # Typed API client (uses shared DTOs)
└── Dockerfile

packages/shared/
└── src/
    └── auth/                   # Shared DTOs, permission name constants, response types
```

**Structure Decision**: Option 2 (Web application fullstack) as mandated by constitution. Auth modules follow the existing feature-based NestJS module layout under `apps/backend/src/modules/`. TypeORM migrations live under `apps/backend/src/database/migrations/`. Each app (`backend`, `frontend`) has its own `Dockerfile`; a single `Jenkinsfile` sits at the repo root. Frontend uses Next.js App Router (`src/app/`) with route groups for layout segmentation; feature logic (hooks, server actions, components) is co-located under `src/features/`. Shared DTOs live in `packages/shared/src/auth/` to avoid duplication between backend and frontend.

## Complexity Tracking

*No constitution violations — table left intentionally empty.*
