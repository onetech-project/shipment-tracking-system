# Contract: Sync Notifications WebSocket (Multi-Sheet)

**Protocol**: Socket.IO v4  
**Gateway**: `SyncNotificationGateway` in `SyncConfigModule` / `SheetSyncModule`  
**Namespace**: `/` (default)  
**Auth Required**: No (Out of Scope per spec)  
**CORS**: Configured via `WEBSOCKET_CORS_ORIGIN`

---

## Event: `sheet:updated` (Server → Clients)

Emitted after a successful sync cycle (one or more spreadsheets processed). Includes the spreadsheet label (human-friendly), tables processed, total rows upserted, and timestamp.

**Payload**:

```ts
interface SheetUpdatedPayload {
  spreadsheetLabel: string // human label from google_sheet_config
  tables: string[] // e.g., ["air_shipment_delivery_routes"]
  totalUpserted: number // total rows upserted in this cycle across the tables
  syncedAt: string // ISO 8601 UTC timestamp
}
```

**Example**:

```json
{
  "spreadsheetLabel": "Delivery Feeds",
  "tables": ["air_shipment_delivery_routes"],
  "totalUpserted": 320,
  "syncedAt": "2026-04-17T12:00:00.000Z"
}
```

---

## Client Handling

- When a client receives `sheet:updated`, it should:
  1. If the current view displays one of the `tables`, re-fetch that table's data from `GET /air-shipments/:tableName`.
  2. Optionally display a toast or highlight to indicate the data was refreshed.

- Clients should connect on component mount and disconnect on unmount. The `useSyncNotification()` hook contract should expose `{ isConnected, lastSyncAt, affectedTables }`.

---

## Server Behavior

- Emit `sheet:updated` only when `totalUpserted > 0` for the cycle.
- Log clients connect/disconnect with client identifiers for observability.
- Do not persist notifications — missed events are not replayed.

---

## Operational Notes

- The event name `sheet:updated` is kept for backward compatibility with existing consumers; payload shape is extended to include `spreadsheetLabel`.
- The WS gateway should throttle emission if needed to avoid overloading clients during big rollouts; by default, emit once per completed cycle.
