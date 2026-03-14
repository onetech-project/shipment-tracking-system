# Data Model: Authentication & Authorization System

**Branch**: `001-auth-rbac-multi-organization` | **Date**: 2026-03-14  
**Research**: [research.md](research.md) | **Spec**: [spec.md](spec.md)

This document defines the full data model for the auth/RBAC feature. All tables use PostgreSQL with TypeORM migrations. Every table includes `created_at` and `updated_at` per the constitution.

---

## Entity Overview

```
organizations
 └── users (belongs to one org)
      └── profiles (one-to-one with user)
      └── user_roles (many-to-many with roles)
           └── roles (scoped to org)
                └── role_permissions (many-to-many with permissions)
                     └── permissions (global master data)
refresh_tokens  (belongs to user)
invitations     (scoped to org)
audit_logs      (polymorphic, partitioned by month)
```

---

## Tables

### `organizations`

Top-level tenant unit.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `name` | `VARCHAR(255)` | NOT NULL | |
| `address` | `TEXT` | NULLABLE | |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | False = deactivated; all users lose access |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Auto-updated on change |

**Indexes**:
- `idx_organizations_name` on `(name)`

**Relationships**:
- Has many `users` (via `profiles.organization_id`)
- Has many `roles` (via `roles.organization_id`)
- Has many `invitations` (via `invitations.organization_id`)

---

### `users`

Authentication identity. Credentials and security state only. Personal data is in `profiles`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `username` | `VARCHAR(255)` | NOT NULL, UNIQUE | Email address used as username |
| `password` | `VARCHAR(255)` | NOT NULL | bcrypt hash (cost factor 12), never plaintext |
| `is_super_admin` | `BOOLEAN` | NOT NULL, DEFAULT false | Platform-level bypass; not org-scoped |
| `last_login_at` | `TIMESTAMPTZ` | NULLABLE | Updated on successful login |
| `last_logout_at` | `TIMESTAMPTZ` | NULLABLE | Updated on explicit logout |
| `failed_attempts` | `INTEGER` | NOT NULL, DEFAULT 0 | Reset to 0 on successful login or admin unlock |
| `is_locked` | `BOOLEAN` | NOT NULL, DEFAULT false | Set true when `failed_attempts` hits threshold |
| `locked_at` | `TIMESTAMPTZ` | NULLABLE | Timestamp when account was locked |
| `require_password_reset` | `BOOLEAN` | NOT NULL, DEFAULT false | Optional flag set by admin on unlock |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT false | false until invitation is accepted |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_users_username` on `(username)` (UNIQUE enforced by constraint)
- `idx_users_is_super_admin` on `(is_super_admin)` WHERE `is_super_admin = true` (partial)

**Validation Rules**:
- `username` must be a valid email format (enforced by class-validator DTO, not DB constraint)
- `password` must never be stored in plaintext — bcrypt hash only
- `failed_attempts` must be >= 0

**State Transitions**:
```
is_active: false (invited) → true (invitation accepted)
is_locked: false → true (failed_attempts >= threshold)
           true → false (admin unlocks)
```

---

### `profiles`

Extended personal and organizational information for a user.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | NOT NULL, FK → users(id) ON DELETE CASCADE, UNIQUE | One-to-one with user |
| `organization_id` | `UUID` | NOT NULL, FK → organizations(id) | User's home organization |
| `name` | `VARCHAR(255)` | NOT NULL | Display name |
| `dob` | `DATE` | NULLABLE | Date of birth |
| `position` | `VARCHAR(255)` | NULLABLE | Job title/position |
| `join_at` | `DATE` | NULLABLE | Date user joined organization |
| `employee_number` | `VARCHAR(100)` | NULLABLE | Org-assigned employee ID |
| `phone_number` | `VARCHAR(50)` | NULLABLE | |
| `email` | `VARCHAR(255)` | NULLABLE | May differ from login username (contact email) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_profiles_user_id` on `(user_id)` (enforced by UNIQUE constraint)
- `idx_profiles_organization_id` on `(organization_id)`

