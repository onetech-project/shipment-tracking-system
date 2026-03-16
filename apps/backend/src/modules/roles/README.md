# Roles Module

Manages organization-scoped roles and their permission assignments. Permission assignments take effect immediately on the next request — no re-login required.

## Key Concepts

- **Org-scoped roles**: Roles belong to a specific organization. Admins can only manage roles in their own org.
- **System roles**: Roles with `isSystem: true` (e.g., `super-admin`, `admin`) cannot be deleted.
- **Immediate effect**: Role permission changes are reflected on the next authenticated request because the RBAC guard performs a live DB join via `PermissionService.getPermissions()` (cached per-request via `nestjs-cls`).
- **PUT replaces all**: `PUT /roles/:id/permissions` replaces the full permission set atomically.

## Endpoints

| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| GET | `/roles` | JWT | `read.role` | List roles (org-scoped) |
| GET | `/roles/:id` | JWT | `read.role` | Get role with permissions |
| POST | `/roles` | JWT | `create.role` | Create a new role |
| PATCH | `/roles/:id` | JWT | `update.role` | Update role name/description |
| DELETE | `/roles/:id` | JWT | `delete.role` | Delete non-system role |
| PUT | `/roles/:id/permissions` | JWT | `update.role` | Replace all role permissions |

## Role Name Format

Role names must match `^[a-z0-9\-_]+$` (lowercase alphanumeric, hyphens, underscores).

## Domain Events

| Event | Payload |
|-------|---------|
| `role.created` | `{ roleId, name, orgId, actorId }` |
| `role.updated` | `{ roleId, changes, actorId }` |
| `role.deleted` | `{ roleId, actorId }` |
| `role.permissions_updated` | `{ roleId, permissionIds, actorId }` |
