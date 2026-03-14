# API Contract: Authentication

**Module**: `auth`  
**Base Path**: `/api/auth`  
**Auth Required**: See per-endpoint notes

---

## Endpoints

### POST `/auth/login`

Authenticate with email and password.

**Auth**: None (`@Public()`)  
**Rate Limited**: Yes (strict — 10 req/min per IP)

**Request Body**:
```json
{
  "username": "user@example.com",
  "password": "plain-text-password"
}
```

**Response `201 Created`**:
```json
{
  "accessToken": "<jwt-string>",
  "user": {
    "id": "uuid",
    "username": "user@example.com",
    "organizationId": "uuid",
    "isSuperAdmin": false,
    "roles": ["admin", "staff"]
  }
}
```
`Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `INVALID_CREDENTIALS` | Username/password mismatch |
| 403 | `ACCOUNT_LOCKED` | Account is locked |
| 403 | `ACCOUNT_INACTIVE` | Account not yet activated |
| 429 | `RATE_LIMITED` | Too many login attempts |

---

### POST `/auth/refresh`

Exchange a refresh token (from cookie) for a new access token. Rotates the refresh token.

**Auth**: None (validated via HttpOnly cookie) (`@Public()`)  
**Rate Limited**: Yes (moderate)

**Request**: No body — refresh token read from `HttpOnly` cookie.

**Response `200 OK`**:
```json
{
  "accessToken": "<new-jwt-string>"
}
```
`Set-Cookie: refresh_token=<new-token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `INVALID_REFRESH_TOKEN` | Token not found, revoked, or expired |
| 401 | `SESSION_EXPIRED` | Inactivity timeout exceeded |

---

### POST `/auth/logout`

Invalidate the current refresh token and end the session.

**Auth**: `JwtAuthGuard`

**Request**: No body.

**Response `200 OK`**:
```json
{ "message": "Logged out successfully" }
```
`Set-Cookie: refresh_token=; Max-Age=0; Path=/api/auth` (clears cookie)

---

### POST `/auth/logout-all`

Revoke all refresh tokens for the current user (all devices).

**Auth**: `JwtAuthGuard`

**Request**: No body.

**Response `200 OK`**:
```json
{ "message": "All sessions terminated" }
```

---

### GET `/auth/me`

Return the current authenticated user's identity.

**Auth**: `JwtAuthGuard`

**Response `200 OK`**:
```json
{
  "id": "uuid",
  "username": "user@example.com",
  "organizationId": "uuid",
  "isSuperAdmin": false,
  "roles": ["manager"],
  "profile": {
    "name": "Jane Doe",
    "position": "Operations Manager",
    "employeeNumber": "EMP-001"
  }
}
```

---

## Common Error Schema

All errors follow:
```json
{
  "statusCode": 401,
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid username or password."
}
```
