# Quickstart: Google Sheets to PostgreSQL Sync Service

**Branch**: `004-sheets-postgres-sync`  
**Updated**: 2026-04-04

This guide covers getting the sync service running end-to-end in a local development environment.

---

## Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL 16.x running locally (or via Docker)
- A Google Cloud project with the **Google Sheets API** enabled
- A **Service Account** with read access to the target Google Sheet
- The downloaded Service Account JSON key file

---

## Step 1: Google Cloud Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services → Library** and enable **Google Sheets API**.
3. Go to **IAM & Admin → Service Accounts** and create a new Service Account.
4. Download the JSON key file and save it to a safe path (e.g., `/run/secrets/google-sa.json`). **Never commit this file to the repository.**
5. In your Google Sheet, click **Share** and add the Service Account email address (found in the JSON file as `client_email`) with **Viewer** access.

---

## Step 2: Configure Environment Variables

Add the following to `apps/backend/.env` (create from `.env.example` if available):

```dotenv
# Google Sheets integration
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-sa.json
SHEET_ID=<your-sheet-id-from-the-url>
SHEET_TAB_NAME=Sheet1

# Sync target (must be a pre-existing PostgreSQL table)
SHEET_SYNC_TABLE=shipment_rows
SHEET_SYNC_PK_COLUMN=trip_code
SHEET_SYNC_INTERVAL_MS=15000

# WebSocket CORS (should match the frontend dev server URL)
FRONTEND_ORIGIN=http://localhost:3001
```

Add to `apps/frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Step 3: Install New Dependencies

```bash
# Backend
cd apps/backend
npm install googleapis @nestjs/schedule @nestjs/websockets @nestjs/platform-socket.io

# Frontend
cd apps/frontend
npm install socket.io-client
```

---

## Step 4: Run the Database Migration

The migration adds `last_synced_at` and `is_locked` columns to the target table if they don't exist.

```bash
cd apps/backend
npm run migration:run
```

Verify the columns were added:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'shipment_rows'
  AND column_name IN ('last_synced_at', 'is_locked');
```

---

## Step 5: Start the Backend

```bash
cd apps/backend
npm run start:dev
```

Watch for the following log output confirming the sync service started:

```
[SheetSyncService] SheetSyncModule initialized. Poll interval: 15000ms
[SheetSyncService] Starting sync cycle for table: shipment_rows
```

---

## Step 6: Start the Frontend

```bash
cd apps/frontend
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) and navigate to the dashboard page that uses `useSheetSync()`. The connection status indicator should show **Connected**.

---

## Step 7: Verify End-to-End

1. Open the target Google Sheet.
2. Modify a non-locked data row (change any value).
3. Within 15–30 seconds, check:
   - Backend logs show `[SheetSyncService] Upserted 1 row(s) into shipment_rows`
   - Backend logs show `[SyncGateway] Emitting sheet:updated (upsertedCount: 1)`
   - Dashboard refreshes automatically (or the `useSheetSync()` hook fires its `onUpdate` callback)

4. Test lock behavior: set `is_locked` to `TRUE` in a sheet row, then change another field.
   - Backend logs should show `[SheetSyncService] Skipped 1 locked row(s)`
   - Database record must remain unchanged

---

## Troubleshooting

| Symptom                                         | Likely Cause                                           | Fix                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Error: Could not load the default credentials` | `GOOGLE_APPLICATION_CREDENTIALS` not set or wrong path | Verify the env var points to a valid JSON key file                                                                   |
| `403 The caller does not have permission`       | Service Account not shared on the sheet                | Share the sheet with the Service Account email                                                                       |
| `No data rows found in sheet`                   | Sheet is empty or only has a header row                | Add at least one data row to the sheet                                                                               |
| Dashboard shows "Disconnected"                  | `NEXT_PUBLIC_API_URL` wrong or backend not running     | Confirm backend is running and URL matches                                                                           |
| Rows never update in DB                         | Column name mismatch between sheet header and DB       | Ensure sheet column headers exactly match DB column names (case-sensitive)                                           |
| `TypeError: column "xyz" does not exist`        | Sheet has a column not in the DB                       | This is a warning, not an error; the column is skipped. Check logs for `[SheetSyncService] WARN Unknown column: xyz` |

---

## Running Tests

```bash
# Unit and integration tests (backend)
cd apps/backend
npm test -- --testPathPattern=sheet-sync

# E2E tests (Playwright)
cd apps/frontend
npx playwright test e2e/sheet-sync/
```