**Relationships**:
- Belongs to one `user`
- Belongs to one `organization`

---

### `roles`

Named permission group, scoped to an organization. Platform-level roles (e.g., `super_admin`) have `organization_id = NULL`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `name` | `VARCHAR(100)` | NOT NULL | e.g., `admin`, `manager`, `staff` |
| `organization_id` | `UUID` | NULLABLE, FK → organizations(id) ON DELETE CASCADE | NULL = platform-level role (super_admin) |
| `is_default` | `BOOLEAN` | NOT NULL, DEFAULT false | true for seeded default roles |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `uq_roles_name_org` UNIQUE on `(name, organization_id)` — prevents duplicate role names per org
- `idx_roles_organization_id` on `(organization_id)`

**Validation Rules**:
- `name` maximum 100 characters; only alphanumeric, hyphens, underscores
- An org Admin cannot create roles with `organization_id = NULL`

**Default seeded roles** (inserted by `RbacSeederService`):

| `name` | `organization_id` | `is_default` |
|--------|-------------------|--------------|
| `super_admin` | NULL (platform) | true |
| `admin` | NULL (template) | true |
| `owner` | NULL (template) | true |
| `manager` | NULL (template) | true |
| `staff` | NULL (template) | true |

---

### `permissions`

Global master data. Defines all possible access rights. Only Super Admin creates entries.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `name` | `VARCHAR(200)` | NOT NULL, UNIQUE | Format: `<action>.<module>`, e.g., `read.shipment` |
| `description` | `TEXT` | NULLABLE | Human-readable description |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `uq_permissions_name` UNIQUE on `(name)`

**Validation Rules**:
- `name` must match regex `^(read|create|update|delete)\.[a-z][a-z0-9_]*$`
- `name` is immutable after creation (changing it breaks existing assignments)

**Supported actions**: `read`, `create`, `update`, `delete`

**Initial permission set** (seeded by `RbacSeederService`):

| Module | Permissions |
|--------|-------------|
| `shipment` | `read.shipment`, `create.shipment`, `update.shipment`, `delete.shipment` |
| `user` | `read.user`, `create.user`, `update.user`, `delete.user` |
| `role` | `read.role`, `create.role`, `update.role`, `delete.role` |
| `permission` | `read.permission`, `create.permission`, `update.permission`, `delete.permission` |
| `organization` | `read.organization`, `create.organization`, `update.organization`, `delete.organization` |
| `invitation` | `read.invitation`, `create.invitation`, `update.invitation`, `delete.invitation` |
| `audit` | `read.audit` |

---

### `user_roles`

Mapping table: a user holds many roles within an organization.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `user_id` | `UUID` | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| `role_id` | `UUID` | NOT NULL, FK → roles(id) ON DELETE CASCADE | |
| `organization_id` | `UUID` | NOT NULL, FK → organizations(id) ON DELETE CASCADE | Denormalized for efficient tenant-scoped queries |
| `assigned_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `assigned_by` | `UUID` | NULLABLE, FK → users(id) | Who assigned the role |

**Primary Key**: `(user_id, role_id, organization_id)`

**Indexes**:
- `idx_user_roles_user_org` on `(user_id, organization_id)` — primary RBAC lookup path
- `idx_user_roles_role_id` on `(role_id)`

**Validation Rules**:
- A user can be assigned the same role in different organizations (different rows with different `organization_id`)
- Assigning `super_admin` role requires the assigning user to also be super_admin

---

### `role_permissions`

Mapping table: a role holds many permissions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `role_id` | `UUID` | NOT NULL, FK → roles(id) ON DELETE CASCADE | |
| `permission_id` | `UUID` | NOT NULL, FK → permissions(id) ON DELETE CASCADE | |
| `assigned_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `assigned_by` | `UUID` | NULLABLE, FK → users(id) | Who assigned the permission to the role |

**Primary Key**: `(role_id, permission_id)`

