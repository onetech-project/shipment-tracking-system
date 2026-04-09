# Feature Specification: Google Sheets to PostgreSQL Sync Service

**Feature Branch**: `004-google-sheets-postgresql-sync`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Google Sheets to PostgreSQL Sync Service — background sync pulling data from multiple Google Sheets, normalizing it, persisting to PostgreSQL, and notifying the frontend in real-time. A new Air Shipments menu is added to the dashboard."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Data Sync from Google Sheets (Priority: P1)

An operations manager wants shipment data from Google Sheets to be automatically available in the system without any manual export or import steps. The background sync service continuously polls the configured Google Sheets workbook and keeps the PostgreSQL database up to date, so data is always fresh and consistent.

**Why this priority**: This is the core value proposition of the feature. Without the sync running, no data reaches the database and no other story is functional. It directly replaces a manual, error-prone data pipeline.

**Independent Test**: Can be fully tested by starting the sync service with valid Google credentials and verifying that rows from `CompileAirCGK`, `SUB`, `SDA`, `Data`, and `Master Data` sheets appear in their respective PostgreSQL tables within one polling cycle, and that row counts stay in sync as the spreadsheet is edited.

**Acceptance Scenarios**:

1. **Given** the sync service is running and Google Sheets contains rows in the `CompileAirCGK` sheet, **When** a polling cycle completes, **Then** those rows are present in the `air_shipments_cgk` table with matching field values.
2. **Given** a row is edited in the Google Sheet, **When** the next polling cycle runs, **Then** the corresponding database row is updated and its `last_synced_at` timestamp is refreshed.
3. **Given** a row has not changed since the last cycle, **When** the polling cycle runs, **Then** no database write is performed for that row.
4. **Given** the `is_locked` field on a row is set to true in the Google Sheet, **When** the polling cycle runs, **Then** that row is skipped entirely with no database write, and a count of locked rows is logged.
5. **Given** a sheet returns empty data (possible cache miss), **When** the polling cycle encounters it, **Then** the service retries up to 3 times with increasing wait intervals before logging a warning and skipping that sheet for the current cycle.

---

### User Story 2 - Real-Time Dashboard Notification on Data Change (Priority: P2)

A logistics supervisor viewing the Air Shipments dashboard should immediately see fresh data without needing to manually refresh the page. When the sync service detects that rows have been upserted, it notifies connected browser sessions in real time so the dashboard can update automatically.

**Why this priority**: Real-time updates are the key UX differentiator over static reports. Once syncing (P1) works, live notification closes the feedback loop and makes the dashboard actionable.

**Independent Test**: Can be fully tested by opening the Air Shipments dashboard in a browser, making an edit in the Google Sheet, waiting one polling cycle, and verifying that the dashboard table refreshes without a manual page reload, and that the "Live" badge and last-synced timestamp update.

**Acceptance Scenarios**:

1. **Given** a user has the Air Shipments dashboard open, **When** the sync service upserts at least one row in any cycle, **Then** the dashboard receives a notification containing the affected table names, total upserted count, and sync timestamp.
2. **Given** a polling cycle completes with zero upserted rows (all rows unchanged), **When** the cycle ends, **Then** no notification is sent to connected clients.
3. **Given** the dashboard receives a notification that includes the table name for the page currently open, **When** the notification arrives, **Then** the data table on that page automatically re-fetches and displays updated rows.
4. **Given** a user's browser disconnects and reconnects to the notification channel, **When** the connection is restored, **Then** the dashboard resumes receiving notifications for subsequent sync cycles.

---

### User Story 3 - Air Shipments Dashboard Pages (Priority: P3)

A warehouse coordinator needs a clear, navigable view of all air shipment data organized by origin (CGK, SUB, SDA) and reference type (rates, routes). The dashboard provides five dedicated sub-pages under an "Air Shipments" menu, each displaying paginated and sortable tabular data fetched from the backend.

**Why this priority**: This is the user-facing surface. P1 and P2 ensure data is available and live; P3 makes it accessible and readable to non-technical users.

**Independent Test**: Can be fully tested by navigating to each of the five Air Shipments sub-pages in the dashboard, verifying that table data loads from the correct source, that pagination controls work, that column sorting works, and that the sync status indicator shows the last sync time and a "Live" badge when connected.

**Acceptance Scenarios**:

