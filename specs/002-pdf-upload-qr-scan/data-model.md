# Data Model: PDF Shipment Upload & QR Code Scan

**Branch**: `002-pdf-upload-qr-scan` | **Date**: 2026-03-18  
**Research**: [research.md](research.md) | **Spec**: [spec.md](spec.md)

All tables include `created_at` and `updated_at` per constitution §III. All new tables are org-scoped via `organization_id`.

---

## Entity Overview

```
organizations
  └── shipments                     (org-scoped shipment records)
  └── shipment_uploads              (one PDF import job per upload)
        └── shipment_upload_errors  (per-row failures and duplicate conflicts)
users
  └── shipment_uploads (uploaded_by_user_id)
```

---

## 1. `shipments`

The canonical shipment record. Created by bulk import or pre-populated seed; looked up by QR scanner.

| Column                    | Type         | Constraints                                        | Notes                                     |
| ------------------------- | ------------ | -------------------------------------------------- | ----------------------------------------- |
| `id`                      | UUID         | PK, DEFAULT gen_random_uuid()                      | Internal row key                          |
| `organization_id`         | UUID         | NOT NULL, FK → organizations(id) ON DELETE CASCADE | Tenant scope                              |
| `shipment_id`             | VARCHAR(100) | NOT NULL                                           | Business identifier from PDF / QR code    |
| `origin`                  | VARCHAR(255) | NOT NULL                                           |                                           |
| `destination`             | VARCHAR(255) | NOT NULL                                           |                                           |
| `status`                  | VARCHAR(50)  | NOT NULL                                           | e.g. `pending`, `in_transit`, `delivered` |
| `carrier`                 | VARCHAR(255) | NULLABLE                                           |                                           |
| `estimated_delivery_date` | DATE         | NULLABLE                                           |                                           |
| `contents_description`    | TEXT         | NULLABLE                                           |                                           |
| `last_import_upload_id`   | UUID         | NULLABLE, FK → shipment_uploads(id) SET NULL       | Tracks which import last touched this row |
| `created_at`              | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                            |                                           |
| `updated_at`              | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                            |                                           |

**Indexes and constraints**:

- `UNIQUE (organization_id, shipment_id)` — prevents silent duplicates; drives conflict detection preflight
- `idx_shipments_org_shipment_id` on `(organization_id, shipment_id)` — QR lookup path
- `idx_shipments_org_status` on `(organization_id, status)` — list/filter queries

**Validation rules**:

- `shipment_id` must be non-empty and match the configured format regex (enforced at DTO level)
- `origin`, `destination`, `status` are required for a valid import row; missing any → `ShipmentUploadError`
- Overwrite of an existing row requires explicit `resolve` confirmation (FR-007)

**State transitions** (via import conflict resolution):

```
[new]    — imported directly on first appearance
[exists] — flagged as duplicate; frozen until user resolves
  → overwritten  (user picks "overwrite" in conflict review)
  → unchanged    (user picks "skip" in conflict review)
```

---

## 2. `shipment_uploads`

Represents one PDF upload import job. Created synchronously; status updated by the BullMQ worker.

| Column                | Type         | Constraints                      | Notes                                        |
| --------------------- | ------------ | -------------------------------- | -------------------------------------------- |
| `id`                  | UUID         | PK, DEFAULT gen_random_uuid()    | Upload / job identifier                      |
| `organization_id`     | UUID         | NOT NULL, FK → organizations(id) | Tenant scope                                 |
| `uploaded_by_user_id` | UUID         | NOT NULL, FK → users(id)         | Actor                                        |
| `original_filename`   | VARCHAR(255) | NOT NULL                         | Client-supplied filename                     |
| `file_hash`           | CHAR(64)     | NOT NULL                         | SHA-256 hex of file buffer (idempotency key) |
| `status`              | VARCHAR(30)  | NOT NULL, DEFAULT 'queued'       | See state transitions below                  |
| `total_rows_detected` | INTEGER      | NOT NULL, DEFAULT 0              | Set after PDF parse                          |
| `rows_imported`       | INTEGER      | NOT NULL, DEFAULT 0              |                                              |
| `rows_failed`         | INTEGER      | NOT NULL, DEFAULT 0              | Validation / parse failures                  |
| `rows_conflicted`     | INTEGER      | NOT NULL, DEFAULT 0              | Duplicate IDs awaiting review                |
| `started_at`          | TIMESTAMPTZ  | NULLABLE                         | Worker picks up job                          |
| `completed_at`        | TIMESTAMPTZ  | NULLABLE                         | Worker finishes                              |
| `duration_ms`         | INTEGER      | NULLABLE                         | For SLA observability                        |
| `created_at`          | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()          |                                              |
| `updated_at`          | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()          |                                              |

**Indexes and constraints**:

- `idx_shipment_uploads_org_created` on `(organization_id, created_at DESC)` — upload history list
- Partial unique index: `UNIQUE (organization_id, file_hash) WHERE status IN ('queued','processing')` — prevents concurrent re-processing of the same file

