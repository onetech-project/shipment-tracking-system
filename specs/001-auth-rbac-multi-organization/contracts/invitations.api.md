# API Contract: Invitations

**Module**: `invitations`  
**Base Path**: `/api/invitations`  
**Auth Required**: See per-endpoint notes  
**Tenant Scope**: Org-scoped for admin endpoints; token-based for public endpoints

---

## Endpoints

### POST `/invitations`

Send an invitation email to a new user. Super Admin can target any org; Org Admin can only invite to their own org.

**Auth**: `JwtAuthGuard`  
**Permission**: `create.invitation`  
**Rate Limited**: Yes (moderate — 20 invitations/hour per admin)

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "organizationId": "uuid",
  "roleId": "uuid"
}
```

**Validation**:
- `email`: required, valid email format
- `organizationId`: must match caller's org unless Super Admin
- `roleId`: optional; must be a valid role in the target org

**Behavior** (idempotent re-invite):
- If a `pending` invitation for `(organizationId, email)` exists and is still valid → return it (no new email sent)
- If the existing invitation is expired or revoked → revoke it and create a new one (new email sent)
- If the user is already an active member of the org → `409 ALREADY_MEMBER`

**Response `201 Created`**:
```json
{
  "id": "uuid",
  "email": "newuser@example.com",
  "organizationId": "uuid",
  "organizationName": "Acme Corp",
  "status": "pending",
  "expiresAt": "2026-03-17T00:00:00Z",
  "createdAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Org mismatch and not Super Admin |
| 409 | `ALREADY_MEMBER` | User is already active in the org |

---

### GET `/invitations`

List invitations for the current organization.

**Auth**: `JwtAuthGuard`  
**Permission**: `read.invitation`

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Default: 1 |
| `limit` | number | Default: 20 |
| `status` | string | `pending`, `accepted`, `expired`, `revoked` |

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "pending@example.com",
      "status": "pending",
      "invitedBy": { "id": "uuid", "name": "Admin User" },
      "expiresAt": "2026-03-17T00:00:00Z",
      "createdAt": "2026-03-14T00:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

---

### GET `/invitations/verify`

Validate an invitation token. Returns metadata so the frontend can show the registration form or an error. **Does not consume the token**.

**Auth**: None (`@Public()`)  
**Rate Limited**: Yes (strict per IP)

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `token` | string | 64-char hex invitation token |

**Response `200 OK`**:
```json
{
  "email": "newuser@example.com",
  "organizationId": "uuid",
  "organizationName": "Acme Corp",
  "expiresAt": "2026-03-17T00:00:00Z",
  "valid": true
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 410 | `INVITATION_EXPIRED` | Token expired |
| 409 | `INVITATION_ALREADY_USED` | Token already consumed |
| 404 | `INVITATION_NOT_FOUND` | Invalid token |

---

### POST `/invitations/accept`

Accept an invitation: consume the token, create the user account, and log the user in.

**Auth**: None (`@Public()`)  
**Rate Limited**: Yes (strict per IP)

**Request Body**:
```json
{
  "token": "<64-char-hex>",
  "firstName": "Jane",
  "lastName": "Doe",
  "password": "SecurePass123!"
}
```

**Validation**:
- `token`: required, 64-char hex string
- `firstName`, `lastName`: required, 1–100 characters each
- `password`: required, min 8 chars, must include uppercase, lowercase, digit

**Behavior**:
1. Validate token (`expires_at > NOW() AND used_at IS NULL`)
2. Atomic `UPDATE WHERE used_at IS NULL` (idempotency guard)
3. Create user + profile record
4. Assign pre-specified role (if any) from invitation
5. Issue access token + refresh token

**Response `201 Created`**:
```json
{
  "accessToken": "<jwt-string>",
  "user": {
    "id": "uuid",
    "username": "newuser@example.com",
    "organizationId": "uuid",
    "roles": ["staff"]
  }
}
```
`Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `INVITATION_ALREADY_USED` | Token already consumed (race condition resolved atomically) |
| 410 | `INVITATION_EXPIRED` | Token expired |
| 404 | `INVITATION_NOT_FOUND` | Invalid token |
| 422 | `VALIDATION_ERROR` | Invalid password format |

---

### DELETE `/invitations/:id`

Revoke a pending invitation. Admin only.

**Auth**: `JwtAuthGuard`  
**Permission**: `delete.invitation`

**Response `200 OK`**:
```json
{ "message": "Invitation revoked successfully" }
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Cross-org invitation |
| 404 | `INVITATION_NOT_FOUND` | |
| 409 | `INVITATION_ALREADY_COMPLETED` | Cannot revoke accepted invitation |

---

## Invitation Email Template Variables

The invitation email (`invitation.hbs`) receives:

```json
{
  "inviteeName": "newuser@example.com",
  "organizationName": "Acme Corp",
  "inviterName": "Jane Admin",
  "acceptLink": "https://app.example.com/accept-invite?token=<hex>",
  "expiresAt": "March 17, 2026 at 12:00 PM UTC",
  "supportEmail": "support@example.com"
}
```
