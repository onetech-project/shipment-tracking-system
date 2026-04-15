# Product Requirements Document (PRD) — Shipment Tracking System

> **Version:** 1.0  
> **Last Updated:** 2026-04-15  
> **Status:** Legacy codebase — comprehensive audit

---

## 1. Product Overview

**Product Name:** Shipment Tracking System (`shipment-tracker`)  
**Type:** Full-stack multi-tenant SaaS platform  
**Repository Type:** NPM workspaces monorepo  
**Primary Domain:** Logistics & shipment tracking with Google Sheets-to-PostgreSQL synchronization

The Shipment Tracking System is a modern, multi-tenant platform that enables organizations to manage air shipment data across multiple stations (CGK, SUB, SDA). It synchronizes data from Google Sheets into PostgreSQL tables in real-time, provides a responsive dashboard UI, and enforces strict role-based access control with comprehensive audit logging.

---

## 2. Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│                      Monorepo (npm workspaces)               │
├──────────────────────┬───────────────────┬───────────────────┤
│  apps/backend/       │  apps/frontend/   │  packages/shared/ │
│  NestJS 10           │  Next.js 14       │  TypeScript types │
│  PostgreSQL/TypeORM  │  React 18         │  DTOs & enums     │
│  BullMQ/Redis        │  Tailwind/shadcn  │                   │
│  Socket.IO           │  Playwright E2E   │                   │
└──────────────────────┴───────────────────┴───────────────────┘
```

### Infrastructure
- **Database:** PostgreSQL 16 (primary data store)
- **Cache/Queue:** Redis 7 (BullMQ background jobs)
- **External API:** Google Sheets API (service account, readonly)
- **Email:** SMTP via Nodemailer (MailHog in dev)
- **Deployment:** Docker + Docker Compose, Jenkins CI/CD
- **Timezone:** Asia/Jakarta

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Framework | NestJS | 10.x |
| ORM | TypeORM | 0.3.20 |
| Database | PostgreSQL | 16 |
| Queue/Cache | Redis + BullMQ | 7.x |
| Auth | JWT + Passport | — |
| Real-time | Socket.IO | — |
| HTTP Validation | class-validator + class-transformer | — |
| Config Validation | Joi | — |
| Email | Nodemailer + Handlebars | — |
| CLS | nestjs-cls | — |
| Rate Limiting | @nestjs/throttler | 100 req/min |
| Frontend Framework | Next.js (App Router) | 14.x |
| UI Library | React | 18 |
| Styling | Tailwind CSS + shadcn/ui | — |
| Data Fetching | @tanstack/react-query | — |
| HTTP Client | Axios | — |
| Real-time Client | socket.io-client | — |
| Forms | react-hook-form + Zod | — |
| E2E Testing | Playwright | — |
| Unit Testing | Jest + supertest | — |
| CI/CD | Jenkins Pipeline | — |
| Containerization | Docker + Docker Compose | — |
| Shared Package | TypeScript types/enums | 5.x |

---

## 4. Core Features

### 4.1 Authentication & Session Management

**Description:** JWT-based authentication with refresh token rotation, account lockout, and session management.

**Key Details:**
- Access tokens: short-lived (default 15m), contain `{ sub, org_id, is_super_admin, roles, permissions }`
- Refresh tokens: long-lived (default 7d), stored as SHA-256 hashes in DB with `familyId` for rotation detection
- Cookie: `httpOnly`, `secure` (prod), `sameSite: strict`, path `/api/auth`
- Token family reuse detection — detects and prevents token replay attacks
- Account lockout after configurable failed attempts (default: 5)
- Session inactivity timeout (default: 30 min)
- `POST /api/auth/login` — throttled 10/min, returns `{ accessToken, user }`
- `POST /api/auth/refresh` — rotates refresh token
- `POST /api/auth/logout` — revokes single token
- `POST /api/auth/logout-all` — revokes all sessions
- `GET /api/auth/me` — returns current user info

### 4.2 Multi-Tenant Organization Management

**Description:** Organizations are isolated tenants. All data queries are scoped to the current user's organization via Continuation-Local Storage (CLS).

**Key Details:**
- Table `organizations`: `{ id, name (unique), slug (unique), address, isActive, createdAt, updatedAt }`
- Auto-generated URL-safe slugs with uniqueness enforcement
- Deactivation revokes all refresh tokens for the organization's users
- CRUD via `GET/POST/PATCH/DELETE /api/organizations`
- Permission-gated: `read/create/update/delete_organization`

### 4.3 User Management

**Description:** Users belong to organizations via profile and user_role join tables. Supports lifecycle management including password changes, account locking, and inactivation.

**Key Details:**
- Table `users`: `{ id, username (unique), password (bcrypt 12 rounds), isSuperAdmin, lastLoginAt, failedAttempts, isLocked, lockedAt, requirePasswordReset, isActive, createdAt, updatedAt }`
- Table `profiles`: `{ id, userId, organizationId, name, email, phone, avatarUrl, createdAt, updatedAt }`
- Super admin sees all users; regular users see only their org's users
- Admin can reset passwords, unlock accounts, inactivate users
- Password change revokes all existing sessions
- CRUD via `GET/POST/PATCH/DELETE /api/users`
- Additional: `PATCH /api/users/:id/inactivate`, `PATCH /api/users/:id/password`, `PATCH /api/users/:id/password/reset`, `PATCH /api/users/:id/unlock`

### 4.4 Role-Based Access Control (RBAC)

**Description:** Fine-grained permission system with roles, role-permission mappings, and user-role assignments. Live DB checks — no re-login needed after permission changes.

**Key Details:**
- Table `roles`: `{ id, name, description, organizationId, isSystem, isDefault, createdAt, updatedAt }`. Unique on `[name, organizationId]`
- Table `permissions`: `{ id, name (unique, format: action.module), description, resource, action }`
- Table `user_roles`: composite PK `{ userId, roleId }`, `{ organizationId, assignedAt, assignedBy }`
- Table `role_permissions`: composite PK `{ roleId, permissionId }`, `{ assignedAt, assignedBy }`
- System roles cannot be modified or deleted
- Permission checks performed live via SQL join: `user_roles → role_permissions → permissions`
- Super admin bypasses all permission checks
- `@Authorize(Permission.X)` decorator applies RbacGuard per endpoint
- CRUD via `GET/POST/PUT/DELETE /api/roles`, `PUT /api/roles/:id/permissions`, `POST /api/roles/assign`, `DELETE /api/roles/:roleId/users/:userId`

### 4.5 Invitation System

**Description:** Email-based invitation workflow for onboarding users into organizations. Uses BullMQ background queue for email delivery.

**Key Details:**
- Table `invitations`: `{ id, organizationId, email, invitedBy, roleId, invitedName, tokenHash (unique), status (pending|accepted|expired|revoked), expiresAt, usedAt, createdAt }`
- Crypto-random token stored as SHA-256 hash
- Configurable expiry (default: 72 hours)
- Email sent via BullMQ `email` queue processor
- Accept flow: validates token → creates User (bcrypt) → creates Profile → assigns Role → marks accepted
- `GET/POST /api/invitations`, `DELETE /api/invitations/:id`, `POST /api/invitations/accept` (public)

### 4.6 Audit Logging

**Description:** Comprehensive, event-driven audit trail for all system actions. Fire-and-forget async writes — non-blocking to business operations.

**Key Details:**
- Table `audit_logs`: `{ id, actorId, action, resourceType, resourceId, metadata (JSONB), ipAddress, userAgent, createdAt }`
- Insert-only (no updates or deletes)
- Subscribes to ALL domain events via `@OnEvent()`:
  - **Auth:** `auth.login`, `auth.login_failed`, `auth.logout`, `auth.logout_all`
  - **Organization:** `organization.created`, `organization.updated`, `organization.deactivated`
  - **User:** `user.created`, `user.updated`, `user.deactivated`, `user.password_changed`, `user.password_reset`, `user.unlocked`
  - **Role:** `role.created`, `role.updated`, `role.deleted`, `role.assigned`, `role.revoked`, `role.permissions_updated`
  - **Invitation:** `invitation.created`, `invitation.cancelled`
  - **Google Sheet Config:** `google_sheet_config.created`, `google_sheet_config.updated`, `google_sheet_config.deleted`
  - **Shipment Row:** `shipment_row.lock_changed`
- Paginated query: `GET /api/audit` (default 50/page, returns `[AuditLog[], total]`)

### 4.7 Google Sheets → PostgreSQL Sync

**Description:** Polling-based sync pipeline that fetches data from configured Google Sheets, normalizes/coerces values, diffs against existing DB rows, and upserts changes in batches.

**Key Details:**

#### Sync Pipeline Flow
```
Google Sheets API → Header Normalization → Value Coercion → Diff Detection → Batch Upsert → WebSocket Notification
```

#### Tables Synchronized
| Table | Entity | Unique Key |
|-------|--------|-----------|
| `air_shipments_cgk` | AirShipmentCgk | `[lt_number, to_number]` |
| `air_shipments_sub` | AirShipmentSub | `[lt_number, to_number]` |
| `air_shipments_sda` | AirShipmentSda | `[lt_number, to_number]` |
| `rate_per_station` | RatePerStation | `[origin_dc, destination_dc]` |
| `route_master` | RouteMaster | `[concat]` |

#### Google Sheet Configuration
- Table `google_sheet_config`: `{ id, sheetLink, sheetId, syncInterval (seconds, default 15), enabled, createdAt, updatedAt }`
- Table `google_sheet_sheet_config`: `{ id, sheetName, tableName, headerRow, uniqueKey (JSONB), skipNullCols }`
- One-to-many: one Google Sheet config → many sheet-level configs

#### Header Normalization
- Replaces newlines with spaces
- Strips non-alphanumeric characters
- Collapses spaces to underscores
- Lowercases everything
- Handles duplicates: suffixes `_2`, `_3`, etc.

#### Value Coercion
1. Empty cells → `null`
2. Spreadsheet errors (`#REF!`, `#VALUE!`, `#N/A`, `#NAME?`, `#DIV/0!`) → `null`
3. Numeric strings → `Number`
4. Boolean strings → `boolean`
5. Duration strings (`"N days, HH:MM:SS"`) → total seconds
6. Date strings (`dd-mmm-yyyy`, `dd/mm/yyyy hh:mm`, ISO 8601) → `Date`
7. Fallback → plain string

