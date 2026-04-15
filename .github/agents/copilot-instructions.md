# shipment-tracking-system Development Guidelines

Auto-generated from full codebase audit. Last updated: 2026-04-15

## Project Overview

Full-stack multi-tenant SaaS shipment tracking platform. NPM workspaces monorepo with NestJS 10 backend, Next.js 14 frontend, and shared TypeScript package. Synchronizes Google Sheets data into PostgreSQL with real-time WebSocket notifications.

## Active Technologies

- **Backend:** NestJS 10.x, TypeORM 0.3.20, PostgreSQL 16, BullMQ (Redis 7), Socket.IO, googleapis, bcrypt, JWT (Passport), class-validator, Joi, nestjs-cls, @nestjs/throttler, @nestjs-modules/mailer, Nodemailer, Handlebars
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript 5.x, Tailwind CSS, shadcn/ui (Radix-based), @tanstack/react-query, Axios, socket.io-client, react-hook-form + Zod, moment, lucide-react
- **Shared:** TypeScript types/enums (Permission enum, DTOs, SyncUpdatePayload)
- **Testing:** Jest + supertest (backend), Playwright (frontend E2E)
- **CI/CD:** Jenkins Pipeline, Docker + Docker Compose
- **Dev Infra:** Dev container with postgres:16, redis:7, mailhog

## Project Structure

