# Users Module

Manages user accounts within organizations. Users are scoped to their organization and managed through RBAC roles.

## Location

`apps/backend/src/modules/users/`

## Key Concepts

- **Org-scoped isolation**: Regular users can only see and modify users within their own organization. Cross-org requests return `403 Forbidden`. Super admins may access users across all organizations.
- **User creation**: Users can be created directly via `POST /api/users` by admins, or through the invitation flow (`POST /api/invitations/accept`).
- **Password hashing**: bcrypt with 12 rounds.
- **Account lockout**: After `LOGIN_MAX_ATTEMPTS` (default: 5) consecutive failed login attempts, the account is locked (`isLocked = true`). Admin can unlock via `PATCH /api/users/:id/unlock`.
- **Inactivation**: Setting `isActive = false` immediately revokes all refresh tokens, terminating all active sessions. Different from lockout — inactivation is administrative, lockout is automatic from failed attempts.
- **Password change**: When a user changes their password, all existing refresh tokens are revoked, requiring re-authentication.
- **Admin password reset**: Admin can reset any user's password, optionally requiring password change on next login.

## Entity

Table: `users`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `username` | string | Unique username (unique index) |
| `password` | string | bcrypt hash (12 rounds) |
| `isSuperAdmin` | boolean | System-level admin flag |
| `lastLoginAt` | Date | Last successful login timestamp |
| `lastLogoutAt` | Date | Last logout timestamp |
| `failedAttempts` | number | Consecutive failed login attempts |
| `isLocked` | boolean | Account lockout flag |
| `lockedAt` | Date | Lockout timestamp |
| `requirePasswordReset` | boolean | Require password change on next login |
| `isActive` | boolean | Default `true`. Set to `false` on inactivation |
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/users` | `read_user` | List users (org-scoped; super admin sees all) |
| GET | `/users/:id` | `read_user` | Get a single user (includes profile) |
| POST | `/users` | `create_user` | Create user (hashes password, creates profile) |
| PATCH | `/users/:id` | `update_user` | Update user profile fields (name, email) |
| DELETE | `/users/:id` | `delete_user` | Deactivate user (sets `isActive = false`, revokes all sessions) |
| PATCH | `/users/:id/inactivate` | `update_user` | Inactivate user; revokes all sessions |
| PATCH | `/users/:id/password` | — (own account only) | Change own password (validates current password) |
| PATCH | `/users/:id/password/reset` | `update_user` | Admin reset password (optionally requires password change) |
| PATCH | `/users/:id/unlock` | `update_user` | Unlock locked account (resets `isLocked`, `lockedAt`, `failedAttempts`) |

## Domain Events

| Event | Payload |
|-------|---------|
| `user.created` | `{ userId, username, orgId, actorId }` |
| `user.updated` | `{ userId, changes, actorId }` |
| `user.deactivated` | `{ userId, actorId }` |
| `user.password_changed` | `{ userId, actorId }` |
| `user.password_reset` | `{ userId, actorId }` |
| `user.unlocked` | `{ userId, actorId }` |

## File Structure

```
users/
├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── entities/
│   └── user.entity.ts           # users table
├── dto/
│   └── user.dto.ts
└── README.md
```
