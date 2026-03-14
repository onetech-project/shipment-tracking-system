# API Contract: Permissions

**Module**: `permissions`  
**Base Path**: `/api/permissions`  
**Auth Required**: `JwtAuthGuard` on all endpoints  
**Scope**: Global master data (not tenant-scoped)

---

## Endpoints

### GET `/permissions`

List all available permissions (global master data).

**Permission**: `read.permission`

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Default: 1 |
| `limit` | number | Default: 100, max: 500 |
| `action` | string | Filter by action: `read`, `create`, `update`, `delete` |
| `module` | string | Filter by module name |

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "read.shipment",
      "description": "View shipment records",
      "createdAt": "2026-03-14T00:00:00Z",
      "updatedAt": "2026-03-14T00:00:00Z"
    }
  ],
  "total": 28,
  "page": 1,
  "limit": 100
}
```

---

### GET `/permissions/:id`

Get a single permission by ID.

**Permission**: `read.permission`

**Response `200 OK`**: Same shape as list item.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `PERMISSION_NOT_FOUND` | |

---

### POST `/permissions`

Create a new permission entry. **Super Admin only**.

**Permission**: `create.permission`

**Request Body**:
```json
{
  "name": "read.tracking",
  "description": "View shipment tracking information"
}
```

**Validation**:
- `name`: required, matches `^(read|create|update|delete)\.[a-z][a-z0-9_]*$`
- `name`: immutable after creation
- `description`: optional, max 500 characters

**Response `201 Created`**:
```json
{
  "id": "uuid",
  "name": "read.tracking",
  "description": "View shipment tracking information",
  "createdAt": "2026-03-14T00:00:00Z",
  "updatedAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not Super Admin |
| 409 | `PERMISSION_NAME_EXISTS` | Duplicate permission name |
| 422 | `INVALID_PERMISSION_FORMAT` | Does not match `<action>.<module>` format |

---

### PATCH `/permissions/:id`

Update permission description only. Name is immutable. **Super Admin only**.

**Permission**: `update.permission`

**Request Body**:
```json
{
  "description": "Updated description text"
}
```

**Response `200 OK`**: Updated permission object.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `PERMISSION_NAME_IMMUTABLE` | Attempt to change `name` field |
| 403 | `FORBIDDEN` | Not Super Admin |
| 404 | `PERMISSION_NOT_FOUND` | |

---

### DELETE `/permissions/:id`

Delete a permission. Removes from all role assignments. **Super Admin only**.

**Permission**: `delete.permission`

**Response `200 OK`**:
```json
{ "message": "Permission deleted. Removed from 4 roles." }
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Not Super Admin |
| 404 | `PERMISSION_NOT_FOUND` | |