```text
shipment-tracking-system/
├── apps/
│   ├── backend/                    # NestJS 10 API
│   │   ├── src/
│   │   │   ├── main.ts             # Bootstrap: cookie-parser, IoAdapter, CORS, /api prefix, ValidationPipe
│   │   │   ├── app.module.ts       # Global: Config(Joi), TypeORM(autoLoad), EventEmitter, CLS, BullMQ, Throttler(100/min)
│   │   │   ├── app.controller.ts   # GET /api/health (public)
│   │   │   ├── common/
│   │   │   │   ├── decorators/     # @Public(), @Authorize(Permission), @CurrentUser()
│   │   │   │   ├── guards/         # JwtAuthGuard (global), RbacGuard
│   │   │   │   ├── filters/        # HttpExceptionFilter (global)
│   │   │   │   ├── interceptors/   # TenantClsInterceptor (stores orgId, userId, isSuperAdmin in CLS)
│   │   │   │   ├── repositories/   # TenantRepository (auto-scopes queries to org from CLS)
│   │   │   │   └── utils/          # generateSlug(), ensureUniqueSlug()
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts  # TypeORM DataSource for migrations
│   │   │   │   └── migrations/     # 18 migrations
│   │   │   └── modules/
│   │   │       ├── auth/           # JWT login, refresh, logout, token rotation, family detection
│   │   │       ├── organizations/  # Multi-tenant org CRUD, slug generation
│   │   │       ├── users/          # User CRUD, password change/reset, lockout, inactivation
│   │   │       ├── roles/          # Role CRUD, permission assignment, user-role mapping
│   │   │       ├── permissions/    # @Global() module, seeds Permission enum, live DB permission checks
│   │   │       ├── invitations/    # Email invitation workflow, BullMQ email queue
│   │   │       ├── audit/          # Event-driven audit logging (fire-and-forget), subscribes to all domain events
│   │   │       └── air-shipments/  # Google Sheets sync, WebSocket notifications, scheduler
│   │   │           ├── entities/   # 7 entities: cgk, sub, sda, rate, route, sheetConfig, sheetSheetConfig
│   │   │           ├── dto/        # Query DTOs, config DTOs, notification DTOs
│   │   │           ├── config/     # sheets.example.json
│   │   │           ├── sheets.service.ts        # Google Sheets API client, batchGet, header normalization, value coercion
│   │   │           ├── scheduler.service.ts     # Concurrency-safe polling scheduler, dynamic interval
│   │   │           ├── sync-notification.gateway.ts  # Socket.IO gateway, broadcasts sync:update
│   │   │           ├── coercer.ts               # Type coercion: empty/errors→null, numbers, booleans, durations, dates
│   │   │           └── normalizer.ts            # Header normalization: strip, lowercase, deduplicate
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── Dockerfile              # Multi-stage, node:24.14.1-slim, port 4000, TZ=Asia/Jakarta
│   │   └── nest-cli.json           # webpack bundling
│   └── frontend/                   # Next.js 14 App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx      # Root layout wraps AuthProvider
│       │   │   ├── (auth)/         # Login, invite accept routes
│       │   │   └── (dashboard)/    # Protected routes: dashboard, settings, air-shipments, audit
│       │   ├── features/
│       │   │   ├── auth/           # AuthProvider, useAuth(), session restore via refresh cookie
│       │   │   └── air-shipments/  # Types, column configs, hooks, AirShipmentTable, GoogleSheetConfigPanel, SyncStatusBadge
│       │   ├── components/
│       │   │   ├── layout/         # DashboardShell (responsive: sidebar/drawer), Sidebar (permission-based nav)
│       │   │   └── shared/         # DataTable, ActionCard, ConfirmDialog, FormField, PageHeader
│       │   ├── shared/
│       │   │   ├── api/client.ts   # Axios: withCredentials, Bearer token interceptor, auto-refresh on 401
│       │   │   └── hooks/          # usePermissions()
│       │   └── app/ui/             # shadcn primitives: badge, button, card, dialog, input, label, separator, sheet
│       ├── e2e/                    # Playwright tests
│       ├── package.json
│       ├── .env.example
│       ├── Dockerfile              # 3-stage, node:24.14.0-alpine, standalone, port 3000
│       └── tsconfig.json           # Path aliases: @/* → ./src/*, @shared/* → ../../packages/shared/src/*
├── packages/
│   └── shared/                     # Shared TypeScript package
│       └── src/
│           ├── auth/index.ts       # Permission enum (28 permissions), JwtPayload, DTOs
│           └── air-shipments/index.ts  # SyncUpdatePayload interface
├── specs/                          # Feature specifications
│   ├── 001-auth-rbac-multi-organization/
│   ├── 003-modern-dashboard-ui/
│   └── 004-google-sheets-postgresql-sync/
├── .github/agents/                 # AI agent configurations (Speckit)
├── .devcontainer/                  # Dev container: workspace, postgres:16, redis:7, mailhog
├── Jenkinsfile                     # CI/CD: build, migrate, deploy to staging/production
├── package.json                    # Workspaces: apps/backend, apps/frontend, packages/*
├── .gitignore
└── .dockerignore
```

## Database Schema (17 tables)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `organizations` | Multi-tenant orgs | id, name(unique), slug(unique), address, isActive |
| `users` | User accounts | id, username(unique), password(bcrypt 12), isSuperAdmin, isLocked, isActive |
| `profiles` | User org profiles | id, userId, orgId, name, email, phone, avatarUrl |
| `roles` | RBAC roles | id, name, orgId, isSystem, isDefault; unique[name,orgId] |
| `permissions` | RBAC permissions | id, name(unique, format: action.module), resource, action |
| `user_roles` | User-role mapping | userId+roleId (composite PK), orgId |
| `role_permissions` | Role-permission mapping | roleId+permissionId (composite PK) |
| `refresh_tokens` | JWT refresh tokens | id, userId, tokenHash(sha256,unique), familyId, expiresAt |
| `invitations` | Email invitations | id, orgId, email, tokenHash(unique), status, expiresAt, roleId |
| `audit_logs` | Audit trail | id, actorId, action, resourceType, metadata(JSONB) — insert-only |
| `air_shipments_cgk` | CGK shipments | id, lt_number, to_number, is_locked, extra_fields(JSONB); unique[lt,to] |
| `air_shipments_sub` | SUB shipments | Same as CGK |
| `air_shipments_sda` | SDA shipments | Same as CGK |
| `rate_per_station` | Rate pricing | id, origin_dc, destination_dc, is_locked, extra_fields; unique[origin,dest] |
| `route_master` | Route definitions | id, concat(unique), is_locked, extra_fields |
| `google_sheet_config` | Sheet sync config | id, sheetLink, sheetId, syncInterval(s, default 15), enabled |
| `google_sheet_sheet_config` | Per-sheet config | id, sheetName, tableName, headerRow, uniqueKey(JSONB), skipNullCols |

