# Feature Specification: PDF Shipment Upload & QR Code Scan

**Feature Branch**: `002-pdf-upload-qr-scan`  
**Created**: 2026-03-18  
**Status**: Draft  
**Input**: User description: "as a user i want be able upload PDF file containing shipment data to the system, and system be able to extract the data from it and store to DB. also i want the system be able to access my device camera to scan QR Code that containing id and search the id to the database"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - PDF Shipment Data Upload & Extraction (Priority: P1)

A user (e.g., a logistics operator or warehouse manager) selects a PDF file containing shipment records from their device and uploads it to the system. The system parses the PDF, extracts all shipment data fields, and stores the records in the database. The user receives confirmation of how many shipments were successfully imported, along with a summary of any rows that could not be parsed.

**Why this priority**: This is the core data-ingestion capability. Without stored shipment records, nothing else in the feature can function. It delivers standalone value by enabling bulk import of shipment data.

**Independent Test**: Can be fully tested by uploading a sample shipment PDF and verifying that the extracted records appear correctly in the shipment database — without needing QR scan functionality.

**Acceptance Scenarios**:

1. **Given** a user has a valid PDF with structured shipment data, **When** they upload the file, **Then** the system extracts all recognize shipment records and saves them to the database within 30 seconds.
2. **Given** a user uploads a PDF containing 50 shipments, **When** extraction completes, **Then** the user sees a summary showing 50 records imported and can view each record.
3. **Given** a user uploads a PDF where some rows have missing required fields, **When** extraction completes, **Then** the system saves valid records and reports the count and reason for skipped records.
4. **Given** a user uploads a file that is not a valid PDF, **When** the upload is attempted, **Then** the system rejects the file with a clear error message before any data is stored.
5. **Given** a user uploads a PDF containing a shipment ID that already exists in the database, **When** extraction completes, **Then** the system flags the conflicting records and presents them to the user for manual review before any overwrite occurs; existing records are not modified until the user confirms.

---

### User Story 2 - QR Code Camera Scan & Shipment Lookup (Priority: P2)

A user opens the QR scanner in the application, grants camera access, and points their device camera at a QR code printed on a package or document. The system decodes the QR code to extract a shipment ID and immediately searches the database. If a matching shipment is found, its full details are displayed to the user. If no match is found, the user is informed clearly.

**Why this priority**: This is a secondary lookup flow that depends on shipment records already existing in the system (added via P1 or other means). It delivers significant operational value for warehouse/field workers who need fast access to shipment info without manual typing.

**Independent Test**: Can be fully tested independently by pre-seeding the database with a known shipment ID, generating a QR code containing that ID, scanning it with the camera, and verifying the correct shipment details appear — without needing the PDF upload flow.

**Acceptance Scenarios**:

1. **Given** a user opens the QR scanner and camera permission has not yet been granted, **When** the scanner view loads, **Then** the system prompts the user to allow camera access.
2. **Given** a user grants camera permission, **When** they point the camera at a valid QR code, **Then** the system decodes the code and displays the matching shipment details within 3 seconds.
3. **Given** a user scans a QR code whose ID does not exist in the database, **When** the scan completes, **Then** the system displays a clear "Shipment not found" message with the scanned ID shown.
4. **Given** a user scans a QR code containing data that is not a valid shipment ID format, **When** the scan completes, **Then** the system displays an error message explaining the code is unrecognized.
5. **Given** the user denies camera permission, **When** the scanner attempts to activate, **Then** the system shows a permission-denied message with guidance on how to enable camera access.

---

### User Story 3 - Upload History & Import Audit (Priority: P3)

A user can view a history of previous PDF uploads, including upload timestamp, number of records extracted, and import status (success, partial, failed). This allows operators to track data ingestion activity and re-investigate any failed imports.

**Why this priority**: Supports operational visibility and auditability. It does not block the core upload or scan flows but is important for production operations.

**Independent Test**: Can be fully tested by uploading multiple PDFs (with varying results) and checking that the history list accurately reflects each upload's outcome.

**Acceptance Scenarios**:

1. **Given** a user has previously uploaded PDFs, **When** they navigate to the upload history view, **Then** they see a list of uploads ordered by date with status and record count for each.
2. **Given** a partially failed upload, **When** the user views its history entry, **Then** they can see which records failed and why.

