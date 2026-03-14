# API Contract: Users

**Module**: `users`  
**Base Path**: `/api/users`  
**Auth Required**: `JwtAuthGuard` on all endpoints  
**Tenant Scope**: Organization-scoped (Super Admin can target any org via `?organizationId=`)

---

## Endpoints

### GET `/users`

List users in the current user's organization. Super Admin may pass `organizationId` query param.

**Permission**: `read.user`

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Default: 1 |
| `limit` | number | Default: 20, max: 100 |
| `organizationId` | UUID | Super Admin only — target org |
| `isActive` | boolean | Filter by active status |
| `search` | string | Search by name or email |

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "username": "user@example.com",
      "isActive": true,
      "isLocked": false,
      "roles": [
        { "id": "uuid", "name": "manager" }
      ],
      "profile": {
        "name": "Jane Doe",
        "position": "Manager",
        "employeeNumber": "EMP-001",
        "phoneNumber": "+66-2-123-4567"
      },
      "lastLoginAt": "2026-03-14T08:00:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

### GET `/users/:id`

Get a single user by ID (must be in same org, or Super Admin).

**Permission**: `read.user`

**Response `200 OK`**: Full user object (same shape as list item above, with `updatedAt`).

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | User belongs to different org and requester is not Super Admin |
| 404 | `USER_NOT_FOUND` | |

---

### POST `/users`

Create a new user in the organization. Super Admin may specify any org.

**Permission**: `create.user`

**Request Body**:
```json
{
  "username": "newuser@example.com",
  "password": "SecurePassword123!",
  "organizationId": "uuid",
  "profile": {
    "name": "John Smith",
    "position": "Staff",
    "employeeNumber": "EMP-099",
    "phoneNumber": "+66-2-000-0000",
    "dob": "1990-01-15",
    "joinAt": "2026-03-14"
  },
  "roleIds": ["uuid"]
}
```

**Validation**:
- `username`: required, valid email format
- `password`: required, min 8 chars, must include uppercase, lowercase, digit
- `organizationId`: required; must match caller's org unless Super Admin
- `profile.name`: required

**Response `201 Created`**: Created user object.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Org mismatch and not Super Admin |
| 409 | `EMAIL_ALREADY_EXISTS` | Duplicate username |

---

### PATCH `/users/:id`

Update user details (profile, active status). Must be in same org or Super Admin.

**Permission**: `update.user`

**Request Body** (all fields optional):
```json
{
  "profile": {
    "name": "John Smith Jr.",
    "position": "Senior Staff",
    "phoneNumber": "+66-2-111-2222"
  },
  "isActive": true
}
```

**Response `200 OK`**: Updated user object.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Cross-org access |
| 404 | `USER_NOT_FOUND` | |

---

### DELETE `/users/:id`

Delete a user and terminate all their active sessions.

**Permission**: `delete.user`

**Request**: No body.

**Response `200 OK`**:
```json
{ "message": "User deleted successfully" }
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Cross-org access |
| 403 | `CANNOT_DELETE_SELF` | User attempts to delete their own account |
| 404 | `USER_NOT_FOUND` | |

---

### PUT `/users/:id/roles`

Replace all roles for a user. Org Admin can only assign roles within their org.

**Permission**: `update.user`

**Request Body**:
```json
{
  "roleIds": ["uuid", "uuid"]
}
```

**Response `200 OK`**:
```json
{
  "userId": "uuid",
  "roles": [
    { "id": "uuid", "name": "manager" },
    { "id": "uuid", "name": "staff" }
  ]
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Cross-org user or role |
| 404 | `USER_NOT_FOUND` | |
| 404 | `ROLE_NOT_FOUND` | One or more role IDs invalid |

---

### POST `/users/:id/unlock`

Unlock a locked user account. Admin+ only.

**Permission**: `update.user`

**Request Body** (optional):
```json
{
  "requirePasswordReset": false
}
```

**Response `200 OK`**:
```json
{
  "id": "uuid",
  "isLocked": false,
  "failedAttempts": 0,
  "requirePasswordReset": false
}
```

---

### POST `/users/:id/change-password`

Change a user's password. User can change own; Admin can reset for others.

**Permission**: Self (no special permission) or `update.user` for others

**Request Body**:
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecure456!"
}
```
*`currentPassword` is required when changing own password. Omitted when Admin resets for another user.*

**Response `200 OK`**:
```json
{ "message": "Password changed successfully" }
```
