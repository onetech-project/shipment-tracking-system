# Phase 0 Research: PDF Shipment Upload & QR Code Scan

**Branch**: `002-pdf-upload-qr-scan` | **Date**: 2026-03-18  
**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

All NEEDS CLARIFICATION items resolved. Decisions documented below with rationale and rejected alternatives.

---

## Topic A — PDF Text Extraction

### A1 — Library Choice: pdf-parse vs pdfjs-dist vs OCR

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `pdf-parse` (wraps `pdfjs-dist`) for text extraction from the single internal shipment template                                                                                                                                                                                                                                                                                                                                    |
| **Rationale**               | The feature scope is explicitly one internal template (FR-003), so text extraction + deterministic field mapping is simpler and more reliable than OCR. `pdf-parse` is a lightweight Node.js library with no native dependencies (Docker-compatible) that provides full plain-text output from the PDF. Template-based text parsing achieves >95% accuracy target (SC-002) without external services or additional infrastructure. |
| **Alternatives considered** | **Tesseract OCR**: rejected — adds native binaries and complexity; unnecessary for a text-layer PDF template. **External OCR APIs**: rejected — adds cost, latency, and vendor lock-in for a problem solvable locally. **pdfjs-dist directly**: valid base; `pdf-parse` wraps it acceptably for this use case; switch to raw `pdfjs-dist` only if template parsing requires page-level or position-aware extraction.               |

---

### A2 — Template Parsing Strategy

|                             |                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Extract full text from `pdf-parse`, then apply deterministic regex/split logic to locate the shipment data table and map columns to DTO fields                                                                                                                                                                             |
| **Rationale**               | A single internal template guarantees a stable layout, so a deterministic parser is both simpler and more maintainable than a general-purpose table extractor. The parser explicitly rejects PDFs whose extracted text does not match the expected template signature (rejecting out-of-scope PDFs per FR-003 assumption). |
| **Alternatives considered** | **tabula-py / camelot**: Python libraries requiring subprocess calls — avoids; adds Python runtime to the Node.js container. **pdfplumber**: Same Python dependency concern.                                                                                                                                               |

---

### A3 — Password-Protected / Unreadable PDFs

|                             |                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Catch `pdf-parse` parse errors and return `INVALID_PDF` (400) immediately; do not attempt processing                                   |
| **Rationale**               | Aligns with edge case handling in spec. Encrypted PDFs produce an unrecoverable parse error; early rejection prevents queue poisoning. |
| **Alternatives considered** | Attempting decryption with a blank password before failing: adds complexity with minimal practical benefit for this system.            |

---

## Topic B — Asynchronous Import Pipeline

### B1 — Async Processing Model

|                             |                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | BullMQ (already provisioned in the project) with a dedicated `shipment-import` queue; controller returns `{ uploadId, status: "queued" }` immediately, client polls `GET /shipments/imports/:id`                                                                                                                                    |
| **Rationale**               | Satisfies FR-008 non-blocking UI requirement. The project already has BullMQ + Redis wired in `apps/backend` (visible in `package.json`), so no new infrastructure is added. BullMQ provides job durability across restarts, configurable retry intervals, and progress tracking — all needed for the import pipeline.              |
| **Alternatives considered** | **Synchronous response**: blocks HTTP connection for up to 30s — browser timeouts and poor UX. **Node.js `worker_threads` without a queue**: no persistence on restart, no built-in retry, harder to monitor. **SSE / WebSocket for push status**: more complex client; polling every 1–2s is adequate for import feedback latency. |

---

### B2 — Worker Retry and Failure Handling

|                             |                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | BullMQ job retries on transient errors (DB connection loss, parse exceptions) with max 3 attempts, exponential backoff starting at 2s. Final failure sets `ShipmentUpload.status = 'failed'` and emits `shipment.import.failed` event. |
| **Rationale**               | Constitution §VIII mandates retryable external operations. DB writes and file parsing can fail transiently. Cap total attempts to avoid indefinite queuing.                                                                            |
| **Alternatives considered** | Unbounded retries: risk queue starvation. No retry: violates constitution §VIII.                                                                                                                                                       |

