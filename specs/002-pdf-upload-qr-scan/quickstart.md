# Quickstart: PDF Shipment Upload & QR Code Scan

> Developer setup guide for feature branch `002-pdf-upload-qr-scan`.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 20 LTS | `node --version` |
| npm | ≥ 10 | `npm --version` |
| PostgreSQL | 16.x | running locally or via Docker |
| Redis | 7.x | required for BullMQ job queue |

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
# Backend — PDF parsing
npm install --workspace=apps/backend pdf-parse pdfjs-dist

# Frontend — QR decoding
npm install --workspace=apps/frontend jsqr
npm install --workspace=apps/frontend --save-dev @types/jsqr
```

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
curl http://localhost:3001/health
# {"status":"ok"}
```

---

## 6. Feature Walkthrough (Manual)

### 6a — Upload a PDF

```bash
# Authenticate first (from feature 001)
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"Admin123!"}' \
  | jq -r '.accessToken')

# Upload a PDF
UPLOAD=$(curl -s -X POST http://localhost:3001/shipments/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/shipments.pdf")

echo $UPLOAD
# {"uploadId":"...","status":"queued","message":"..."}

UPLOAD_ID=$(echo $UPLOAD | jq -r '.uploadId')
```

### 6b — Poll Import Status

```bash
curl http://localhost:3001/shipments/imports/$UPLOAD_ID \
  -H "Authorization: Bearer $TOKEN"
# {"status":"completed","rowsImported":50,"rowsFailed":0,"rowsConflicted":0,...}
```

### 6c — View Conflicts (if status is `awaiting_conflict_review`)

```bash
curl http://localhost:3001/shipments/imports/$UPLOAD_ID/errors \
  -H "Authorization: Bearer $TOKEN"
```

### 6d — Resolve Conflicts

```bash
curl -X POST http://localhost:3001/shipments/imports/$UPLOAD_ID/conflicts/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decisions":[{"errorId":"<uuid>","action":"overwrite"},{"errorId":"<uuid>","action":"skip"}]}'
```

### 6e — Lookup Shipment by ID (QR Scan)

```bash
curl http://localhost:3001/shipments/SHP-1001 \
  -H "Authorization: Bearer $TOKEN"
# {"shipmentId":"SHP-1001","origin":"Jakarta","destination":"Bandung",...}
```

### 6f — In the Browser (QR Scanner)

1. Log in at `http://localhost:3000`.
2. Navigate to **Shipments → Scan QR**.
3. Click **Start Scanner** — the browser prompts for camera permission.
4. Point camera at a QR code encoded with a valid shipment ID.
5. The shipment detail card appears within 5 seconds.
6. To test "not found": generate a QR with an unknown ID and scan it.

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

| Location | Purpose |
|----------|---------|
| `apps/backend/src/modules/shipments/shipments.service.spec.ts` | Unit — QR lookup, validation |
| `apps/backend/src/modules/shipments/imports/import.processor.spec.ts` | Unit — PDF parse, row validation, conflict detection |
| `apps/backend/src/modules/shipments/imports/import.controller.spec.ts` | Integration — full HTTP cycle |
| `apps/frontend/e2e/shipments/upload.spec.ts` | Playwright — upload journey |
| `apps/frontend/e2e/shipments/scan.spec.ts` | Playwright — QR scan journey |

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

| Symptom | Fix |
|---------|-----|
| `INVALID_PDF` on upload | Confirm the file is a text-layer PDF matching the internal template (not a scanned image). |
| Import stuck at `queued` | Check Redis is reachable: `redis-cli ping`. Confirm `ShipmentsModule` registers the BullMQ processor. |
| `SHIPMENT_NOT_FOUND` on scan | Verify the QR payload matches the format in `SHIPMENT_ID_REGEX` and the shipment exists in the database. |
| Scanner shows blank / no feed | Confirm browser has camera permission. On desktop, check no other app is holding the camera. |
| `ECONNREFUSED` on DB | `pg_isready -h localhost -p 5432` — start PostgreSQL if not running. |