## API Endpoints

### Auth (public endpoints throttled)
- `POST /api/auth/login` — login, returns `{ accessToken, user }`, sets refresh_token cookie
- `POST /api/auth/refresh` — rotate refresh token (cookie-based)
- `POST /api/auth/logout` — revoke current session
- `POST /api/auth/logout-all` — revoke all sessions
- `GET /api/auth/me` — current user

### Organizations (permission-gated)
- `GET/POST/PATCH/DELETE /api/organizations` — CRUD

### Users (permission-gated)
- `GET/POST/PATCH/DELETE /api/users` — CRUD (org-scoped)
- `PATCH /api/users/:id/inactivate` — deactivate
- `PATCH /api/users/:id/password` — own account
- `PATCH /api/users/:id/password/reset` — admin reset
- `PATCH /api/users/:id/unlock` — unlock

### Roles (permission-gated)
- `GET/POST/PUT/DELETE /api/roles` — CRUD (cannot modify system roles)
- `PUT /api/roles/:id/permissions` — replace all permissions
- `POST /api/roles/assign` — assign role to user
- `DELETE /api/roles/:roleId/users/:userId` — revoke role

### Permissions (permission-gated)
- `GET /api/permissions` — list all (seeded on bootstrap)

### Invitations
- `GET/POST /api/invitations` — list/send (permission-gated)
- `DELETE /api/invitations/:id` — cancel (permission-gated)
- `POST /api/invitations/accept` — accept (public)

### Audit (permission-gated)
- `GET /api/audit` — paginated (default 50/page)

### Air Shipments (JWT-gated)
- `GET /api/air-shipments/cgk|sub|sda|rate|routes` — paginated queries with ILIKE search and sort
- `PATCH /api/air-shipments/:tableName/:id/lock` — lock/unlock row
- `GET/POST/PUT/DELETE /api/air-shipments/google-sheet-config` — CRUD

### Health
- `GET /api/health` — public, returns `{ status: 'ok' }`

## Permission Enum (28 total)

All format: `<action>.<module>`. See `packages/shared/src/auth/index.ts`.

shipment: read, create, update, delete
user: read, create, update, delete
role: read, create, update, delete
permission: read, create, update, delete
organization: read, create, update, delete
invitation: read, create, update, delete
audit: read
google_sheet_config: read, create, update, delete

## Commands

```bash
npm run dev                    # Run backend + frontend concurrently
npm run build                  # Build all workspaces
npm test && npm run lint       # Run tests + linting
npm run migration:run          # Run pending TypeORM migrations
npm run migration:revert       # Revert last migration
npm run migration:generate -- -n <name>  # Generate migration from schema diff
```

## Code Style & Patterns

- **TypeScript:** Strict mode, interfaces over types for object shapes
- **NestJS:** Module pattern with providers/controllers/services. Decorators for entities. `@Global()` for shared modules (PermissionsModule)
- **TypeORM:** Decorator-based entities. No synchronize — use migrations only. Auto-load entities from TypeORM config
- **Guards:** JwtAuthGuard is global (APP_GUARD). Use `@Public()` to bypass. Use `@Authorize(Permission.X)` for RBAC
- **CLS:** TenantClsInterceptor stores orgId, userId, isSuperAdmin per request. TenantRepository auto-scopes queries
- **Events:** Use EventEmitter for domain events. AuditService subscribes to all. Use `@OnEvent()` decorator
- **Jobs:** BullMQ for background tasks (email queue). Define queue name, use `@Process()` decorator
- **Testing:** Jest for unit/e2e (backend). Playwright for E2E (frontend). Each module has `.spec.ts` files
- **Frontend:** App Router, server/client components. Axios with auto-refresh on 401. React Query for data fetching. Zod for form validation
- **UI:** Tailwind CSS + shadcn/ui primitives. Radix-based components. Responsive shell (sidebar desktop, drawer mobile)