---

## Topic C — Duplicate Detection and Conflict Review

### C1 — Duplicate Handling Strategy

|                             |                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Pre-flight batch query for all shipment IDs found in PDF against `(organization_id, shipment_id)` index; new IDs inserted immediately; conflicting IDs written to `ShipmentUploadError` rows with `error_type = 'duplicate'`; upload transitions to `awaiting_conflict_review`; user must call `POST /shipments/imports/:id/conflicts/resolve` before any overwrite occurs |
| **Rationale**               | Directly satisfies FR-007: existing records MUST NOT be modified until user explicitly confirms. Batch pre-flight query (one `IN` query for all IDs) is efficient — avoids N+1 round-trips and meets 30s SLA.                                                                                                                                                              |
| **Alternatives considered** | **Automatic upsert**: violates FR-007 directly. **Reject entire file on first duplicate**: poor usability — valid rows should not be blocked. **Application-level row-by-row check**: O(n) queries — fails performance targets at 200 rows.                                                                                                                                |

---

### C2 — Idempotency (Re-upload of Same File)

|                             |                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Compute `SHA-256` hex hash of the uploaded file buffer; store on `ShipmentUpload.file_hash`; detect duplicate hash + same org within a 24h window and return existing upload job result rather than re-queuing  |
| **Rationale**               | Spec edge case "same PDF uploaded twice". File hash is content-based and reliable; filename alone is not. 24h window prevents false duplicate suppression for legitimately re-imported files after corrections. |
| **Alternatives considered** | **Filename-only dedup**: filenames are non-unique. **No idempotency**: double-processing risk on client retry.                                                                                                  |

---

## Topic D — QR Code Scanner

### D1 — Scanning Library

|                             |                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `jsqr` — pure JavaScript QR decoder operating on `ImageData` from a `<canvas>` element drawing from the `getUserMedia` video stream                                                                                                                                                                                                                                  |
| **Rationale**               | Lightweight (~6KB gzipped), zero native dependencies, works idiomatically in Next.js client components (`"use client"`). Gives explicit control over camera lifecycle, permission UX, decode rate limiting, and cleanup — all required by FR-009/FR-014. No wrapper abstractions that could obscure camera errors.                                                   |
| **Alternatives considered** | **ZXing.js**: heavier (~150KB); supports more barcode types than needed; overkill for QR-only. **html5-qrcode**: higher-level wrapper; acceptable but adds abstraction over camera permission handling; harder to control fine-grained permission error messages per FR-014. **Native Web API alone**: requires ~250 lines of boilerplate with no decoding built in. |

---

### D2 — Camera Permission UX

|                             |                                                                                                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Request `getUserMedia` only on explicit user button click ("Start Scanner"); catch and classify `NotAllowedError` / `NotFoundError` / `NotReadableError` separately; show inline recovery guidance for each                                                                 |
| **Rationale**               | Permission prompts from explicit user gestures convert to persistent browser grants more reliably than auto-prompts on mount. Satisfies FR-009/FR-014. Clear per-error messages (denied, no camera, camera in use) are more actionable than a generic "camera unavailable". |
| **Alternatives considered** | **Auto-prompt on mount**: inconsistent browser behavior; violates privacy UX norms. **Single generic error**: fails FR-014 usability requirement.                                                                                                                           |

---

### D3 — Decode Loop and Performance

|                             |                                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `requestAnimationFrame` loop drawing camera frames to canvas and running `jsQR` decode; 800ms debounce before triggering a backend lookup; 5s cooldown to avoid re-scanning the same code; stop loop and release stream on component unmount                                  |
| **Rationale**               | `requestAnimationFrame` syncs with display refresh (60fps); skipping frames when a scan is "in cooldown" keeps CPU usage low on mobile. 800ms debounce prevents duplicate network calls from jitter while the user holds the camera still. Satisfies SC-003 (≤5s end-to-end). |
| **Alternatives considered** | `setInterval` polling: no sync with display; wastes CPU when browser tab is backgrounded. Continuous decode without debounce: triggers multiple redundant backend calls per second.                                                                                           |

