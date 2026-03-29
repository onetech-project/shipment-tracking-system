# Quickstart: PDF Shipment Upload & QR Code Scan

> Developer setup guide for feature branch `002-pdf-upload-qr-scan`.

---

## Prerequisites

| Tool       | Version  | Check                         |
| ---------- | -------- | ----------------------------- |
| Node.js    | ≥ 20 LTS | `node --version`              |
| npm        | ≥ 10     | `npm --version`               |
| PostgreSQL | 16.x     | running locally or via Docker |
| Redis      | 7.x      | required for BullMQ job queue |

---

## 1. Clone & Install

```bash
git clone https://github.com/onetech-project/shipment-tracking-system.git
cd shipment-tracking-system

git checkout 002-pdf-upload-qr-scan

npm install
```

---

## 2. Install Feature Dependencies

```bash
# Backend — PDF parsing (existing template + Line Haul Trip)
npm install --workspace=apps/backend pdf-parse pdfjs-dist pdf2json

# Frontend — QR decoding
npm install --workspace=apps/frontend jsqr
npm install --workspace=apps/frontend --save-dev @types/jsqr
```

> **pdf2json** is used for Line Haul Trip PDFs which require positional (x, y) data for table reconstruction. The existing `pdf-parse` remains for the pipe-delimited shipment template.

---

## 3. Environment Variables

```bash
cp apps/backend/.env.example apps/backend/.env
```

Add or verify these variables inside `apps/backend/.env`:

```dotenv
# ── Database ────────────────────────────────────────────────
DATABASE_URL=postgres://postgres:password@localhost:5432/shipment_tracking

# ── Redis (BullMQ) ──────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ── Import settings ─────────────────────────────────────────
SHIPMENT_IMPORT_MAX_FILE_MB=10        # reject files larger than this
SHIPMENT_IMPORT_CONCURRENCY=4         # BullMQ worker concurrency
SHIPMENT_ID_REGEX=^[A-Z0-9-]{6,40}$  # valid business shipment ID format

# ── General ─────────────────────────────────────────────────
BACKEND_PORT=3001
APP_URL=http://localhost:3000
NODE_ENV=development
```

> **Redis quick-start** (Docker): `docker run -p 6379:6379 redis:7-alpine`

---

## 4. Database Setup

### Create the database (if not already done from feature 001)

```bash
psql -U postgres -c "CREATE DATABASE shipment_tracking;"
```

### Run migrations

```bash
npm run migration:run --workspace=apps/backend
```

New migrations added by this feature (run in order after existing ones):

```
20260318000001-create-shipments.ts
20260318000002-create-shipment-uploads.ts
20260318000003-create-shipment-upload-errors.ts
20260319000001-create-linehaul-trips.ts
20260319000002-create-linehaul-trip-items.ts
```

---

## 5. Start Development Servers

```bash
# both in parallel (recommended)
npm run dev

# or individually:
npm run dev:backend    # NestJS on localhost:3001
npm run dev:frontend   # Next.js on localhost:3000
```

Verify backend is healthy:

```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

---

## 6. Feature Walkthrough (Manual)

### 6a — Upload a PDF

```bash
# Authenticate first (from feature 001)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"Admin123!"}' \
  | jq -r '.accessToken')

