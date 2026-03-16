# Audit Module

Records immutable audit log entries for all critical operations via domain events. Writes are fire-and-forget and do not block the originating request.

## Key Concepts

- **Event-driven**: `AuditService` subscribes to domain events from all other modules via `@OnEvent()` decorators.
- **Non-blocking**: Audit writes are executed asynchronously and do not impact response latency.
- **Immutable**: Audit records are insert-only. No update or delete endpoints exist.
- **Partitioned table**: The `audit_logs` PostgreSQL table is range-partitioned by month for query performance.
- **Super-admin read access**: Only super-admins can query the audit log.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit` | Super-Admin | List audit logs (paginated, returns `[AuditLog[], total]`) |

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50, max: 200) |
| `action` | string | Filter by action type |
| `entityType` | string | Filter by entity type |
| `userId` | string | Filter by actor user ID |

## Audit Action Types (19 total)

| Category | Actions |
|----------|---------|
| Auth | `auth.login.success`, `auth.login.failed`, `auth.login.locked`, `auth.logout`, `auth.token.refreshed` |
| Organizations | `org.created`, `org.updated`, `org.deactivated` |
| Users | `user.updated`, `user.inactivated`, `user.unlocked`, `user.role_changed` |
| Invitations | `invitation.sent`, `invitation.accepted`, `invitation.cancelled` |
| Roles | `role.created`, `role.updated`, `role.deleted`, `role.permissions_updated` |
| Permissions | `permission.created`, `permission.deleted` |

## Audit Log Record Fields

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `action` | One of the 19 action types above |
| `userId` | ID of the user performing the action (nullable for public actions) |
| `entityType` | Type of entity affected (e.g., `User`, `Organization`) |
| `entityId` | ID of the affected entity |
| `metadata` | JSONB — additional context (IP, changes, role IDs, etc.) |
| `createdAt` | Timestamp of the event |
