# Invitations Module

Handles the user invitation lifecycle: token generation, email delivery via BullMQ queue, single-use acceptance, and user account creation.

## Location

`apps/backend/src/modules/invitations/`

## Key Concepts

- **Single-use tokens**: Each invitation generates a cryptographically random token (`crypto.randomBytes`). Only the SHA-256 hash is stored in the database. The raw token is included in the invitation email link.
- **Expiry**: Invitations expire after `INVITATION_EXPIRY_HOURS` hours (default: 72). Expired tokens cannot be accepted.
- **Org-scoped**: Invitations are scoped to a specific organization. Admins can only invite users to their own organization.
- **Email delivery**: Invitation emails are sent via BullMQ `email` queue. The `EmailProcessor` uses `@nestjs-modules/mailer` with HTML and text templates. Queue provides retry on failure.
- **Accept flow**: `POST /api/invitations/accept` (public endpoint) validates the token hash and expiry, creates a User (bcrypt hash password), creates a Profile, assigns a Role if `roleId` was specified on the invitation, and marks the invitation as `accepted`.
- **Idempotent re-invite**: Sending a second invitation to the same email in the same org regenerates the token and resets expiry (implementation detail — check service logic).

## Entity

Table: `invitations`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organizationId` | UUID | FK to organizations |
| `email` | string | Invitee email address |
| `invitedBy` | UUID | User who sent the invitation |
| `roleId` | UUID | Role to assign on acceptance (nullable) |
| `invitedName` | string | Display name of invitee |
| `tokenHash` | string | SHA-256 hash of raw token (unique) |
| `status` | enum | `pending` | `accepted` | `expired` | `revoked` |
| `expiresAt` | Date | Token expiration timestamp |
| `usedAt` | Date | When the invitation was accepted (nullable) |
| `createdAt` | Date | Creation timestamp |

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/invitations` | `read_invitation` | List invitations (org-scoped, filterable by status) |
| POST | `/invitations` | `create_invitation` | Send an invitation (generates token, queues email) |
| DELETE | `/invitations/:id` | `delete_invitation` | Cancel a pending invitation (sets status = `revoked`) |
| POST | `/invitations/accept` | Public | Accept invitation — creates User + Profile + UserRole |

### Create Invitation

Request body:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | ✅ | Invitee email |
| `name` | string | ✅ | Display name |
| `roleId` | string (UUID) | ❌ | Role to assign on acceptance |

### Accept Invitation

Request body:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `token` | string | ✅ | Raw token from invitation link |
| `username` | string | ✅ | Desired username |
| `password` | string | ✅ | Password (validated) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INVITATION_EXPIRY_HOURS` | `72` | Hours until invitation token expires |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP authentication username |
| `SMTP_PASS` | — | SMTP authentication password |

## BullMQ Queue

Queue name: `email`

Processor: `EmailProcessor` (`email.processor.ts`)
- Uses `@nestjs-modules/mailer` to send HTML + text emails
- Sends invitation emails with acceptance link
- Retries on failure

## Domain Events

| Event | Payload |
|-------|---------|
| `invitation.created` | `{ invitationId, email, orgId, invitedBy }` |
| `invitation.cancelled` | `{ invitationId, actorId }` |

## File Structure

```
invitations/
├── invitations.module.ts
├── invitations.controller.ts
├── invitations.service.ts
├── email.processor.ts           # BullMQ email queue processor
├── entities/
│   └── invitation.entity.ts     # invitations table
├── dto/
│   └── invitation.dto.ts
└── README.md
```
