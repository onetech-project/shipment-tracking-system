# Data Model: Google Sheets → PostgreSQL Sync Service

**Branch**: `copilot/add-google-sheets-sync-service` | **Date**: 2026-04-08  
**Research**: [research.md](research.md) | **Spec**: [spec.md](spec.md)

All tables include `created_at`, `updated_at`, and `last_synced_at` per constitution §III and spec requirements. No `organization_id` scope applies — these tables are global sync targets, not tenant-scoped.

---

## Entity Overview

```
air_shipments_cgk    ← CompileAirCGK sheet  (unique key: to_number)
air_shipments_sub    ← SUB sheet            (unique key: to_number)
air_shipments_sda    ← SDA sheet            (unique key: to_number)
rate_per_station     ← Data sheet           (unique key: concat)
route_master         ← Master Data sheet    (unique key: concat)
```

All five tables share the same structural pattern. The per-table column set is determined at sync time from the normalized Google Sheet headers; the schema below documents the **fixed system columns**. Application columns (from sheet data) extend each table.

---

## 1. `air_shipments_cgk`

Normalized data from the `CompileAirCGK` Google Sheet tab. Represents CGK-origin air shipment records.

### Fixed System Columns

| Column          | Type        | Constraints                                    | Notes                                              |
| --------------- | ----------- | ---------------------------------------------- | -------------------------------------------------- |
| `id`            | UUID        | PK, DEFAULT gen_random_uuid()                  | Internal surrogate key                             |
| `to_number`     | VARCHAR(100)| NOT NULL, UNIQUE                               | Business unique key; normalized from `to_number` header |
| `is_locked`     | BOOLEAN     | NULLABLE                                       | When true, row is skipped by sync (FR-027–FR-029)  |
| `last_synced_at`| TIMESTAMPTZ | NULLABLE                                       | Updated only when a write occurs (FR-025)          |
| `created_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                        | Row creation time                                  |
| `updated_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                        | Last update time (auto-managed by TypeORM)         |

### Application Columns (from sheet headers)

Additional columns are defined by the actual Google Sheet headers after normalization (FR-012–FR-015). Because the exact column set is determined by the sheet at runtime, the migration creates the fixed system columns only; application columns are pre-defined in the migration based on the known sheet structure. All application columns are typed as `TEXT NULLABLE` unless the coercion pipeline (FR-016–FR-021) and known data semantics justify a narrower type.

Typical application columns for CGK (illustrative; actual names depend on normalized headers):

| Normalized Column   | Type    | Coercion Rule |
| ------------------- | ------- | ------------- |
| `flight_date`       | TEXT    | Date string   |
| `airline`           | TEXT    | Plain text    |
| `destination`       | TEXT    | Plain text    |
| `weight_kg`         | NUMERIC | Numeric       |
| `pieces`            | INTEGER | Numeric       |
| `status`            | TEXT    | Plain text    |

### Indexes and Constraints

- `UNIQUE (to_number)` — enforces uniqueness for upsert operations
- `idx_air_shipments_cgk_to_number` on `(to_number)` — used for change detection bulk lookup (not N+1)
- `idx_air_shipments_cgk_last_synced_at` on `(last_synced_at)` — for freshness queries from dashboard API

---

## 2. `air_shipments_sub`

Normalized data from the `SUB` Google Sheet tab. Represents SUB-origin air shipment records.

Identical structure to `air_shipments_cgk` (same fixed system columns, same unique-key type). Application columns reflect the SUB sheet's column headers after normalization.

### Fixed System Columns

| Column          | Type        | Constraints           | Notes                    |
| --------------- | ----------- | --------------------- | ------------------------ |
| `id`            | UUID        | PK, DEFAULT gen_random_uuid() |                  |
| `to_number`     | VARCHAR(100)| NOT NULL, UNIQUE      | Business unique key      |
| `is_locked`     | BOOLEAN     | NULLABLE              |                          |
| `last_synced_at`| TIMESTAMPTZ | NULLABLE              |                          |
| `created_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                         |
| `updated_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                         |

### Indexes and Constraints

- `UNIQUE (to_number)`
- `idx_air_shipments_sub_to_number` on `(to_number)`

---

## 3. `air_shipments_sda`

Normalized data from the `SDA` Google Sheet tab. Represents SDA-origin air shipment records.

Identical structure to `air_shipments_cgk`.

### Fixed System Columns

