# API Contract: Dynamic Air Shipments Endpoint

**Module**: `air-shipments` (dynamic table access)
**Base Path**: `/air-shipments/:tableName`
**Auth Required**: Yes — same guards as other air-shipments endpoints
**Safety**: `:tableName` must exist in `google_sheet_sheet_config` and be `is_enabled=true` to prevent arbitrary table access.

---

## Query Parameters

| Param       | Type   | Default | Description                                                                 |
| ----------- | ------ | ------- | --------------------------------------------------------------------------- |
| `page`      | number | `1`     | 1-based page index                                                          |
| `limit`     | number | `50`    | Rows per page (max 200)                                                     |
| `sortBy`    | string | `id`    | Column name to sort by (must be a known column)                             |
| `sortOrder` | string | `asc`   | `asc` or `desc`                                                             |
| `search`    | string | —       | Optional full-text-like search (implemented as `ILIKE` across TEXT columns) |

---

## Response Envelope

```json
{
  "data": [
    /* row objects */
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "totalPages": 25
  }
}
```

Each row object includes:

- Fixed system columns: `id`, `is_locked`, `last_synced_at`, `created_at`, `updated_at`
- Dedicated unique-key columns (e.g., `to_number`) as top-level fields
- `extra_data` JSON object containing all remaining unknown columns from the sheet

Example row:

```json
{
  "id": "uuid",
  "to_number": "ABC-123",
  "is_locked": false,
  "last_synced_at": "2026-04-17T12:00:00.000Z",
  "created_at": "2026-04-17T11:00:00.000Z",
  "updated_at": "2026-04-17T12:00:00.000Z",
  "extra_data": {
    "flight_date": "2026-04-16",
    "airline": "ACME"
  }
}
```

---

## Validation Rules

- `tableName` path param must exist in `google_sheet_sheet_config` (match `table_name` column) and be `is_enabled=true`. If not, return `404 NOT_FOUND`.
- `page` must be integer ≥ 1; `limit` between 1 and 200 inclusive.
- `sortOrder` must be `asc` or `desc`.
- `sortBy` must refer to either a known dedicated column or a fixed system column; otherwise return `400 VALIDATION_ERROR`.

## Search Behavior

- `search` performs a case-insensitive `ILIKE` across all TEXT/dedicated TEXT columns and may also search stringified `extra_data` values. Implementation detail: `search` is implemented with parameterized `ILIKE` patterns; do not perform unquoted identifier concatenation.

## Errors

- 400 `VALIDATION_ERROR` — invalid params
- 401 `UNAUTHORIZED` — missing/invalid JWT
- 404 `NOT_FOUND` — table not registered or not enabled
- 500 `INTERNAL_ERROR` — unexpected failures

---

## Notes

- This endpoint is read-only. Writes to dynamic tables happen only via the sync pipeline.
- For performance, the service should determine dedicated columns via `information_schema` or the `SheetsService.reloadTableSchemas()` cache, then build SELECT clauses safely using the `quoteIdentifier` helper.
- The endpoint should return both dedicated columns and the `extra_data` object so the UI can display a complete table without prior schema knowledge.
