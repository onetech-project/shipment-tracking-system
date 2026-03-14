# Tasks: Authentication & Authorization System (RBAC Multi-Organization)

**Input**: Design documents from `/specs/001-auth-rbac-multi-organization/`
**Branch**: `001-auth-rbac-multi-organization`
**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅

**Tech Stack**: TypeScript 5.x · NestJS 10.x (backend) · Next.js 14.x App Router (frontend) · PostgreSQL 16 · TypeORM · Jest

**Tests**: Not included — specs do not request TDD approach. Add test tasks if required.

---

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Parallelizable (different files, no incomplete dependencies)
- **[US#]**: User story this task belongs to (US1–US7 map to spec.md priorities)

---

## Phase 1: Setup

**Purpose**: Scaffold the monorepo workspace, apps, and DevOps artifacts.

- [ ] T001 Initialize NestJS backend application with TypeScript in `apps/backend/`
- [ ] T002 Initialize Next.js 14 frontend application with TypeScript and App Router in `apps/frontend/`
- [ ] T003 [P] Initialize `packages/shared` TypeScript package with `package.json` and `tsconfig.json` in `packages/shared/`
- [ ] T004 [P] Configure monorepo root `package.json` with workspaces and shared scripts in `package.json`
- [ ] T005 [P] Create backend Dockerfile (multi-stage, Node 20 LTS) in `apps/backend/Dockerfile`
- [ ] T006 [P] Create frontend Dockerfile (multi-stage, Node 20 LTS, standalone output) in `apps/frontend/Dockerfile`
- [ ] T007 [P] Create root `Jenkinsfile` with monorepo build, test, and Docker pipeline stages in `Jenkinsfile`

**Checkpoint**: Both apps scaffold cleanly, shared package is importable, CI/CD artifacts exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story implementation can begin.

**⚠️ CRITICAL**: All user story phases depend on this phase being complete.

### Database & TypeORM

- [ ] T008 Configure TypeORM DataSource with PostgreSQL connection and migration discovery in `apps/backend/src/database/data-source.ts`
- [ ] T009 Create migration 001 — `organizations` table (id, name, address, is_active, timestamps) in `apps/backend/src/database/migrations/20260314000001-create-organizations.ts`
- [ ] T010 Create migration 002 — `users` table (id, username, password, is_super_admin, login tracking, lock fields, is_active, timestamps) in `apps/backend/src/database/migrations/20260314000002-create-users.ts`
- [ ] T011 Create migration 003 — `profiles` table (id, user_id FK UNIQUE, organization_id FK, personal fields, timestamps) in `apps/backend/src/database/migrations/20260314000003-create-profiles.ts`
- [ ] T012 Create migration 004 — `roles` table (id, name, organization_id NULLABLE, is_default, timestamps) and `permissions` table (id, name UNIQUE `<action>.<module>`, description, timestamps) in `apps/backend/src/database/migrations/20260314000004-create-roles-permissions.ts`
- [ ] T013 Create migration 005 — `user_roles` join table (user_id, role_id, organization_id composite PK, assigned_at, assigned_by) and `role_permissions` join table (role_id, permission_id composite PK, assigned_at, assigned_by) in `apps/backend/src/database/migrations/20260314000005-create-user-roles-role-permissions.ts`
- [ ] T014 Create migration 006 — `refresh_tokens` table (id, user_id FK, organization_id NULLABLE, token_hash CHAR(64) UNIQUE, family_id, expires_at, last_used_at, revoked_at, ip_address, user_agent, created_at) in `apps/backend/src/database/migrations/20260314000006-create-refresh-tokens.ts`
- [ ] T015 Create migration 007 — `invitations` table (id, organization_id FK, email, invited_by FK, token_hash CHAR(64) UNIQUE, status, expires_at, used_at NULLABLE, role_id FK NULLABLE, timestamps) in `apps/backend/src/database/migrations/20260314000007-create-invitations.ts`
- [ ] T016 Create migration 008 — `audit_logs` partitioned table (id+created_at composite PK, user_id NULLABLE, action, entity_type NULLABLE, entity_id NULLABLE, metadata JSONB NULLABLE, ip_address NULLABLE, user_agent NULLABLE, created_at) with monthly range partitioning in `apps/backend/src/database/migrations/20260314000008-create-audit-logs.ts`
- [ ] T017 Create migration 009 — all secondary indexes (idx_organizations_name, idx_users_username, idx_user_roles_user_org, idx_refresh_tokens_family_id, idx_audit_logs_user_id, idx_audit_logs_entity, and others per data-model.md) in `apps/backend/src/database/migrations/20260314000009-create-indexes.ts`

### Backend Infrastructure

- [ ] T018 [P] Configure `ConfigModule` (Joi env validation for DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, SMTP_*, LOGIN_MAX_ATTEMPTS, SESSION_INACTIVITY_MINUTES, INVITATION_EXPIRY_HOURS) in `apps/backend/src/app.module.ts`
- [ ] T019 [P] Set up `nestjs-cls` module and implement `TenantClsInterceptor` (populates `organizationId` from JWT claims on every request) in `apps/backend/src/common/interceptors/tenant-cls.interceptor.ts`
- [ ] T020 [P] Set up `@nestjs/event-emitter` module for async domain events in `apps/backend/src/app.module.ts`
- [ ] T021 [P] Set up `BullMQ` module with Redis connection and `EmailQueue` producer for invitation email retry in `apps/backend/src/modules/invitations/email/email.module.ts`
- [ ] T022 [P] Create global `HttpExceptionFilter` with structured `{ statusCode, error, message }` response shape in `apps/backend/src/common/filters/http-exception.filter.ts`
- [ ] T023 [P] Create `@Public()` and `@CurrentUser()` decorators in `apps/backend/src/common/decorators/public.decorator.ts` and `current-user.decorator.ts`

### Shared Package

- [ ] T024 [P] Create `JwtPayload` interface and `Permission` enum (all `<action>.<module>` keys from data-model.md) and shared DTOs in `packages/shared/src/auth/index.ts`

**Checkpoint**: Database schema is complete. App infrastructure (config, interceptors, event emitter, BullMQ, exception filter, decorators) is wired. Shared types are importable from `packages/shared`.

---

## Phase 3: User Story 1 — Secure User Login (Priority: P1) 🎯 MVP

**Goal**: Users can authenticate with email + password, receive a short-lived access token and `HttpOnly` refresh token cookie, refresh sessions without re-entering credentials, log out, and have their account locked after repeated failures.

**Independent Test**: Create a user record with bcrypt-hashed password, call `POST /auth/login` with correct credentials → verify `accessToken` returned and `refresh_token` cookie is set. Call `POST /auth/login` with wrong password 5 times → verify 403 `ACCOUNT_LOCKED`. Call `POST /auth/refresh` with valid cookie → verify new `accessToken`.

### Implementation

- [ ] T025 [P] [US1] Create `User` TypeORM entity mapping to `users` table in `apps/backend/src/modules/users/entities/user.entity.ts`
- [ ] T026 [P] [US1] Create `RefreshToken` TypeORM entity mapping to `refresh_tokens` table in `apps/backend/src/modules/auth/entities/refresh-token.entity.ts`
- [ ] T027 [US1] Implement `JwtStrategy` (validates access token, loads user from DB if `is_super_admin` or org active) in `apps/backend/src/modules/auth/strategies/jwt.strategy.ts`
- [ ] T028 [US1] Implement `RefreshTokenStrategy` (validates refresh token hash, checks `expires_at`, checks `last_used_at` against `SESSION_INACTIVITY_MINUTES`, detects family reuse) in `apps/backend/src/modules/auth/strategies/refresh-token.strategy.ts`
- [ ] T029 [US1] Implement global `JwtAuthGuard` (extends `AuthGuard('jwt')`, checks `@Public()` metadata via `Reflector`) in `apps/backend/src/common/guards/jwt-auth.guard.ts`
- [ ] T030 [US1] Implement `AuthService.login()` — validate credentials with bcrypt, increment `failed_attempts` on failure, lock account at `LOGIN_MAX_ATTEMPTS`, reset `failed_attempts` on success, issue access token + refresh token, store SHA-256 hash of refresh token in DB in `apps/backend/src/modules/auth/auth.service.ts`
- [ ] T031 [US1] Implement `AuthService.refreshToken()` — verify token hash, perform rotation (invalidate current, issue new in same family), detect and handle family reuse (revoke all family tokens) in `apps/backend/src/modules/auth/auth.service.ts`
- [ ] T032 [US1] Implement `AuthService.logout()` and `AuthService.logoutAll()` — set `revoked_at` on one or all refresh tokens for user in `apps/backend/src/modules/auth/auth.service.ts`
- [ ] T033 [US1] Implement `AuthController` with endpoints `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`; set/clear `HttpOnly` refresh token cookie in `apps/backend/src/modules/auth/auth.controller.ts`
- [ ] T034 [P] [US1] Implement frontend auth context (stores access token in memory, exposes `login()`, `logout()`, `user` state) in `apps/frontend/src/features/auth/auth.context.tsx`
- [ ] T035 [P] [US1] Implement frontend login page with email/password form and error handling in `apps/frontend/src/app/(auth)/login/page.tsx`
- [ ] T036 [P] [US1] Implement frontend API client with Axios interceptor for automatic access token attachment and silent refresh on 401 in `apps/frontend/src/shared/api/client.ts`

**Checkpoint**: Full login → refresh → logout lifecycle works. Account lockout works. Access token in memory; refresh token in `HttpOnly` cookie.

---

## Phase 4: User Story 2 — Organization Management by Super Admin (Priority: P1)

**Goal**: Super Admin can create, update, and deactivate organizations. Deactivating an org revokes all member sessions immediately.

**Independent Test**: Authenticate as Super Admin. `POST /organizations` → verify org created. `PATCH /organizations/:id` → verify update. `PATCH /organizations/:id/deactivate` → verify `isActive: false` and org members can no longer authenticate.

### Implementation

- [ ] T037 [P] [US2] Create `Organization` TypeORM entity in `apps/backend/src/modules/organizations/entities/organization.entity.ts`
- [ ] T038 [P] [US2] Create `Profile` TypeORM entity (references `User` and `Organization`) in `apps/backend/src/modules/organizations/entities/profile.entity.ts`
- [ ] T039 [US2] Implement `TenantRepository<T>` abstract base class (automatically appends `organization_id` filter from `nestjs-cls` context on all queries) in `apps/backend/src/common/repositories/tenant.repository.ts`
- [ ] T040 [US2] Implement `OrganizationsService` (findAll with pagination, findOne, create, update, deactivate) in `apps/backend/src/modules/organizations/organizations.service.ts`
- [ ] T041 [US2] Implement `OrganizationsController` with endpoints `GET /organizations`, `GET /organizations/:id`, `POST /organizations`, `PATCH /organizations/:id`, `PATCH /organizations/:id/deactivate`; restrict create/update/deactivate to `is_super_admin` in `apps/backend/src/modules/organizations/organizations.controller.ts`
- [ ] T042 [US2] Implement org deactivation side-effect: set `revoked_at` on all active `refresh_tokens` for users whose `profiles.organization_id` matches the deactivated org in `apps/backend/src/modules/organizations/organizations.service.ts`
- [ ] T043 [P] [US2] Implement frontend organization list and detail pages at `apps/frontend/src/app/(dashboard)/organizations/` (page.tsx and `[id]/page.tsx`)
- [ ] T044 [P] [US2] Implement frontend organization feature hooks and server actions in `apps/frontend/src/features/organizations/`

**Checkpoint**: Super Admin can fully manage organizations. Deactivation immediately terminates org sessions.

---

## Phase 5: User Story 3 — User Invitation & Onboarding (Priority: P2)

**Goal**: Admins send email invitations; invited users receive a single-use, time-limited link, set their password, and activate their account.

**Independent Test**: As Super Admin, `POST /invitations` with `{ email, organizationId, roleId }` → verify email sent (Mailpit). Use the raw token from the email: `GET /invitations/verify?token=<token>` → verify valid response. `POST /invitations/accept` with `{ token, password }` → verify user `is_active = true`. Re-submit `POST /invitations/accept` with same token → verify 409/410 rejected.

### Implementation

- [ ] T045 [US3] Create `Invitation` TypeORM entity mapping to `invitations` table in `apps/backend/src/modules/invitations/entities/invitation.entity.ts`
- [ ] T046 [US3] Implement `EmailService` with `@nestjs-modules/mailer` and `EmailQueueConsumer` BullMQ worker (exponential backoff retry) for sending invitation emails in `apps/backend/src/modules/invitations/email/email.service.ts` and `email.processor.ts`
- [ ] T047 [US3] Implement `InvitationsService` — generate `crypto.randomBytes(32)` token, store SHA-256 hash, enforce `INVITATION_EXPIRY_HOURS`, idempotent re-invite logic (revoke pending → create new), atomic `UPDATE WHERE used_at IS NULL` single-use gate on accept in `apps/backend/src/modules/invitations/invitations.service.ts`
- [ ] T048 [US3] Implement `InvitationsController` with endpoints `POST /invitations`, `GET /invitations`, `GET /invitations/verify` (@Public), `POST /invitations/accept` (@Public), `DELETE /invitations/:id` in `apps/backend/src/modules/invitations/invitations.controller.ts`
- [ ] T049 [P] [US3] Implement frontend accept-invitation page (form to set password, calls `POST /invitations/accept`, redirects to login on success) in `apps/frontend/src/app/invitations/accept/page.tsx`
- [ ] T050 [P] [US3] Implement frontend invitation send form and list in `apps/frontend/src/features/invitations/` and `apps/frontend/src/app/(dashboard)/invitations/page.tsx`

**Checkpoint**: Full invitation lifecycle works end-to-end. Expired and replayed tokens are rejected.

---

## Phase 6: User Story 4 — Role & Permission Management (Priority: P2)

**Goal**: Super Admin manages permission master data. Organization Admins create roles, assign permissions to roles, and assign roles to users. RBAC guards enforce access on all endpoints.

**Independent Test**: Seed default roles and permissions. Create a role, assign `read.shipment` permission. Assign role to a test user. Verify user receives 200 on a `read.shipment`-guarded endpoint and 403 on a `delete.shipment`-guarded endpoint.

### Implementation

- [ ] T051 [P] [US4] Create `Role` TypeORM entity in `apps/backend/src/modules/roles/entities/role.entity.ts`
- [ ] T052 [P] [US4] Create `Permission` TypeORM entity in `apps/backend/src/modules/permissions/entities/permission.entity.ts`
- [ ] T053 [P] [US4] Create `UserRole` TypeORM entity (composite PK: user_id, role_id, organization_id) in `apps/backend/src/modules/roles/entities/user-role.entity.ts`
- [ ] T054 [P] [US4] Create `RolePermission` TypeORM entity (composite PK: role_id, permission_id) in `apps/backend/src/modules/roles/entities/role-permission.entity.ts`
- [ ] T055 [US4] Implement `RbacSeederService` with `OnApplicationBootstrap` — idempotent upsert of all default roles (`super_admin`, `admin`, `owner`, `manager`, `staff`) and all permissions from `Permission` enum in `apps/backend/src/modules/permissions/rbac-seeder.service.ts`
- [ ] T056 [US4] Implement `PermissionsService` (findAll, findOne, create [Super Admin only], update, delete) in `apps/backend/src/modules/permissions/permissions.service.ts`
- [ ] T057 [US4] Implement `PermissionsController` with endpoints `GET /permissions`, `GET /permissions/:id`, `POST /permissions`, `PATCH /permissions/:id`, `DELETE /permissions/:id` in `apps/backend/src/modules/permissions/permissions.controller.ts`
- [ ] T058 [US4] Implement `RolesService` (findAll org-scoped, findOne, create, update, delete, assignPermissions via `PUT /roles/:id/permissions`) in `apps/backend/src/modules/roles/roles.service.ts`
- [ ] T059 [US4] Implement `RolesController` with endpoints `GET /roles`, `GET /roles/:id`, `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`, `PUT /roles/:id/permissions` in `apps/backend/src/modules/roles/roles.controller.ts`
- [ ] T060 [US4] Implement `PermissionService.getPermissions(userId, orgId)` — execute RBAC JOIN query (user_roles → roles → role_permissions → permissions), return `Set<string>`, cache per request via `nestjs-cls` in `apps/backend/src/modules/permissions/permission.service.ts`
- [ ] T061 [US4] Implement `RbacGuard` — read `@Authorize()` metadata via `Reflector.getAllAndOverride`, call `PermissionService.getPermissions()`, deny if required permission not in set, bypass for `is_super_admin` in `apps/backend/src/common/guards/rbac.guard.ts`
- [ ] T062 [US4] Implement `@Authorize(permission: string)` decorator and `PermissionAssertion` injectable for service-layer defense in `apps/backend/src/common/decorators/authorize.decorator.ts`
- [ ] T063 [US4] Apply `@Authorize()` guards to all existing controller endpoints in Auth, Organizations modules
- [ ] T064 [P] [US4] Implement frontend roles management pages (list, create, edit, assign permissions) in `apps/frontend/src/app/(dashboard)/roles/` and `apps/frontend/src/features/roles/`
- [ ] T065 [P] [US4] Implement frontend permissions management pages (list, create, edit) in `apps/frontend/src/app/(dashboard)/permissions/` and `apps/frontend/src/features/permissions/`

**Checkpoint**: RBAC guard enforces permissions on all endpoints. Default roles and permissions are seeded. Org Admins cannot create permissions. Super Admin bypass works.

---

## Phase 7: User Story 5 — User Management by Administrators (Priority: P2)

**Goal**: Super Admin manages users across all organizations. Organization Admin manages users within their own org only. Admins assign roles; role changes take effect immediately. Deleting a user terminates all their sessions.

**Independent Test**: As Org Admin, `POST /users` with org context → verify user created in admin's org only. Attempt `POST /users` with a different `organizationId` → verify 403. `PUT /users/:id/roles` → verify role assignment reflected immediately (without re-login).

### Implementation

- [ ] T066 [US5] Implement `UsersService` (findAll org-scoped, findOne, create with Profile, update, delete, assignRoles, unlock, changePassword) in `apps/backend/src/modules/users/users.service.ts`
- [ ] T067 [US5] Implement `UsersController` with endpoints `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`, `PUT /users/:id/roles`, `POST /users/:id/unlock`, `POST /users/:id/change-password` in `apps/backend/src/modules/users/users.controller.ts`
- [ ] T068 [US5] Enforce org-scoped isolation in `UsersService` — Organization Admin queries filtered by `organizationId` from JWT/CLS context; throw `ForbiddenException` on cross-org access attempts in `apps/backend/src/modules/users/users.service.ts`
- [ ] T069 [US5] On `DELETE /users/:id` — call `AuthService.revokeAllTokens(userId)` to terminate all active sessions before deleting user in `apps/backend/src/modules/users/users.service.ts`
- [ ] T070 [US5] On `PUT /users/:id/roles` — revoke existing refresh tokens so updated permissions take effect on next login in `apps/backend/src/modules/users/users.service.ts`
- [ ] T071 [P] [US5] Implement frontend users management pages (list, create, edit, assign roles) in `apps/frontend/src/app/(dashboard)/users/` and `apps/frontend/src/features/users/`

**Checkpoint**: Super Admin and Org Admin user management works with tenant isolation enforced. Session revocation on delete and role change works.

---

## Phase 8: User Story 6 — Account Security Enforcement (Priority: P3)

**Goal**: Brute-force protection is configurable and enforced. Locked accounts receive clear error messages. Admin unlock resets all security counters. Inactivity-based session expiry is enforced on refresh.

**Independent Test**: Submit wrong password `LOGIN_MAX_ATTEMPTS` times → verify 403 `ACCOUNT_LOCKED`. Submit wrong password on locked account → verify still 403 with locked message. Admin calls `POST /users/:id/unlock` → verify `is_locked=false`, `failed_attempts=0`. User logs in again after unlock → verify success.

### Implementation

- [ ] T072 [US6] Verify `AuthService.login()` reads `LOGIN_MAX_ATTEMPTS` from `ConfigService` and locks account (`is_locked=true`, `locked_at=NOW()`) when threshold is reached; returns `ACCOUNT_LOCKED` code in `apps/backend/src/modules/auth/auth.service.ts`
- [ ] T073 [US6] Verify `RefreshTokenStrategy.validate()` reads `SESSION_INACTIVITY_MINUTES` from `ConfigService` and rejects token with `SESSION_EXPIRED` code when `last_used_at` is stale in `apps/backend/src/modules/auth/strategies/refresh-token.strategy.ts`
- [ ] T074 [US6] Verify `AuthService.login()` resets `failed_attempts` to 0 on successful authentication in `apps/backend/src/modules/auth/auth.service.ts`
- [ ] T075 [US6] Verify `UsersService.unlock()` resets `is_locked=false`, `failed_attempts=0`, `locked_at=NULL` atomically and optionally sets `require_password_reset=true` in `apps/backend/src/modules/users/users.service.ts`
- [ ] T076 [US6] Verify `AuthController` returns structured error with `ACCOUNT_LOCKED` (403) and `ACCOUNT_INACTIVE` (403) response codes with human-readable messages in `apps/backend/src/modules/auth/auth.controller.ts`

**Checkpoint**: Account lockout threshold is configurable. Locked accounts are clearly communicated. Admin unlock is fully operational. Inactivity timeout is enforced.

---

## Phase 9: User Story 7 — Audit Logging for Critical Operations (Priority: P3)

**Goal**: All critical operations (auth events, role assignments, org actions, user invitations, permission changes) generate immutable audit log entries captured asynchronously.

**Independent Test**: Perform a login (success), a failed login, a role assignment, and an org deactivation. Query `audit_logs` directly in PostgreSQL → verify each action has a corresponding row with correct `action`, `user_id`, `entity_type`, `entity_id`, and `created_at`.

### Implementation

- [ ] T077 [US7] Create `AuditLog` TypeORM entity mapping to the `audit_logs` partitioned table in `apps/backend/src/modules/audit/entities/audit-log.entity.ts`
- [ ] T078 [US7] Implement `AuditModule` and `AuditService.record(event)` — appends to `audit_logs` via `INSERT` (fire-and-forget, no blocking the request); registers as event listener host in `apps/backend/src/modules/audit/audit.module.ts` and `audit.service.ts`
- [ ] T079 [US7] Register `@OnEvent()` listeners for auth events (`auth.login.success`, `auth.login.failed`, `auth.logout`, `auth.account.locked`, `auth.account.unlocked`) in `apps/backend/src/modules/audit/audit.service.ts`
- [ ] T080 [US7] Register `@OnEvent()` listeners for org events (`org.created`, `org.updated`, `org.deactivated`) in `apps/backend/src/modules/audit/audit.service.ts`
- [ ] T081 [US7] Register `@OnEvent()` listeners for user/invitation events (`user.created`, `user.updated`, `user.deleted`, `user.role_assigned`, `user.role_removed`, `user.invited`, `user.activation`) in `apps/backend/src/modules/audit/audit.service.ts`
- [ ] T082 [US7] Register `@OnEvent()` listeners for role/permission events (`role.created`, `role.permission_assigned`, `role.permission_removed`, `permission.created`) in `apps/backend/src/modules/audit/audit.service.ts`
- [ ] T083 [US7] Emit all auth domain events from `apps/backend/src/modules/auth/auth.service.ts` using `EventEmitter2`
- [ ] T084 [US7] Emit all organization domain events from `apps/backend/src/modules/organizations/organizations.service.ts`
- [ ] T085 [US7] Emit all user and invitation domain events from `apps/backend/src/modules/users/users.service.ts` and `apps/backend/src/modules/invitations/invitations.service.ts`
- [ ] T086 [US7] Emit all role and permission domain events from `apps/backend/src/modules/roles/roles.service.ts` and `apps/backend/src/modules/permissions/permissions.service.ts`

**Checkpoint**: All 19 audit action types (from data-model.md taxonomy) produce verifiable `audit_logs` rows. Audit writes do not block HTTP responses.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, navigation, and developer experience improvements that span all stories.

- [ ] T087 [P] Apply `@nestjs/throttler` rate limiting: strict (10 req/min IP) on `POST /auth/login` and `POST /invitations/accept`; moderate on `POST /auth/refresh` in `apps/backend/src/modules/auth/auth.controller.ts` and `invitations.controller.ts`
- [ ] T088 [P] Add `GET /health` endpoint returning `{ status: 'ok' }` in `apps/backend/src/app.controller.ts`
- [ ] T089 [P] Implement `apps/frontend/src/app/(dashboard)/layout.tsx` — server component that redirects unauthenticated users to `/login`
- [ ] T090 [P] Implement `apps/frontend/src/app/(auth)/layout.tsx` — minimal layout for auth pages (login)
- [ ] T091 [P] Implement root route `apps/frontend/src/app/page.tsx` — redirect to `/dashboard` if authenticated, else `/login`
- [ ] T092 [P] Run `quickstart.md` validation: `npm install` → `migration:run` → seed → `dev:backend` → `dev:frontend` → smoke-test login flow

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)          → No dependencies
Phase 2 (Foundational)   → Depends on Phase 1 · BLOCKS all user story phases
Phase 3 (US1 - Login)    → Depends on Phase 2
Phase 4 (US2 - Orgs)     → Depends on Phase 2
Phase 5 (US3 - Invites)  → Depends on Phase 3 (needs User entity + AuthService)
Phase 6 (US4 - RBAC)     → Depends on Phase 3 (needs User entity + JwtAuthGuard) and Phase 4 (needs Organization entity)
Phase 7 (US5 - Users)    → Depends on Phase 6 (needs RbacGuard + Role entities)
Phase 8 (US6 - Security) → Depends on Phase 3 (hardening auth) and Phase 7 (hardening unlock)
Phase 9 (US7 - Audit)    → Depends on Phases 3–7 (subscribes to all domain events)
Phase 10 (Polish)        → Depends on all above phases
```

### User Story Dependencies

| Story | Depends On | Independent Test Available? |
|-------|-----------|------------------------------|
| US1 — Secure Login (P1) | Phase 2 only | ✅ Yes |
| US2 — Org Management (P1) | Phase 2 only | ✅ Yes |
| US3 — Invitations (P2) | US1 (User entity, AuthService) | ✅ Yes |
| US4 — RBAC (P2) | US1 (JwtAuthGuard), US2 (Org entity) | ✅ Yes |
| US5 — User Mgmt (P2) | US4 (RbacGuard, Role entities) | ✅ Yes |
| US6 — Account Security (P3) | US1 (auth service) + US5 (unlock) | ✅ Yes |
| US7 — Audit Logging (P3) | US1–US5 (domain events emitted) | ✅ Yes |

### Within Each Phase

- Entities marked `[P]` (T025/T026, T037/T038, T051–T054) can be created in parallel
- Services must follow their entity tasks
- Controllers must follow their service tasks
- Frontend tasks within a phase (`[P]`) can run in parallel with each other and with backend entity tasks

---

## Parallel Execution Examples

### Phase 2 (Foundational) — After T008–T017 migrations

```
T018: ConfigModule                    │
T019: nestjs-cls + TenantClsInterceptor  │ All in parallel
T020: EventEmitter setup              │
T021: BullMQ + EmailModule            │
T022: HttpExceptionFilter             │
T023: @Public() + @CurrentUser()      │
T024: packages/shared types           │
```

### Phase 3 (US1 - Login) — Entity layer in parallel

```
T025: User entity       │
T026: RefreshToken entity│ Both in parallel
```

### Phase 6 (US4 - RBAC) — Entity layer fully parallel

```
T051: Role entity         │
T052: Permission entity   │ All 4 in parallel
T053: UserRole entity     │
T054: RolePermission entity│
```

### Phase 9 (US7 - Audit) — Event emitters in parallel

```
T083: Emit auth events      │
T084: Emit org events       │ All 4 in parallel
T085: Emit user/invite events│
T086: Emit role/perm events  │
```

---

## Implementation Strategy

### MVP First (P1 Stories Only — US1 + US2)

1. ✅ Complete Phase 1: Setup
2. ✅ Complete Phase 2: Foundational (CRITICAL)
3. ✅ Complete Phase 3: US1 — Login / Session management
4. ✅ Complete Phase 4: US2 — Organization Management
5. **STOP and VALIDATE**: Full auth + org management works independently
6. Deploy/demo MVP

### Incremental Delivery

| Increment | Phases | Delivers |
|-----------|--------|----------|
| MVP | 1 → 2 → 3 → 4 | Login + Org management |
| + Onboarding | +5 | Invitation flow |
| + Authorization | +6 | Full RBAC enforcement |
| + User Mgmt | +7 | Admin user lifecycle |
| + Security | +8 | Brute-force protection |
| + Compliance | +9 | Audit trail |
| Full Release | +10 | Hardening + polish |

### Parallel Team Strategy

- **Team A**: Backend — Phases 2 → 3 → 6 (auth + RBAC path)
- **Team B**: Backend — Phase 4 → 5 (data + invitations path)
- **Team C**: Frontend — Phases 3–7 frontend tasks (can proceed once API contracts are stable)
- **Team D**: DevOps — Phase 1 + CI/CD + Phase 10

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 92 |
| Phase 1 — Setup | 7 |
| Phase 2 — Foundational | 17 |
| Phase 3 — US1 Login (P1) | 12 |
| Phase 4 — US2 Orgs (P1) | 8 |
| Phase 5 — US3 Invitations (P2) | 6 |
| Phase 6 — US4 RBAC (P2) | 15 |
| Phase 7 — US5 User Mgmt (P2) | 6 |
| Phase 8 — US6 Security (P3) | 5 |
| Phase 9 — US7 Audit (P3) | 10 |
| Phase 10 — Polish | 6 |
| Parallelizable tasks `[P]` | 42 |
| Suggested MVP scope | US1 + US2 (Phases 1–4, 44 tasks) |