#### Sync Cycle (`runSyncCycle()`)
1. Fetches all configured sheets via single `batchGet` API call
2. For each sheet: normalizes headers, coerces values
3. Skips empty rows and rows with missing unique keys
4. Compares normalized values against existing DB rows
5. Skips locked rows (`is_locked = true`)
6. Skips unchanged rows
7. Batch upserts in chunks of 500 (fallback to row-by-row on error)
8. Error classification: `UNIQUE_CONSTRAINT`, `COLUMN_MISMATCH`, `UNKNOWN`
9. Columns not in entity schema → stored in `extra_fields` (JSONB)
10. Emits WebSocket `sync:update` event if `totalUpserted > 0`

#### Scheduler
- Polling interval: configurable per sheet config (default: 15 seconds)
- Concurrency-safe: skips tick if sync still running
- Auto-pauses after 2 consecutive skips, resumes after in-flight cycle completes
- Hot-reloads config on `gsheetConfig.updated` event
- Graceful shutdown via `OnApplicationShutdown`

#### Row Locking
- `PATCH /api/air-shipments/:tableName/:id/lock` — sets `is_locked` flag
- Locked rows are excluded from sync upserts
- Emits `shipment_row.lock_changed` audit event

#### Pagination & Search
- All 5 shipment tables support paginated queries
- ILIKE search on direct columns AND `extra_fields` JSONB
- Sorting supported on regular and JSONB columns

