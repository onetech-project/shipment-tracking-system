# Quickstart: Auth RBAC Multi-Organization

> Developer guide for bootstrapping and working with the `auth-rbac-multi-organization` feature locally.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.x LTS | `node --version` |
| npm | ≥ 10.x | `npm --version` |
| PostgreSQL | 16.x | Running locally or via Docker |
| Git | any | for branch management |

---

## 1. Clone & Install

```bash
# clone the repo (skip if already cloned)
git clone https://github.com/onetech-project/shipment-tracking-system.git
cd shipment-tracking-system

# switch to the feature branch
git checkout 001-auth-rbac-multi-organization

# install all workspace dependencies (monorepo root)
npm install
```

---

## 2. Environment Variables

Create `.env` files for the backend. Copy the example and fill in values:

```bash
cp apps/backend/.env.example apps/backend/.env
```

### Required Variables — `apps/backend/.env`

```dotenv
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgres://postgres:password@localhost:5432/shipment_tracking

# ── JWT ───────────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>

# Token TTL (ISO 8601 duration or seconds)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Account Security ──────────────────────────────────────
LOGIN_MAX_ATTEMPTS=5              # lock account after N consecutive failures
SESSION_INACTIVITY_MINUTES=30    # refresh token inactivity window

# ── Invitations ───────────────────────────────────────────
INVITATION_EXPIRY_HOURS=72

# ── Email (SMTP) ──────────────────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@shipment-tracking.local

# ── App ───────────────────────────────────────────────────
APP_URL=http://localhost:3000        # frontend base URL (used in invitation emails)
BACKEND_PORT=3001
NODE_ENV=development
```

