# Organizations Module

Manages multi-tenant organizations. Only super-admins can create, update, or deactivate organizations.

## Key Concepts

- **Slug auto-generation**: When an organization is created, a URL-safe slug is auto-generated from the name (e.g., `"Acme Corp"` → `acme-corp`). If the slug is already taken, a numeric suffix is appended (`acme-corp-2`, `acme-corp-3`, …).
- **Slug is immutable**: Once set on creation, the slug never changes, even if the name is updated.
- **Deactivation cascade**: Deactivating an organization immediately revokes all active refresh tokens for every member of that organization.
- **Super-admin only**: All organization endpoints require `isSuperAdmin: true`.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations` | Super-Admin | List all organizations (paginated) |
| GET | `/organizations/:id` | Super-Admin | Get a single organization |
| POST | `/organizations` | Super-Admin | Create organization (name + address only, slug auto-generated) |
| PATCH | `/organizations/:id` | Super-Admin | Update name and/or address |
| PATCH | `/organizations/:id/deactivate` | Super-Admin | Deactivate; revokes all member sessions |

## DTO Fields

### `CreateOrganizationDto`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | 2–255 chars |
| `address` | string | ❌ | Optional address text |

`slug` is NOT accepted in the request body — it is always auto-generated server-side.

## Domain Events

| Event | Payload |
|-------|---------|
| `org.created` | `{ orgId, name, slug, actorId }` |
| `org.updated` | `{ orgId, changes, actorId }` |
| `org.deactivated` | `{ orgId, actorId }` |
