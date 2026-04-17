# Feature Specification: Multi Google Sheet Sync — Configuration UI, Dynamic Table Creation & Async Multi-Sheet Processing

**Feature Branch**: `005-multi-google-sheet-sync`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "Multi Google Sheet Sync — Configuration UI, Dynamic Table Creation & Async Multi-Sheet Processing"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Admin: Manage Google Sheet Configs (Priority: P1)

An admin can add and maintain Google Spreadsheet sync configurations so the product can ingest data from multiple spreadsheets and render that data in the Air Shipments dashboard.

Why this priority: This enables non-developers to onboard new shipment sources and is the primary business value of the feature.

Independent Test:

- Using the Admin UI, create a new Spreadsheet entry with at least one Sheet entry and save.
- Verify the spreadsheet and its sheets appear in the config list and the Air Shipments UI after the next scheduler run.

Acceptance Scenarios:

1. Given the Admin is on the Google Sheet Config page, When they add a new spreadsheet (label, URL, interval, enabled) and add one or more sheets with a unique key and header row, Then the config is persisted and the system schedules syncs for enabled sheets.
2. Given a sheet's "Table Name" preview is shown while editing, When the admin types a Sheet Name, Then the preview updates immediately to show the derived table identifier.
3. Given an admin deletes a spreadsheet config, When they confirm the deletion, Then the config is removed from the list and a warning explains that persisted data in the system will remain.

---

### User Story 2 - End User: View Dynamic Air Shipments (Priority: P1)

End users access the Air Shipments section to view shipments coming from configured spreadsheets via dynamic tabs.

Why this priority: This is the primary consumer-facing outcome: data entered in spreadsheets becomes visible in the app.

Independent Test:

- Enable at least one sheet and ensure the sync has run at least once.
- As an end user, navigate to Air Shipments and verify a tab appears for each enabled sheet and that the table shows paginated, sortable rows for that sheet.

Acceptance Scenarios:

1. Given at least one enabled sheet config exists, When an end user opens Air Shipments, Then a tab appears for each enabled sheet and selecting a tab shows data for that sheet.
2. Given no enabled sheets exist, When a user opens Air Shipments, Then the UI shows an empty state with a prominent link to Google Sheet Config.

---

### User Story 3 - Operator: Observe and Troubleshoot Syncs (Priority: P2)

An operator can confirm sync cycles run per configured intervals and that failures in one spreadsheet do not affect other spreadsheets.

Independent Test:

- Trigger sync cycles and inspect logs and monitoring output to confirm per-spreadsheet cycles, error isolation, and summary metrics are recorded.

Acceptance Scenarios:

1. Given multiple enabled spreadsheets with different intervals, When the scheduler runs, Then each spreadsheet runs independently according to its interval and a failure in one does not stop others.
2. Given a spreadsheet returns an API error (e.g., permission error), When that cycle fails, Then the system logs the error with spreadsheet label and continues other spreadsheet cycles.

---

### Edge Cases

- A spreadsheet URL becomes invalid or returns a 404.
- A sheet tab referenced in config does not exist anymore in the remote spreadsheet.
- Two admins concurrently edit the same spreadsheet config.
- A sheet's normalized table identifier becomes invalid after extreme sheet name input.
- Network/transient API quota errors occur during fetch.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Persist Spreadsheet Configs — The system must store spreadsheet-level configs (label, spreadsheet URL, sync interval seconds, enabled flag) in persistent storage.
  - Acceptance: Creating/updating/deleting a spreadsheet config is reflected in persistent storage and in the Admin UI list.

- **FR-002**: Persist Sheet Configs — The system must store per-sheet configs (sheet name, derived table identifier, unique key(s), header row number, enabled flag) associated with a spreadsheet.
  - Acceptance: Each saved sheet shows a stable derived table identifier and persisted unique key(s).

- **FR-003**: Stable Table Identifier — For each sheet config the system must derive a stable table identifier from the Sheet Name that is safe to use as a data-store identifier.
  - Acceptance: The identifier is deterministic for the same sheet name and visible to the admin as a preview while editing.

- **FR-004**: Ensure Storage for Sheet Data — When a sheet config is saved (created or updated), the system must ensure a corresponding storage table/container/collection exists to persist rows for that sheet. If creation fails, the config save still succeeds but the sheet is marked as not-ready for sync and an operator-visible log entry is produced.
  - Acceptance: Saving a sheet config immediately marks it as created in the config store; the system attempts to provision backing storage and records success/failure in logs and status fields.

- **FR-005**: Dedicated Unique Key Columns — The storage for a sheet must expose dedicated fields for the configured unique key(s) and enforce uniqueness across those fields.
  - Acceptance: Insert/upsert operations respect unique key constraints; test rows with duplicate unique keys are rejected or deduplicated according to the upsert behaviour.

- **FR-006**: Hybrid Row Storage — Columns not mapped to dedicated unique key fields must be stored in an extensible structured field so new/unknown columns do not require schema migrations.
  - Acceptance: Rows inserted from sheets retain unknown columns in a structured blob accessible in read results.

