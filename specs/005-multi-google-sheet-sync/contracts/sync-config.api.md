# API Contract: Sync Config (Google Sheet Config)

**Module**: `SyncConfigModule`  
**Base Path**: `/sync-config`  
**Auth Required**: Yes — admin scopes (project convention)  
**Rate Limiting**: Inherited from global throttler policy

---

## Endpoints

### `GET /sync-config/spreadsheets`

List all spreadsheet configs with nested sheets.

**Query params**: none

**Response 200**:

```json
[
  {
    "id": "uuid",
    "label": "Delivery Feeds",
    "spreadsheet_id": "1AbC...",
    "interval_seconds": 15,
    "is_enabled": true,
    "created_at": "...",
    "updated_at": "...",
    "sheets": [
      {
        "id": "uuid",
        "sheet_name": "Delivery Routes",
        "table_name": "air_shipment_delivery_routes",
        "unique_keys": ["to_number"],
        "header_row": 1,
        "is_enabled": true,
        "status": "ready"
      }
    ]
  }
]
```

---

### `POST /sync-config/spreadsheets`

Create a spreadsheet config.

**Body**:

```json
{
  "label": "Delivery Feeds",
  "spreadsheet_id": "1AbC...",
  "interval_seconds": 15,
  "is_enabled": true
}
```

**Response 201**: created spreadsheet object with `id`.

---

### `PATCH /sync-config/spreadsheets/:id`

Update spreadsheet config fields (label, interval_seconds, is_enabled).

**Body**: partial of POST body

**Response 200**: updated spreadsheet object.

---

### `DELETE /sync-config/spreadsheets/:id`

Deletes the spreadsheet config and cascades to `google_sheet_sheet_config` rows.

**Note**: Per spec, PostgreSQL tables created for sheets are NOT dropped automatically.

**Response 204**: no content.

---

### `GET /sync-config/spreadsheets/:id/sheets`

List sheets for a spreadsheet.

**Response 200**: array of sheet objects (same shape as nested sheets above).

---

### `POST /sync-config/spreadsheets/:id/sheets`

Create a sheet config. This triggers `DynamicTableService.ensureTable()` after DB save.

**Body**:

```json
{
  "sheet_name": "Delivery Routes",
  "unique_keys": ["to_number"],
  "header_row": 1,
  "is_enabled": true
}
```

**Response 201**: created sheet object. The response includes `table_name` (generated) and may include a `status` field indicating whether `ensureTable` succeeded (e.g., `ready` vs `not-ready`). The API returns success for the config save even if table creation failed; check `status` and logs for details.

---

### `PATCH /sync-config/sheets/:id`

Update a sheet config. If `unique_keys` change, API triggers `DynamicTableService.ensureTable()` to add missing columns and constraints.

**Body**: partial sheet object

**Response 200**: updated sheet object, including `status`.

---

### `DELETE /sync-config/sheets/:id`

Delete sheet config (does not drop the underlying PostgreSQL table).

**Response 204**: no content

---

## Validation Rules

- `spreadsheet_id` must match Google Sheets ID pattern (basic validation only)
- `label` is required and non-empty
- `interval_seconds` must be >= 5
- `header_row` must be >= 1
- `unique_keys` must be a non-empty array of snake_case strings (recommendation; server validates that columns can be used as identifiers)

## Errors

- 400 `VALIDATION_ERROR` — invalid input values
- 404 `NOT_FOUND` — spreadsheet or sheet id not found
- 409 `CONFLICT` — attempted to create duplicate spreadsheet/config
- 422 `TABLE_CREATION_FAILED` — returned as a non-fatal status in the sheet object `status` field; API still returns 201/200 for config save

---

## Notes

- The `table_name` property is read-only and derived from `sheet_name` using the normalization rule. The UI should show a preview but not allow direct edits.
- Table creation is attempted asynchronously during the request flow but failures do not block saving the config row.
