# API Contract: Air Shipments

**Module**: `air-shipments`  
**Base Path**: `/api/air-shipments`  
**Auth Required**: Yes — all endpoints require `JwtAuthGuard` unless noted  
**Rate Limiting**: Inherited from global `@nestjs/throttler` policy  
**Pagination**: All list endpoints support `page` (default 1) and `limit` (default 50) query params  
**Sorting**: All list endpoints support `sortBy` (column name) and `sortOrder` (`asc` | `desc`, default `asc`)

---

## Common Query Parameters

| Param      | Type   | Default | Description                                |
| ---------- | ------ | ------- | ------------------------------------------ |
| `page`     | number | `1`     | 1-based page index                         |
| `limit`    | number | `50`    | Rows per page (max 200)                    |
| `sortBy`   | string | `id`    | Column name to sort by (must be a valid column in the table) |
| `sortOrder`| string | `asc`   | Sort direction: `asc` or `desc`            |

## Common Response Envelope

```json
{
  "data": [ /* row objects */ ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "totalPages": 25
  }
}
```

## Common Errors

| Status | Code              | Condition                                        |
| ------ | ----------------- | ------------------------------------------------ |
| 400    | `VALIDATION_ERROR`| Invalid query param value (e.g., non-numeric page) |
| 401    | `UNAUTHORIZED`    | Missing or invalid JWT                           |
| 429    | `RATE_LIMITED`    | Throttler limit exceeded                         |

---

## 1. CGK Air Shipments

### `GET /api/air-shipments/cgk`

Returns paginated rows from the `air_shipments_cgk` table (CompileAirCGK sheet data).

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "uuid",
      "to_number": "CGK-001234",
      "is_locked": false,
      "last_synced_at": "2026-04-08T12:00:00.000Z",
      "created_at": "2026-04-08T08:00:00.000Z",
      "updated_at": "2026-04-08T12:00:00.000Z"
      // ... normalized application columns from sheet
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 321,
    "totalPages": 7
  }
}
```

---

## 2. SUB Air Shipments

### `GET /api/air-shipments/sub`

Returns paginated rows from the `air_shipments_sub` table (SUB sheet data).

**Response `200 OK`**: Same envelope as CGK; row objects reflect `air_shipments_sub` columns.

---

## 3. SDA Air Shipments

### `GET /api/air-shipments/sda`

Returns paginated rows from the `air_shipments_sda` table (SDA sheet data).

**Response `200 OK`**: Same envelope as CGK; row objects reflect `air_shipments_sda` columns.

---

## 4. Rate Per Station

### `GET /api/air-shipments/rate`

Returns paginated rows from the `rate_per_station` table (Data sheet data).

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "uuid",
      "concat": "CGK-JKT-EXPRESS",
      "is_locked": null,
      "last_synced_at": "2026-04-08T12:00:00.000Z",
      "created_at": "2026-04-08T08:00:00.000Z",
      "updated_at": "2026-04-08T12:00:00.000Z"
      // ... normalized application columns
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 87, "totalPages": 2 }
}
```

---

## 5. Route Master

### `GET /api/air-shipments/routes`

Returns paginated rows from the `route_master` table (Master Data sheet data).

**Response `200 OK`**: Same envelope as Rate; row objects reflect `route_master` columns.

---

## Validation Rules

- `page` must be a positive integer ≥ 1
- `limit` must be a positive integer between 1 and 200 inclusive
- `sortOrder` must be exactly `asc` or `desc`
- `sortBy` must be a non-empty string; if the column does not exist on the target table the endpoint returns `400 VALIDATION_ERROR`

---

## Notes

- These endpoints are **read-only**. No write operations are exposed via REST; all data enters through the sync service.
- The `last_synced_at` field indicates when the sync service last wrote to that specific row (not when it was last polled).
- All application columns (beyond the fixed system columns) are returned as-is from the database; their types reflect the coercion applied by the sync pipeline.