- **FR-007**: Multi-Spreadsheet Scheduler — The system must run a global tick that evaluates all enabled spreadsheets, and trigger per-spreadsheet sync cycles independently using each spreadsheet's configured interval. Each spreadsheet maintains an in-memory last-run timestamp and an in-memory in-progress flag; skipped ticks for busy spreadsheets do not affect others.
  - Acceptance: In test runs with multiple spreadsheets configured to different intervals, observe independent cycles and that an in-flight run prevents concurrent runs for the same spreadsheet.

- **FR-008**: Per-Sheet Parallelism — Within a single spreadsheet sync, enabled sheets may be processed in parallel so slow processing on one sheet does not block other sheets of the same spreadsheet.
  - Acceptance: Processing multiple sheets in the same spreadsheet completes faster with parallelism enabled and per-sheet failures are isolated.

- **FR-009**: Error Isolation & Logging — Errors must be caught and logged per spreadsheet using an operator-readable format that includes spreadsheet label and identifier. Errors in one spreadsheet or sheet must not stop other syncs.
  - Acceptance: Injected errors produce log entries scoped to the failing spreadsheet and do not stop other in-flight or scheduled syncs.

- **FR-010**: Sync Status and Notifications — After each successful sync cycle, the system must emit a notification/event that includes: spreadsheet label, list of tables processed, total rows upserted, and timestamp. The UI and other consumers may subscribe to this event to refresh views.
  - Acceptance: After a completed cycle a subscriber receives an event with the required fields.

- **FR-011**: Admin REST API — Provide CRUD endpoints for spreadsheet configs and sheet configs that return spreadsheet objects with nested sheet configs and the derived table identifier visible.
  - Acceptance: API users can list spreadsheets with sheets nested and can create/update/delete spreadsheets and sheets via API.

- **FR-012**: Air Shipments Surface — The Air Shipments UI must render tabs based on enabled sheet configs. The UI must be able to request paginated, sortable data for any configured table identifier and receive both dedicated columns and flattened unknown-column fields.
  - Acceptance: For each enabled sheet an Air Shipments tab exists, data loads via the dynamic data endpoint, and columns are rendered including unknown fields.

- **FR-013**: Safety & Validation — APIs and UI must validate inputs (e.g., Google Sheet URL format, header row >=1, at least one unique key) and provide user-friendly validation messages.
  - Acceptance: Invalid inputs are rejected with clear messages and do not create configs.

- **FR-014**: Clean Shutdown Behavior — The scheduler must stop new cycles and allow in-flight cycles to complete on application shutdown.
  - Acceptance: On controlled shutdown, no new per-spreadsheet cycle is started and running cycles finish within an agreed timeout.

- **FR-015**: Configuration Read Model — The sync runtime must read spreadsheet and sheet configs from persistent storage at runtime and on each scheduler evaluation to pick up changes without requiring a full application restart.
  - Acceptance: Adding/updating a config is reflected in scheduler behavior within one global tick.

### Key Entities _(include if feature involves data)_

- **SpreadsheetConfig**: Represents a Google Spreadsheet to sync.
  - Attributes: label, spreadsheetUrl, intervalSeconds, isEnabled

- **SheetConfig**: Represents a tab/sheet in a spreadsheet.
  - Attributes: sheetName, derivedTableIdentifier, uniqueKeys (ordered list), headerRowNumber, isEnabled, status (ready/not-ready)

- **SheetData (backing storage)**: Per-sheet storage that contains system-level metadata (id, timestamps, lock flag), dedicated unique-key fields, and a structured field for all other columns.

## Success Criteria _(mandatory)_

- **SC-001**: Onboard Speed — An admin can create a spreadsheet and at least one sheet config and see the corresponding Air Shipments tab and data within 60 seconds after initial sync (assuming the sheet contains rows and network is healthy).

- **SC-002**: Scheduler Accuracy — Per-spreadsheet sync cycles trigger at the configured interval with an average deviation of no more than ±1 second measured across sample runs.

- **SC-003**: Isolation Guarantee — A failure in a single spreadsheet or sheet does not stop other spreadsheets; at least 99.9% of healthy spreadsheets continue to sync during any single-failure incident.

- **SC-004**: Data Availability — After a successful sync, 100% of non-empty rows with valid unique key values are present in storage and visible via the Air Shipments UI.

- **SC-005**: Observability — Per-sync logs include cycle start, sheets processed, total rows upserted, duration (ms), and any errors; operators can correlate these logs to specific spreadsheet labels.

- **SC-006**: UX Feedback — The Admin UI shows an immediate preview of the derived table identifier while editing and provides clear success/error feedback when saving.

## Assumptions

- A single service-level credential is used to access Google Sheets (service account). User-level OAuth is out of scope.
- The product team accepts that created backing storage for sheet data is retained when a sheet config is deleted.
- Role-based access control for these admin endpoints is out of scope for initial delivery.

## Out of Scope

- User-level Google OAuth flows and per-user credentials.
- Automatic dropping/deleting of backing storage when a sheet config is deleted.
- Indexing/search beyond basic text search across string fields.

---

_Next steps_: run the project feature-creation script to create the branch & scaffold (script failed previously), or create the feature branch manually and proceed to planning.
