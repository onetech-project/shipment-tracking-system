# Shipment Tracking System

**A modern, multi-tenant shipment tracking platform with advanced RBAC and audit logging.**

## Overview

This project is a full-stack monorepo for managing and tracking air shipments across multiple organizations. It is designed for logistics providers, freight forwarders, and enterprise teams who need secure, auditable, and scalable shipment management.

- Multi-organization (tenant) support with strict data isolation
- Role-based access control (RBAC) with fine-grained permissions
- User invitation and onboarding flow
- Account lockout and session management
- Audit logging for all critical actions
- Real-time notifications (WebSocket)
- Modular, event-driven backend (NestJS)
- Modern, component-driven frontend (Next.js, React 18, Tailwind CSS)
  +- Google Sheets sync for air shipment data
- Multi-organization (tenant) support with strict data isolation
- Role-based access control (RBAC) with fine-grained permissions
- User invitation and onboarding flow
- Account lockout and session management
- Audit logging for all critical actions
- Real-time notifications (WebSocket)
- Modular, event-driven backend (NestJS)
- Modern, component-driven frontend (Next.js, React 18, Tailwind CSS)

**Tech Stack:**

- Backend: NestJS 10, TypeORM, PostgreSQL, BullMQ, JWT, WebSockets
- Frontend: Next.js 14 App Router, React 18, Playwright, Tailwind CSS
- Shared: TypeScript types and utilities

## Monorepo Structure

## Monorepo Structure

```
apps/
  backend/    — NestJS 10 API (PostgreSQL, TypeORM, JWT, BullMQ, WebSockets)
  frontend/   — Next.js 14 App Router (React 18, TypeScript, Playwright)
packages/
  shared/     — Shared TypeScript types, DTOs, and utilities
specs/        — Feature specifications, API contracts, plans, and checklists
```

### Backend Architecture

- Modular NestJS app with domain-driven modules (auth, users, orgs, roles, permissions, audit, air-shipments, invitations)
- PostgreSQL with partitioned tables for audit logs and shipment data
- TypeORM migrations for schema and seed data
- BullMQ for background jobs (email, notifications)
- WebSocket gateway for real-time updates

### Frontend Architecture

- Next.js 14 App Router (React 18)
- Modular feature folders (air-shipments, users, orgs, etc.)
- Tailwind CSS for styling, Radix UI for accessible components
- Playwright for E2E testing

### Shared Package

- Centralized TypeScript types, DTOs, and utility functions
- Used by both backend and frontend for type safety and DRY code

### Specs & Contracts

- Living documentation for features, API contracts, and requirements
- Used for planning, QA, and cross-team alignment

## Main Features

- **Multi-Organization:** Each tenant has isolated users, roles, and data. Super-admins can manage all orgs.
- **RBAC:** Fine-grained permissions, system and org-scoped roles, live permission checks.
- **User Management:** Invite-only onboarding, account lockout, unlock, inactivation, password reset.
- **Audit Logging:** Immutable, partitioned logs for all critical actions, super-admin access only.
- **Air Shipments:** Track, update, and search air shipment records.
- **Google Sheets Sync:** Import and sync air shipment data from Google Sheets.
- **Invitations:** Secure, single-use, expiring invite tokens with email delivery and retry.
- **Notifications:** Real-time updates via WebSocket for shipment and org events.
- **Testing:** Jest for backend, Playwright for frontend E2E, type-checking for both.

---

## Quick Start

### Prerequisites

- Node.js 20 LTS
- PostgreSQL 16
- (Optional) Docker + Docker Compose

### Install dependencies

```bash
npm install
```

### Environment setup

Copy and fill in the environment files:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Key backend env vars:

| Variable                                           | Description                                |
| -------------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`                                     | PostgreSQL connection string               |
| `JWT_ACCESS_SECRET`                                | 64+ char secret for access tokens          |
| `JWT_REFRESH_SECRET`                               | 64+ char secret for refresh tokens         |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery                             |
| `LOGIN_MAX_ATTEMPTS`                               | Lockout threshold (default: 5)             |
| `SESSION_INACTIVITY_MINUTES`                       | Refresh token inactivity TTL (default: 30) |
| `INVITATION_EXPIRY_HOURS`                          | Invitation link lifetime (default: 72)     |
| `REDIS_HOST`, `REDIS_PORT`                         | Redis for BullMQ queues                    |
| `APP_URL`                                          | Frontend URL (for emails, CORS)            |
| `BACKEND_PORT`                                     | Backend server port                        |
| `CORS_ORIGIN`                                      | Allowed frontend origin                    |
| `SHIPMENT_IMPORT_MAX_FILE_MB`                      | Max import file size (MB)                  |
| `SHIPMENT_IMPORT_CONCURRENCY`                      | Max concurrent imports                     |
| `SHIPMENT_ID_REGEX`                                | Regex for shipment IDs                     |
| `GOOGLE_CREDENTIALS_PATH`                          | Path to Google service account JSON        |
| `WEBSOCKET_CORS_ORIGIN`                            | Allowed WebSocket CORS origin              |

Key frontend env vars:

| Variable              | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:4000/api`)   |
| `NEXT_PUBLIC_WS_URL`  | Backend WebSocket URL (default: `http://localhost:4000`) |

### Run database migrations and seed

```bash
cd apps/backend
npm run migration:run
```

This runs all migrations including seeding the super-admin user and default roles/permissions.

### Start development servers

```bash
# In one terminal
cd apps/backend && npm run dev

# In another terminal
cd apps/frontend && npm run dev
```

Backend runs on http://localhost:4000  
Frontend runs on http://localhost:3000

## Testing

### Backend unit tests

```bash
cd apps/backend
npm test
```

### Frontend type check

```bash
cd apps/frontend
npm run type-check
```

### E2E tests (Playwright)

Requires both backend and frontend to be running. Install browsers first:

```bash
cd apps/frontend
npx playwright install chromium
```

Set credentials in environment:

```bash
export E2E_SUPER_ADMIN_EMAIL=superadmin@system.local
export E2E_SUPER_ADMIN_PASSWORD=SuperAdmin@123!
export PLAYWRIGHT_BASE_URL=http://localhost:3000
```

Run tests:

```bash
npm run test:e2e --workspace=apps/frontend
# or with interactive UI
npm run test:e2e:ui --workspace=apps/frontend
```

Reports are generated in `apps/frontend/playwright-report/`.

## Modules

See each module's `README.md` for detailed documentation:

- [Air Shipments](apps/backend/src/modules/air-shipments/README.md)
- [Audit](apps/backend/src/modules/audit/README.md)
- [Auth](apps/backend/src/modules/auth/README.md)
- [Invitations](apps/backend/src/modules/invitations/README.md)
- [Organizations](apps/backend/src/modules/organizations/README.md)
- [Permissions](apps/backend/src/modules/permissions/README.md)
- [Roles](apps/backend/src/modules/roles/README.md)
- [Users](apps/backend/src/modules/users/README.md)

## CI/CD

The `Jenkinsfile` defines these stages:

1. **Install** — `npm ci` at monorepo root
2. **Lint** — ESLint for backend and frontend (parallel)
3. **Test** — Jest for backend + type-check for frontend (parallel)
4. **E2E Tests** — Playwright against running backend + frontend (feature + main branches)
5. **Build** — Compile backend and frontend for production (parallel)
6. **Docker Build & Push** — Build and push images on `main`/`develop`
7. **Deploy** — Placeholder for orchestration integration on `main`