**`status` state machine**:

```
queued
  → processing           (worker starts)
      → completed        (all rows inserted, no conflicts)
      → partial          (some rows failed validation; conflicts all resolved)
      → awaiting_conflict_review  (≥1 duplicate IDs need user decision)
          → completed / partial   (after resolve endpoint called)
      → failed           (unrecoverable parse error or all retries exhausted)
```

---

## 3. `shipment_upload_errors`

Per-row failure or duplicate conflict record for a given upload.

| Column                 | Type         | Constraints                                           | Notes                                            |
| ---------------------- | ------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `id`                   | UUID         | PK, DEFAULT gen_random_uuid()                         |                                                  |
| `shipment_upload_id`   | UUID         | NOT NULL, FK → shipment_uploads(id) ON DELETE CASCADE | Parent job                                       |
| `row_number`           | INTEGER      | NOT NULL                                              | 1-based row index in parsed PDF table            |
| `error_type`           | VARCHAR(30)  | NOT NULL                                              | `validation`, `duplicate`, `parse`               |
| `field_name`           | VARCHAR(100) | NULLABLE                                              | Specific field that failed (for `validation`)    |
| `message`              | TEXT         | NOT NULL                                              | Human-readable reason                            |
| `incoming_payload`     | JSONB        | NULLABLE                                              | Snapshot of parsed row fields                    |
| `existing_shipment_id` | UUID         | NULLABLE, FK → shipments(id) SET NULL                 | FK to conflicting existing row (for `duplicate`) |
| `resolved`             | BOOLEAN      | NOT NULL, DEFAULT false                               | Set true after conflict decision                 |
| `resolution`           | VARCHAR(20)  | NULLABLE                                              | `overwritten` or `skipped` (set on resolution)   |
| `created_at`           | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                               |                                                  |
| `updated_at`           | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                               |                                                  |

**Indexes**:

- `idx_upload_errors_upload_id` on `(shipment_upload_id)`
- `idx_upload_errors_upload_type` on `(shipment_upload_id, error_type)`
- `idx_upload_errors_unresolved` on `(shipment_upload_id, resolved)` WHERE `resolved = false`

**Validation rules**:

- `error_type` limited to enum values `validation | duplicate | parse`
- A `duplicate` row MUST have `existing_shipment_id` set
- `resolution` is NULLABLE until `POST /conflicts/resolve` is called; after that must be `overwritten` or `skipped`

---

## Relationships Summary

| Relationship                              | Cardinality | Notes                                |
| ----------------------------------------- | ----------- | ------------------------------------ |
| Organization → Shipments                  | 1:many      | `organization_id` scopes all records |
| Organization → ShipmentUploads            | 1:many      | One upload job per PDF               |
| User → ShipmentUploads                    | 1:many      | `uploaded_by_user_id`                |
| ShipmentUpload → ShipmentUploadErrors     | 1:many      | Cascade delete                       |
| ShipmentUploadError → Shipment (existing) | n:optional1 | Duplicate conflict reference         |

---

## Migration Sequence

1. `20260318000001-create-shipments.ts` — create `shipments` table with UNIQUE constraint
2. `20260318000002-create-shipment-uploads.ts` — create `shipment_uploads` table
3. `20260318000003-create-shipment-upload-errors.ts` — create `shipment_upload_errors` table with FKs to both above

Each migration is reversible (`down` method drops the table).

---

## 4. `linehaul_trips` (Added 2026-03-19)

The Line Haul Trip header record. One row per uploaded Line Haul Trip PDF. Represents the "Surat Jalan" header section.

| Column                  | Type          | Constraints                                        | Notes                                |
| ----------------------- | ------------- | -------------------------------------------------- | ------------------------------------ |
| `id`                    | UUID          | PK, DEFAULT gen_random_uuid()                      | Internal row key                     |
| `organization_id`       | UUID          | NOT NULL, FK → organizations(id) ON DELETE CASCADE | Tenant scope                         |
| `trip_code`             | VARCHAR(100)  | NOT NULL                                           | Business identifier (e.g. `LT...`)   |
| `schedule`              | VARCHAR(255)  | NULLABLE                                           | Schedule reference                   |
| `origin`                | VARCHAR(255)  | NOT NULL                                           | Origin terminal/city                 |
| `destination`           | VARCHAR(255)  | NOT NULL                                           | Destination terminal/city            |
| `vendor`                | VARCHAR(255)  | NULLABLE                                           | Vendor name                          |
| `plate_number`          | VARCHAR(50)   | NULLABLE                                           | Vehicle plate number                 |
| `driver_name`           | VARCHAR(255)  | NULLABLE                                           | Driver name                          |
| `std`                   | TIMESTAMPTZ   | NULLABLE                                           | Scheduled Time of Departure          |
| `sta`                   | TIMESTAMPTZ   | NULLABLE                                           | Scheduled Time of Arrival            |
| `ata`                   | TIMESTAMPTZ   | NULLABLE                                           | Actual Time of Arrival               |
| `total_weight`          | NUMERIC(12,3) | NULLABLE                                           | Total weight of all items            |
| `last_import_upload_id` | UUID          | NULLABLE, FK → shipment_uploads(id) SET NULL       | Tracks which import created this row |
| `created_at`            | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                            |                                      |
| `updated_at`            | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                            |                                      |