---

### D4 — Client-Side ID Validation Before Lookup

|                             |                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Validate decoded QR payload against a configurable shipment ID regex before calling the backend; extract ID from URL paths/params if payload is a URL; display `INVALID_FORMAT` error instantly on mismatch   |
| **Rationale**               | Avoids round-trips for obviously invalid payloads. Satisfies SC-005 (≤3s error feedback). Spec assumption: plain text shipment ID; spec also notes QR codes with URLs should attempt ID extraction from path. |
| **Alternatives considered** | Backend-only validation: adds unnecessary latency for malformed QR content. No URL extraction: breaks spec assumption for URL-encoded shipment IDs.                                                           |

---

## Topic E — Audit and Observability

### E1 — Audit Event Strategy

|                             |                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Reuse existing `AuditService` (from feature 001) to emit structured events: `shipment.import.started`, `shipment.import.completed`, `shipment.import.partial`, `shipment.import.failed`. Log at batch level (1–3 events per import), not per-row.                                   |
| **Rationale**               | FR-016 mandates audit logging. Reusing the existing audit service (DRY). Per-batch logging (vs per-row) is proportionate: 200-row import produces 2 events, not 200. `metadata` JSONB field accommodates `fileHash`, `importJobId`, `rowsImported`, `rowsFailed`, `rowsConflicted`. |
| **Alternatives considered** | Per-row audit entries: exponential audit table growth; not necessary for compliance. Separate audit table for shipment events: duplicates the pattern already in `audit_logs` — YAGNI.                                                                                              |

---

## Topic F — Line Haul Trip PDF Extraction (Added 2026-03-19)

### F1 — PDF Library for Positional Extraction

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | `pdf2json` v4.x for Line Haul Trip PDFs; retain `pdf-parse` for the existing pipe-delimited shipment template                                                                                                                                                                                                                                                                                                                                                                                   |
| **Rationale**               | Line Haul Trip PDFs have a tabular layout without pipe delimiters — data must be reconstructed from text positions. `pdf2json` provides `x`, `y` coordinates on each `Pages[].Texts[]` item, directly usable for column/row grouping. It wraps `pdfjs-dist` (already installed) and abstracts transform matrix parsing. Zero native dependencies; Docker-compatible. v4.x outputs UTF-8 directly (no URI-decoding needed). ~236k weekly npm downloads, actively maintained (2.2k GitHub stars). |
| **Alternatives considered** | **pdfjs-dist directly**: already installed but requires manual transform matrix parsing (`transform[4]`/`transform[5]`) and custom text block grouping — more boilerplate for the same result. **pdf-parse**: already used for the existing template but produces flat text only — insufficient for table reconstruction. **tabula-py / camelot**: Python libraries requiring subprocess calls — violates TypeScript stack constraint.                                                          |

---

### F2 — Template Detection Strategy

|                             |                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Add a template detector to `ImportProcessor` that inspects the first pass of PDF text for sentinel markers. Line Haul Trip PDF identified by presence of "Nomor TO" and "Surat Jalan" (or equivalent markers). Existing pipe-delimited template identified by existing `TEMPLATE_MARKERS`. Unknown templates → `INVALID_PDF` error. |
| **Rationale**               | The import processor already has `isValidTemplate()` checking for sentinel markers. Extending this to a multi-template dispatcher is minimal change. Each template gets its own parser service while sharing the upload tracking, error handling, and audit pipeline.                                                               |
| **Alternatives considered** | **Separate upload endpoint per template**: breaks existing frontend upload flow and API contract. **User-selected template type**: adds friction; auto-detection is more reliable for a known set of templates.                                                                                                                     |

---

### F3 — Table Reconstruction Strategy