## Key Architectural Patterns

1. **Multi-tenant scoping:** CLS context → TenantRepository auto-filters by orgId. Never manually add `where: { organizationId }` in repositories extending TenantRepository
2. **JWT rotation:** Refresh tokens rotate on each use. familyId detects reuse/replay. SHA-256 hashed in DB
3. **Live permissions:** RbacGuard performs live SQL join. No caching — changes take effect immediately
4. **Event-driven audit:** Modules emit events → AuditService writes fire-and-forget. Never block business logic for audit
5. **Sync pipeline:** Google Sheets → normalize headers → coerce values → diff against DB → batch upsert (500 chunks, fallback row-by-row) → WebSocket notification
6. **JSONB extra_fields:** Columns not in entity schema go into JSONB. Enables dynamic columns without migrations
7. **Row locking:** `is_locked` flag prevents sync overwrites. Check before upserting

## Environment Variables

### Backend (key vars)
`DATABASE_URL`, `JWT_ACCESS_SECRET` (64+ chars), `JWT_REFRESH_SECRET` (64+ chars), `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`, `LOGIN_MAX_ATTEMPTS=5`, `SESSION_INACTIVITY_MINUTES=30`, `INVITATION_EXPIRY_HOURS=72`, `SMTP_*`, `REDIS_HOST`, `REDIS_PORT`, `BACKEND_PORT=4000`, `CORS_ORIGIN` (comma-separated), `GOOGLE_CREDENTIALS_PATH`, `WEBSOCKET_CORS_ORIGIN`

### Frontend (key vars)
`NEXT_PUBLIC_API_URL=http://localhost:4000/api`, `NEXT_PUBLIC_WS_URL=http://localhost:4000`

## Deployment

- **CI/CD:** Jenkins — build Docker images (parallel), run migrations (with rollback on failure), docker-compose deploy (parallel)
- **Targets:** staging→`staging.ekasatyapuspita.com`, production→`ekasatyapuspita.com`
- **Backend:** port 4000, non-root user 1001, TZ=Asia/Jakarta
- **Frontend:** port 3000, non-root user nextjs:1001, standalone output
- **Dev container:** ports 3000, 4000, 5432, 6379, 1025/8025 (MailHog)

## Security

- bcrypt 12 rounds for passwords
- SHA-256 hashed tokens (never store raw)
- JWT family-based rotation detection
- Account lockout after failed attempts
- Rate limiting: 100 req/min global, 10/min login
- CORS whitelist via env var
- Cookies: httpOnly, secure (prod), sameSite strict
- Super-admin bypass for RBAC
- Non-root Docker containers

## Recent Changes (from specs)

- **004-google-sheets-postgresql-sync:** Added AirShipmentsModule with SheetsService, SchedulerService, SyncNotificationGateway, 7 entities, 5 dashboard pages, WebSocket real-time notifications, header normalization, value coercion pipeline, batch upsert with fallback
- **003-modern-dashboard-ui:** Next.js 14 App Router, Tailwind CSS, shadcn/ui, responsive dashboard shell, permission-based navigation, Playwright E2E tests
- **001-auth-rbac-multi-organization:** Core auth/RBAC foundation — JWT with refresh rotation, multi-tenant CLS scoping, RBAC with live permission checks, invitation workflow, event-driven audit logging

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
