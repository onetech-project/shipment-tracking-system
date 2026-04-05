# Contract: Sheet Sync WebSocket API

**Feature**: Google Sheets to PostgreSQL Sync Service  
**Branch**: `004-sheets-postgres-sync`  
**Protocol**: Socket.IO (default namespace `/`)  
**Backend server**: NestJS `SyncGateway`  
**Frontend consumer**: `useSheetSync()` React hook

---

## Connection

### Backend Gateway Declaration

```
Gateway:   SyncGateway
Namespace: / (default)
Port:      Same as HTTP server (0 = attach to Express HTTP server)
Transport: WebSocket (with long-polling fallback)
CORS:      Configured via FRONTEND_ORIGIN env var
```

### Client Connection

```
URL:     process.env.NEXT_PUBLIC_API_URL
Options: { transports: ['websocket', 'polling'] }
```

Clients connect anonymously. No authentication token is required on the WebSocket connection for this feature.

---

## Server → Client Events

### `sheet:updated`

Emitted to **all connected clients** after a sync cycle completes with at least one database write. Never emitted when zero rows were upserted.

**Trigger condition**: `upsertedCount > 0` after a sync cycle.

**Payload** (`SyncNotificationPayload`):

| Field           | Type     | Required | Description                                                                                       |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------- |
| `table`         | `string` | ✅       | Name of the PostgreSQL table that was written to                                                  |
| `upsertedCount` | `number` | ✅       | Number of rows actually written (inserted or updated) in this cycle. Always ≥ 1 when event fires. |
| `syncedAt`      | `string` | ✅       | ISO 8601 UTC timestamp of when the cycle completed (e.g. `"2026-04-04T10:30:00.000Z"`)            |

**Example**:

```json
{
  "table": "shipment_rows",
  "upsertedCount": 7,
  "syncedAt": "2026-04-04T10:30:00.000Z"
}
```

---

## Client → Server Events

This service exposes no client-to-server events. The WebSocket connection is receive-only for clients in this feature scope.

---

## Connection Lifecycle Events

The following standard Socket.IO events are relevant to the frontend hook:

| Event           | Direction       | Meaning                                                            |
| --------------- | --------------- | ------------------------------------------------------------------ |
| `connect`       | Server → Client | Connection established; set `connected = true`                     |
| `disconnect`    | Server → Client | Connection lost (network, server restart); set `connected = false` |
| `connect_error` | Server → Client | Failed to establish connection; should be logged                   |

---

## Error Handling

- If the server is unreachable at mount time, Socket.IO client will retry with its built-in reconnection strategy. The `connected` flag stays `false` until a successful `connect` event fires.
- The gateway emits events on a best-effort basis; if a client disconnects between a DB write and the emit, that client misses the notification and will receive updated data on its next data fetch.
- No queue or replay of missed events.

---

## Environment Variables

### Backend

| Variable          | Required | Description                                                                  |
| ----------------- | -------- | ---------------------------------------------------------------------------- |
| `FRONTEND_ORIGIN` | ✅       | Allowed CORS origin for the Socket.IO gateway (e.g. `http://localhost:3001`) |

### Frontend

| Variable              | Required | Description                                                   |
| --------------------- | -------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | ✅       | Base URL of the NestJS backend (e.g. `http://localhost:3000`) |

---

## Shared Type: `SyncNotificationPayload`

Defined in `packages/shared/src/sync.ts`. Imported by both backend (gateway emit) and frontend (hook event type).

```typescript
export interface SyncNotificationPayload {
  table: string
  upsertedCount: number
  syncedAt: string // ISO 8601
}
```