#### Google Sheet Config CRUD
- `GET /api/air-shipments/google-sheet-config`
- `POST /api/air-shipments/google-sheet-config`
- `PUT /api/air-shipments/google-sheet-config/:id`
- `DELETE /api/air-shipments/google-sheet-config/:id`
- Permission-gated: `read/create/update/delete_google_sheet_config`

### 4.8 Real-Time Notifications (WebSocket)

**Description:** Socket.IO WebSocket gateway broadcasts sync updates to all connected frontend clients.

**Key Details:**
- Gateway CORS from `WEBSOCKET_CORS_ORIGIN` env var
- Event: `sync:update` → payload `{ affectedTables: string[], totalUpserted: number, syncedAt: string }`
- Frontend uses `socket.io-client` with auto-refresh when sync affects current table
- Connection/disconnection logged to console

### 4.9 Dashboard UI

**Description:** Responsive Next.js 14 App Router dashboard with permission-based navigation, real-time sync status, and data tables.

#### Routing Structure
```
/login                              — Login page
/invite/accept?token=xxx           — Accept invitation
/dashboard                          — Dashboard home
/air-shipments/cgk                  — CGK shipments table
/air-shipments/sub                  — SUB shipments table
/air-shipments/sda                  — SDA shipments table
/air-shipments/rate                 — Rate per station table
/air-shipments/routes               — Route master table
/air-shipments/google-sheet-config  — Google Sheets config panel
/audit                              — Audit logs
/settings/invitations               — Invitations management
/settings/organizations             — Organizations management
/settings/roles                     — Roles management
/settings/users                     — Users management
/settings/permissions               — Permissions management
/settings/forbidden                 — 403 forbidden page
```