1. **Given** a user navigates to the Air Shipments section, **When** they open the navigation sidebar, **Then** they see an "Air Shipments" menu item with sub-items for CGK, SUB, SDA, Rate, and Routes.
2. **Given** a user opens the CGK sub-page, **When** the page loads, **Then** a loading skeleton is shown briefly, then a paginated table of CGK shipment rows is displayed with sortable columns.
3. **Given** data is loaded on the SUB sub-page, **When** the user clicks a column header, **Then** the table re-sorts by that column in ascending or descending order.
4. **Given** the user is on the Rate sub-page with more rows than one page, **When** the user navigates to the next page, **Then** the next set of rows is displayed without a full page reload.
5. **Given** the sync service is connected and the dashboard is open, **When** the user looks at the status indicator on any sub-page, **Then** they see the time of the last sync and a "Live" badge indicating the real-time connection is active.

---

### User Story 4 - Concurrency-Safe Polling Scheduler (Priority: P4)

The operations team expects the system to handle slow Google Sheets API responses gracefully without queuing up multiple overlapping sync cycles or crashing. The scheduler must protect itself from concurrent execution and pause automatically if cycles consistently take longer than the polling interval.

**Why this priority**: Protects data integrity and API quota. Without this, overlapping cycles could write conflicting data or exhaust the Google Sheets API rate limit.

**Independent Test**: Can be fully tested by simulating a slow sync cycle (longer than 15 seconds) and verifying via logs that subsequent ticks are skipped while the cycle is in progress, and that after completion the scheduler resumes normally.

**Acceptance Scenarios**:

1. **Given** a sync cycle is in progress when the next scheduled tick fires, **When** the tick fires, **Then** that tick is skipped and no second concurrent cycle starts.
2. **Given** two or more consecutive ticks have been skipped while a cycle is running, **When** those ticks are missed, **Then** the scheduler pauses itself until the in-flight cycle finishes.
3. **Given** the scheduler has paused, **When** the in-flight cycle completes, **Then** the scheduler resumes its regular polling interval from that point.
4. **Given** the application is shutting down, **When** a shutdown signal is received, **Then** the scheduler stops gracefully without starting a new cycle.

---

### Edge Cases

- What happens when the `uniqueKey` column is missing from a sheet's headers after normalization? The entire sheet is skipped for that cycle and an error is logged; no exception is thrown.
- What happens when a cell contains an Excel error string like `#REF!` or `#N/A`? The value is coerced to `null` and a warning is logged with the sheet name, row index, and column name.
- What happens when two columns in the same sheet normalize to the same name? Subsequent duplicates are suffixed with `_2`, `_3`, etc.
- What happens when `skipNullCols` is false and a column with no header is encountered? That column is skipped with a warning logged including its index; other columns in the row are still processed.
- What happens when the Google Sheets API returns a transient error? The error is logged with a stack trace and the cycle ends; the scheduler resumes at the next tick.
- What happens when no browser clients are connected at the time of a sync? The notification is emitted to an empty audience; no error is raised.
- What happens when the sheet config JSON file is missing or malformed at startup? The module fails to initialize and the application exits with a clear error message.
- What happens when a date-like string cannot be parsed into a valid date? It is stored as plain text; no exception is thrown.

## Requirements *(mandatory)*

### Functional Requirements

**Polling & Scheduling**

- **FR-001**: The system MUST poll all configured Google Sheets every 15 seconds (configurable via `SYNC_INTERVAL_MS` environment variable).
- **FR-002**: The system MUST use a concurrency guard (`isSyncing` flag) to prevent overlapping sync cycles; any tick that fires while a cycle is running MUST be skipped entirely.
- **FR-003**: If two or more consecutive ticks are skipped because a cycle is still running, the scheduler MUST pause itself until the in-flight cycle finishes.
- **FR-004**: Once an in-flight cycle completes, the scheduler MUST resume its regular polling interval.
- **FR-005**: The scheduler MUST stop gracefully on application shutdown.
- **FR-006**: All configured sheets MUST be fetched in a single batch API call per cycle to minimize API quota usage.
- **FR-007**: The system MUST request `FORMATTED_VALUE` for cell rendering and `FORMATTED_STRING` for date/time rendering from the Sheets API.
- **FR-008**: If a sheet returns unexpectedly empty data, the system MUST retry that sheet up to 3 times with exponential backoff (2 s, 4 s, 6 s) before logging a warning and skipping it for the current cycle.

**Sheet Configuration**

