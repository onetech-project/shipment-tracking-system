# Phase 0 Research: PDF Shipment Upload & QR Code Scan

**Branch**: `002-pdf-upload-qr-scan` | **Date**: 2026-03-18  
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

All NEEDS CLARIFICATION items resolved. Decisions documented below with rationale and rejected alternatives.

---

## Topic A — PDF Text Extraction

### A1 — Library Choice: pdf-parse vs pdfjs-dist vs OCR

| | |
|---|---|
| **Decision** | `pdf-parse` (wraps `pdfjs-dist`) for text extraction from the single internal shipment template |
| **Rationale** | The feature scope is explicitly one internal template (FR-003), so text extraction + deterministic field mapping is simpler and more reliable than OCR. `pdf-parse` is a lightweight Node.js library with no native dependencies (Docker-compatible) that provides full plain-text output from the PDF. Template-based text parsing achieves >95% accuracy target (SC-002) without external services or additional infrastructure. |
| **Alternatives considered** | **Tesseract OCR**: rejected — adds native binaries and complexity; unnecessary for a text-layer PDF template. **External OCR APIs**: rejected — adds cost, latency, and vendor lock-in for a problem solvable locally. **pdfjs-dist directly**: valid base; `pdf-parse` wraps it acceptably for this use case; switch to raw `pdfjs-dist` only if template parsing requires page-level or position-aware extraction. |

---

### A2 — Template Parsing Strategy

| | |
|---|---|
| **Decision** | Extract full text from `pdf-parse`, then apply deterministic regex/split logic to locate the shipment data table and map columns to DTO fields |
| **Rationale** | A single internal template guarantees a stable layout, so a deterministic parser is both simpler and more maintainable than a general-purpose table extractor. The parser explicitly rejects PDFs whose extracted text does not match the expected template signature (rejecting out-of-scope PDFs per FR-003 assumption). |
| **Alternatives considered** | **tabula-py / camelot**: Python libraries requiring subprocess calls — avoids; adds Python runtime to the Node.js container. **pdfplumber**: Same Python dependency concern. |

---

### A3 — Password-Protected / Unreadable PDFs

| | |
|---|---|
| **Decision** | Catch `pdf-parse` parse errors and return `INVALID_PDF` (400) immediately; do not attempt processing |
| **Rationale** | Aligns with edge case handling in spec. Encrypted PDFs produce an unrecoverable parse error; early rejection prevents queue poisoning. |
| **Alternatives considered** | Attempting decryption with a blank password before failing: adds complexity with minimal practical benefit for this system. |

---

## Topic B — Asynchronous Import Pipeline

### B1 — Async Processing Model

| | |
|---|---|
| **Decision** | BullMQ (already provisioned in the project) with a dedicated `shipment-import` queue; controller returns `{ uploadId, status: "queued" }` immediately, client polls `GET /shipments/imports/:id` |
| **Rationale** | Satisfies FR-008 non-blocking UI requirement. The project already has BullMQ + Redis wired in `apps/backend` (visible in `package.json`), so no new infrastructure is added. BullMQ provides job durability across restarts, configurable retry intervals, and progress tracking — all needed for the import pipeline. |
| **Alternatives considered** | **Synchronous response**: blocks HTTP connection for up to 30s — browser timeouts and poor UX. **Node.js `worker_threads` without a queue**: no persistence on restart, no built-in retry, harder to monitor. **SSE / WebSocket for push status**: more complex client; polling every 1–2s is adequate for import feedback latency. |

---

### B2 — Worker Retry and Failure Handling

| | |
|---|---|
| **Decision** | BullMQ job retries on transient errors (DB connection loss, parse exceptions) with max 3 attempts, exponential backoff starting at 2s. Final failure sets `ShipmentUpload.status = 'failed'` and emits `shipment.import.failed` event. |
| **Rationale** | Constitution §VIII mandates retryable external operations. DB writes and file parsing can fail transiently. Cap total attempts to avoid indefinite queuing. |
| **Alternatives considered** | Unbounded retries: risk queue starvation. No retry: violates constitution §VIII. |

---

## Topic C — Duplicate Detection and Conflict Review

### C1 — Duplicate Handling Strategy

| | |
|---|---|
| **Decision** | Pre-flight batch query for all shipment IDs found in PDF against `(organization_id, shipment_id)` index; new IDs inserted immediately; conflicting IDs written to `ShipmentUploadError` rows with `error_type = 'duplicate'`; upload transitions to `awaiting_conflict_review`; user must call `POST /shipments/imports/:id/conflicts/resolve` before any overwrite occurs |
| **Rationale** | Directly satisfies FR-007: existing records MUST NOT be modified until user explicitly confirms. Batch pre-flight query (one `IN` query for all IDs) is efficient — avoids N+1 round-trips and meets 30s SLA. |
| **Alternatives considered** | **Automatic upsert**: violates FR-007 directly. **Reject entire file on first duplicate**: poor usability — valid rows should not be blocked. **Application-level row-by-row check**: O(n) queries — fails performance targets at 200 rows. |

