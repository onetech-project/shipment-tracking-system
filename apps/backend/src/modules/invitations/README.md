# Invitations Module

Handles user invitation lifecycle: token generation, email delivery, single-use acceptance, and profile activation.

## Key Concepts

- **Single-use tokens**: Each invitation generates a cryptographically random token. Only the SHA-256 hash is stored in the database.
- **Expiry**: Invitations expire after `INVITATION_EXPIRY_HOURS` hours (default: 72).
- **Idempotent re-invite**: Sending a second invitation to the same email (in the same org) regenerates the token and resets the expiry rather than creating a duplicate.
- **Org-scoped**: Admins can only invite users to their own organization.
- **Email delivery**: Invitation emails are sent via BullMQ queue (`email-queue`) with exponential backoff retry. SMTP is configured via `SMTP_*` environment variables.

## Endpoints

| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| POST | `/invitations` | JWT | `create.invitation` | Send an invitation |
| GET | `/invitations` | JWT | `read.invitation` | List invitations (org-scoped, filterable by status) |
| GET | `/invitations/verify` | Public | — | Verify invite token validity |
| POST | `/invitations/accept` | Public | — | Accept invite and set password |
| DELETE | `/invitations/:id` | JWT | `delete.invitation` | Cancel a pending invitation |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INVITATION_EXPIRY_HOURS` | `72` | Hours until invitation token expires |
| `SMTP_HOST` | — (required) | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP authentication username |
| `SMTP_PASS` | — | SMTP authentication password |
| `SMTP_FROM` | `noreply@example.com` | Sender email address |

## Domain Events

| Event | Payload |
|-------|---------|
| `invitation.sent` | `{ invitationId, email, orgId, actorId }` |
| `invitation.accepted` | `{ invitationId, userId, email }` |
| `invitation.cancelled` | `{ invitationId, actorId }` |
| `invitation.expired` | `{ invitationId, email }` |