- **FR-009**: Sheet configuration MUST be stored in a dedicated JSON file whose path is provided via the `SHEET_CONFIG_PATH` environment variable.
- **FR-010**: The configuration file MUST be loaded once at module initialization; it MUST NOT be re-read on every cycle.
- **FR-011**: Each sheet configuration entry MUST specify: the sheet tab name, the target database table name, the 1-based header row index, the unique key column name (normalized), and a flag indicating whether columns with null/empty headers should be dropped.

**Header Normalization**

- **FR-012**: Column headers MUST be normalized by: replacing newline characters with a space, removing non-alphanumeric/space characters, trimming whitespace, collapsing multiple spaces into a single underscore, and converting to lowercase.
- **FR-013**: After normalization, duplicate column names within the same sheet MUST be made unique by appending `_2`, `_3`, etc. to subsequent occurrences.
- **FR-014**: When `skipNullCols` is enabled, columns whose header is null or empty after normalization MUST be dropped along with their cell values.
- **FR-015**: When `skipNullCols` is disabled and a null-header column is encountered, the system MUST log a warning with the column index and skip only that column.

**Type Coercion**

- **FR-016**: Cell values containing spreadsheet error strings (`#REF!`, `#VALUE!`, `#N/A`, `#NAME?`, `#DIV/0!`) MUST be coerced to `null` and a warning logged with sheet name, row index, and column name.
- **FR-017**: Numeric strings (including decimals and negatives) MUST be coerced to numbers before storage.
- **FR-018**: String values `"true"`, `"false"`, `"TRUE"`, `"FALSE"` MUST be coerced to booleans.
- **FR-019**: Recognized date and datetime strings (ISO 8601, `dd-mmm-yyyy`, `dd/mm/yyyy hh:mm`) MUST be coerced to date values.
- **FR-020**: Excel duration/timedelta strings (e.g., `"1 day, 4:00:00"`) MUST be converted to total seconds as an integer.
- **FR-021**: If no coercion rule matches, the value MUST be stored as plain text without throwing an error.

**Change Detection & Upsert**

- **FR-022**: Before writing any row, the system MUST compare incoming field values against the existing database row matched by the `uniqueKey` column.
- **FR-023**: A database write (INSERT or UPDATE) MUST only occur when at least one non-key field value has changed.
- **FR-024**: Rows with no changed field values MUST be skipped with no database write.
- **FR-025**: The `last_synced_at` timestamp column MUST be updated only when a write actually occurs.
- **FR-026**: If the `uniqueKey` column is absent from a sheet's normalized headers, the system MUST log an error and skip the entire sheet for that cycle without throwing an exception.

**Row-Level Locking**

- **FR-027**: Before any comparison or write, the system MUST check whether the `is_locked` field on the incoming row coerces to `true`.
- **FR-028**: Rows where `is_locked` is `true` MUST be skipped entirely with no diff, write, or error.
- **FR-029**: The count of locked rows skipped per sheet per cycle MUST be logged.
- **FR-030**: If `is_locked` is absent from a sheet's headers, all rows MUST be treated as unlocked.

**Real-Time Notification**

- **FR-031**: After each sync cycle where at least one row was upserted across any sheet, the system MUST emit a real-time notification to all connected clients containing: the list of affected table names, total upserted row count, and the sync timestamp.
- **FR-032**: If zero rows were upserted in a cycle, no notification MUST be sent.
- **FR-033**: The notification channel MUST log client connect and disconnect events per client identifier.
- **FR-034**: The notification gateway CORS origin MUST be configurable via the `WEBSOCKET_CORS_ORIGIN` environment variable.

**Dashboard REST API**

- **FR-035**: The system MUST expose dedicated read endpoints for each of the five data sources: CGK shipments, SUB shipments, SDA shipments, rate-per-station, and route master.
- **FR-036**: Each endpoint MUST support pagination via `page` (default 1) and `limit` (default 50) query parameters.
- **FR-037**: Each endpoint MUST support sorting via `sortBy` and `sortOrder` (`asc` | `desc`) query parameters.

**Frontend Dashboard**