> **Tip**: use [Mailpit](https://mailpit.axllent.org/) (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`) for local SMTP during development.

---

## 3. Database Setup

### 3a. Create the database

```bash
psql -U postgres -c "CREATE DATABASE shipment_tracking;"
```

### 3b. Run migrations

```bash
# from monorepo root
npm run migration:run --workspace=apps/backend
```

Migrations run in order and create all 9 tables:

1. `001_create_organizations`
2. `002_create_users`
3. `003_create_profiles`
4. `004_create_roles`
5. `005_create_permissions`
6. `006_create_user_roles`
7. `007_create_role_permissions`
8. `008_create_refresh_tokens`
9. `009_create_invitations`
10. `010_create_audit_logs` (partitioned)

### 3c. Seed default roles and permissions

```bash
npm run seed:roles --workspace=apps/backend
npm run seed:permissions --workspace=apps/backend
```

The seeder is idempotent (`OnApplicationBootstrap`) — safe to run multiple times.

> **Platform roles seeded**: `Super Admin` (platform-level, `organization_id = NULL`).  
> **Permissions seeded**: all `<action>.<module>` keys defined in `PermissionKey` enum.

---

## 4. Start the Development Servers

```bash
# backend only (NestJS on port 3001)
npm run dev:backend

# frontend only (Next.js on port 3000)
npm run dev:frontend

# both in parallel
npm run dev
```

Verify the backend is running:

```bash
curl http://localhost:3001/health
# → {"status":"ok"}
```

---

## 5. Monorepo Structure (feature scope)

```
Jenkinsfile                     ← CI/CD pipeline (repo root)

apps/
  backend/
    src/
      modules/
        auth/               ← JWT login, refresh, logout
          guards/           ← JwtAuthGuard (global), RbacGuard
          decorators/       ← @Public(), @Authorize(), @CurrentUser()
          strategies/       ← JwtStrategy, RefreshStrategy
        organizations/      ← org CRUD
        users/              ← user management, locking, password
        roles/              ← role CRUD + permission assignment
        permissions/        ← permission master data + seeding
        invitations/        ← invite flow + email job
        audit/              ← event-driven audit log writer
      database/
        migrations/         ← TypeORM migration files
    Dockerfile
  frontend/
    src/
      app/                  ← Next.js App Router
        (auth)/
          login/            ← login page
        (dashboard)/
          organizations/    ← org management pages
          users/            ← user management pages
          roles/            ← roles management pages
          invitations/      ← invite user pages
        invitations/
          accept/           ← accept invite page (@Public)
      features/             ← co-located feature logic (hooks, actions, components)
        auth/
        organizations/
        users/
        roles/
        invitations/
    Dockerfile

packages/
  shared/src/
    auth/                   ← shared DTOs, JwtPayload type, Permission enum
```

---

## 6. Common Development Flows

### 6a. Register a user (via invitation)

1. Create an organization:
   ```bash
   curl -s -X POST http://localhost:3001/organizations \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"Acme Corp"}'
   ```

2. Send an invitation:
   ```bash
   curl -s -X POST http://localhost:3001/invitations \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","roleId":"<uuid>"}'
   ```

3. Accept the invitation (recipient):
   ```bash
   # verify token (GET, public)
   curl "http://localhost:3001/invitations/verify?token=<raw-token>"
   
   # accept and set password (POST, public)
   curl -s -X POST http://localhost:3001/invitations/accept \
     -H "Content-Type: application/json" \
     -d '{"token":"<raw-token>","password":"Str0ng!Pass"}'
   ```

### 6b. Login and get tokens

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username":"user@example.com","password":"Str0ng!Pass"}'
# → { "accessToken": "...", "user": {...} }
# refresh token is set as HttpOnly cookie
```

### 6c. Refresh access token

```bash
curl -s -X POST http://localhost:3001/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
# → { "accessToken": "..." }
```

### 6d. Assign a role to a user

```bash
curl -s -X PUT http://localhost:3001/users/<user-id>/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleIds":["<role-uuid>"]}'
```

### 6e. Unlock a locked account

```bash
curl -s -X POST http://localhost:3001/users/<user-id>/unlock \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Running Tests

```bash
# unit + integration tests (backend)
npm run test --workspace=apps/backend

# with coverage
npm run test:cov --workspace=apps/backend

# e2e tests (requires running DB)
npm run test:e2e --workspace=apps/backend
```

Tests for this feature live in:

- `apps/backend/src/modules/auth/*.spec.ts`
- `apps/backend/src/modules/organizations/*.spec.ts`
- `apps/backend/src/modules/users/*.spec.ts`
- `apps/backend/src/modules/roles/*.spec.ts`
- `apps/backend/src/modules/permissions/*.spec.ts`
- `apps/backend/src/modules/invitations/*.spec.ts`
- `apps/backend/test/auth.e2e-spec.ts`

---

## 8. Generating a New Migration

After changing a TypeORM entity:

```bash
npm run migration:generate --workspace=apps/backend -- -n <MigrationName>
# example:
npm run migration:generate --workspace=apps/backend -- -n AddFailedAttemptsToUsers
```

Review the generated file in `apps/backend/src/database/migrations/` before committing.

---

## 9. Useful Environment Shortcuts

| Task | Command |
|---|---|
| View running migrations | `npm run migration:show --workspace=apps/backend` |
| Revert last migration | `npm run migration:revert --workspace=apps/backend` |
| Drop all + re-migrate (dev only) | `npm run schema:drop --workspace=apps/backend && npm run migration:run --workspace=apps/backend` |
| Lint backend | `npm run lint --workspace=apps/backend` |
| Format code | `npm run format --workspace=apps/backend` |

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `JWT_ACCESS_SECRET is not defined` | Ensure `apps/backend/.env` exists and has the variable set |
| `ECONNREFUSED` on DB | Verify PostgreSQL is running: `pg_isready -h localhost -p 5432` |
| `UnauthorizedException` on every request | Access token expired — call `POST /auth/refresh` first |
| Account locked on login | An admin must call `POST /users/:id/unlock` |
| Invitation email not received | Check Mailpit UI at `http://localhost:8025` |
| `TokenFamilyReuseDetected` | Refresh token replayed — all sessions revoked; re-login required |