---

### C2 — Idempotency (Re-upload of Same File)

| | |
|---|---|
| **Decision** | Compute `SHA-256` hex hash of the uploaded file buffer; store on `ShipmentUpload.file_hash`; detect duplicate hash + same org within a 24h window and return existing upload job result rather than re-queuing |
| **Rationale** | Spec edge case "same PDF uploaded twice". File hash is content-based and reliable; filename alone is not. 24h window prevents false duplicate suppression for legitimately re-imported files after corrections. |
| **Alternatives considered** | **Filename-only dedup**: filenames are non-unique. **No idempotency**: double-processing risk on client retry. |

---

## Topic D — QR Code Scanner

### D1 — Scanning Library

| | |
|---|---|
| **Decision** | `jsqr` — pure JavaScript QR decoder operating on `ImageData` from a `<canvas>` element drawing from the `getUserMedia` video stream |
| **Rationale** | Lightweight (~6KB gzipped), zero native dependencies, works idiomatically in Next.js client components (`"use client"`). Gives explicit control over camera lifecycle, permission UX, decode rate limiting, and cleanup — all required by FR-009/FR-014. No wrapper abstractions that could obscure camera errors. |
| **Alternatives considered** | **ZXing.js**: heavier (~150KB); supports more barcode types than needed; overkill for QR-only. **html5-qrcode**: higher-level wrapper; acceptable but adds abstraction over camera permission handling; harder to control fine-grained permission error messages per FR-014. **Native Web API alone**: requires ~250 lines of boilerplate with no decoding built in. |

---

### D2 — Camera Permission UX

| | |
|---|---|
| **Decision** | Request `getUserMedia` only on explicit user button click ("Start Scanner"); catch and classify `NotAllowedError` / `NotFoundError` / `NotReadableError` separately; show inline recovery guidance for each |
| **Rationale** | Permission prompts from explicit user gestures convert to persistent browser grants more reliably than auto-prompts on mount. Satisfies FR-009/FR-014. Clear per-error messages (denied, no camera, camera in use) are more actionable than a generic "camera unavailable". |
| **Alternatives considered** | **Auto-prompt on mount**: inconsistent browser behavior; violates privacy UX norms. **Single generic error**: fails FR-014 usability requirement. |

---

### D3 — Decode Loop and Performance

| | |
|---|---|
| **Decision** | `requestAnimationFrame` loop drawing camera frames to canvas and running `jsQR` decode; 800ms debounce before triggering a backend lookup; 5s cooldown to avoid re-scanning the same code; stop loop and release stream on component unmount |
| **Rationale** | `requestAnimationFrame` syncs with display refresh (60fps); skipping frames when a scan is "in cooldown" keeps CPU usage low on mobile. 800ms debounce prevents duplicate network calls from jitter while the user holds the camera still. Satisfies SC-003 (≤5s end-to-end). |
| **Alternatives considered** | `setInterval` polling: no sync with display; wastes CPU when browser tab is backgrounded. Continuous decode without debounce: triggers multiple redundant backend calls per second. |

---

### D4 — Client-Side ID Validation Before Lookup

| | |
|---|---|
| **Decision** | Validate decoded QR payload against a configurable shipment ID regex before calling the backend; extract ID from URL paths/params if payload is a URL; display `INVALID_FORMAT` error instantly on mismatch |
| **Rationale** | Avoids round-trips for obviously invalid payloads. Satisfies SC-005 (≤3s error feedback). Spec assumption: plain text shipment ID; spec also notes QR codes with URLs should attempt ID extraction from path. |
| **Alternatives considered** | Backend-only validation: adds unnecessary latency for malformed QR content. No URL extraction: breaks spec assumption for URL-encoded shipment IDs. |

---

## Topic E — Audit and Observability

### E1 — Audit Event Strategy

| | |
|---|---|
| **Decision** | Reuse existing `AuditService` (from feature 001) to emit structured events: `shipment.import.started`, `shipment.import.completed`, `shipment.import.partial`, `shipment.import.failed`. Log at batch level (1–3 events per import), not per-row. |
| **Rationale** | FR-016 mandates audit logging. Reusing the existing audit service (DRY). Per-batch logging (vs per-row) is proportionate: 200-row import produces 2 events, not 200. `metadata` JSONB field accommodates `fileHash`, `importJobId`, `rowsImported`, `rowsFailed`, `rowsConflicted`. |
| **Alternatives considered** | Per-row audit entries: exponential audit table growth; not necessary for compliance. Separate audit table for shipment events: duplicates the pattern already in `audit_logs` — YAGNI. |