**Indexes and constraints**:

- `UNIQUE (organization_id, trip_code)` — prevents duplicate trip imports
- `idx_linehaul_trips_org_trip_code` on `(organization_id, trip_code)` — lookup path
- `idx_linehaul_trips_org_created` on `(organization_id, created_at DESC)` — listing queries

**Validation rules**:

- `trip_code` must be non-empty and match `LT\w+` pattern
- `origin` and `destination` are required
- At least 1 trip item is required for a valid import

**State transitions** (via import):

```
[new]    — imported on first appearance
[exists] — flagged as duplicate; trip_code unique constraint prevents re-insert
  → update  (user confirms overwrite in conflict review)
  → skip    (user skips in conflict review)
```

---

## 5. `linehaul_trip_items` (Added 2026-03-19)

Individual items (rows) from the Line Haul Trip table section. Each row has a Transfer Order (TO) number used for QR code scanning.

| Column             | Type          | Constraints                                         | Notes                                      |
| ------------------ | ------------- | --------------------------------------------------- | ------------------------------------------ |
| `id`               | UUID          | PK, DEFAULT gen_random_uuid()                       | Internal row key                           |
| `linehaul_trip_id` | UUID          | NOT NULL, FK → linehaul_trips(id) ON DELETE CASCADE | Parent trip                                |
| `to_number`        | VARCHAR(100)  | NOT NULL                                            | Transfer Order number (used for QR lookup) |
| `weight`           | NUMERIC(12,3) | NULLABLE                                            | Item weight                                |
| `destination`      | VARCHAR(255)  | NULLABLE                                            | Item destination                           |
| `dg_type`          | VARCHAR(50)   | NULLABLE                                            | Dangerous goods type                       |
| `to_type`          | VARCHAR(50)   | NULLABLE                                            | Transfer Order type                        |
| `created_at`       | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                             |                                            |
| `updated_at`       | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                             |                                            |

**Indexes and constraints**:

- `idx_linehaul_items_trip_id` on `(linehaul_trip_id)` — parent lookup
- `UNIQUE (linehaul_trip_id, to_number)` — prevents duplicate items within a trip
- `idx_linehaul_items_to_number` on `(to_number)` — QR scan lookup (cross-trip, not org-scoped since `to_number` is globally unique within the system)

**Validation rules**:

- `to_number` must be non-empty and unique within the trip
- `linehaul_trip_id` must reference an existing trip

---

## Updated Entity Overview (with Line Haul)

```
organizations
  └── shipments                     (org-scoped shipment records)
  └── shipment_uploads              (one PDF import job per upload)
  │     └── shipment_upload_errors  (per-row failures and duplicate conflicts)
  └── linehaul_trips                (Line Haul Trip header records)
        └── linehaul_trip_items     (Line Haul Trip table rows — QR scannable via to_number)
users
  └── shipment_uploads (uploaded_by_user_id)
```

## Updated Relationships Summary

| Relationship                              | Cardinality | Notes                                 |
| ----------------------------------------- | ----------- | ------------------------------------- |
| Organization → Shipments                  | 1:many      | `organization_id` scopes all records  |
| Organization → ShipmentUploads            | 1:many      | One upload job per PDF                |
| Organization → LinehaulTrips              | 1:many      | `organization_id` scopes trips        |
| User → ShipmentUploads                    | 1:many      | `uploaded_by_user_id`                 |
| ShipmentUpload → ShipmentUploadErrors     | 1:many      | Cascade delete                        |
| ShipmentUploadError → Shipment (existing) | n:optional1 | Duplicate conflict reference          |
| LinehaulTrip → LinehaulTripItems          | 1:many      | Cascade delete                        |
| ShipmentUpload → LinehaulTrip             | 1:optional  | `last_import_upload_id` tracks source |

---

## Updated Migration Sequence

1. `20260318000001-create-shipments.ts` — create `shipments` table with UNIQUE constraint
2. `20260318000002-create-shipment-uploads.ts` — create `shipment_uploads` table
3. `20260318000003-create-shipment-upload-errors.ts` — create `shipment_upload_errors` table with FKs to both above
4. `20260319000001-create-linehaul-trips.ts` — create `linehaul_trips` table with UNIQUE constraint on `(organization_id, trip_code)`
5. `20260319000002-create-linehaul-trip-items.ts` — create `linehaul_trip_items` table with FK to `linehaul_trips` and index on `to_number`

Each migration is reversible (`down` method drops the table).
