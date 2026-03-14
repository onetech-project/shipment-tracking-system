# API Contract: Roles

**Module**: `roles`  
**Base Path**: `/api/roles`  
**Auth Required**: `JwtAuthGuard` on all endpoints  
**Tenant Scope**: Org-scoped (roles belong to the caller's organization)

---

## Endpoints

### GET `/roles`

List roles available in the current organization. Includes default platform roles.

**Permission**: `read.role`

**Query Params**:
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Default: 1 |
| `limit` | number | Default: 50, max: 200 |
| `isDefault` | boolean | Filter default vs custom roles |

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "manager",
      "organizationId": "uuid",
      "isDefault": true,
      "permissions": [
        { "id": "uuid", "name": "read.shipment" },
        { "id": "uuid", "name": "update.shipment" }
      ],
      "createdAt": "2026-03-14T00:00:00Z",
      "updatedAt": "2026-03-14T00:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 50
}
```

---

### GET `/roles/:id`

Get a single role with its assigned permissions.

**Permission**: `read.role`

**Response `200 OK`**: Same shape as list item.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Role belongs to different org |
| 404 | `ROLE_NOT_FOUND` | |

---

### POST `/roles`

Create a new role in the current organization.

**Permission**: `create.role`

**Request Body**:
```json
{
  "name": "warehouse-supervisor",
  "permissionIds": ["uuid", "uuid"]
}
```

**Validation**:
- `name`: required, 1–100 chars, matches `^[a-z0-9\-_]+$`
- `permissionIds`: optional; must reference valid global permissions
- Cannot create roles with `organizationId = NULL` (platform roles are seeded only)

**Response `201 Created`**:
```json
{
  "id": "uuid",
  "name": "warehouse-supervisor",
  "organizationId": "uuid",
  "isDefault": false,
  "permissions": [
    { "id": "uuid", "name": "read.shipment" }
  ],
  "createdAt": "2026-03-14T00:00:00Z",
  "updatedAt": "2026-03-14T00:00:00Z"
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `ROLE_NAME_EXISTS` | Duplicate role name in org |
| 422 | `INVALID_PERMISSION_ID` | One or more permission IDs not found |

---

### PATCH `/roles/:id`

Update a role's name or permissions. Cannot modify default seeded roles' names.

**Permission**: `update.role`

**Request Body** (all optional):
```json
{
  "name": "senior-warehouse-supervisor",
  "permissionIds": ["uuid", "uuid", "uuid"]
}
```

**Response `200 OK`**: Updated role object.

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `CANNOT_MODIFY_DEFAULT_ROLE_NAME` | Attempt to rename a default seeded role |
| 403 | `FORBIDDEN` | Cross-org role |
| 404 | `ROLE_NOT_FOUND` | |

---

### DELETE `/roles/:id`

Delete a custom role. Removes all user-role assignments using this role.

**Permission**: `delete.role`

**Request**: No body.

**Response `200 OK`**:
```json
{ "message": "Role deleted. 3 user assignments removed." }
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `CANNOT_DELETE_DEFAULT_ROLE` | Attempt to delete a seeded default role |
| 403 | `FORBIDDEN` | Cross-org role |
| 404 | `ROLE_NOT_FOUND` | |

---

### PUT `/roles/:id/permissions`

Replace all permissions on a role (full replace, not patch).

**Permission**: `update.role`

**Request Body**:
```json
{
  "permissionIds": ["uuid", "uuid"]
}
```

**Response `200 OK`**:
```json
{
  "roleId": "uuid",
  "permissions": [
    { "id": "uuid", "name": "read.shipment" },
    { "id": "uuid", "name": "create.shipment" }
  ]
}
```

**Errors**:
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Cross-org role |
| 404 | `ROLE_NOT_FOUND` | |
| 422 | `INVALID_PERMISSION_ID` | |
