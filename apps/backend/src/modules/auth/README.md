# Auth Module

Handles user authentication, JWT token issuance, refresh token rotation, and account security enforcement.

## Key Concepts

- **Access tokens**: Short-lived JWTs (default 15 min), signed with `JWT_SECRET`. Carry `sub`, `username`, `isSuperAdmin`, and `roles` claims.
- **Refresh tokens**: Long-lived, stored as SHA-256 hashes in `refresh_tokens` table. Served as `HttpOnly` cookies. Rotated on every use.
- **Token family reuse detection**: Reusing a previously rotated refresh token immediately revokes the entire token family (all sessions for that user).
- **Inactivity expiry**: Refresh tokens are rejected if `last_used_at` is older than `SESSION_INACTIVITY_MINUTES`.
- **Account lockout**: `LOGIN_MAX_ATTEMPTS` consecutive failures lock the account. Admin must call `POST /users/:id/unlock` to reset.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Issue access + refresh tokens |
| POST | `/auth/refresh` | Cookie | Rotate refresh token, issue new access token |
| POST | `/auth/logout` | JWT | Revoke current refresh token |
| POST | `/auth/logout-all` | JWT | Revoke all refresh tokens (all sessions) |
| GET | `/auth/me` | JWT | Return current authenticated user info |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — (required) | HMAC-SHA256 signing secret for access tokens |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` | Refresh token max age |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed attempts before lockout |
| `SESSION_INACTIVITY_MINUTES` | `30` | Refresh token inactivity TTL in minutes |

## Rate Limiting

- `POST /auth/login`: 10 requests/minute per IP
- `POST /auth/refresh`: 20 requests/minute per IP

## Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `INVALID_CREDENTIALS` | Wrong username or password |
| 403 | `ACCOUNT_LOCKED` | Too many failed attempts |
| 403 | `ACCOUNT_INACTIVE` | Account has been inactivated by admin |
| 401 | `TOKEN_EXPIRED` | Access or refresh token expired |
| 401 | `TOKEN_REVOKED` | Refresh token revoked (logout or family reuse) |

## Domain Events

| Event | Payload |
|-------|---------|
| `auth.login.success` | `{ userId, ip, userAgent }` |
| `auth.login.failed` | `{ username, ip, attempts }` |
| `auth.login.locked` | `{ username, ip }` |
| `auth.logout` | `{ userId }` |
| `auth.token.refreshed` | `{ userId }` |
