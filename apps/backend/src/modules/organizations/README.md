# Organizations Module

Manages multi-tenant organizations. Organizations are the core tenant isolation boundary — all data (users, roles, shipments) is scoped to a specific organization.

## Location

`apps/backend/src/modules/organizations/`

## Key Concepts

- **Slug auto-generation**: When an organization is created, a URL-safe slug is auto-generated from the name (e.g., `"Acme Corp"` → `acme-corp`). If the slug is already taken, a numeric suffix is appended (`acme-corp-2`, `acme-corp-3`, …). Slug is generated using `generateSlug()` and `ensureUniqueSlug()` from `common/utils/slug.util.ts`.
- **Slug is immutable**: Once set on creation, the slug never changes, even if the name is updated.
- **Deactivation cascade**: Deactivating an organization (`isActive = false`) immediately revokes all active refresh tokens for every user in that organization, terminating all active sessions.
- **Permission-gated endpoints**: All organization endpoints require specific permissions (`read/create/update/delete_organization`), enforced via `@Authorize()` decorator and `RbacGuard`.
- **Tenant scoping**: Regular users can only see their own organization. Super admins can see all organizations.

## Entities

### Organization

Table: `organizations`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Organization name (unique) |
| `slug` | string | URL-safe slug (unique, auto-generated, immutable) |
| `address` | string | Optional address text |
| `isActive` | boolean | Default `true`. Set to `false` on deactivation |
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

### Profile

Table: `profiles`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | FK to users (CASCADE delete) |
| `organizationId` | UUID | FK to organizations |
| `name` | string | Display name |
| `email` | string | Email address |
| `phone` | string | Phone number |
| `avatarUrl` | string | Avatar image URL |
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/organizations` | `read_organization` | List all organizations (ordered by createdAt DESC) |
| GET | `/organizations/:id` | `read_organization` | Get a single organization by ID |
| POST | `/organizations` | `create_organization` | Create organization (name + address, slug auto-generated) |
| PATCH | `/organizations/:id` | `update_organization` | Update name and/or address |
| DELETE | `/organizations/:id` | `delete_organization` | Deactivate organization (sets `isActive = false`, revokes all sessions) |

### CreateOrganizationDto

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | 2–255 chars |
| `address` | string | ❌ | Optional address text |

`slug` is NOT accepted in the request body — it is always auto-generated server-side.

## Domain Events

| Event | Payload |
|-------|---------|
| `organization.created` | `{ orgId, name, slug, actorId }` |
| `organization.updated` | `{ orgId, changes, actorId }` |
| `organization.deactivated` | `{ orgId, actorId }` |

## File Structure

```
organizations/
├── organizations.module.ts
├── organizations.controller.ts
├── organizations.service.ts
├── entities/
│   ├── organization.entity.ts   # organizations table
│   └── profile.entity.ts        # profiles table
├── dto/
│   └── organization.dto.ts
└── README.md
```
