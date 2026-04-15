# Auth Module

Handles user authentication, JWT token issuance, refresh token rotation, session management, and account security enforcement.

## Location

`apps/backend/src/modules/auth/`

## Key Concepts

- **Access tokens**: Short-lived JWTs (default 15 min), signed with `JWT_ACCESS_SECRET`. Carry claims: `{ sub, org_id, is_super_admin, roles, permissions }`. Extracted from `Authorization: Bearer <token>` header.
- **Refresh tokens**: Long-lived (default 7d), stored as SHA-256 hashes in `refresh_tokens` table. Served as `HttpOnly` cookies (`secure` in production, `sameSite: strict`, path `/api/auth`). Rotated on every use.
- **Token family reuse detection**: Each refresh token has a `familyId`. Reusing a previously rotated refresh token immediately revokes the entire token family (all sessions for that user). This detects token replay attacks.
- **Inactivity expiry**: Refresh tokens are rejected if `last_used_at` is older than `SESSION_INACTIVITY_MINUTES` (default: 30).
- **Account lockout**: `LOGIN_MAX_ATTEMPTS` consecutive failures (default: 5) lock the account. Admin must call `PATCH /api/users/:id/unlock` to reset.
- **Password hashing**: bcrypt with 12 rounds.

## Refresh Token Entity

Table: `refresh_tokens`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | FK to users (CASCADE delete) |
| `organizationId` | UUID | Tenant reference |
| `tokenHash` | string | SHA-256 hash of raw token (unique) |
| `familyId` | string | Rotation family identifier |
| `expiresAt` | Date | Token expiration |
| `lastUsedAt` | Date | Last usage timestamp |
| `revokedAt` | Date | Revocation timestamp (null if active) |
| `ipAddress` | inet | Client IP at creation |
| `userAgent` | string | Client user agent |
| `createdAt` | Date | Creation timestamp |

## Endpoints

All paths have `/api` prefix.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public (throttled 10/min) | Login, returns `{ accessToken, user }`, sets refresh_token cookie |
| POST | `/auth/refresh` | Public (jwt-refresh guard) | Rotate refresh token, issue new access token |
| POST | `/auth/logout` | JWT | Revoke current refresh token, sets `lastLogoutAt` |
| POST | `/auth/logout-all` | JWT | Revoke all refresh tokens for user |
| GET | `/auth/me` | JWT | Return current authenticated user info |

### Login Response

```json
{
  "accessToken": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "username": "john",
    "organizationId": "uuid",
    "isSuperAdmin": false,
    "roles": ["admin"],
    "permissions": ["read.user", "update.user"]
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ACCESS_SECRET` | — (required) | 64+ char HMAC-SHA256 signing secret for access tokens |
| `JWT_REFRESH_SECRET` | — (required) | 64+ char signing secret for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token max age |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed attempts before account lockout |
| `SESSION_INACTIVITY_MINUTES` | `30` | Refresh token inactivity TTL in minutes |

## Rate Limiting

- `POST /auth/login`: 10 requests/minute per IP (via `@Throttle()`)

## Error Responses

| HTTP | Meaning |
|------|---------|
| 401 | Invalid credentials (wrong username or password) |
| 403 | Account locked (too many failed attempts) |
| 403 | Account inactive (admin deactivated) |
| 401 | Token expired (access or refresh token) |
| 401 | Token revoked (logout or family reuse detection) |

## Domain Events

| Event | Payload |
|-------|---------|
| `auth.login` | `{ userId, ip, userAgent }` |
| `auth.login_failed` | `{ username, ip, attempts }` |
| `auth.logout` | `{ userId }` |
| `auth.logout_all` | `{ userId }` |

## File Structure

```
auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   ├── jwt.strategy.ts          # Passport JWT strategy
│   └── refresh-token.strategy.ts # Passport refresh token strategy
├── dto/
│   └── login.dto.ts             # { username, password }
├── entities/
│   └── refresh-token.entity.ts  # refresh_tokens table
└── README.md
```
