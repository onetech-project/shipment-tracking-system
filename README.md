# Shipment Tracking System

**A modern, multi-tenant SaaS platform for managing air shipment data with Google Sheets-to-PostgreSQL synchronization, real-time WebSocket notifications, and enterprise-grade RBAC.**

## Overview

The Shipment Tracking System (`shipment-tracker`) is a full-stack monorepo that enables organizations to manage air shipment data across multiple stations (CGK, SUB, SDA). It synchronizes data from Google Sheets into PostgreSQL in real-time, provides a responsive dashboard UI, and enforces strict role-based access control with comprehensive audit logging.

### Key Features

- **Multi-Tenant Organization Management** — Strict data isolation via Continuation-Local Storage (CLS). All queries auto-scoped to the current user's organization
- **Role-Based Access Control (RBAC)** — Fine-grained permissions with live DB checks. No re-login needed after role/permission changes
- **JWT Authentication with Token Rotation** — Short-lived access tokens (15m), refresh tokens stored as SHA-256 hashes with family-based rotation detection
- **Invitation Workflow** — Email-based onboarding with crypto-random tokens, BullMQ background queue delivery
- **Event-Driven Audit Logging** — Fire-and-forget async writes. Insert-only, immutable audit trail for all domain events
- **Google Sheets → PostgreSQL Sync** — Polling-based sync with header normalization, value coercion, batch upsert (500 chunks), and row-level locking
- **Real-Time WebSocket Notifications** — Socket.IO gateway broadcasts sync updates to all connected clients
- **Responsive Dashboard UI** — Next.js 14 App Router, Tailwind CSS, shadcn/ui components, permission-based navigation

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10, TypeORM 0.3.20, PostgreSQL 16 |
| Queue/Cache | Redis 7 + BullMQ |
| Auth | JWT + Passport, bcrypt (12 rounds) |
| Real-time | Socket.IO |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui |
| Data Fetching | @tanstack/react-query, Axios |
| Forms | react-hook-form + Zod |
| Testing | Jest + supertest (backend), Playwright (frontend E2E) |
| CI/CD | Jenkins Pipeline, Docker + Docker Compose |
| Shared | TypeScript types/enums (NPM workspaces) |

## Monorepo Structure

```
shipment-tracking-system/
├── apps/
│   ├── backend/       # NestJS 10 API (PostgreSQL, TypeORM, JWT, BullMQ, Socket.IO)
│   └── frontend/      # Next.js 14 App Router (React 18, TypeScript, Playwright)
├── packages/
│   └── shared/        # Shared TypeScript types, DTOs, and Permission enum
└── specs/             # Feature specifications and API contracts
```

## Quick Start

### Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL 16
- Redis 7
- (Optional) Docker + Docker Compose for dev container

### Install dependencies

```bash
npm install
```

### Environment setup

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

#### Key Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | — | 64+ char secret for access tokens |
| `JWT_REFRESH_SECRET` | — | 64+ char secret for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiry |
| `LOGIN_MAX_ATTEMPTS` | `5` | Max failed login attempts before lockout |
| `SESSION_INACTIVITY_MINUTES` | `30` | Session inactivity timeout |
| `INVITATION_EXPIRY_HOURS` | `72` | Invitation token expiry |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | Email delivery config |
| `REDIS_HOST` / `REDIS_PORT` | — / `6379` | Redis config for BullMQ |
| `BACKEND_PORT` | `4000` | Backend server port |
| `CORS_ORIGIN` | — | Comma-separated CORS whitelist |
| `GOOGLE_CREDENTIALS_PATH` | — | Path to Google service account JSON |
| `WEBSOCKET_CORS_ORIGIN` | — | WebSocket CORS origin |

#### Key FRONTEND Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:4000` | WebSocket server URL |

### Run database migrations

```bash
npm run migration:run
```

This runs all 18 migrations, including seeding the super-admin user (username: `superadmin`, password: `Admin@1234`) and default permissions.

### Start development servers

```bash
# Run both backend and frontend concurrently
npm run dev
```

Or manually:

```bash
# Terminal 1 - Backend
cd apps/backend && npm run dev

# Terminal 2 - Frontend
cd apps/frontend && npm run dev
```

- Backend: http://localhost:4000 (API prefix: `/api`)
- Frontend: http://localhost:3000

