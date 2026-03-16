# Tasks: Authentication & Authorization System (RBAC Multi-Organization)

**Input**: Design documents from `/specs/001-auth-rbac-multi-organization/`
**Branch**: `001-auth-rbac-multi-organization`
**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅

**Tech Stack**: TypeScript 5.x · NestJS 10.x (backend) · Next.js 14.x App Router (frontend) · PostgreSQL 16 · TypeORM · Jest + Supertest (unit/integration) · Playwright (E2E)

**Tests**: MANDATORY per constitution §VI — every user story includes unit tests (Jest), integration tests (Jest + Supertest), and Playwright E2E tests covering critical user journeys.

---

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Parallelizable (different files, no incomplete dependencies)
- **[US#]**: User story this task belongs to (US1–US9 map to spec.md)

---

## Phase 1: Setup

**Purpose**: Scaffold the monorepo workspace, apps, and DevOps artifacts.

- [X] T001 Initialize NestJS backend application with TypeScript in `apps/backend/`
- [X] T002 Initialize Next.js 14 frontend application with TypeScript and App Router in `apps/frontend/`
- [X] T003 [P] Initialize `packages/shared` TypeScript package with `package.json` and `tsconfig.json` in `packages/shared/`
- [X] T004 [P] Configure monorepo root `package.json` with workspaces and shared scripts in `package.json`
- [X] T005 [P] Create backend Dockerfile (multi-stage, Node 20 LTS) in `apps/backend/Dockerfile`
- [X] T006 [P] Create frontend Dockerfile (multi-stage, Node 20 LTS, standalone output) in `apps/frontend/Dockerfile`
- [X] T007 [P] Create root `Jenkinsfile` with monorepo build, test, and Docker pipeline stages (including Playwright E2E stage) in `Jenkinsfile`
- [X] T008 Install and configure Playwright in `apps/frontend/` — create `apps/frontend/playwright.config.ts`, add `@playwright/test` dev dependency, create `apps/frontend/e2e/` directory tree (`auth/`, `settings/`, `organizations/`, `roles/`, `users/`, `invitations/`, `permissions/`, `audit/`), create shared `apps/frontend/e2e/fixtures/` for database seeding helpers

**Checkpoint**: Both apps scaffold cleanly, shared package is importable, CI/CD artifacts exist, Playwright is configured and runnable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story implementation can begin.

**⚠️ CRITICAL**: All user story phases depend on this phase being complete.

### Database & TypeORM

- [X] T009 Configure TypeORM DataSource with PostgreSQL connection and migration discovery in `apps/backend/src/database/data-source.ts`
- [X] T010 Create migration 001 — `organizations` table (id, name, address, is_active, timestamps) in `apps/backend/src/database/migrations/20260314000001-create-organizations.ts`
- [X] T011 Create migration 002 — `users` table (id, username, password, is_super_admin, login tracking, lock fields, is_active, timestamps) in `apps/backend/src/database/migrations/20260314000002-create-users.ts`
- [X] T012 Create migration 003 — `profiles` table (id, user_id FK UNIQUE, organization_id FK, personal fields, timestamps) in `apps/backend/src/database/migrations/20260314000003-create-profiles.ts`
- [X] T013 Create migration 004 — `roles` table and `permissions` table in `apps/backend/src/database/migrations/20260314000004-create-roles-permissions.ts`
- [X] T014 Create migration 005 — `user_roles` and `role_permissions` join tables in `apps/backend/src/database/migrations/20260314000005-create-user-roles-role-permissions.ts`
- [X] T015 Create migration 006 — `refresh_tokens` table in `apps/backend/src/database/migrations/20260314000006-create-refresh-tokens.ts`
- [X] T016 Create migration 007 — `invitations` table (id, organization_id, email, invited_by, token_hash, status, expires_at, used_at, role_id, **invited_name**, timestamps) in `apps/backend/src/database/migrations/20260314000007-create-invitations.ts`
- [X] T017 Create migration 008 — `audit_logs` partitioned table in `apps/backend/src/database/migrations/20260314000008-create-audit-logs.ts`
- [X] T018 Create migration 009 — all secondary indexes in `apps/backend/src/database/migrations/20260314000009-create-indexes.ts`
- [X] T019 Seed migration 010 — super-admin user and default roles/permissions in `apps/backend/src/database/migrations/20260314000010-seed-super-admin.ts`
- [X] T020 Create migration 011 — add `slug VARCHAR(300) NOT NULL UNIQUE` column to `organizations` table; add `invited_name VARCHAR(255)` column to `invitations` table (if not already present from T016) in `apps/backend/src/database/migrations/20260314000011-fix-schema-mismatches.ts`
- [X] T021 Implement slug generation utility — `generateSlug(name: string): string` (URL-safe, lowercase, hyphens) and `ensureUniqueSlug(slug: string, repo): Promise<string>` (appends numeric suffix on collision) in `apps/backend/src/common/utils/slug.util.ts`

### Backend Infrastructure

- [X] T022 [P] Configure `ConfigModule` (Joi env validation for DATABASE_URL, JWT secrets, SMTP, LOGIN_MAX_ATTEMPTS, SESSION_INACTIVITY_MINUTES, INVITATION_EXPIRY_HOURS) in `apps/backend/src/app.module.ts`
- [X] T023 [P] Set up `nestjs-cls` module and implement `TenantClsInterceptor` in `apps/backend/src/common/interceptors/tenant-cls.interceptor.ts`
- [X] T024 [P] Set up `@nestjs/event-emitter` module in `apps/backend/src/app.module.ts`
- [X] T025 [P] Set up BullMQ `EmailQueue` for invitation email retry in `apps/backend/src/modules/invitations/email/email.module.ts`
- [X] T026 [P] Create global `HttpExceptionFilter` in `apps/backend/src/common/filters/http-exception.filter.ts`
- [X] T027 [P] Create `@Public()`, `@CurrentUser()`, and `@Authorize()` decorators in `apps/backend/src/common/decorators/`

### Shared Package

- [X] T028 [P] Create `JwtPayload` interface, `Permission` enum, and shared DTOs in `packages/shared/src/auth/index.ts`

**Checkpoint**: Database schema complete (including slug + invited_name columns). App infrastructure wired. Slug utility available. Shared types importable.

---

## Phase 3: User Story 1 — Secure User Login (Priority: P1) 🎯 MVP

**Goal**: Users authenticate with email + password, receive a short-lived access token and `HttpOnly` refresh token cookie, refresh without re-credentials, log out, with account lockout after repeated failures.

**Independent Test**: Create a seeded user, call `POST /auth/login` with correct credentials → verify `accessToken` returned and `refresh_token` cookie set. Call `POST /auth/login` with wrong password 5× → verify 403 `ACCOUNT_LOCKED`. Call `POST /auth/refresh` → verify new `accessToken`. Log out → verify cookie cleared.

### Tests for User Story 1 (MANDATORY per constitution §VI)

- [ ] T029 Unit test for `AuthService` — login success, login failure increment, lockout threshold, refresh token rotation, family reuse detection, logout revocation in `apps/backend/src/modules/auth/auth.service.spec.ts`
- [ ] T030 Integration test for `AuthController` — `POST /auth/login` (2xx, 401, 403 locked, 403 inactive), `POST /auth/refresh` (200, 401 expired, 401 revoked), `POST /auth/logout` (200), `GET /auth/me` (200) in `apps/backend/src/modules/auth/auth.controller.spec.ts`
- [ ] T031 [P] Playwright E2E — login with valid credentials → dashboard redirect; login with invalid credentials → error message shown; logout → redirected to login page in `apps/frontend/e2e/auth/login.spec.ts`

### Implementation

- [X] T032 [P] Create `User` TypeORM entity in `apps/backend/src/modules/users/entities/user.entity.ts`
- [X] T033 [P] Create `RefreshToken` TypeORM entity in `apps/backend/src/modules/auth/entities/refresh-token.entity.ts`
- [X] T034 Implement `JwtStrategy` in `apps/backend/src/modules/auth/strategies/jwt.strategy.ts`
- [X] T035 Implement `RefreshTokenStrategy` (validates hash, inactivity window, family reuse) in `apps/backend/src/modules/auth/strategies/refresh-token.strategy.ts`
- [X] T036 Implement global `JwtAuthGuard` in `apps/backend/src/common/guards/jwt-auth.guard.ts`
- [X] T037 Implement `AuthService.login()` — bcrypt verify, attempt counter, lockout, token issuance in `apps/backend/src/modules/auth/auth.service.ts`
- [X] T038 Implement `AuthService.refreshToken()` — rotation, family reuse revocation in `apps/backend/src/modules/auth/auth.service.ts`
- [X] T039 Implement `AuthService.logout()` / `logoutAll()` in `apps/backend/src/modules/auth/auth.service.ts`
- [X] T040 Implement `AuthController` (`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`) with `HttpOnly` cookie handling in `apps/backend/src/modules/auth/auth.controller.ts`
- [X] T041 [P] Implement frontend auth context (in-memory access token, `login()`, `logout()`, `user` state) in `apps/frontend/src/features/auth/auth.context.tsx`
- [X] T042 [P] Implement login page in `apps/frontend/src/app/(auth)/login/page.tsx`
- [X] T043 [P] Implement API client with Axios interceptor (auto-attach token, silent 401 refresh) in `apps/frontend/src/shared/api/client.ts`

**Checkpoint**: Full login → refresh → logout lifecycle works. Account lockout works. Unit + integration + Playwright tests pass.

---

## Phase 4: User Story 2 — Settings Menu Navigation (Priority: P1)

**Goal**: Super-admin and admin roles see a Settings section in the nav containing Organizations, Roles, Users, Invitations, and (super-admin only) Permissions. All other roles see no Settings entry. Direct URL access by unauthorized roles returns 403.

**Independent Test**: Login as super-admin → Settings menu visible with all 5 sub-items including Permissions. Login as admin → Settings visible with Roles, Users, Invitations but NO Permissions. Login as staff → Settings menu entirely absent. Navigate directly to `/settings/permissions` as admin → 403.

### Tests for User Story 2 (MANDATORY per constitution §VI)

- [ ] T044 [P] Playwright E2E — verify Settings menu visibility for super-admin (5 items), admin (3 items, no Permissions), and staff (no Settings menu) in `apps/frontend/e2e/settings/settings-nav.spec.ts`
- [ ] T045 Integration test — verify `GET /permissions` returns 403 for admin role and 200 for super-admin in `apps/backend/src/modules/permissions/permissions.controller.spec.ts` (shared with Phase 9)

### Implementation

- [X] T046 Implement `(dashboard)/settings/` route group layout with server-side RBAC check — redirect to 403 page if role is not super-admin or admin — in `apps/frontend/src/app/(dashboard)/settings/layout.tsx`
- [X] T047 Implement navigation sidebar component with role-aware Settings menu — sub-items rendered conditionally by `isSuperAdmin` / `isAdmin` flags from auth context — in `apps/frontend/src/features/auth/components/navigation.tsx`
- [X] T048 Implement `usePermissions()` hook — exposes `isSuperAdmin`, `isAdmin`, `hasPermission(p)` derived from JWT claims — in `apps/frontend/src/shared/hooks/use-permissions.ts`
- [X] T049 Implement 403 forbidden page in `apps/frontend/src/app/(dashboard)/settings/forbidden/page.tsx`

**Checkpoint**: Settings menu is correctly gated per role in UI and direct URL access returns 403 for unauthorized roles.

---

## Phase 5: User Story 3 — Organization Management by Super Admin (Priority: P1)

**Goal**: Super Admin creates and manages organizations via Settings → Organizations. The create form accepts only Name and Address; the system auto-generates a unique slug. Organization-scoped routes are protected to super-admin only.

**Independent Test**: Login as super-admin, open Settings → Organizations, create org with name "Acme Corp" and address — verify slug `acme-corp` auto-generated and shown in detail. Create second org also named "Acme Corp" → verify slug is `acme-corp-2`. Update org name → verify slug unchanged. Deactivate org → verify org members receive 403. Login as admin → verify Organizations page returns 403.

### Tests for User Story 3 (MANDATORY per constitution §VI)

- [ ] T050 Unit test for `OrganizationsService` — create generates slug, collision handling appends suffix, update does not regenerate slug, deactivation revokes all member tokens in `apps/backend/src/modules/organizations/organizations.service.spec.ts`
- [ ] T051 Integration test for `OrganizationsController` — `POST /organizations` (201 with slug, 403 for non-super-admin), `PATCH /organizations/:id` (200, 403), `PATCH /organizations/:id/deactivate` (200, 403), `GET /organizations` (200 with pagination) in `apps/backend/src/modules/organizations/organizations.controller.spec.ts`
- [ ] T052 [P] Playwright E2E — super-admin creates org with name+address only → slug visible in detail; second org with same name → unique slug; update details → slug unchanged; deactivate → member loses access in `apps/frontend/e2e/organizations/organizations.spec.ts`

### Implementation

- [X] T053 [P] Create `Organization` TypeORM entity in `apps/backend/src/modules/organizations/entities/organization.entity.ts`
- [X] T054 [P] Create `Profile` TypeORM entity in `apps/backend/src/modules/organizations/entities/profile.entity.ts`
- [X] T055 Add `slug` field to `Organization` entity and update entity in `apps/backend/src/modules/organizations/entities/organization.entity.ts`
- [X] T056 Implement `TenantRepository<T>` abstract base class in `apps/backend/src/common/repositories/tenant.repository.ts`
- [X] T057 Update `OrganizationsService.create()` — call `generateSlug()` + `ensureUniqueSlug()` from `slug.util.ts`, persist slug; `create()` DTO must NOT include slug field in `apps/backend/src/modules/organizations/organizations.service.ts`
- [X] T058 Implement `OrganizationsService` (findAll, findOne, update, deactivate) in `apps/backend/src/modules/organizations/organizations.service.ts`
- [X] T059 Implement `OrganizationsController` restricted to super-admin in `apps/backend/src/modules/organizations/organizations.controller.ts`
- [X] T060 Implement deactivation side-effect (revoke all org member refresh tokens) in `apps/backend/src/modules/organizations/organizations.service.ts`
- [X] T061 Implement organizations list page under settings in `apps/frontend/src/app/(dashboard)/settings/organizations/page.tsx`
- [X] T062 Implement organization create/edit form — fields: Name and Address only; slug shown as read-only derived value after creation — in `apps/frontend/src/features/organizations/components/organization-form.tsx`
- [X] T063 Implement deactivation confirmation dialog in `apps/frontend/src/features/organizations/components/deactivate-org-dialog.tsx`

**Checkpoint**: Super Admin can create orgs (slug auto-generated and unique), update, and deactivate. Admin cannot access the page. Unit + integration + Playwright tests pass.

---

## Phase 6: User Story 4 — User Invitation & Onboarding (Priority: P2)

**Goal**: Admins invite users via Settings → Invitations. The invitation form has Name, Role, and Organization fields. Organization is an active dropdown for super-admin and disabled + pre-filled for admin. Invited users receive a single-use link to set their password.

**Independent Test**: Login as super-admin, open Settings → Invitations, send invite with name + role + any org selected → verify email received. Login as admin, open form → org field is disabled and pre-filled. Accept invite link before expiry → set password → login succeeds. Accept same link again → error. Use expired link → error.

### Tests for User Story 4 (MANDATORY per constitution §VI)

- [X] T064 Unit test for `InvitationsService` — token generation, SHA-256 hash storage, idempotent re-invite logic, single-use gate on accept, expiry rejection, name field saved in `apps/backend/src/modules/invitations/invitations.service.spec.ts`
- [ ] T065 Integration test for `InvitationsController` — `POST /invitations` (201, 403 cross-org for admin, 409 already-member), `GET /invitations/verify?token=` (200, 410 expired), `POST /invitations/accept` (201, 409 used, 410 expired) in `apps/backend/src/modules/invitations/invitations.controller.spec.ts`
- [ ] T066 [P] Playwright E2E — super-admin sends invite (org dropdown active); admin sends invite (org field disabled + pre-filled); accept valid link → set password → login in `apps/frontend/e2e/invitations/invitations.spec.ts`

### Implementation

- [X] T067 Create `Invitation` TypeORM entity in `apps/backend/src/modules/invitations/entities/invitation.entity.ts`
- [X] T068 Implement `EmailService` and `EmailQueueConsumer` (exponential backoff retry) in `apps/backend/src/modules/invitations/email/email.service.ts` and `email.processor.ts`
- [X] T069 Update `InvitationsService` — include `invited_name` field when creating invitation record; use name in activated user's profile on accept in `apps/backend/src/modules/invitations/invitations.service.ts`
- [X] T070 Implement `InvitationsService` core (token generation, hash, expiry, idempotent re-invite, accept gate) in `apps/backend/src/modules/invitations/invitations.service.ts`
- [X] T071 Implement `InvitationsController` (`POST /invitations`, `GET /invitations`, `GET /invitations/verify` @Public, `POST /invitations/accept` @Public, `DELETE /invitations/:id`) in `apps/backend/src/modules/invitations/invitations.controller.ts`
- [X] T072 [P] Implement frontend accept-invitation page in `apps/frontend/src/app/invite/accept/page.tsx`
- [X] T073 Implement invitation form with conditional organization field — org dropdown active for super-admin, disabled + pre-filled for admin — in `apps/frontend/src/features/invitations/components/invitation-form.tsx`
- [X] T074 Implement Invitations management page under settings in `apps/frontend/src/app/(dashboard)/settings/invitations/page.tsx`

**Checkpoint**: Invitation lifecycle (send → receive → accept → activate) works end-to-end. Org field behavior is correct per role. Expired and replayed tokens rejected. Unit + integration + Playwright tests pass.

---

## Phase 7: User Story 5 — Role Management by Administrators (Priority: P2)

**Goal**: Administrators manage roles via Settings → Roles. Role edit view includes a permission checkbox panel for assigning/unassigning permissions. Changes take effect immediately for all role holders.

**Independent Test**: Login as admin, open Settings → Roles, create a role, open its edit view → see checkbox panel with all available permissions. Check `read.shipment`, save → user with that role can access shipment read endpoint. Uncheck → access revoked on next request (no re-login needed).

### Tests for User Story 5 (MANDATORY per constitution §VI)

- [X] T075 Unit test for `RolesService` — create org-scoped role, assign permissions set (PUT replaces all), unassign, permission change takes immediate effect on RBAC query in `apps/backend/src/modules/roles/roles.service.spec.ts`
- [ ] T076 Integration test for `RolesController` — `GET /roles` (200 org-scoped), `POST /roles` (201), `PUT /roles/:id/permissions` (200 for admin, 403 cross-org), `GET /roles/:id` with permissions array in `apps/backend/src/modules/roles/roles.controller.spec.ts`
- [ ] T077 [P] Playwright E2E — admin creates role, opens edit, checks two permissions, saves → user with role gains access; unchecks one → access revoked in `apps/frontend/e2e/roles/roles.spec.ts`

### Implementation

- [X] T078 [P] Create `Role` TypeORM entity in `apps/backend/src/modules/roles/entities/role.entity.ts`
- [X] T079 [P] Create `UserRole` TypeORM entity in `apps/backend/src/modules/roles/entities/user-role.entity.ts`
- [X] T080 [P] Create `RolePermission` TypeORM entity in `apps/backend/src/modules/roles/entities/role-permission.entity.ts`
- [X] T081 Implement `RolesService` (findAll org-scoped, findOne with permissions, create, update, delete, `replacePermissions(roleId, permissionIds[])`) in `apps/backend/src/modules/roles/roles.service.ts`
- [X] T082 Implement `RolesController` (`GET /roles`, `GET /roles/:id`, `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`, `PUT /roles/:id/permissions`) in `apps/backend/src/modules/roles/roles.controller.ts`
- [X] T083 Implement `PermissionService.getPermissions(userId, orgId)` — RBAC JOIN cached per request in `apps/backend/src/modules/permissions/permission.service.ts`
- [X] T084 Implement `RbacGuard` in `apps/backend/src/common/guards/rbac.guard.ts`
- [X] T085 Apply `@Authorize()` guards to all existing controller endpoints
- [X] T086 Implement roles list page under settings in `apps/frontend/src/app/(dashboard)/settings/roles/page.tsx`
- [X] T087 Implement role create/edit form with permission checkbox panel — fetches all permissions, renders checkbox per permission grouped by module, submits via `PUT /roles/:id/permissions` — in `apps/frontend/src/features/roles/components/role-permissions-panel.tsx`

**Checkpoint**: Role CRUD works. Permission assignment via checkbox panel is immediate. RBAC guard enforces correctly. Unit + integration + Playwright tests pass.

---

## Phase 8: User Story 6 — User Management by Administrators (Priority: P2)

**Goal**: Administrators manage users via Settings → Users. Users can only be added via the Invitation flow (no direct create form). Existing users are editable (personal info, role). Administrators can inactivate users, immediately terminating all active sessions.

**Independent Test**: Login as admin, open Settings → Users → verify no "Create User" button. Open existing user → edit name and position, save → changes reflected. Change role → role updated without re-login requirement. Click Inactivate → confirm → user can no longer log in. Login as org admin, attempt to access user from another org → 403.

### Tests for User Story 6 (MANDATORY per constitution §VI)

- [X] T088 Unit test for `UsersService` — update profile fields, change role (revokes tokens), inactivate (revokes tokens + sets is_active=false), org-scoped isolation throws ForbiddenException on cross-org access in `apps/backend/src/modules/users/users.service.spec.ts`
- [ ] T089 Integration test for `UsersController` — `GET /users` (200 org-scoped), `PATCH /users/:id` (200 own-org, 403 cross-org), `PATCH /users/:id/inactivate` (200, 403 cross-org), `PUT /users/:id/roles` (200) in `apps/backend/src/modules/users/users.controller.spec.ts`
- [ ] T090 [P] Playwright E2E — admin opens Users list → no create button; edits user personal info; changes role; inactivates user → user cannot log in in `apps/frontend/e2e/users/users.spec.ts`

### Implementation

- [X] T091 Implement `UsersService` (findAll org-scoped, findOne, update profile, assignRoles, unlock, changePassword) in `apps/backend/src/modules/users/users.service.ts`
- [X] T092 Add `UsersService.inactivate(userId, actorId)` — set `is_active=false`, revoke all active refresh tokens for user, emit `user.inactivated` event in `apps/backend/src/modules/users/users.service.ts`
- [X] T093 Implement `UsersController` (`GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`, `PUT /users/:id/roles`, `POST /users/:id/unlock`) in `apps/backend/src/modules/users/users.controller.ts`
- [X] T094 Add `PATCH /users/:id/inactivate` endpoint to `UsersController` in `apps/backend/src/modules/users/users.controller.ts`
- [X] T095 Enforce org-scoped isolation in `UsersService` — cross-org requests throw `ForbiddenException` in `apps/backend/src/modules/users/users.service.ts`
- [X] T096 On role change — revoke existing refresh tokens so updated permissions take effect on next login in `apps/backend/src/modules/users/users.service.ts`
- [X] T097 Implement users list page under settings (no "Create User" button — direct to Invitations for adding users) in `apps/frontend/src/app/(dashboard)/settings/users/page.tsx`
- [X] T098 Implement user edit form (personal info: name, position, phone; role dropdown) in `apps/frontend/src/features/users/components/user-edit-form.tsx`
- [X] T099 Implement inactivate user confirmation dialog — calls `PATCH /users/:id/inactivate`, refreshes list in `apps/frontend/src/features/users/components/inactivate-user-dialog.tsx`

**Checkpoint**: Users management is invite-only for adding. Edit and inactivation work correctly. Tenant isolation enforced. Unit + integration + Playwright tests pass.

---

## Phase 9: User Story 7 — Permission Management by Super Admin (Priority: P2)

**Goal**: Super Admin manages the global permission master list via Settings → Permissions. This page and all permission mutation endpoints are exclusively accessible by super-admin.

**Independent Test**: Login as super-admin → open Settings → Permissions → create `read.shipment` → permission visible in list and available for role assignment. Login as admin → navigate to `/settings/permissions` → 403. Verify `POST /permissions` returns 403 for admin JWT.

### Tests for User Story 7 (MANDATORY per constitution §VI)

- [ ] T100 Unit test for `PermissionsService` — create with valid `<action>.<module>` format, reject duplicate, reject invalid format in `apps/backend/src/modules/permissions/permissions.service.spec.ts`
- [ ] T101 Integration test for `PermissionsController` — `GET /permissions` (200 for any authenticated), `POST /permissions` (201 for super-admin, 403 for admin), `DELETE /permissions/:id` (200 super-admin, 403 admin) in `apps/backend/src/modules/permissions/permissions.controller.spec.ts`
- [ ] T102 [P] Playwright E2E — super-admin creates permission; admin navigates to permissions page → 403 shown in `apps/frontend/e2e/permissions/permissions.spec.ts`

### Implementation

- [X] T103 [P] Create `Permission` TypeORM entity in `apps/backend/src/modules/permissions/entities/permission.entity.ts`
- [X] T104 Implement `RbacSeederService` (idempotent upsert of default roles and permissions) in `apps/backend/src/modules/permissions/rbac-seeder.service.ts`
- [X] T105 Implement `PermissionsService` (findAll, findOne, create [super-admin only], update, delete) in `apps/backend/src/modules/permissions/permissions.service.ts`
- [X] T106 Implement `PermissionsController` with `@Authorize('create.permission')` guard on mutation endpoints in `apps/backend/src/modules/permissions/permissions.controller.ts`
- [X] T107 Implement permissions page under settings (super-admin only route guard — redirect to 403 if not super-admin) in `apps/frontend/src/app/(dashboard)/settings/permissions/page.tsx`
- [X] T108 Implement permission create form in `apps/frontend/src/features/permissions/components/permission-form.tsx`

**Checkpoint**: Permission master data managed exclusively by super-admin. Admin receives 403 on page and API. Unit + integration + Playwright tests pass.

---

## Phase 10: User Story 8 — Account Security Enforcement (Priority: P3)

**Goal**: Configurable brute-force protection. Locked accounts receive clear error messages. Admin unlock resets security counters. Inactivity-based session expiry enforced on refresh.

**Independent Test**: Submit wrong password `LOGIN_MAX_ATTEMPTS` times → verify 403 `ACCOUNT_LOCKED`. Submit once more on locked account → still 403 locked. Admin calls `POST /users/:id/unlock` → verify `is_locked=false`, `failed_attempts=0`. Login succeeds after unlock.

### Tests for User Story 8 (MANDATORY per constitution §VI)

- [ ] T109 Unit test for account lockout scenarios — threshold reached → locked, correct passwords after lock still rejected, unlock resets counters, inactivity window check on refresh in `apps/backend/src/modules/auth/auth.service.spec.ts` (lockout scenarios section)
- [ ] T110 [P] Playwright E2E — repeated wrong password → account locked message; admin unlocks via Settings → Users → user can log in again in `apps/frontend/e2e/auth/account-lockout.spec.ts`

### Implementation

- [X] T111 Verify `AuthService.login()` reads `LOGIN_MAX_ATTEMPTS` from `ConfigService` and locks account at threshold in `apps/backend/src/modules/auth/auth.service.ts`
- [X] T112 Verify `RefreshTokenStrategy.validate()` reads `SESSION_INACTIVITY_MINUTES` and rejects stale `last_used_at` in `apps/backend/src/modules/auth/strategies/refresh-token.strategy.ts`
- [X] T113 Verify `AuthService.login()` resets `failed_attempts` to 0 on successful login in `apps/backend/src/modules/auth/auth.service.ts`
- [X] T114 Verify `UsersService.unlock()` atomically resets `is_locked`, `failed_attempts`, `locked_at` in `apps/backend/src/modules/users/users.service.ts`
- [X] T115 Verify `AuthController` returns structured `ACCOUNT_LOCKED` (403) and `ACCOUNT_INACTIVE` (403) codes with human-readable messages in `apps/backend/src/modules/auth/auth.controller.ts`
- [X] T116 Implement unlock user UI in `apps/frontend/src/features/users/components/unlock-user-dialog.tsx`

**Checkpoint**: Lockout threshold is configurable. Clear error messaging for locked/inactive accounts. Admin unlock fully functional. Unit + Playwright tests pass.

---

## Phase 11: User Story 9 — Audit Logging for Critical Operations (Priority: P3)

**Goal**: All critical operations produce immutable audit log entries captured asynchronously via domain events.

**Independent Test**: Perform: login (success), failed login, role assignment, org deactivation, user inactivation, invite sent. Query `audit_logs` in PostgreSQL → verify each action has a row with correct `action`, `user_id`, `entity_type`, `entity_id`, `created_at`.

### Tests for User Story 9 (MANDATORY per constitution §VI)

- [X] T117 Unit test for `AuditService` — `record()` inserts correct action + entity metadata for each of the 19 audit action types in `apps/backend/src/modules/audit/audit.service.spec.ts`
- [ ] T118 Integration test for `AuditController` — `GET /audit` (200 with pagination for super-admin, 403 for staff) in `apps/backend/src/modules/audit/audit.controller.spec.ts`
- [ ] T119 [P] Playwright E2E — perform login, role assignment, and invite actions; open audit log page as super-admin → verify all three events appear with correct metadata in `apps/frontend/e2e/audit/audit.spec.ts`

### Implementation

- [X] T120 Create `AuditLog` TypeORM entity in `apps/backend/src/modules/audit/entities/audit-log.entity.ts`
- [X] T121 Implement `AuditModule` and `AuditService.record(event)` (fire-and-forget INSERT) in `apps/backend/src/modules/audit/audit.module.ts` and `audit.service.ts`
- [X] T122 Register `@OnEvent()` listeners for auth events in `apps/backend/src/modules/audit/audit.service.ts`
- [X] T123 Register `@OnEvent()` listeners for org events in `apps/backend/src/modules/audit/audit.service.ts`
- [X] T124 Register `@OnEvent()` listeners for user/invitation events (including `user.inactivated`) in `apps/backend/src/modules/audit/audit.service.ts`
- [X] T125 Register `@OnEvent()` listeners for role/permission events in `apps/backend/src/modules/audit/audit.service.ts`
- [X] T126 Emit all auth domain events from `apps/backend/src/modules/auth/auth.service.ts`
- [X] T127 Emit all org domain events from `apps/backend/src/modules/organizations/organizations.service.ts`
- [X] T128 Emit all user/invitation domain events from `apps/backend/src/modules/users/users.service.ts` and `invitations.service.ts`
- [X] T129 Emit all role/permission domain events from `apps/backend/src/modules/roles/roles.service.ts` and `permissions.service.ts`
- [X] T130 Implement audit log viewer page (super-admin only) in `apps/frontend/src/app/(dashboard)/audit/page.tsx`

**Checkpoint**: All 19 audit action types produce verifiable rows. Audit writes are non-blocking. Unit + integration + Playwright tests pass.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Rate limiting, navigation wiring, Playwright CI integration, and developer experience.

- [X] T131 [P] Apply `@nestjs/throttler` rate limiting — strict (10 req/min IP) on `POST /auth/login` and `POST /invitations/accept`; moderate on `POST /auth/refresh` in `apps/backend/src/modules/auth/auth.controller.ts` and `invitations.controller.ts`
- [X] T132 [P] Add `GET /health` endpoint in `apps/backend/src/app.controller.ts`
- [X] T133 [P] Implement `apps/frontend/src/app/(dashboard)/layout.tsx` — redirect unauthenticated users to `/login`
- [X] T134 [P] Implement `apps/frontend/src/app/(auth)/layout.tsx` — minimal auth layout
- [X] T135 [P] Implement root route `apps/frontend/src/app/page.tsx` — redirect based on auth state
- [X] T136 [P] Configure Playwright CI — headless mode, `BASE_URL` from env, screenshot on failure, test report artifact — in `apps/frontend/playwright.config.ts`
- [X] T137 Update `Jenkinsfile` — add Playwright E2E stage after unit/integration tests (install Playwright browsers, run `npx playwright test`, publish HTML report) in `Jenkinsfile`
- [X] T138 [P] Write module READMEs for auth, organizations, users, roles, permissions, invitations, and audit modules (setup, env vars, key concepts) in `apps/backend/src/modules/*/README.md`
- [ ] T139 Run `quickstart.md` validation: `npm install` → `migration:run` → seed → `dev:backend` → `dev:frontend` → smoke-test login and Settings menu flows

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1  (Setup)            → No dependencies
Phase 2  (Foundational)     → Depends on Phase 1 · BLOCKS all user story phases
Phase 3  (US1 - Login)      → Depends on Phase 2
Phase 4  (US2 - Settings)   → Depends on Phase 3 (needs auth context + JWT claims)
Phase 5  (US3 - Orgs)       → Depends on Phase 2 (slug utility) + Phase 3 (JwtAuthGuard)
Phase 6  (US4 - Invites)    → Depends on Phase 3 (User entity + AuthService) + Phase 5 (Org entity)
Phase 7  (US5 - Roles)      → Depends on Phase 3 (JwtAuthGuard) + Phase 5 (Org entity)
Phase 8  (US6 - Users)      → Depends on Phase 7 (RbacGuard + Role entities) + Phase 6 (invitation-only onboarding)
Phase 9  (US7 - Permissions)→ Depends on Phase 7 (Permission entity + RbacSeeder)
Phase 10 (US8 - Security)   → Depends on Phase 3 (auth service) + Phase 8 (unlock)
Phase 11 (US9 - Audit)      → Depends on Phases 3–9 (subscribes to all domain events)
Phase 12 (Polish)           → Depends on all above phases
```

### User Story Dependencies

| Story | Depends On | Independent Test Available? |
|-------|-----------|------------------------------|
| US1 — Secure Login (P1) | Phase 2 only | ✅ Yes |
| US2 — Settings Menu (P1) | US1 (auth context, JWT role claims) | ✅ Yes |
| US3 — Org Management (P1) | Phase 2 (slug util) + US1 (guard) | ✅ Yes |
| US4 — Invitations (P2) | US1 (User entity) + US3 (Org entity) | ✅ Yes |
| US5 — Role Management (P2) | US1 (guard) + US3 (Org entity) | ✅ Yes |
| US6 — User Management (P2) | US5 (roles) + US4 (invite-only onboarding) | ✅ Yes |
| US7 — Permission Management (P2) | US5 (Permission entity + seeder) | ✅ Yes |
| US8 — Account Security (P3) | US1 (auth) + US6 (unlock) | ✅ Yes |
| US9 — Audit Logging (P3) | US1–US7 (domain events) | ✅ Yes |

### Parallel Execution Examples

**Phase 2 — Infrastructure (after migrations T009–T020)**:
```
T022: ConfigModule          │
T023: TenantClsInterceptor  │ All in parallel
T024: EventEmitter          │
T025: BullMQ EmailModule    │
T026: HttpExceptionFilter   │
T027: Decorators            │
T028: Shared types          │
```

**Phase 3 — US1 entity layer**:
```
T032: User entity          │
T033: RefreshToken entity  │ Both in parallel
```

**Phase 5 — US3 entity layer**:
```
T053: Organization entity  │
T054: Profile entity       │ Both in parallel
```

**Phase 7 — US5 entity layer**:
```
T078: Role entity          │
T079: UserRole entity      │ All in parallel
T080: RolePermission entity│
T103: Permission entity    │
```

**Test tasks within any phase**:
- Unit test, integration test, and Playwright E2E test for the same story can all be written in parallel (different files, no dependencies)

---

## Implementation Strategy

### MVP Scope (Phases 1–3)
Deliver US1 (Login) with working authentication, tokens, and lockout. This is the minimum deployable increment — all other features gate on auth being functional.

### Increment 1 (Phases 4–5)
Add Settings menu navigation gating (US2) and Organization management (US3). Establishes multi-tenancy and admin navigation structure.

### Increment 2 (Phases 6–9)
Complete the admin Settings suite: Invitations (US4), Roles (US5), Users (US6), Permissions (US7). Full RBAC system operational.

### Increment 3 (Phases 10–12)
Account security hardening (US8), Audit logging (US9), and CI/testing polish.