#### Navigation (permission-based visibility)
- **Always visible:** Dashboard, Air Shipments (CGK, SUB, SDA, Rate, Routes)
- **Admin+:** Settings section (Organizations, Roles, Users, Invitations)
- **Super-admin only:** Permissions, Audit Logs

#### Air Shipment Table Component
- Frozen/sticky columns: `date`, `lt_number`, `to_number`
- Sortable headers with indicators
- Cell formatting: dates via moment, datetime formatting, checkbox for `is_locked`
- Pagination controls
- Dynamic column resolution from `extra_fields` JSONB keys

#### Sync Status Badge
- Live/Offline indicator with pulse animation
- Displays last sync relative time
- Shows affected tables from last sync

---

## 5. Database Schema

### Core Tables (17 total)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Multi-tenant orgs | id, name, slug, address, isActive |
| `users` | User accounts | id, username, password, isSuperAdmin, isLocked, isActive |
| `profiles` | User org profiles | id, userId, orgId, name, email, phone, avatarUrl |
| `roles` | RBAC roles | id, name, orgId, isSystem, isDefault |
| `permissions` | RBAC permissions | id, name (action.module), resource, action |
| `user_roles` | User-role mapping | userId, roleId, orgId (composite PK: userId+roleId) |
| `role_permissions` | Role-permission mapping | roleId, permissionId (composite PK: roleId+permissionId) |
| `refresh_tokens` | JWT refresh tokens | id, userId, tokenHash, familyId, expiresAt, revokedAt |
| `invitations` | Email invitations | id, orgId, email, tokenHash, status, expiresAt, roleId |
| `audit_logs` | Audit trail | id, actorId, action, resourceType, metadata (JSONB) |
| `air_shipments_cgk` | CGK shipment data | id, lt_number, to_number, is_locked, extra_fields (JSONB) |
| `air_shipments_sub` | SUB shipment data | Same as CGK |
| `air_shipments_sda` | SDA shipment data | Same as CGK |
| `rate_per_station` | Rate pricing | id, origin_dc, destination_dc, is_locked, extra_fields (JSONB) |
| `route_master` | Route definitions | id, concat, is_locked, extra_fields (JSONB) |
| `google_sheet_config` | Sheet sync config | id, sheetLink, sheetId, syncInterval, enabled |
| `google_sheet_sheet_config` | Per-sheet config | id, sheetName, tableName, uniqueKey (JSONB), skipNullCols |

### Migrations (18 total)

