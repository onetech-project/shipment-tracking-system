# shipment-tracking-system
Shipment tracking system with OCR and QR Scanner

## Monorepo Structure

```
apps/
  backend/    — NestJS 10 API (PostgreSQL, TypeORM, JWT, BullMQ)
  frontend/   — Next.js 14 App Router (React 18, TypeScript)
packages/
  shared/     — Shared TypeScript types and utilities
specs/        — Feature specifications, plans, and task lists
```

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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random 64+ char secret for access tokens |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery |
| `LOGIN_MAX_ATTEMPTS` | Lockout threshold (default: 5) |
| `SESSION_INACTIVITY_MINUTES` | Refresh token inactivity TTL (default: 30) |
| `INVITATION_EXPIRY_HOURS` | Invitation link lifetime (default: 72) |

Key frontend env vars:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:4000/api`) |

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

- [Auth](apps/backend/src/modules/auth/README.md)
- [Organizations](apps/backend/src/modules/organizations/README.md)
- [Users](apps/backend/src/modules/users/README.md)
- [Roles](apps/backend/src/modules/roles/README.md)
- [Permissions](apps/backend/src/modules/permissions/README.md)
- [Invitations](apps/backend/src/modules/invitations/README.md)
- [Audit](apps/backend/src/modules/audit/README.md)

## CI/CD

The `Jenkinsfile` defines these stages:

1. **Install** — `npm ci` at monorepo root
2. **Lint** — ESLint for backend and frontend (parallel)
3. **Test** — Jest for backend + type-check for frontend (parallel)
4. **E2E Tests** — Playwright against running backend + frontend (feature + main branches)
5. **Build** — Compile backend and frontend for production (parallel)
6. **Docker Build & Push** — Build and push images on `main`/`develop`
7. **Deploy** — Placeholder for orchestration integration on `main`

