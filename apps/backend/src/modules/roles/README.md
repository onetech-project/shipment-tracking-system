# Roles Module

Manages organization-scoped roles and their permission assignments. Roles are the bridge between users and permissions in the RBAC system.

## Location

`apps/backend/src/modules/roles/`

## Key Concepts

- **Org-scoped roles**: Roles belong to a specific organization. Admins can only manage roles within their own org. Super admins can manage roles across all organizations.
- **System roles**: Roles with `isSystem: true` cannot be modified or deleted. These are seeded by the system and provide baseline access control.
- **Immediate effect**: Permission changes take effect on the next authenticated request. The `RbacGuard` performs a live SQL join (`user_roles → role_permissions → permissions`) — no re-login required.
- **Atomic permission replacement**: `PUT /api/roles/:id/permissions` replaces all permissions atomically.
- **Unique constraint**: Role names must be unique within an organization (`[name, organizationId]` composite unique index).
- **Default roles**: Roles can be marked as `isDefault` for automatic assignment during invitation acceptance.

## Entities

### Role

Table: `roles`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Role name |
| `description` | string | Role description |
| `organizationId` | UUID | Owning organization |
| `isSystem` | boolean | System role flag (cannot modify/delete) |
| `isDefault` | boolean | Default role for new users |
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

Unique constraint: `[name, organizationId]`

### UserRole

Table: `user_roles`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | UUID | FK to users |
| `roleId` | UUID | FK to roles |
| `organizationId` | UUID | Organization reference |
| `assignedAt` | Date | Assignment timestamp |
| `assignedBy` | UUID | User who made the assignment |

Composite primary key: `[userId, roleId]`

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/roles` | `read_role` | List roles (org-scoped; super admin sees all) |
| GET | `/roles/:id` | `read_role` | Get role with permissions |
| POST | `/roles` | `create_role` | Create a new role (validates unique name in org) |
| PUT | `/roles/:id` | `update_role` | Update role name/description (cannot modify system roles) |
| DELETE | `/roles/:id` | `delete_role` | Delete non-system role |
| PUT | `/roles/:id/permissions` | `update_role` | Replace all role permissions atomically |
| POST | `/roles/assign` | `update_role` | Assign role to user (creates user-role mapping) |
| DELETE | `/roles/:roleId/users/:userId` | `update_role` | Revoke role from user (removes user-role mapping) |

## Domain Events

| Event | Payload |
|-------|---------|
| `role.created` | `{ roleId, name, orgId, actorId }` |
| `role.updated` | `{ roleId, changes, actorId }` |
| `role.deleted` | `{ roleId, actorId }` |
| `role.assigned` | `{ userId, roleId, actorId }` |
| `role.revoked` | `{ userId, roleId, actorId }` |
| `role.permissions_updated` | `{ roleId, permissionIds, actorId }` |

## File Structure

```
roles/
├── roles.module.ts
├── roles.controller.ts
├── roles.service.ts
├── entities/
│   ├── role.entity.ts           # roles table
│   └── user-role.entity.ts      # user_roles table
├── dto/
│   └── role.dto.ts
└── README.md
```