**Indexes**:
- `idx_role_permissions_role_id` on `(role_id)` — used in RBAC JOIN query

---

### `refresh_tokens`

Stores active and revoked refresh token hashes for session management.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| `organization_id` | `UUID` | NULLABLE | Org context at time of login (NULL for super_admin) |
| `token_hash` | `CHAR(64)` | NOT NULL, UNIQUE | SHA-256 hex of the raw refresh token |
| `family_id` | `UUID` | NOT NULL | Rotation lineage; reuse detection revokes entire family |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Absolute expiry (default: 7 days from creation) |
| `last_used_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Updated on each refresh; inactivity check |
| `revoked_at` | `TIMESTAMPTZ` | NULLABLE | Set on logout, rotation, or breach detection |
| `ip_address` | `INET` | NULLABLE | Client IP at issuance |
| `user_agent` | `TEXT` | NULLABLE | User-Agent at issuance (for session UI) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_refresh_tokens_token_hash` UNIQUE on `(token_hash)` — primary lookup
- `idx_refresh_tokens_user_id` on `(user_id)` — for logout-all-devices
- `idx_refresh_tokens_family_id` on `(family_id)` — for breach family revocation

**State Transitions**:
```
Active:  revoked_at IS NULL AND expires_at > NOW()
Expired: expires_at <= NOW()
Revoked: revoked_at IS NOT NULL
```

**Cleanup**: Periodic job `DELETE WHERE expires_at < NOW() - INTERVAL '1 day'`.

---

### `invitations`

Tracks email invitations to join an organization.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `organization_id` | `UUID` | NOT NULL, FK → organizations(id) ON DELETE CASCADE | |
| `email` | `VARCHAR(255)` | NOT NULL | Invitee email address |
| `invited_by` | `UUID` | NOT NULL, FK → users(id) | Admin who sent the invite |
| `token_hash` | `CHAR(64)` | NOT NULL, UNIQUE | SHA-256 of 32-byte random token |
| `status` | `VARCHAR(20)` | NOT NULL, DEFAULT 'pending' | `pending`, `accepted`, `expired`, `revoked` |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Default: 72 hours from creation |
| `used_at` | `TIMESTAMPTZ` | NULLABLE | Set on acceptance (atomic single-use gate) |
| `role_id` | `UUID` | NULLABLE, FK → roles(id) | Pre-assigned role (optional) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `uq_invitations_org_email_pending` UNIQUE partial on `(organization_id, email) WHERE status = 'pending'`
- `idx_invitations_token_hash` UNIQUE on `(token_hash)`
- `idx_invitations_organization_id` on `(organization_id)`

**State Transitions**:
```
pending → accepted (atomic UPDATE WHERE used_at IS NULL + expires_at > NOW())
pending → expired  (status updated by cleanup job when expires_at <= NOW())
pending → revoked  (admin revokes or re-invite replaces it)
```

---

### `audit_logs`

Immutable append-only log of critical operations. Range-partitioned by month.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | NOT NULL, DEFAULT gen_random_uuid() | Part of partition key |
| `user_id` | `UUID` | NULLABLE | Actor; NULL for system-generated events |
| `action` | `VARCHAR(100)` | NOT NULL | e.g., `auth.login`, `user.role_assigned`, `org.deactivated` |
| `entity_type` | `VARCHAR(100)` | NULLABLE | e.g., `User`, `Organization`, `Role` |
| `entity_id` | `UUID` | NULLABLE | ID of affected entity |
| `metadata` | `JSONB` | NULLABLE | Additional context (e.g., `{ "roleId": "...", "roleName": "..." }`) |
| `ip_address` | `INET` | NULLABLE | |
| `user_agent` | `TEXT` | NULLABLE | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Partition key |

**Primary Key**: `(id, created_at)` — composite required by PostgreSQL range partitioning.