## Commands

```bash
npm run dev                    # Run backend + frontend concurrently
npm run build                  # Build all workspaces
npm test                       # Run Jest tests
npm run lint                   # ESLint
npm run migration:run          # Run pending TypeORM migrations
npm run migration:revert       # Revert last migration
npm run migration:generate -- -n <name>  # Generate migration from schema diff
```

## Testing

### Backend unit tests

```bash
npm test --workspace=apps/backend
```

### Frontend E2E tests (Playwright)

Requires both backend and frontend running. Install browsers first:

```bash
cd apps/frontend && npx playwright install chromium
```

Run tests:

```bash
npm run test:e2e --workspace=apps/frontend
# or with interactive UI
npm run test:e2e:ui --workspace=apps/frontend
```

Reports are generated in `apps/frontend/playwright-report/`.

## API Endpoints

All endpoints are prefixed with `/api`. Global prefix configured in `main.ts`.

### Auth

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| POST | `/auth/login` | Public (throttled 10/min) | Login, returns `{ accessToken, user }`, sets refresh_token cookie |
| POST | `/auth/refresh` | Public (jwt-refresh guard) | Rotate refresh token |
| POST | `/auth/logout` | JWT | Revoke current session |
| POST | `/auth/logout-all` | JWT | Revoke all sessions |
| GET | `/auth/me` | JWT | Get current user |

### Organizations

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/organizations` | read_organization | List all orgs |
| POST | `/organizations` | create_organization | Create org |
| PATCH | `/organizations/:id` | update_organization | Update org |
| DELETE | `/organizations/:id` | delete_organization | Deactivate org |

### Users

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/users` | read_user | List users (org-scoped) |
| GET | `/users/:id` | read_user | Get user |
| POST | `/users` | create_user | Create user |
| PATCH | `/users/:id` | update_user | Update user profile |
| DELETE | `/users/:id` | delete_user | Deactivate user |
| PATCH | `/users/:id/inactivate` | update_user | Inactivate user |
| PATCH | `/users/:id/password` | — (own account) | Change own password |
| PATCH | `/users/:id/password/reset` | update_user | Admin reset password |
| PATCH | `/users/:id/unlock` | update_user | Unlock user account |

### Roles

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET/POST | `/roles` | read_role / create_role | List / Create roles |
| GET/PUT/DELETE | `/roles/:id` | read_role / update_role / delete_role | Get / Update / Delete role |
| PUT | `/roles/:id/permissions` | update_role | Replace all permissions |
| POST | `/roles/assign` | update_role | Assign role to user |
| DELETE | `/roles/:roleId/users/:userId` | update_role | Revoke role from user |

### Permissions

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/permissions` | read_permission | List all permissions |
| GET | `/permissions/:id` | read_permission | Get permission by ID |

### Invitations

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET/POST | `/invitations` | read_invitation / create_invitation | List / Send invitations |
| DELETE | `/invitations/:id` | delete_invitation | Cancel invitation |
| POST | `/invitations/accept` | Public | Accept invitation (creates account) |

### Audit

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/audit` | read_audit | Paginated audit logs (default 50/page) |

