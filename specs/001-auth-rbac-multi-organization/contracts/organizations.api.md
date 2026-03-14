# API Contract: Organizations

**Module**: `organizations`  
**Base Path**: `/api/organizations`  
**Auth Required**: `JwtAuthGuard` on all endpoints  
**Permission Scope**: Super Admin only (create/update/deactivate); organization-scoped read

---

## Endpoints

### GET `/organizations`

List all organizations.

**Permission**: `read.organization` (Super Admin in practice)

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `isActive` | boolean | Filter by active status |

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Acme Corp",
      "address": "123 Main St, Bangkok 10100",
      "isActive": true,
      "createdAt": "2026-03-14T00:00:00Z",
      "updatedAt": "2026-03-14T00:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### GET `/organizations/:id`

Get a single organization by ID.

**Permission**: `read.organization`

**Response `200 OK`**:
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "address": "123 Main St, Bangkok 10100",
  "isActive": true,
  "createdAt": "2026-03-14T00:00:00Z",
  "updatedAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `ORGANIZATION_NOT_FOUND` | ID does not exist |

---

### POST `/organizations`

Create a new organization. **Super Admin only**.

**Permission**: `create.organization`

**Request Body**:
```json
{
  "name": "New Corp",
  "address": "456 Park Ave, Bangkok 10200"
}
```

**Validation**:
- `name`: required, 1–255 characters
- `address`: optional, max 1000 characters

**Response `201 Created`**:
```json
{
  "id": "uuid",
  "name": "New Corp",
  "address": "456 Park Ave, Bangkok 10200",
  "isActive": true,
  "createdAt": "2026-03-14T00:00:00Z",
  "updatedAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Not Super Admin |
| 409 | `ORGANIZATION_NAME_EXISTS` | Duplicate organization name |

---

### PATCH `/organizations/:id`

Update organization details. **Super Admin only**.

**Permission**: `update.organization`

**Request Body** (all fields optional):
```json
{
  "name": "Updated Corp",
  "address": "789 New Ave, Bangkok 10300"
}
```

**Response `200 OK`**: Updated organization object (same shape as GET).

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Not Super Admin |
| 404 | `ORGANIZATION_NOT_FOUND` | |
| 409 | `ORGANIZATION_NAME_EXISTS` | Duplicate name |

---

### PATCH `/organizations/:id/deactivate`

Deactivate an organization. Invalidates all sessions for org members. **Super Admin only**.

**Permission**: `update.organization`

**Request**: No body.

**Response `200 OK`**:
```json
{
  "id": "uuid",
  "isActive": false,
  "updatedAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Not Super Admin |
| 404 | `ORGANIZATION_NOT_FOUND` | |
| 409 | `ORGANIZATION_ALREADY_INACTIVE` | Already deactivated |

---

## Common Error Schema

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "Only Super Admin can manage organizations."
}
```