|                             |                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Dynamic x-coordinate clustering with configurable tolerance (default 10 page units). Segment PDF at "Nomor TO" y-threshold into header vs table sections. Group table items into columns by x-cluster, sort by y, zip into rows. Handle multi-line cells by merging items with close y and similar x. |
| **Rationale**               | Dynamic clustering is robust to slight PDF misalignments and font variations. Fixed thresholds would break on layout shifts. The y-threshold segmentation at "Nomor TO" is reliable because this keyword is a fixed part of the Line Haul Trip template.                                              |
| **Alternatives considered** | **Fixed x-thresholds**: fragile; breaks on font size changes. **Grid detection via VLines**: more robust but adds complexity; Line Haul PDFs may not have visible grid lines. **Regex-only on flat text**: fails for tabular data without delimiters.                                                 |

---

### F4 — Header Parsing Strategy

|                             |                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Hybrid approach combining regex patterns, keyword detection, and positional proximity. Use regex for structured values (`LT\w+` for trip_code, `B\d{4,}` for plate_number, datetime patterns for STD/STA/ATA). Use keyword-proximity for label-value pairs (e.g., value item directly following "Nama Vendor" on x-axis).               |
| **Rationale**               | Header fields in the Line Haul Trip PDF are not tabular but are laid out as label-value pairs at various positions. A single strategy (regex or position alone) would be fragile. The hybrid approach provides multiple extraction paths with fallback: if regex fails, try keyword proximity; if that fails, try positional heuristic. |
| **Alternatives considered** | **Regex only**: misses unlabeled positional values. **Position only**: breaks if layout shifts. **LLM extraction**: overkill for a known template; adds latency, cost, and external dependency.                                                                                                                                         |

---

### F5 — Data Model: New Tables vs Extending Shipments

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Create new `linehaul_trips` and `linehaul_trip_items` tables as separate entities within the existing shipments module. Do NOT reuse the `shipments` table for trip data.                                                                                                                                                                                                                                                        |
| **Rationale**               | Line Haul Trip data has fundamentally different fields (trip_code, schedule, vendor, plate_number, driver_name, STD/STA/ATA, total_weight) compared to shipments (shipment_id, status, carrier, estimated_delivery_date). Forcing both into one table would require excessive nullable columns — violates KISS. Separate tables allow proper validation, indexing, and entity semantics while sharing the import infrastructure. |
| **Alternatives considered** | **Store in `shipments` table with extra JSON column**: loses type safety and query efficiency. **Separate linehaul module**: viable but creates unnecessary module boundary for code that shares the same import pipeline — YAGNI.                                                                                                                                                                                               |

---

### F6 — QR Scanner Line Haul Lookup

|                             |                                                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | Extend the QR scanner to support two lookup modes. The QR code contains a `to_number` (Transfer Order number). On scan, search `linehaul_trip_items.to_number` first; if found, return the trip item with parent trip details. If not found, fall back to existing `shipments.shipment_id` lookup. |
| **Rationale**               | The user explicitly stated that QR codes contain `to_number` and should search the `linehaul_trip_items` table. The dual-lookup approach maintains backward compatibility with existing shipment QR codes while adding linehaul support. A single endpoint handles both cases.                     |
| **Alternatives considered** | **Separate QR scan endpoint for linehaul**: fragments the scan UX; user would need to know which mode to use. **QR code contains a type prefix**: requires changing QR code generation; not feasible for existing printed labels.                                                                  |

---

### F7 — Fallback Parsing Strategy

|                             |                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**                | If pdf2json positional parsing fails (e.g., coordinates are unreliable or all columns cluster to the same x), fall back to regex-based line-by-line parsing on the raw text. Log a warning for observability.                                                                                               |
| **Rationale**               | Constitution §VII mandates fail-safe design. PDF parsing is inherently heuristic; a fallback prevents total failure on edge cases. The fallback uses the same regex patterns from header parsing applied to the full text, which can extract at least the header fields even if table reconstruction fails. |
| **Alternatives considered** | **No fallback — fail immediately**: violates constitution §VII and reduces extraction rate below SC-002 target. **LLM fallback**: adds external dependency; considered for future enhancement only.                                                                                                         |