### Air Shipments

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/air-shipments/cgk` | JWT | Paginated CGK shipments (ILIKE search, sort) |
| GET | `/air-shipments/sub` | JWT | Paginated SUB shipments |
| GET | `/air-shipments/sda` | JWT | Paginated SDA shipments |
| GET | `/air-shipments/rate` | JWT | Paginated rate per station |
| GET | `/air-shipments/routes` | JWT | Paginated route master |
| PATCH | `/air-shipments/:tableName/:id/lock` | JWT | Lock/unlock shipment row |
| GET/POST/PUT/DELETE | `/air-shipments/google-sheet-config` | JWT | Google Sheet config CRUD |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check `{ status: 'ok' }` |

## Modules

Each backend module has its own README with detailed documentation:

- [Auth](apps/backend/src/modules/auth/README.md) — JWT authentication, token rotation, account lockout
- [Organizations](apps/backend/src/modules/organizations/README.md) — Multi-tenant org management, slug generation
- [Users](apps/backend/src/modules/users/README.md) — User CRUD, password management, account locking
- [Roles](apps/backend/src/modules/roles/README.md) — Role management, permission assignment, user-role mapping
- [Permissions](apps/backend/src/modules/permissions/README.md) — Global permission list, live DB checks
- [Invitations](apps/backend/src/modules/invitations/README.md) — Email invitation workflow, BullMQ queue
- [Audit](apps/backend/src/modules/audit/README.md) — Event-driven audit logging

## Architecture

### Multi-Tenant Scoping

All data queries are automatically scoped to the current user's organization via Continuation-Local Storage (CLS). The `TenantClsInterceptor` stores `organizationId`, `userId`, and `isSuperAdmin` in the CLS context per request. Repositories extending `TenantRepository` auto-filter queries by org — no manual scoping needed.

### JWT Authentication

- **Access tokens**: Short-lived (15m), contain `{ sub, org_id, is_super_admin, roles, permissions }`
- **Refresh tokens**: Long-lived (7d), stored as SHA-256 hashes with `familyId` for rotation detection
- **Cookie**: `httpOnly`, `secure` (prod), `sameSite: strict`, path `/api/auth`
- **Family reuse detection**: Reusing a rotated token revokes the entire family

### RBAC

- `@Authorize(Permission.X)` decorator applies `RbacGuard` per endpoint
- Permission checks performed via live SQL join: `user_roles → role_permissions → permissions`
- Super admin bypasses all permission checks
- Changes take effect immediately — no re-login required

### Google Sheets Sync Pipeline

```
Google Sheets API → Header Normalization → Value Coercion → Diff Detection → Batch Upsert → WebSocket Notification
```

- Fetches all configured sheets via single `batchGet` API call
- Normalizes headers (strip, lowercase, deduplicate)
- Coerces values (empty/errors→null, numbers, booleans, durations, dates)
- Diffs against existing DB rows, skips locked and unchanged rows
- Batch upserts in chunks of 500 (fallback to row-by-row on error)
- Columns not in entity schema → stored in `extra_fields` (JSONB)
- Emits WebSocket `sync:update` event if rows were upserted

### Event-Driven Audit Logging

All modules emit domain events. The `AuditService` subscribes to all events via `@OnEvent()` decorators and writes fire-and-forget to the `audit_logs` table. Writes are non-blocking and do not impact business logic latency.

## Deployment

### CI/CD (Jenkinsfile)

Pipeline stages:
1. **Setup Environment** — resolves branch from `TARGET_ENV` (staging→development, production→main)
2. **Install** — `npm ci`
3. **Build Docker Image** (parallel) — builds backend and frontend images
4. **Run Migration** — copies `.env`, runs TypeORM migrations with rollback on failure
5. **Deploy with Docker Compose** (parallel) — deploys backend and frontend

**Deployment targets:**
- **Production:** `ekasatyapuspita.com`
- **Staging:** `staging.ekasatyapuspita.com`

### Docker Configuration

- **Backend:** `node:24.14.1-slim`, port 4000, TZ=Asia/Jakarta, non-root user (1001)
- **Frontend:** `node:24.14.0-alpine`, port 3000, standalone output, non-root user (nextjs:1001)

### Dev Container

Services: `workspace` (Node.js 24), `postgres:16`, `redis:7`, `mailhog`
Ports: 3000 (frontend), 4000 (backend), 5432 (PostgreSQL), 6379 (Redis), 1025/8025 (MailHog)

## Security

- Password hashing: bcrypt with 12 rounds
- Token storage: SHA-256 hashes (never store raw tokens)
- Token rotation: family-based reuse detection
- Account lockout: configurable max attempts (default 5)
- Session inactivity: auto-expire after 30 min
- Rate limiting: 100 req/min global, 10/min on login
- CORS: whitelist via env var (comma-separated)
- Non-root Docker containers

## Database Schema

17 tables total. See [PRD.md](./PRD.md) for complete schema documentation.

Core tables: `organizations`, `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions`, `refresh_tokens`, `invitations`, `audit_logs`, `air_shipments_cgk`, `air_shipments_sub`, `air_shipments_sda`, `rate_per_station`, `route_master`, `google_sheet_config`, `google_sheet_sheet_config`

## Product Requirements Document

See [PRD.md](./PRD.md) for the comprehensive Product Requirements Document with full system documentation.