All migrations are in `apps/backend/src/database/migrations/`:
1. `20260314000001` — Create organizations table
2. `20260314000002` — Create users table (with failed_attempts check constraint)
3. `20260314000003` — Create profiles table
4. `20260314000004` — Create roles + permissions tables (with name format CHECK constraint)
5. `20260314000005` — Create user_roles + role_permissions join tables
6. `20260314000006` — Create refresh_tokens table
7. `20260314000007` — Create invitations table
8. `20260314000008` — Create audit_logs table
9. `20260314000009` — Create indexes
10. `20260314000010` — Seed super-admin (username: `superadmin`, password: `Admin@1234`)
11. `20260314000011` — Fix schema mismatches (slug, description, is_system, invited_name, profile fields)
12. `20260408000001` — Create air_shipments_cgk table
13. `20260408000002` — Create air_shipments_sub table
14. `20260408000003` — Create air_shipments_sda table
15. `20260408000004` — Create rate_per_station table
16. `20260408000005` — Create route_master table
17. `20260410000100` — Create google_sheet_config + google_sheet_sheet_config (with seed data)
18. `20260412000001` — Add extra_fields JSONB to all air shipment tables

---

## 6. API Endpoints

### Auth
| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| POST | `/api/auth/login` | Public (throttled 10/min) | Login, returns accessToken + user, sets refresh_token cookie |
| POST | `/api/auth/refresh` | Public (jwt-refresh guard) | Rotate refresh token |
| POST | `/api/auth/logout` | JWT | Revoke current session |
| POST | `/api/auth/logout-all` | JWT | Revoke all sessions |
| GET | `/api/auth/me` | JWT | Get current user |

### Organizations
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/organizations` | read_organization | List all orgs |
| GET | `/api/organizations/:id` | read_organization | Get org by ID |
| POST | `/api/organizations` | create_organization | Create org |
| PATCH | `/api/organizations/:id` | update_organization | Update org |
| DELETE | `/api/organizations/:id` | delete_organization | Deactivate org |

### Users
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/users` | read_user | List users (org-scoped) |
| GET | `/api/users/:id` | read_user | Get user |
| POST | `/api/users` | create_user | Create user |
| PATCH | `/api/users/:id` | update_user | Update user profile |
| DELETE | `/api/users/:id` | delete_user | Deactivate user |
| PATCH | `/api/users/:id/inactivate` | update_user | Inactivate user |
| PATCH | `/api/users/:id/password` | — (own account) | Change own password |
| PATCH | `/api/users/:id/password/reset` | update_user | Admin reset password |
| PATCH | `/api/users/:id/unlock` | update_user | Unlock user account |

### Roles
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/roles` | read_role | List roles (org-scoped) |
| GET | `/api/roles/:id` | read_role | Get role with permissions |
| POST | `/api/roles` | create_role | Create role |
| PUT | `/api/roles/:id` | update_role | Update role |
| DELETE | `/api/roles/:id` | delete_role | Delete role (not system roles) |
| PUT | `/api/roles/:id/permissions` | update_role | Replace all permissions |
| POST | `/api/roles/assign` | update_role | Assign role to user |
| DELETE | `/api/roles/:roleId/users/:userId` | update_role | Revoke role from user |

### Permissions
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/permissions` | read_permission | List all permissions |
| GET | `/api/permissions/:id` | read_permission | Get permission by ID |

### Invitations
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/invitations` | read_invitation | List invitations (org-scoped) |
| POST | `/api/invitations` | create_invitation | Send invitation |
| DELETE | `/api/invitations/:id` | delete_invitation | Cancel invitation |
| POST | `/api/invitations/accept` | Public | Accept invitation (creates account) |

### Audit
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/audit` | read_audit | Paginated audit logs (default 50/page) |

