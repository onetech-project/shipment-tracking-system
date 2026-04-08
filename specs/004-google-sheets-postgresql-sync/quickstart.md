# Quickstart: Google Sheets → PostgreSQL Sync Service

**Branch**: `copilot/add-google-sheets-sync-service` | **Date**: 2026-04-08  
**Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

---

## Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL 16 running and accessible
- A Google Cloud service account with **Google Sheets API** enabled
- The service account's JSON key file downloaded locally
- The target Google Spreadsheet shared with the service account's email (Viewer access is sufficient)

---

## 1. Install New Dependencies

```bash
# Backend
cd apps/backend
npm install googleapis @nestjs/schedule @nestjs/websockets @nestjs/platform-socket.io socket.io

# Frontend
cd apps/frontend
npm install socket.io-client
```

---

## 2. Configure Environment Variables

### Backend (`apps/backend/.env`)

```env
# Google Sheets integration
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/service-account.json
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

# Sheet config file
SHEET_CONFIG_PATH=/absolute/path/to/config/sheets.json

# Sync interval (optional, defaults to 15000 ms)
SYNC_INTERVAL_MS=15000

# WebSocket CORS (set to your frontend origin)
WEBSOCKET_CORS_ORIGIN=http://localhost:3000
```

### Frontend (`apps/frontend/.env.local`)

```env
# Must point to the running backend
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 3. Create Sheet Config

Copy the example and edit for your spreadsheet:

```bash
cp apps/backend/src/modules/air-shipments/config/sheets.example.json \
   /path/to/config/sheets.json
```

`sheets.example.json` structure:

```json
[
  {
    "sheetName": "CompileAirCGK",
    "tableName": "air_shipments_cgk",
    "headerRow": 1,
    "uniqueKey": "to_number",
    "skipNullCols": true
  },
  {
    "sheetName": "SUB",
    "tableName": "air_shipments_sub",
    "headerRow": 1,
    "uniqueKey": "to_number",
    "skipNullCols": true
  },
  {
    "sheetName": "SDA",
    "tableName": "air_shipments_sda",
    "headerRow": 1,
    "uniqueKey": "to_number",
    "skipNullCols": true
  },
  {
    "sheetName": "Data",
    "tableName": "rate_per_station",
    "headerRow": 1,
    "uniqueKey": "concat",
    "skipNullCols": false
  },
  {
    "sheetName": "Master Data",
    "tableName": "route_master",
    "headerRow": 1,
    "uniqueKey": "concat",
    "skipNullCols": false
  }
]
```

---

## 4. Run Database Migrations

```bash
cd apps/backend
npm run migration:run
```

This creates the five target tables:
- `air_shipments_cgk`
- `air_shipments_sub`
- `air_shipments_sda`
- `rate_per_station`
- `route_master`

Each table includes `id`, the unique key column, `is_locked`, `last_synced_at`, `created_at`, and `updated_at`.

---

## 5. Start the Backend

```bash
cd apps/backend
npm run start:dev
```

Expected startup logs:

```
[NestApplication] Starting...
[AirShipmentsModule] Sheet config loaded: 5 sheets configured
[SyncNotificationGateway] WebSocket gateway initialized (CORS: http://localhost:3000)
[SchedulerService] Sync scheduler started — interval: 15000 ms
```

Within 15 seconds you should see the first sync cycle log:

```
[SchedulerService] Cycle start: 2026-04-08T08:00:00.000Z
[AirShipmentsService] [CompileAirCGK → air_shipments_cgk] fetched: 412, upserted: 412, skipped(nochange): 0, skipped(locked): 0
[AirShipmentsService] [SUB → air_shipments_sub] fetched: 183, upserted: 183, skipped(nochange): 0, skipped(locked): 0
...
[SchedulerService] Cycle complete — duration: 4231 ms, total upserted: 874
[SyncNotificationGateway] Emitted sync:update to all clients
```

---

## 6. Start the Frontend

```bash
cd apps/frontend
npm run dev
```

Navigate to `http://localhost:3000`. The sidebar now shows an **Air Shipments** item with sub-links: **CGK**, **SUB**, **SDA**, **Rate**, **Routes**.

Opening any sub-page shows:
- A loading skeleton while the first fetch runs
- Paginated table data once loaded
- A **"Live"** badge when the Socket.IO connection is active
- The **last synced at** time updating automatically after each cycle

---

## 7. Verify Real-Time Updates

1. Open the **CGK** sub-page in your browser.
2. Edit a row in the `CompileAirCGK` Google Sheet tab.
3. Wait up to 15 seconds for the next polling cycle.
4. Watch the dashboard table refresh automatically without a page reload.
5. Check the **last synced at** timestamp updates.

---

## 8. Run Tests

```bash
# Unit + integration tests (backend)
cd apps/backend
npm test

# E2E Playwright tests (frontend)
cd apps/frontend
npx playwright test e2e/air-shipments/
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
| ------- | ------------ | --- |
| `Error: Cannot find module 'config/sheets.json'` | `SHEET_CONFIG_PATH` not set or file missing | Set env var and ensure file exists |
| `Error: PERMISSION_DENIED` from Google Sheets API | Service account not shared on the spreadsheet | Share the spreadsheet with the service account email (Viewer) |
| `uniqueKey 'to_number' not found in sheet headers` | Sheet tab name mismatch or header row wrong | Check `sheetName` and `headerRow` in `sheets.json` |
| Dashboard shows "Disconnected" badge | `WEBSOCKET_CORS_ORIGIN` mismatch | Set `WEBSOCKET_CORS_ORIGIN` to the exact frontend origin |
| Cycle overlaps (consecutive skips logged) | Sheets API too slow for 15s interval | Increase `SYNC_INTERVAL_MS` or reduce the number of columns fetched |
