# Permissions Module

Manages the global permission master list. This module is exported as `@Global()` and available to all other modules without explicit import.

## Location

`apps/backend/src/modules/permissions/`

## Key Concepts

- **Global module**: Decorated with `@Global()`, exported automatically. No need to import in other modules.
- **Permission name format**: `<action>.<module>` (e.g., `read.user`, `create.organization`). Enforced by DB CHECK constraint.
- **Global permissions**: Permissions are not scoped to an organization — they are shared across all organizations.
- **Live DB checks**: `getPermissionsForUser(userId, orgId)` performs a live SQL join through `user_roles → role_permissions → permissions`. Results are cached per-request in the CLS context for performance.
- **Auto-seeding**: On application bootstrap (`onApplicationBootstrap`), all permission values from the `Permission` enum (`@shared/auth`) are seeded into the database. Ensures permission list is always in sync with code.
- **Super admin bypass**: Super admins skip all permission checks in `RbacGuard`.

## Entities

### Permission

Table: `permissions`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Permission name (unique, format: `action.module`) |
| `description` | string | Permission description |
| `resource` | string | Resource identifier |
| `action` | string | Action identifier |
| `createdAt` | Date | Creation timestamp |

### RolePermission

Table: `role_permissions`

| Field | Type | Description |
|-------|------|-------------|
| `roleId` | UUID | FK to roles |
| `permissionId` | UUID | FK to permissions |
| `assignedAt` | Date | Assignment timestamp |
| `assignedBy` | UUID | User who made the assignment |

Composite primary key: `[roleId, permissionId]`

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/permissions` | `read_permission` | List all permissions |
| GET | `/permissions/:id` | `read_permission` | Get a single permission by ID |

Note: Create/delete permission endpoints are not exposed via REST. Permissions are managed through the `Permission` enum in code and auto-seeded on bootstrap.

## Permission List (28 total)

| Resource | Permissions |
|----------|------------|
| `shipment` | `read.shipment`, `create.shipment`, `update.shipment`, `delete.shipment` |
| `user` | `read.user`, `create.user`, `update.user`, `delete.user` |
| `role` | `read.role`, `create.role`, `update.role`, `delete.role` |
| `permission` | `read.permission`, `create.permission`, `update.permission`, `delete.permission` |
| `organization` | `read.organization`, `create.organization`, `update.organization`, `delete.organization` |
| `invitation` | `read.invitation`, `create.invitation`, `update.invitation`, `delete.invitation` |
| `audit` | `read.audit` |
| `google_sheet_config` | `read.google_sheet_config`, `create.google_sheet_config`, `update.google_sheet_config`, `delete.google_sheet_config` |

Defined in: `packages/shared/src/auth/index.ts`

## File Structure

```
permissions/
├── permissions.module.ts        # @Global() module
├── permissions.controller.ts
├── permissions.service.ts       # Auto-seeds on bootstrap, live DB permission checks
├── entities/
│   ├── permission.entity.ts     # permissions table
│   └── role-permission.entity.ts # role_permissions table
└── README.md
```