# Upload a PDF
UPLOAD=$(curl -s -X POST http://localhost:3001/api/shipments/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/shipments.pdf")

echo $UPLOAD
# {"uploadId":"...","status":"queued","message":"..."}

UPLOAD_ID=$(echo $UPLOAD | jq -r '.uploadId')
```

### 6b — Poll Import Status

```bash
curl http://localhost:3001/api/shipments/imports/$UPLOAD_ID \
  -H "Authorization: Bearer $TOKEN"
# {"status":"completed","rowsImported":50,"rowsFailed":0,"rowsConflicted":0,...}
```

### 6c — View Conflicts (if status is `awaiting_conflict_review`)

```bash
curl http://localhost:3001/api/shipments/imports/$UPLOAD_ID/errors \
  -H "Authorization: Bearer $TOKEN"
```

### 6d — Resolve Conflicts

```bash
curl -X POST http://localhost:3001/api/shipments/imports/$UPLOAD_ID/conflicts/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decisions":[{"errorId":"<uuid>","action":"overwrite"},{"errorId":"<uuid>","action":"skip"}]}'
```

### 6e — Upload a Line Haul Trip PDF

```bash
# Upload a Line Haul Trip PDF (auto-detected by template markers)
UPLOAD=$(curl -s -X POST http://localhost:3001/api/shipments/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/linehaul-trip.pdf")

echo $UPLOAD
# {"uploadId":"...","status":"queued","message":"..."}
```

The import processor auto-detects Line Haul Trip PDFs by the presence of "Nomor TO" and "Surat Jalan" markers. Extracted data is stored in `linehaul_trips` and `linehaul_trip_items` tables.

### 6f — Lookup Trip Item by TO Number (QR Scan)

```bash
curl http://localhost:3001/api/shipments/linehaul/items/TO-2026031900001 \
  -H "Authorization: Bearer $TOKEN"
# {"item":{"toNumber":"TO-2026031900001","weight":12.5,...},"trip":{"tripCode":"LT2026031901",...}}
```

### 6g — Lookup Shipment by ID (existing QR Scan)

```bash
curl http://localhost:3001/api/shipments/SHP-1001 \
  -H "Authorization: Bearer $TOKEN"
# {"shipmentId":"SHP-1001","origin":"Jakarta","destination":"Bandung",...}
```

### 6h — In the Browser (QR Scanner)

1. Log in at `http://localhost:3000`.
2. Navigate to **Shipments → Scan QR**.
3. Click **Start Scanner** — the browser prompts for camera permission.
4. Point camera at a QR code encoded with a TO number from a Line Haul Trip item.
5. The trip item detail card appears within 5 seconds, showing item and parent trip info.
6. Scanning a QR code with an existing shipment ID (not a TO number) falls back to the shipment lookup.
7. To test "not found": generate a QR with an unknown ID and scan it.

---

## 7. Running Tests

```bash
# Backend unit + integration
npm run test --workspace=apps/backend

# Backend with coverage
npm run test:cov --workspace=apps/backend

# Playwright E2E (requires running backend + frontend + DB)
npm run test:e2e --workspace=apps/frontend
```

Key test files for this feature:

| Location                                                                              | Purpose                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/backend/src/modules/shipments/shipments.service.spec.ts`                        | Unit — QR lookup, validation                               |
| `apps/backend/src/modules/shipments/imports/import.processor.spec.ts`                 | Unit — PDF parse, row validation, conflict detection       |
| `apps/backend/src/modules/shipments/imports/import.controller.spec.ts`                | Integration — full HTTP cycle                              |
| `apps/backend/src/modules/shipments/imports/linehaul/linehaul-parser.service.spec.ts` | Unit — Line Haul Trip PDF extraction, table reconstruction |
| `apps/backend/src/modules/shipments/imports/linehaul/linehaul-import.service.spec.ts` | Unit — Line Haul Trip persistence                          |
| `apps/backend/src/modules/shipments/linehaul.controller.spec.ts`                      | Integration — TO number lookup HTTP cycle                  |
| `apps/frontend/e2e/shipments/upload.spec.ts`                                          | Playwright — upload journey (both templates)               |
| `apps/frontend/e2e/shipments/scan.spec.ts`                                            | Playwright — QR scan journey (TO number + shipment ID)     |

---

## 8. Generating a New Migration

After modifying a TypeORM entity:

```bash
npm run migration:generate --workspace=apps/backend -- -n <MigrationName>
# review the generated file, then:
npm run migration:run --workspace=apps/backend
```

---

## 9. Troubleshooting

| Symptom                         | Fix                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `INVALID_PDF` on upload         | Confirm the file is a text-layer PDF matching the internal template (not a scanned image).               |
| Import stuck at `queued`        | Check Redis is reachable: `redis-cli ping`. Confirm `ShipmentsModule` registers the BullMQ processor.    |
| `SHIPMENT_NOT_FOUND` on scan    | Verify the QR payload matches the format in `SHIPMENT_ID_REGEX` and the shipment exists in the database. |
| `TRIP_ITEM_NOT_FOUND` on scan   | Verify the scanned TO number exists in `linehaul_trip_items`. Upload a Line Haul Trip PDF first.         |
| Line Haul PDF parsed as invalid | Confirm the PDF contains "Nomor TO" and "Surat Jalan" marker text.                                       |
| Scanner shows blank / no feed   | Confirm browser has camera permission. On desktop, check no other app is holding the camera.             |
| `ECONNREFUSED` on DB            | `pg_isready -h localhost -p 5432` — start PostgreSQL if not running.                                     |