- **FR-038**: A new "Air Shipments" top-level menu item MUST be added to the existing sidebar navigation, with five sub-pages: CGK, SUB, SDA, Rate, and Routes.
- **FR-039**: Each sub-page MUST display its data in a paginated, sortable table.
- **FR-040**: Each sub-page MUST show a sync status indicator displaying the last-synced time and a "Live" badge when the real-time connection is active.
- **FR-041**: Each sub-page MUST show a loading skeleton while data is being fetched.
- **FR-042**: Each sub-page MUST automatically refresh its data when a sync notification is received and the notification includes the table name for that page.
- **FR-043**: The frontend MUST connect to the real-time notification channel on page mount and disconnect cleanly on unmount.

**Logging & Observability**

- **FR-044**: At the start of each cycle, the system MUST log the cycle start time.
- **FR-045**: Per sheet per cycle, the system MUST log: rows fetched, rows skipped (no change), rows skipped (locked), rows upserted, rows skipped (missing key), and columns skipped (error value or null header).
- **FR-046**: At the end of each cycle, the system MUST log the total cycle duration in milliseconds.
- **FR-047**: All errors MUST be logged with their full stack trace.

### Key Entities

- **SheetConfig**: Defines the mapping between a Google Sheets tab and a PostgreSQL table, including the header row index, the unique key column name, and the null-column handling policy.
- **SyncCycle**: A single execution of the polling scheduler — fetches all configured sheets, normalizes data, performs change detection, upserts changed rows, and emits a notification if any rows were written.
- **SyncNotification**: The real-time message sent to connected clients after a cycle that produced at least one upserted row; contains affected table names, row count, and timestamp.
- **AirShipmentRow**: A normalized row from one of the five configured sheets stored in PostgreSQL; keyed by a unique identifier column (`to_number` for shipment tables, `concat` for reference tables).
- **SyncStatus**: The observable state of the sync connection on the frontend — whether the real-time channel is connected and when data was last updated.

## Assumptions

- All five PostgreSQL target tables (`air_shipments_cgk`, `air_shipments_sub`, `air_shipments_sda`, `rate_per_station`, `route_master`) are created via separate database migrations before the sync service starts; the sync service does not create or modify table schemas.
- Each target table has a unique key column matching its configured `uniqueKey`, an `is_locked BOOLEAN` (nullable) column, and a `last_synced_at TIMESTAMPTZ` column.
- The Google Sheets workbook is accessed via a service account; credentials are provided as a file whose path is set in `GOOGLE_CREDENTIALS_PATH`.
- Only a single spreadsheet (identified by `GOOGLE_SHEET_ID`) is synced; multi-spreadsheet sync is out of scope.
- The `CGK01-10`, `CGK11-15`, `CGK16-20`, and `CGK21-30` sub-sheets are not directly synced; their data is already compiled into `CompileAirCGK`.
- The `config/sheets.json` file may contain sheet names considered sensitive and should be excluded from version control or provided as an example file.
- The frontend real-time connection uses the URL in the `NEXT_PUBLIC_API_URL` environment variable.
- No authentication or authorization is applied to the real-time notification channel.

## Out of Scope

- Webhook or push-based sync from Google Sheets (polling only).
- Writing data back from the database to Google Sheets.
- Automatic schema inference or migration for PostgreSQL tables.
- Alternative real-time mechanisms (Redis pub/sub, Server-Sent Events).
- Direct sync of the CGK sub-input sheets (CGK01-10, etc.).
- Multi-spreadsheet sync (single spreadsheet ID only).
- Authentication or authorization on the real-time notification gateway.
- Filtering, searching, or exporting data from the Air Shipments dashboard pages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Data from all five configured Google Sheets tabs is visible in the corresponding dashboard pages within 30 seconds of a change being made in the spreadsheet, without any manual user action.
- **SC-002**: Dashboard pages reflect updated data automatically when new rows are synced, without requiring a manual page refresh.
- **SC-003**: Rows that have not changed between polling cycles produce no database writes; 100% of unchanged rows are correctly identified and skipped.
- **SC-004**: Locked rows (where `is_locked` is true) are never overwritten; 100% of locked rows are skipped during sync.
- **SC-005**: The sync service handles a polling interval of 15 seconds for a workbook with up to 5 sheets and thousands of rows without exceeding API rate limits or causing overlapping cycles.
- **SC-006**: When the sync service is running but data has not changed, no spurious notifications are sent to connected dashboard clients.
- **SC-007**: A user can navigate between the five Air Shipments sub-pages, apply sorting, and paginate through results without experiencing errors or full page reloads.
- **SC-008**: The sync status indicator on each dashboard page accurately reflects whether the real-time connection is active and when data was last updated.
