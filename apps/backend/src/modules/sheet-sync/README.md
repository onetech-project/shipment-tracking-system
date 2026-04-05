# SheetSyncModule

Polls a configured Google Sheet at a regular interval, compares each row against the current database state, and upserts only changed or new rows. After each successful cycle that produces writes, it broadcasts a `sheet:updated` WebSocket event to all connected clients via [Socket.IO](https://socket.io/).

See the full feature spec at [`specs/004-sheets-postgres-sync/spec.md`](../../../../../specs/004-sheets-postgres-sync/spec.md).

---

## Environment Variables

All variables are validated at startup by the NestJS `ConfigModule` Joi schema in `app.module.ts`.

| Variable                         | Required | Default                 | Description                                                                                                                        |
| -------------------------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | No       | —                       | Path to a Google service-account JSON key file. If omitted, the Google client falls back to Application Default Credentials (ADC). |
| `SHEET_ID`                       | No       | —                       | The Google Spreadsheet ID from the sheet's URL.                                                                                    |
| `SHEET_TAB_NAME`                 | No       | `Sheet1`                | The exact name of the tab (worksheet) to read from.                                                                                |
| `SHEET_SYNC_TABLE`               | **Yes**  | —                       | The PostgreSQL table to upsert into. Must match `[a-z_][a-z0-9_]*`.                                                                |
| `SHEET_SYNC_PK_COLUMN`           | **Yes**  | —                       | Column used as the upsert conflict target. Must exist in both the sheet header row and the DB table.                               |
| `SHEET_SYNC_INTERVAL_MS`         | No       | `15000`                 | Poll frequency in milliseconds. Minimum: `1000`.                                                                                   |
| `FRONTEND_ORIGIN`                | No       | `http://localhost:3000` | Allowed CORS origin for the Socket.IO gateway (`SyncGateway`).                                                                     |

Full descriptions and examples: [`specs/004-sheets-postgres-sync/contracts/sync.config.md`](../../../../../specs/004-sheets-postgres-sync/contracts/sync.config.md).

---

## Running Tests

```bash
# From apps/backend/
npm test -- --testPathPattern=sheet-sync
```

| Spec file                        | What it covers                                               |
| -------------------------------- | ------------------------------------------------------------ |
| `type-coercion.util.spec.ts`     | String → boolean / integer / float / date / string coercion  |
| `column-mapper.spec.ts`          | Header row parsing, unknown column warnings, cache behaviour |
| `sheet-sync.service.spec.ts`     | Scheduler lifecycle, change detection, locking, logging      |
| `sheet-sync.integration.spec.ts` | Full US2 lock-skip scenarios with real dependency flow       |
| `sync.gateway.spec.ts`           | `notifyClients()` emits correct Socket.IO event              |

```bash
# Playwright E2E (frontend must be running)
cd apps/frontend && npx playwright test e2e/sheet-sync/
```

---

## Wiring into Another NestJS Module

`SyncGateway` is exported by `SheetSyncModule`. To inject it elsewhere:

```typescript
import { Module } from '@nestjs/common'
import { SheetSyncModule } from '../sheet-sync/sheet-sync.module'
import { SyncGateway } from '../sheet-sync/sync.gateway'

@Module({
  imports: [SheetSyncModule],
})
export class YourModule {
  constructor(private readonly syncGateway: SyncGateway) {}
}
```

---

## Architecture

```
Google Sheets API
      │
      ▼
GoogleSheetsService.getSheetRows()
      │  string[][]
      ▼
ColumnMapperService.buildColumnMap()
      │  ColumnMap { valid, skipped, pkColumn }
      ▼
SheetSyncService.runSyncCycle()
  │  For each row:
  │   1. Skip if is_locked
  │   2. coerceValue() each field
  │   3. Compare vs. existing DB row
  │   4. Upsert if changed/new, set last_synced_at
      │
      ▼  if upsertedCount > 0
SyncGateway.notifyClients()
      │  emit('sheet:updated', { table, upsertedCount, syncedAt })
      ▼
All connected Socket.IO clients (browser → useSheetSync hook)
```

---

## Database Migration

Before starting the service, run the migration to add the required columns:

```bash
cd apps/backend
npm run typeorm -- migration:run -d src/database/data-source.ts
```

The migration (`20260404000001-add-sheet-sync-columns.ts`) conditionally adds:

- `last_synced_at TIMESTAMPTZ NULL` — set to the current timestamp on every write
- `is_locked BOOLEAN NOT NULL DEFAULT FALSE` — when `true`, the row is never modified by the sync service
