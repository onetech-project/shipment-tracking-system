# Audit Module

Records immutable audit log entries for all critical operations via domain events. Writes are fire-and-forget and do not block the originating request.

## Location

`apps/backend/src/modules/audit/`

## Key Concepts

- **Event-driven**: `AuditService` subscribes to ALL domain events from all other modules via `@OnEvent()` decorators. No module needs to explicitly call the audit service.
- **Non-blocking**: Audit writes are executed asynchronously (fire-and-forget). Errors are logged but do not impact business logic or response latency.
- **Immutable**: Audit records are insert-only. No update or delete endpoints exist.
- **Super-admin read access**: Querying the audit log requires `read_audit` permission.
- **Pagination**: Default 50 items per page. Returns `[AuditLog[], total]` tuple.

## Entity

Table: `audit_logs`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `actorId` | UUID | ID of the user performing the action (nullable for public actions) |
| `action` | string | Action type (e.g., `auth.login`, `user.created`) |
| `resourceType` | string | Type of resource affected (e.g., `User`, `Organization`) |
| `resourceId` | string | ID of the affected resource (nullable) |
| `metadata` | JSONB | Additional context (IP, changes, role IDs, etc.) |
| `ipAddress` | string | Client IP address |
| `userAgent` | string | Client user agent |
| `createdAt` | Date | Event timestamp |

## Endpoints

All paths have `/api` prefix.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/audit` | `read_audit` | List audit logs (paginated, returns `[AuditLog[], total]`) |

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Items per page |

## Audited Events

The `AuditService` subscribes to the following event categories:

| Category | Events |
|----------|--------|
| **Auth** | `auth.login`, `auth.login_failed`, `auth.logout`, `auth.logout_all` |
| **Organization** | `organization.created`, `organization.updated`, `organization.deactivated` |
| **User** | `user.created`, `user.updated`, `user.deactivated`, `user.password_changed`, `user.password_reset`, `user.unlocked` |
| **Role** | `role.created`, `role.updated`, `role.deleted`, `role.assigned`, `role.revoked`, `role.permissions_updated` |
| **Invitation** | `invitation.created`, `invitation.cancelled` |
| **Google Sheet Config** | `google_sheet_config.created`, `google_sheet_config.updated`, `google_sheet_config.deleted` |
| **Shipment Row** | `shipment_row.lock_changed` |

## File Structure

```
audit/
├── audit.module.ts
├── audit.controller.ts
├── audit.service.ts             # Subscribes to all domain events, fire-and-forget writes
├── entities/
│   └── audit-log.entity.ts      # audit_logs table
└── README.md
```
