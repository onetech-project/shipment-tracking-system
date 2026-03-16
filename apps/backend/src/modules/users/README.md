# Users Module

Manages user accounts within organizations. New users are created exclusively through the Invitation flow.

## Key Concepts

- **Invite-only onboarding**: There is no direct `POST /users` endpoint. Users are created by accepting an invitation (`POST /invitations/accept`).
- **Org-scoped isolation**: Admins can only see and modify users within their own organization. Cross-org requests return `403 Forbidden`.
- **Super-admin cross-org access**: Super-admins may access users across all organizations.
- **Inactivation**: Setting `is_active = false` immediately revokes all refresh tokens, terminating all active sessions.
- **Unlock**: Resets `is_locked`, `failed_attempts`, and `locked_at` atomically.

## Endpoints

| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| GET | `/users` | JWT | `read.user` | List users (org-scoped) |
| GET | `/users/:id` | JWT | `read.user` | Get a single user |
| PATCH | `/users/:id` | JWT | `update.user` | Update profile fields |
| PATCH | `/users/:id/inactivate` | JWT | `update.user` | Inactivate user; revokes all sessions |
| POST | `/users/:id/unlock` | JWT | `update.user` | Unlock locked account |
| PATCH | `/users/:id/password` | JWT | Own account | Change own password |
| PUT | `/users/:id/roles` | JWT | `update.user` | Replace user's role assignments |
| DELETE | `/users/:id` | JWT | `delete.user` | Soft-delete user |

## Domain Events

| Event | Payload |
|-------|---------|
| `user.updated` | `{ userId, changes, actorId }` |
| `user.inactivated` | `{ userId, actorId }` |
| `user.unlocked` | `{ userId, actorId }` |
| `user.role_changed` | `{ userId, roleIds, actorId }` |