**Indexes** (on each partition):
- `idx_audit_logs_user_id` on `(user_id, created_at DESC)` — user activity view
- `idx_audit_logs_entity` on `(entity_type, entity_id, created_at DESC)` — entity history view

**Partitioning**:
```sql
CREATE TABLE audit_logs (
  ...
) PARTITION BY RANGE (created_at);

-- Monthly partitions managed by pg_cron:
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

**Audit Action Taxonomy**:

| Action | Trigger |
|--------|---------|
| `auth.login.success` | Successful login |
| `auth.login.failed` | Failed login attempt |
| `auth.logout` | Explicit logout |
| `auth.account.locked` | Account locked after threshold |
| `auth.account.unlocked` | Admin unlocks account |
| `user.created` | User created by admin |
| `user.updated` | User profile updated |
| `user.deleted` | User deleted |
| `user.role_assigned` | Role assigned to user |
| `user.role_removed` | Role removed from user |
| `user.invited` | Invitation sent |
| `user.activation` | Invitation accepted, account activated |
| `role.created` | New role created |
| `role.permission_assigned` | Permission added to role |
| `role.permission_removed` | Permission removed from role |
| `permission.created` | New permission created (Super Admin) |
| `org.created` | New organization created |
| `org.updated` | Organization details updated |
| `org.deactivated` | Organization deactivated |

---

## Entity Relationships Diagram

```
organizations
│
├── profiles (organization_id FK)
│    └── users (user_id FK, one-to-one)
│         ├── user_roles (user_id FK)
│         │    └── roles (role_id FK, organization_id FK)
│         │         └── role_permissions (role_id FK)
│         │              └── permissions (permission_id FK)
│         └── refresh_tokens (user_id FK)
│
├── roles (organization_id FK)
│
└── invitations (organization_id FK)

audit_logs (polymorphic, appends for all entities)
```

---

## RBAC Authorization Query

The permission check performed by `PermissionService.getPermissions(userId, orgId)`:

```sql
SELECT DISTINCT p.name
FROM user_roles ur
  INNER JOIN roles r ON ur.role_id = r.id
  INNER JOIN role_permissions rp ON r.id = rp.role_id
  INNER JOIN permissions p ON rp.permission_id = p.id
WHERE
  ur.user_id = $1
  AND ur.organization_id = $2
  AND (r.organization_id = $2 OR r.organization_id IS NULL)
```

Result cached as `Set<string>` for the lifetime of the current HTTP request.

---

## Migration Strategy

All schema changes via TypeORM migrations. Migration naming: `<timestamp>-<description>.ts`.

| Migration | Tables Created |
|-----------|---------------|
| `001-create-organizations` | `organizations` |
| `002-create-users` | `users` |
| `003-create-profiles` | `profiles` |
| `004-create-roles-permissions` | `roles`, `permissions` |
| `005-create-user-roles-role-permissions` | `user_roles`, `role_permissions` |
| `006-create-refresh-tokens` | `refresh_tokens` |
| `007-create-invitations` | `invitations` |
| `008-create-audit-logs` | `audit_logs` (partitioned) |
| `009-create-indexes` | All secondary indexes |

---

## Tenant Isolation Summary

All tenant-scoped tables carry `organization_id` and are filtered via `TenantRepository<T>`:

| Table | Tenant-Scoped? | `organization_id` Source |
|-------|---------------|--------------------------|
| `organizations` | ❌ Platform-level | — |
| `users` | ✅ (via `profiles`) | `profiles.organization_id` |
| `profiles` | ✅ | `profiles.organization_id` |
| `roles` | ✅ | `roles.organization_id` |
| `permissions` | ❌ Global master data | — |
| `user_roles` | ✅ | `user_roles.organization_id` |
| `role_permissions` | ❌ | — (scoped via `roles.organization_id`) |
| `refresh_tokens` | ✅ | `refresh_tokens.organization_id` |
| `invitations` | ✅ | `invitations.organization_id` |
| `audit_logs` | ✅ (query-time) | `audit_logs.user_id` + org context in `metadata` |
