# API Contract: Line Haul Trips

**Module**: `shipments` (linehaul sub-domain)  
**Base Path**: `/api/shipments/linehaul`  
**Auth Required**: Yes — all endpoints require `JwtAuthGuard`  
**Rate Limiting**: Inherited from global `@nestjs/throttler` policy

---

## 1. Lookup Trip Item by TO Number (QR Scan)

### `GET /shipments/linehaul/items/:toNumber`

Look up a Line Haul Trip item by its Transfer Order number (decoded from QR code). Returns the item details along with parent trip header information.

**Auth**: `JwtAuthGuard`

**Path Parameters**:

| Param      | Type   | Description                                |
| ---------- | ------ | ------------------------------------------ |
| `toNumber` | string | Transfer Order number decoded from QR code |

**Response `200 OK`**:

```json
{
  "item": {
    "id": "a1b2c3d4-...",
    "toNumber": "TO-2026031900001",
    "weight": 12.5,
    "destination": "Bandung",
    "dgType": "non-dg",
    "toType": "REGULAR"
  },
  "trip": {
    "id": "e5f6g7h8-...",
    "tripCode": "LT2026031901",
    "schedule": "SCH-001",
    "origin": "Jakarta",
    "destination": "Bandung",
    "vendor": "PT Vendor Logistics",
    "plateNumber": "B1234XYZ",
    "driverName": "Ahmad Bayu",
    "std": "2026-03-19T08:00:00.000Z",
    "sta": "2026-03-19T14:00:00.000Z",
    "ata": "2026-03-19T13:45:00.000Z",
    "totalWeight": 1250.0
  }
}
```

**Errors**:

| Status | Code                       | Condition                                                                         |
| ------ | -------------------------- | --------------------------------------------------------------------------------- |
| 400    | `INVALID_TO_NUMBER_FORMAT` | Decoded QR value fails format validation                                          |
| 401    | `UNAUTHORIZED`             | Missing or invalid access token                                                   |
| 404    | `TRIP_ITEM_NOT_FOUND`      | No matching `to_number` in `linehaul_trip_items` within this organisation's trips |

---

## 2. List Line Haul Trips

### `GET /shipments/linehaul/trips`

Paginated list of Line Haul Trips for the authenticated user's organisation.

**Auth**: `JwtAuthGuard`

**Query Parameters**:

| Param    | Default | Notes                                  |
| -------- | ------- | -------------------------------------- |
| `limit`  | 20      | Max results per page (max 100)         |
| `cursor` | —       | Opaque cursor for next-page pagination |

**Response `200 OK`**:

```json
{
  "items": [
    {
      "id": "e5f6g7h8-...",
      "tripCode": "LT2026031901",
      "origin": "Jakarta",
      "destination": "Bandung",
      "vendor": "PT Vendor Logistics",
      "plateNumber": "B1234XYZ",
      "driverName": "Ahmad Bayu",
      "std": "2026-03-19T08:00:00.000Z",
      "sta": "2026-03-19T14:00:00.000Z",
      "totalWeight": 1250.0,
      "itemCount": 15,
      "createdAt": "2026-03-19T07:30:00.000Z"
    }
  ],
  "nextCursor": "opaque-base64-cursor"
}
```

**Errors**:

| Status | Code           | Condition |
| ------ | -------------- | --------- |
| 401    | `UNAUTHORIZED` |           |

---

## 3. Get Line Haul Trip Details with Items

### `GET /shipments/linehaul/trips/:tripId`

Retrieve full trip header with all item rows.

**Auth**: `JwtAuthGuard`

**Response `200 OK`**:

```json
{
  "trip": {
    "id": "e5f6g7h8-...",
    "tripCode": "LT2026031901",
    "schedule": "SCH-001",
    "origin": "Jakarta",
    "destination": "Bandung",
    "vendor": "PT Vendor Logistics",
    "plateNumber": "B1234XYZ",
    "driverName": "Ahmad Bayu",
    "std": "2026-03-19T08:00:00.000Z",
    "sta": "2026-03-19T14:00:00.000Z",
    "ata": "2026-03-19T13:45:00.000Z",
    "totalWeight": 1250.0,
    "createdAt": "2026-03-19T07:30:00.000Z"
  },
  "items": [
    {
      "id": "a1b2c3d4-...",
      "toNumber": "TO-2026031900001",
      "weight": 12.5,
      "destination": "Bandung",
      "dgType": "non-dg",
      "toType": "REGULAR"
    }
  ]
}
```

**Errors**:

| Status | Code             | Condition                                |
| ------ | ---------------- | ---------------------------------------- |
| 401    | `UNAUTHORIZED`   |                                          |
| 403    | `FORBIDDEN`      | Trip belongs to a different organisation |
| 404    | `TRIP_NOT_FOUND` | No trip found for given `tripId`         |

---

## QR Scanner Integration

The existing QR scan flow is extended to support Line Haul Trip item lookup:

1. QR code is scanned → decoded value is the `to_number` string
2. Frontend calls `GET /shipments/linehaul/items/:toNumber`
3. If found → display `LinehaulDetail` component with trip item + parent trip info
4. If 404 → fall back to existing `GET /shipments/:shipmentId` lookup
5. If both 404 → display "not found" message

This dual-lookup approach maintains backward compatibility with existing shipment QR codes.

---

## Common Error Schema

All endpoints return structured errors consistent with the existing shipments API:

```json
{
  "statusCode": 400,
  "error": "INVALID_TO_NUMBER_FORMAT",
  "message": "The scanned value does not match a valid Transfer Order number format."
}
```

---

## PDF Upload Integration

Line Haul Trip PDFs use the **existing** `POST /shipments/imports` endpoint. The import processor auto-detects the template type:

- If PDF text contains "Nomor TO" + "Surat Jalan" markers → Line Haul Trip parser
- If PDF text contains existing `TEMPLATE_MARKERS` → pipe-delimited shipment parser
- Otherwise → reject with `INVALID_PDF`

No changes to the upload API contract. The `ImportStatusResponse` shared type accommodates both template types.
