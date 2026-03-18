# API Contract: Shipments

**Module**: `shipments`  
**Base Path**: `/api/shipments`  
**Auth Required**: Yes — all endpoints require `JwtAuthGuard` unless noted  
**Rate Limiting**: Inherited from global `@nestjs/throttler` policy

---

## 1. Upload PDF for Import

### `POST /shipments/imports`

Upload a shipment PDF. Validates the file type synchronously, queues the import job, and returns immediately.

**Auth**: `JwtAuthGuard`  
**Content-Type**: `multipart/form-data`

**Form fields**:

| Field | Required | Notes |
|-------|----------|-------|
| `file` | Yes | PDF file; max size configured via `SHIPMENT_IMPORT_MAX_FILE_MB` |

**Response `202 Accepted`**:
```json
{
  "uploadId": "a1b2c3d4-...",
  "status": "queued",
  "message": "Import queued. Poll GET /shipments/imports/:uploadId for progress."
}
```

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_FILE_TYPE` | Non-PDF MIME type or extension |
| 400 | `INVALID_PDF` | File passes MIME check but cannot be parsed (corrupt, encrypted) |
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 413 | `FILE_TOO_LARGE` | Exceeds `SHIPMENT_IMPORT_MAX_FILE_MB` limit |
| 429 | `RATE_LIMITED` | Upload rate limit exceeded |

---

## 2. Get Import Status

### `GET /shipments/imports/:uploadId`

Poll for the progress and final summary of an upload job.

**Response `200 OK`**:
```json
{
  "uploadId": "a1b2c3d4-...",
  "originalFilename": "march-batch.pdf",
  "status": "awaiting_conflict_review",
  "totalRowsDetected": 52,
  "rowsImported": 49,
  "rowsFailed": 1,
  "rowsConflicted": 2,
  "startedAt": "2026-03-18T08:00:01.000Z",
  "completedAt": null,
  "durationMs": null
}
```

**`status` values**: `queued` | `processing` | `completed` | `partial` | `awaiting_conflict_review` | `failed`

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | |
| 403 | `FORBIDDEN` | Upload belongs to a different organisation |
| 404 | `UPLOAD_NOT_FOUND` | No job found for given `uploadId` |

---

## 3. List Per-Row Errors and Conflicts

### `GET /shipments/imports/:uploadId/errors`

Return all rows that failed validation or were flagged as duplicates.

**Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "e1e2e3-...",
      "rowNumber": 14,
      "errorType": "duplicate",
      "fieldName": null,
      "message": "Shipment ID 'SHP-1001' already exists in the database.",
      "incomingPayload": {
        "shipmentId": "SHP-1001",
        "origin": "Jakarta",
        "destination": "Bandung",
        "status": "in_transit"
      },
      "existingShipmentId": "f1f2f3-...",
      "resolved": false,
      "resolution": null
    },
    {
      "id": "e4e5e6-...",
      "rowNumber": 31,
      "errorType": "validation",
      "fieldName": "destination",
      "message": "Field 'destination' is required but was empty.",
      "incomingPayload": { "shipmentId": "SHP-2005", "origin": "Surabaya", "destination": "" },
      "existingShipmentId": null,
      "resolved": false,
      "resolution": null
    }
  ]
}
```

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | |
| 403 | `FORBIDDEN` | Upload belongs to a different organisation |
| 404 | `UPLOAD_NOT_FOUND` | |

---

## 4. Resolve Conflict Decisions

### `POST /shipments/imports/:uploadId/conflicts/resolve`

Apply overwrite or skip decisions for duplicate rows. Triggers final completion of the upload.

**Request Body**:
```json
{
  "decisions": [
    { "errorId": "e1e2e3-...", "action": "overwrite" },
    { "errorId": "e7e8e9-...", "action": "skip" }
  ]
}
```

**Field rules**:
- `decisions` — required, non-empty array
- `action` — required, enum: `"overwrite"` | `"skip"`
- All unresolved `duplicate`-type error IDs for the upload must be included

**Response `200 OK`**:
```json
{
  "uploadId": "a1b2c3d4-...",
  "status": "completed",
  "rowsImported": 51,
  "rowsFailed": 1,
  "rowsConflicted": 2
}
```

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_ACTION` | `action` is not `"overwrite"` or `"skip"` |
| 400 | `MISSING_DECISIONS` | Not all unresolved conflict error IDs included |
| 401 | `UNAUTHORIZED` | |
| 403 | `FORBIDDEN` | Upload belongs to a different organisation |
| 404 | `ERROR_ROW_NOT_FOUND` | `errorId` not found within this upload |
| 409 | `UPLOAD_NOT_AWAITING_REVIEW` | Upload status is not `awaiting_conflict_review` |

---

## 5. Upload History

### `GET /shipments/imports/history`

Paginated list of past PDF uploads for the authenticated user's organisation.

**Query parameters**:

| Param | Default | Notes |
|-------|---------|-------|
| `limit` | 20 | Max results per page (max 100) |
| `cursor` | — | Opaque cursor for next-page pagination |

**Response `200 OK`**:
```json
{
  "items": [
    {
      "uploadId": "a1b2c3d4-...",
      "originalFilename": "march-batch.pdf",
      "status": "partial",
      "totalRowsDetected": 200,
      "rowsImported": 195,
      "rowsFailed": 3,
      "rowsConflicted": 2,
      "createdAt": "2026-03-18T08:00:00.000Z",
      "completedAt": "2026-03-18T08:00:27.000Z"
    }
  ],
  "nextCursor": "opaque-base64-cursor"
}
```

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | |

---

## 6. Shipment Lookup (QR Scan)

### `GET /shipments/:shipmentId`

Look up a shipment by its business shipment ID (decoded from QR code). The `:shipmentId` parameter is the plain-text business ID, not the database UUID.

**Response `200 OK`**:
```json
{
  "id": "f1f2f3-...",
  "shipmentId": "SHP-1001",
  "origin": "Jakarta",
  "destination": "Bandung",
  "status": "in_transit",
  "carrier": "JNE Express",
  "estimatedDeliveryDate": "2026-03-20",
  "contentsDescription": "Medical supplies — 3 cartons"
}
```

**Errors**:

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_SHIPMENT_ID_FORMAT` | Decoded QR value fails format validation |
| 401 | `UNAUTHORIZED` | |
| 404 | `SHIPMENT_NOT_FOUND` | No matching record in this organisation |

---

## Common Error Schema

All endpoints return structured errors:

```json
{
  "statusCode": 400,
  "error": "INVALID_FILE_TYPE",
  "message": "Only PDF files are accepted. Received: image/png"
}
```
