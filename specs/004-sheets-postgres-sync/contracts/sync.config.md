# Contract: Sheet Sync Module Configuration API

**Feature**: Google Sheets to PostgreSQL Sync Service  
**Branch**: `004-sheets-postgres-sync`  
**Type**: Environment-variable configuration contract (NestJS ConfigModule)

This contract defines all environment variables consumed by `SheetSyncModule`. All variables are loaded via `@nestjs/config` and validated using Joi at application bootstrap.

---

## Environment Variables

| Variable                         | Type                 | Required | Default  | Description                                                                                                                                                   |
| -------------------------------- | -------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | `string` (file path) | ✅       | —        | Absolute path to the Google Service Account JSON key file. Read by `googleapis` `GoogleAuth` automatically. Never store the key contents here, only the path. |
| `SHEET_ID`                       | `string`             | ✅       | —        | The Google Sheet ID (from the sheet URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/`).                                                                       |
| `SHEET_TAB_NAME`                 | `string`             | No       | `Sheet1` | The name of the sheet tab to read. Used in the A1 range notation (e.g., `'Sheet1'!A:Z`).                                                                      |
| `SHEET_SYNC_TABLE`               | `string`             | ✅       | —        | Name of the target PostgreSQL table to upsert into (e.g., `shipment_rows`).                                                                                   |
| `SHEET_SYNC_PK_COLUMN`           | `string`             | ✅       | —        | Name of the column used as the primary key for row matching between sheet and database. Must exist in both.                                                   |
| `SHEET_SYNC_INTERVAL_MS`         | `number`             | No       | `15000`  | Poll interval in milliseconds. Minimum `5000`.                                                                                                                |
| `FRONTEND_ORIGIN`                | `string`             | ✅       | —        | Allowed CORS origin for the Socket.IO WebSocket gateway (e.g., `http://localhost:3001`).                                                                      |

---

## Validation Rules (Joi Schema)

```
GOOGLE_APPLICATION_CREDENTIALS:  string, required
SHEET_ID:                         string, required, min length 20
SHEET_TAB_NAME:                   string, optional, default 'Sheet1'
SHEET_SYNC_TABLE:                 string, required, alphanum + underscore only
SHEET_SYNC_PK_COLUMN:             string, required, alphanum + underscore only
SHEET_SYNC_INTERVAL_MS:           number, optional, min 5000, default 15000
FRONTEND_ORIGIN:                  string, required, URI format
```

If any required variable is missing or fails validation, the application fails to start with a descriptive error message.

---

## Example `.env` Snippet

```dotenv
# Google Sheets
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-service-account.json
SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
SHEET_TAB_NAME=Sheet1

# Sync target
SHEET_SYNC_TABLE=shipment_rows
SHEET_SYNC_PK_COLUMN=trip_code
SHEET_SYNC_INTERVAL_MS=15000

# WebSocket CORS
FRONTEND_ORIGIN=http://localhost:3001
```

---

## Notes

- `SHEET_SYNC_TABLE` and `SHEET_SYNC_PK_COLUMN` accept only alphanumeric characters and underscores to prevent SQL injection through table/column name interpolation.
- `SHEET_SYNC_INTERVAL_MS` minimum of 5000ms protects against accidental quota exhaustion against the Google Sheets API (free tier: 300 requests/minute per project).
- Changing these values requires an application restart; they are not hot-reloaded.
