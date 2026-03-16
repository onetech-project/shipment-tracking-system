# Permissions Module

Manages the global permission master list. Only super-admins can create or delete permissions.

## Key Concepts

- **Permission name format**: `<action>.<module>` (e.g., `read.user`, `create.organization`). Valid actions: `read`, `create`, `update`, `delete`.
- **Global permissions**: Permissions are not scoped to an organization — they are shared across all organizations.
- **Super-admin only mutations**: Only super-admins can create or delete permissions. Any authenticated user can list permissions.
- **Seeded defaults**: A set of default permissions is seeded at startup via `RbacSeederService` using TypeORM migrations.

## Endpoints

| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| GET | `/permissions` | JWT | (any) | List all permissions (paginated, filterable by name) |
| GET | `/permissions/:id` | JWT | (any) | Get a single permission |
| POST | `/permissions` | JWT | `create.permission` (super-admin) | Create a new permission |
| DELETE | `/permissions/:id` | JWT | `delete.permission` (super-admin) | Delete a permission |

## Default Permission Set (seeded)

Actions × Modules where modules are: `user`, `role`, `permission`, `organization`, `invitation`, `audit`.

Full set: `read.user`, `create.user`, `update.user`, `delete.user`, `read.role`, `create.role`, `update.role`, `delete.role`, `read.permission`, `create.permission`, `update.permission`, `delete.permission`, `read.organization`, `create.organization`, `update.organization`, `delete.organization`, `read.invitation`, `create.invitation`, `delete.invitation`, `read.audit`.

## Domain Events

| Event | Payload |
|-------|---------|
| `permission.created` | `{ permissionId, name, actorId }` |
| `permission.deleted` | `{ permissionId, name, actorId }` |