---

### Edge Cases

- What happens when a PDF is password-protected or encrypted?
- What happens when the camera feed is obstructed or too dark to scan a QR code?
- What happens when the same PDF is uploaded twice?
- How does the system handle very large PDFs (e.g., 500+ shipment records)?
- What happens when the user navigates away mid-upload?
- What happens when the scanned QR code contains a URL instead of a raw shipment ID?
- What happens when camera access is revoked mid-session?

## Requirements _(mandatory)_

### Functional Requirements

**PDF Upload & Extraction**

- **FR-001**: System MUST allow authenticated users to upload a PDF file from their device.
- **FR-002**: System MUST validate that the uploaded file is a properly formatted PDF before processing.
- **FR-003**: System MUST extract shipment data fields from PDFs that follow the organization's single internal shipment template. PDFs from other sources or with different layouts are out of scope.
- **FR-004**: System MUST persist all successfully extracted shipment records to the database.
- **FR-005**: System MUST report to the user how many records were successfully imported and how many were skipped, with reasons for skipped records.
- **FR-006**: System MUST reject non-PDF files with a user-facing error before any processing occurs.
- **FR-007**: System MUST flag any shipment ID in the uploaded PDF that already exists in the database and present those conflicts to the user for manual review before storing. Existing records MUST NOT be modified until the user explicitly confirms the overwrite for each flagged record.
- **FR-008**: System MUST process PDF uploads without blocking the user interface (i.e., upload and extraction should run asynchronously with status feedback).

**QR Code Camera Scan**

- **FR-009**: System MUST request camera permission from the user's device before activating the scanner.
- **FR-010**: System MUST display real-time camera feed within the application for QR code scanning.
- **FR-011**: System MUST automatically decode a detected QR code and extract the shipment ID without requiring manual user action.
- **FR-012**: System MUST search the database for the shipment matching the decoded ID and display the result.
- **FR-013**: System MUST display a clear "not found" message when the scanned shipment ID does not exist in the database.
- **FR-014**: System MUST handle camera permission denial gracefully with a user-friendly explanation and recovery guidance.

**General**

- **FR-015**: System MUST restrict both upload and scan features to authenticated users.
- **FR-016**: System MUST log all PDF upload events (filename, user, timestamp, records imported) for audit purposes.

### Key Entities

- **Shipment**: Represents a single shipment record. Key attributes: unique shipment ID, origin, destination, current status, carrier, estimated delivery date, contents description. Linked to the organization that owns it.
- **ShipmentUpload**: Represents a PDF import event. Key attributes: upload timestamp, file reference, user who uploaded, total records found, records successfully imported, records failed, overall status (completed / partial / failed).
- **ShipmentUploadError**: Represents a per-row failure within an upload. Key attributes: row reference, field(s) that failed validation, error description.

## Assumptions

- Shipment PDFs follow a single consistent internal template. PDFs from external carriers or with alternate layouts are out of scope and will be rejected with a clear error message.
- A "shipment ID" encoded in a QR code is a plain text string (not a full URL). QR codes encoding URLs will be treated as unrecognized unless the ID can be extracted from the URL path.
- Only authenticated users (existing auth system) can access upload and scan features — no guest access.
- Camera-based scanning targets mobile or desktop browsers/apps with camera hardware; desktop users without a camera will see a disabled scanner with a message.
- Uploaded PDFs are not stored permanently after extraction — only the extracted data is retained — unless audit requirements dictate otherwise.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can upload a shipment PDF and receive confirmation of imported records within 30 seconds for files containing up to 200 shipments.
- **SC-002**: At least 95% of valid shipment PDFs are parsed and stored without manual intervention or data loss.
- **SC-003**: Users can complete the full QR scan-to-shipment-detail flow in under 5 seconds from the moment the QR code enters the camera frame.
- **SC-004**: QR code shipment lookup returns the correct shipment record with 99% accuracy for properly formatted QR codes.
- **SC-005**: The system provides actionable error feedback for rejected files and unrecognized QR codes within 3 seconds.
- **SC-006**: 90% of first-time users can successfully upload a PDF and perform a QR scan without external assistance.
