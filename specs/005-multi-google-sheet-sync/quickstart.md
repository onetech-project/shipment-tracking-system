# Quickstart: Multi Google Sheet Sync — Config UI & Dynamic Tables

**Branch**: `005-multi-google-sheet-sync` | **Date**: 2026-04-17
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

This quickstart shows how to run the backend locally, apply migrations, create a spreadsheet config via API or UI, and verify that the dynamic table was created and syncs run.

---

## Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL 16 reachable by the backend
- A Google Cloud service account JSON key with Sheets API enabled
- Share target spreadsheets with the service account (Viewer)
- DB user must have permission to `CREATE TABLE` and `ALTER TABLE` if you intend runtime table creation

---

## Environment Variables (backend)

Set required env vars for `apps/backend` (or your deployment env):

```env
# Google
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/service-account.json
# Optional - if you prefer UI creation, leave GOOGLE_SHEET_ID empty and create via UI
# DB and app
DATABASE_URL=postgres://user:pass@localhost:5432/db
# Scheduler
# Global tick runs every 1s; per-spreadsheet interval_seconds is per-config.
SYNC_GLOBAL_TICK_MS=1000
# WebSocket Cors
WEBSOCKET_CORS_ORIGIN=http://localhost:3000
```

---

## Run Migrations

Apply DB migrations that add config tables and any base schema changes:

```bash
cd apps/backend
npm run migration:run
```

This should create/alter:
- `google_sheet_config` (adds `label` column)
- `google_sheet_sheet_config` (adds GENERATED `table_name` column)

---

## Start Backend

```bash
cd apps/backend
npm run start:dev
```

Expected log lines on startup:

```
[SyncConfigModule] Connected to DB; existing spreadsheet configs loaded: 0
[Scheduler] Global tick started (1000ms)
```

---

## Create Spreadsheet Config (via API - example)

Create a spreadsheet record and a sheet record under it. The sheet save triggers `DynamicTableService.ensureTable()` which will create the target table if DB permissions allow.

### Create spreadsheet

```bash
curl -X POST http://localhost:4000/sync-config/spreadsheets \
  -H 'Content-Type: application/json' \
  -d '{"label":"Delivery Feeds","spreadsheetId":"1AbC...","interval_seconds":15,"is_enabled":true}'
```

Response includes the created spreadsheet object with `id`.

### Add sheet to spreadsheet (triggers table creation)

```bash
curl -X POST http://localhost:4000/sync-config/spreadsheets/<spreadsheetId>/sheets \
  -H 'Content-Type: application/json' \
  -d '{"sheet_name":"Delivery Routes","unique_keys":["to_number"],"header_row":1,"is_enabled":true}'
```

- Backend will attempt to create table `air_shipment_delivery_routes`.
- Check logs for `DynamicTableService.ensureTable()` outcome.

---

## Verify Table Exists

Connect to Postgres and run:

```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'air_shipment_%';
```

You should see `air_shipment_delivery_routes` (or similar) if creation succeeded.

---

## Verify Scheduler & Sync

- If the spreadsheet and sheet are enabled, the scheduler will evaluate the spreadsheet according to its `interval_seconds` and trigger sync cycles.
- Watch backend logs for per-spreadsheet sync messages:

```
[SyncScheduler] Delivery Feeds (1AbC...): cycle start
[SheetsService] Fetched 320 rows for Delivery Routes
[DynamicTableService] Ensured table air_shipment_delivery_routes (created)
[SyncScheduler] Delivery Feeds (1AbC...): processed 1 tables, totalUpserted: 320, duration: 3412ms
[SyncGateway] Emitted sheet:updated — { spreadsheetLabel: 'Delivery Feeds', tables: ['air_shipment_delivery_routes'], totalUpserted: 320, syncedAt: '...' }
```

---

## Inspect Data via Dynamic Endpoint

Request paginated results from the dynamic air shipments endpoint:

```bash
curl "http://localhost:4000/air-shipments/air_shipment_delivery_routes?page=1&limit=25"
```

Response will include dedicated unique-key columns and an `extra_data` JSON object containing unknown columns.

---

## Frontend

- The Air Shipments UI will query `GET /sync-config/spreadsheets` to build tabs for enabled sheets.
- When the `sheet:updated` WebSocket event arrives, the UI re-fetches the tab list or active tab's data.

---

## Troubleshooting

- If table creation fails with permission errors, ensure DB user has `CREATE`/`ALTER` privileges or run the migration to create the table ahead of time.
- If `table_name` looks wrong in UI, check that sheet names contain only allowed characters; the preview uses the same normalization helper as the DB.
- If syncs are not running, verify `is_enabled` flags on spreadsheet and sheet records and check scheduler logs.