| Column          | Type        | Constraints           | Notes               |
| --------------- | ----------- | --------------------- | ------------------- |
| `id`            | UUID        | PK, DEFAULT gen_random_uuid() |             |
| `to_number`     | VARCHAR(100)| NOT NULL, UNIQUE      | Business unique key |
| `is_locked`     | BOOLEAN     | NULLABLE              |                     |
| `last_synced_at`| TIMESTAMPTZ | NULLABLE              |                     |
| `created_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                    |
| `updated_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                    |

### Indexes and Constraints

- `UNIQUE (to_number)`
- `idx_air_shipments_sda_to_number` on `(to_number)`

---

## 4. `rate_per_station`

Normalized data from the `Data` Google Sheet tab. Represents rate-per-station reference data.

### Fixed System Columns

| Column          | Type        | Constraints           | Notes                   |
| --------------- | ----------- | --------------------- | ----------------------- |
| `id`            | UUID        | PK, DEFAULT gen_random_uuid() |                 |
| `concat`        | VARCHAR(255)| NOT NULL, UNIQUE      | Business unique key; concatenated station + rate identifier |
| `is_locked`     | BOOLEAN     | NULLABLE              |                         |
| `last_synced_at`| TIMESTAMPTZ | NULLABLE              |                         |
| `created_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                        |
| `updated_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                        |

### Indexes and Constraints

- `UNIQUE (concat)`
- `idx_rate_per_station_concat` on `(concat)`

---

## 5. `route_master`

Normalized data from the `Master Data` Google Sheet tab. Represents route master reference data.

### Fixed System Columns

| Column          | Type        | Constraints           | Notes                   |
| --------------- | ----------- | --------------------- | ----------------------- |
| `id`            | UUID        | PK, DEFAULT gen_random_uuid() |                 |
| `concat`        | VARCHAR(255)| NOT NULL, UNIQUE      | Business unique key; concatenated route identifier |
| `is_locked`     | BOOLEAN     | NULLABLE              |                         |
| `last_synced_at`| TIMESTAMPTZ | NULLABLE              |                         |
| `created_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                        |
| `updated_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()|                        |

### Indexes and Constraints

- `UNIQUE (concat)`
- `idx_route_master_concat` on `(concat)`

---

## 6. Configuration Entity (non-database)

### `SheetConfig` (runtime object, not persisted)

Loaded once at module initialization from `SHEET_CONFIG_PATH` JSON file (FR-009–FR-011).

| Field          | Type    | Description                                                              |
| -------------- | ------- | ------------------------------------------------------------------------ |
| `sheetName`    | string  | Google Sheet tab name (e.g., `"CompileAirCGK"`)                          |
| `tableName`    | string  | Target PostgreSQL table (e.g., `"air_shipments_cgk"`)                    |
| `headerRow`    | number  | 1-based index of the header row                                          |
| `uniqueKey`    | string  | Normalized column name used as unique identifier (e.g., `"to_number"`)   |
| `skipNullCols` | boolean | If true, columns with null/empty normalized headers are dropped           |

---

## 7. Runtime Notification Payload (non-persisted)

### `SyncNotification`

Emitted via Socket.IO `sync:update` event after each productive sync cycle (FR-031).

| Field            | Type     | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| `affectedTables` | string[] | List of table names that had at least one upsert      |
| `totalUpserted`  | number   | Total row count upserted across all sheets this cycle |
| `syncedAt`       | string   | ISO 8601 UTC timestamp of the cycle completion        |

---

## State Transitions

### Sync Cycle Flow

```
[tick fires]
    │
    ├─ isSyncing=true? ──→ [skip tick] ──→ [increment skipCount]
    │                                           │
    │                                           └─ skipCount ≥ 2? ──→ [pause scheduler]
    │
    └─ isSyncing=false ──→ [start cycle]
           │
           ├─ [fetch all sheets via batchGet]
           │       └─ empty response? ──→ [retry up to 3×, backoff 2s/4s/6s]
           │                              └─ still empty? ──→ [log warning, skip sheet]
           │
           ├─ [normalize headers] ──→ uniqueKey missing? ──→ [log error, skip sheet]
           │
           ├─ [for each row]
           │       ├─ is_locked=true? ──→ [skip, increment lockedCount]
           │       ├─ [coerce values]
           │       ├─ [diff vs existing row]
           │       │       └─ no change? ──→ [skip, increment skippedCount]
           │       └─ [upsert row, update last_synced_at]
           │
           ├─ [totalUpserted > 0?] ──→ [emit sync:update notification]
           │
           └─ [isSyncing=false] ──→ [log cycle duration]
                    │
                    └─ scheduler paused? ──→ [resume scheduler]
```

### Row-Level Lock State

```
is_locked = null or false  →  row is processed normally
is_locked = true           →  row skipped entirely (no diff, no write)
```