### Air Shipments
| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/api/air-shipments/cgk` | JWT | Paginated CGK shipments (ILIKE search, sort) |
| GET | `/api/air-shipments/sub` | JWT | Paginated SUB shipments |
| GET | `/api/air-shipments/sda` | JWT | Paginated SDA shipments |
| GET | `/api/air-shipments/rate` | JWT | Paginated rate per station |
| GET | `/api/air-shipments/routes` | JWT | Paginated route master |
| PATCH | `/api/air-shipments/:tableName/:id/lock` | JWT | Lock/unlock shipment row |
| GET | `/api/air-shipments/google-sheet-config` | JWT | List sheet configs |
| POST | `/api/air-shipments/google-sheet-config` | JWT | Create sheet config |
| PUT | `/api/air-shipments/google-sheet-config/:id` | JWT | Update sheet config |
| DELETE | `/api/air-shipments/google-sheet-config/:id` | JWT | Delete sheet config |

### Health
| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/api/health` | Public | Health check `{ status: 'ok' }` |

---

## 7. Permission Enum (Complete List)

All permissions follow format `<action>.<module>`:

| Permission | Resource | Action |
|------------|----------|--------|
| `read.shipment` | shipment | read |
| `create.shipment` | shipment | create |
| `update.shipment` | shipment | update |
| `delete.shipment` | shipment | delete |
| `read.user` | user | read |
| `create.user` | user | create |
| `update.user` | user | update |
| `delete.user` | user | delete |
| `read.role` | role | read |
| `create.role` | role | create |
| `update.role` | role | update |
| `delete.role` | role | delete |
| `read.permission` | permission | read |
| `create.permission` | permission | create |
| `update.permission` | permission | update |
| `delete.permission` | permission | delete |
| `read.organization` | organization | read |
| `create.organization` | organization | create |
| `update.organization` | organization | update |
| `delete.organization` | organization | delete |
| `read.invitation` | invitation | read |
| `create.invitation` | invitation | create |
| `update.invitation` | invitation | update |
| `delete.invitation` | invitation | delete |
| `read.audit` | audit | read |
| `read.google_sheet_config` | google_sheet_config | read |
| `create.google_sheet_config` | google_sheet_config | create |
| `update.google_sheet_config` | google_sheet_config | update |
| `delete.google_sheet_config` | google_sheet_config | delete |

---

## 8. Environment Variables

### Backend (`apps/backend/.env`)

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
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_PORT` | — | SMTP server port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `REDIS_HOST` | — | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `APP_URL` | — | Application base URL |
| `BACKEND_PORT` | `4000` | Backend server port |
| `CORS_ORIGIN` | — | Comma-separated CORS whitelist |
| `GOOGLE_CREDENTIALS_PATH` | — | Path to Google service account JSON |
| `WEBSOCKET_CORS_ORIGIN` | — | WebSocket CORS origin |
| `SHIPMENT_IMPORT_MAX_FILE_MB` | `10` | Max file size for imports |
| `SHIPMENT_IMPORT_CONCURRENCY` | `3` | Concurrent import workers |
| `SHIPMENT_ID_REGEX` | — | Regex for shipment ID validation |

### Frontend (`apps/frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:4000` | WebSocket server URL |

---

## 9. Deployment

### CI/CD (Jenkinsfile)

**Pipeline stages:**
1. **Debug Params** — logs pipeline parameters
2. **Setup Environment** — resolves branch from `TARGET_ENV` (staging→development, production→main), sets Docker image tags, compose directory (`/var/sts-app/{env}`), API/WS URLs
3. **Checkout** — Git checkout from SCM
4. **Install** — `npm ci`
5. **Build Docker Image** (parallel) — builds `sts-backend:staging|production` and `sts-frontend:staging|production`
6. **Run Migration** — copies `.env`, runs TypeORM migrations with rollback on failure
7. **Deploy with Docker Compose** (parallel) — deploys backend and frontend via `docker compose up -d`

**Deployment targets:**
- **Production:** `ekasatyapuspita.com`
- **Staging:** `staging.ekasatyapuspita.com`

### Docker Configuration

**Backend:**
- Base: `node:24.14.1-slim`
- Installs: `tzdata`, `postgresql-client`, `redis-tools`
- Timezone: `Asia/Jakarta`
- Exposes: `4000`
- User: non-root (1001)

**Frontend:**
- 3-stage build: deps → builder → production
- Base: `node:24.14.0-alpine` (production)
- Build args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`
- Output: standalone `server.js`
- Exposes: `3000`
- User: non-root (nextjs:1001)

