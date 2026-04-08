# Contract: Sync Notifications WebSocket

**Protocol**: Socket.IO v4  
**Transport**: WebSocket (with long-polling fallback)  
**Gateway**: `SyncNotificationGateway` in `AirShipmentsModule`  
**Namespace**: `/` (default namespace)  
**Auth Required**: No — notification channel is public per spec Out of Scope  
**CORS**: Configured via `WEBSOCKET_CORS_ORIGIN` environment variable

---

## Connection

**URL**: `${NEXT_PUBLIC_API_URL}` (same origin as the REST API)

### Client Connect

```typescript
import { io } from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_API_URL, {
  transports: ['websocket', 'polling'],
});
```

### Server Behavior on Connect

- Logs `[SyncGateway] client connected: <clientId>` (FR-033)
- Emits no initial event; client waits for `sync:update`

### Server Behavior on Disconnect

- Logs `[SyncGateway] client disconnected: <clientId>` (FR-033)

---

## Events

### Server → Client: `sync:update`

Emitted to **all connected clients** after a sync cycle where at least one row was upserted (FR-031). Not emitted if zero rows were upserted in the cycle (FR-032).

**Payload**:

```typescript
interface SyncUpdatePayload {
  /** Names of target DB tables that had at least one upserted row */
  affectedTables: string[];
  /** Total number of rows upserted across all sheets in this cycle */
  totalUpserted: number;
  /** ISO 8601 UTC timestamp of when this cycle completed */
  syncedAt: string;
}
```

**Example payload**:

```json
{
  "affectedTables": ["air_shipments_cgk", "rate_per_station"],
  "totalUpserted": 47,
  "syncedAt": "2026-04-08T12:00:15.321Z"
}
```

**Frontend handling**:

1. Check if any `affectedTables` entry matches the current sub-page's table name.
2. If yes, re-fetch data for that page from the REST API.
3. Update the "last synced at" display to `syncedAt`.

---

## Frontend Hook Contract

The `useSyncNotification()` hook exposes the following interface:

```typescript
interface SyncNotificationState {
  /** Whether the Socket.IO connection is currently active */
  isConnected: boolean;
  /** ISO string of the most recent sync:update payload's syncedAt, or null */
  lastSyncAt: string | null;
  /** Table names from the most recent sync:update payload, or [] */
  affectedTables: string[];
}

function useSyncNotification(): SyncNotificationState;
```

### Lifecycle

| Phase    | Behavior                                                            |
| -------- | ------------------------------------------------------------------- |
| Mount    | `socket.connect()` → sets `isConnected = true` on `connect` event  |
| Receive  | Updates state on `sync:update` event                                |
| Unmount  | `socket.disconnect()` → sets `isConnected = false`                  |
| Reconnect| Socket.IO auto-reconnects; `connect` event fires again, restoring `isConnected = true` (FR-043 / User Story 2 Scenario 4) |

---

## Operational Notes

- The gateway does not persist notifications; a client that misses a `sync:update` event must wait for the next cycle.
- No authentication is verified on the WebSocket connection (Out of Scope per spec).
- `WEBSOCKET_CORS_ORIGIN` should be set to the exact frontend origin (e.g., `http://localhost:3000` in development, the production domain in production).