### Dev Container

Services: `workspace` (Node.js 24), `postgres:16`, `redis:7`, `mailhog`
Ports: 3000 (frontend), 4000 (backend), 5432 (PostgreSQL), 6379 (Redis), 1025/8025 (MailHog)

---

## 10. Project Structure

```
shipment-tracking-system/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── app.controller.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   │   ├── public.decorator.ts
│   │   │   │   │   ├── authorize.decorator.ts
│   │   │   │   │   └── current-user.decorator.ts
│   │   │   │   ├── guards/
│   │   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   │   └── rbac.guard.ts
│   │   │   │   ├── filters/
│   │   │   │   │   └── http-exception.filter.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── tenant-cls.interceptor.ts
│   │   │   │   ├── repositories/
│   │   │   │   │   └── tenant.repository.ts
│   │   │   │   └── utils/
│   │   │   │       └── slug.util.ts
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts
│   │   │   │   └── migrations/          (18 migration files)
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       ├── organizations/
│   │   │       ├── users/
│   │   │       ├── roles/
│   │   │       ├── permissions/          (@Global())
│   │   │       ├── invitations/
│   │   │       ├── audit/
│   │   │       └── air-shipments/
│   │   │           ├── entities/
│   │   │           ├── dto/
│   │   │           ├── config/
│   │   │           ├── sheets.service.ts
│   │   │           ├── scheduler.service.ts
│   │   │           ├── sync-notification.gateway.ts
│   │   │           ├── coercer.ts
│   │   │           └── normalizer.ts
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   └── nest-cli.json
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── (auth)/
│       │   │   │   ├── layout.tsx
│       │   │   │   └── login/page.tsx
│       │   │   ├── (dashboard)/
│       │   │   │   ├── layout.tsx
│       │   │   │   └── dashboard/page.tsx
│       │   │   └── invite/accept/page.tsx
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   └── auth.context.tsx
│       │   │   └── air-shipments/
│       │   │       ├── types.ts
│       │   │       ├── columns.config.ts
│       │   │       ├── hooks/
│       │   │       │   ├── useAirShipments.ts
│       │   │       │   └── useSyncNotification.ts
│       │   │       └── components/
│       │   │           ├── AirShipmentTable.tsx
│       │   │           ├── GoogleSheetConfigPanel.tsx
│       │   │           └── SyncStatusBadge.tsx
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── dashboard-shell.tsx
│       │   │   │   └── sidebar.tsx
│       │   │   └── shared/
│       │   │       ├── data-table.tsx
│       │   │       ├── action-card.tsx
│       │   │       ├── confirm-dialog.tsx
│       │   │       ├── form-field.tsx
│       │   │       └── page-header.tsx
│       │   ├── shared/
│       │   │   ├── api/client.ts
│       │   │   └── hooks/use-permissions.ts
│       │   └── app/
│       │       └── ui/                  (shadcn primitives: badge, button, card, dialog, input, label, separator, sheet)
│       ├── e2e/                         (Playwright tests)
│       ├── package.json
│       ├── .env.example
│       ├── Dockerfile
│       └── tsconfig.json
├── packages/
│   └── shared/
│       └── src/
│           ├── auth/index.ts            (Permission enum, DTOs)
│           └── air-shipments/index.ts   (SyncUpdatePayload)
├── specs/
│   ├── 001-auth-rbac-multi-organization/
│   ├── 003-modern-dashboard-ui/
│   └── 004-google-sheets-postgresql-sync/
├── .github/
│   └── agents/                          (AI agent configurations)
├── .devcontainer/
│   ├── devcontainer.json
│   ├── docker-compose.yml
│   └── Dockerfile
├── Jenkinsfile
├── package.json
├── .gitignore
└── .dockerignore
```

---

## 11. Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Monorepo with npm workspaces** | Single source of truth, shared types between backend/frontend |
| **Multi-tenant via CLS** | Automatic org-scoping without manual query filtering in every service |
| **JWT + Refresh Token Rotation** | Short-lived access tokens reduce blast radius; rotation with family detection prevents token replay |
| **RBAC with live DB checks** | No re-login needed after role/permission changes; real-time permission state |
| **Event-driven audit logging** | Decoupled from business logic; fire-and-forget ensures non-blocking writes |
| **Background jobs via BullMQ** | Reliable email delivery with retry; Redis-backed queue survives restarts |
| **Google Sheets sync via polling** | Simpler than webhooks for readonly access; configurable interval balances freshness vs API quota |
| **JSONB extra_fields** | Extensible schema — dynamic sheet columns don't require migrations |
| **Row locking (is_locked)** | Prevents sync from overwriting manually edited rows |
| **Header normalization + value coercion** | Handles real-world messy spreadsheet data robustly |
| **Batch upsert with fallback** | Performance via bulk operations, resilience via row-by-row fallback |

---

## 12. Testing Strategy

### Backend (Jest)
- Unit tests per module (`.spec.ts` files)
- Integration tests for air-shipments sync pipeline
- Test coverage configured in Jest config

### Frontend (Playwright)
- E2E tests in `apps/frontend/e2e/`:
  - `auth/login.spec.ts`
  - `auth/account-lockout.spec.ts`
  - `organizations/organizations.spec.ts`
  - `users/users.spec.ts`
  - `roles/roles.spec.ts`
  - `permissions/permissions.spec.ts`
  - `invitations/invitations.spec.ts`
  - `rbac/rbac.spec.ts`
  - `audit/audit.spec.ts`
  - `air-shipments/sync-dashboard.spec.ts`
  - `settings/settings-nav.spec.ts`

---

## 13. Commands

```bash
# Development
npm run dev                    # Run backend + frontend concurrently

# Build
npm run build                  # Build all workspaces

# Test
npm test                       # Run Jest + Playwright
npm run lint                   # ESLint

# Database
npm run migration:run          # Run pending TypeORM migrations
npm run migration:revert       # Revert last migration
npm run migration:generate -- -n <name>  # Generate migration from schema diff
```

---

## 14. Security Considerations

- **Password hashing:** bcrypt with 12 rounds
- **Token storage:** SHA-256 hashes (never store raw tokens)
- **Token rotation:** family-based reuse detection
- **Account lockout:** configurable max attempts (default 5)
- **Session inactivity:** auto-expire after 30 min
- **Rate limiting:** 100 req/min global, 10/min on login
- **CORS:** whitelist via env var (comma-separated)
- **Cookies:** httpOnly, secure (prod), sameSite strict
- **RBAC:** super-admin bypass, live DB permission checks
- **Row locking:** prevents accidental data overwrite during sync
- **Invitation tokens:** crypto-random, SHA-256 hashed, time-limited
- **Non-root Docker:** containers run as user 1001

---

## 15. Known Limitations & Future Considerations

1. **Google Sheets readonly:** Current integration is one-way (Sheet → DB). No write-back capability.
2. **No WebSocket auth:** Socket.IO gateway has no authentication — any client can connect.
3. **Sheet config UI sub-form:** The sheet-level configs sub-form in GoogleSheetConfigPanel is commented out.
4. **No file-based PDF/QR import:** Dependencies for pdf-parse, jsqr exist in package.json history but no implementation found in current codebase (legacy features from spec 002-pdf-upload-qr-scan).
5. **Lint/test stages commented out** in Jenkinsfile — CI does not currently run linting or tests.
6. **No API versioning:** All endpoints are at `/api/*` without version prefix.
7. **No pagination on some list endpoints:** Organizations, roles, users list endpoints return all records.
8. **Single Google Sheet config:** Only one active Google Sheet config supported (no per-organization sheet configs).
9. **No soft-delete on most entities:** Users/orgs have `isActive` flag, but roles/permissions/invitations use hard deletes.
10. **No data export:** No CSV/Excel export functionality for shipment data.
