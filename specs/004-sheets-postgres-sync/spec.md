# Feature Specification: Google Sheets to PostgreSQL Sync Service

**Feature Branch**: `004-sheets-postgres-sync`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Feature: Google Sheets to PostgreSQL Sync Service"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Automatic Background Data Synchronization (Priority: P1)

As an operations team member, I want the database to automatically stay in sync with the designated Google Sheet so that any data entry in the sheet is reflected in the application without any manual import steps.

**Why this priority**: This is the core value proposition. Without reliable automated sync, all other features are irrelevant. It is the foundational capability that everything else builds on.

**Independent Test**: Can be verified by making a change to a row in the configured Google Sheet and confirming the corresponding database record updates within the configured poll interval, without any manual action.

**Acceptance Scenarios**:

1. **Given** a Google Sheet row contains data that differs from the corresponding database record, **When** the next scheduled sync cycle runs, **Then** the database record is updated to match the sheet data, and the row's last-synced timestamp is updated.
2. **Given** a Google Sheet row contains data identical to the corresponding database record, **When** a sync cycle runs, **Then** no write is performed to the database for that row.
3. **Given** a row exists in the Google Sheet but not yet in the database, **When** a sync cycle runs, **Then** a new record is created in the database and the last-synced timestamp is set.
4. **Given** a sync cycle is currently in progress, **When** the next scheduled tick fires, **Then** that tick is skipped entirely and no second sync process begins.
5. **Given** the previous sync process is taking longer than one full poll interval, **When** additional ticks continue to fire, **Then** the scheduler pauses further ticks until the in-flight process completes, then resumes its regular cadence from that point.

---

### User Story 2 - Row-Level Locking Protection (Priority: P2)

As an operations team member, I want to flag individual rows in the Google Sheet as locked so that the sync service never overwrites data that I have intentionally held back from automatic updates.

**Why this priority**: Locking prevents data corruption for in-progress or protected records. It is essential for operational safety and must be guaranteed before the service is used in production.

**Independent Test**: Can be verified by marking a row as locked in the sheet, modifying that row's data, running a sync cycle, and confirming the database record remains unchanged.

**Acceptance Scenarios**:

1. **Given** a sheet row has its locked flag set to `true`, **When** a sync cycle runs, **Then** that row is entirely skipped — no comparison and no database write occur.
2. **Given** a sync cycle skips one or more locked rows, **When** the cycle completes, **Then** the count of skipped locked rows is recorded in the sync log.
3. **Given** a sheet row has its locked flag set to `false` (or absent), **When** a sync cycle runs, **Then** the row is processed normally according to change-detection rules.
4. **Given** a locked row later has its locked flag removed or set to `false`, **When** the next sync cycle runs, **Then** the row is processed normally and updated if its data differ from the database.

---

### User Story 3 - Real-Time Dashboard Notifications (Priority: P3)

As a dashboard user, I want to see the data on my screen refresh automatically when the Google Sheet changes so that I am always viewing the most current information without needing to reload the page.

**Why this priority**: Real-time visibility improves operational awareness but is an enhancement on top of the core sync functionality. The service delivers value even without live UI updates.

**Independent Test**: Can be verified by opening the dashboard, modifying a non-locked row in the Google Sheet, and observing that the dashboard data refreshes automatically within a few seconds without a manual page reload.

**Acceptance Scenarios**:

1. **Given** a user has the dashboard open, **When** a sync cycle completes with at least one row written to the database, **Then** the dashboard receives a notification and automatically refreshes the affected data.
2. **Given** a sync cycle completes but no rows were written (all skipped due to no change or locking), **When** the cycle ends, **Then** no notification is sent to the dashboard.
3. **Given** a user opens the dashboard, **When** the connection to the sync notification service is established, **Then** the dashboard displays a "connected" status indicator.
4. **Given** a user closes or navigates away from the dashboard, **When** the component is destroyed, **Then** the connection is cleanly closed without lingering subscriptions.

---

### User Story 4 - Operational Visibility and Logging (Priority: P4)

As a system operator, I want every sync cycle to produce detailed logs so that I can diagnose issues, audit what changed, and confirm the service is running as expected.

**Why this priority**: Logging is critical for operational trust and incident response but does not gate the core sync or notification features.

**Independent Test**: Can be verified by running a sync cycle against a sheet with a mix of changed, unchanged, and locked rows, then inspecting the application logs to confirm counts for each category are accurately reported.

**Acceptance Scenarios**:

1. **Given** a sync cycle starts, **When** processing begins, **Then** a log entry is recorded indicating the cycle has started.
2. **Given** a sync cycle completes, **When** processing ends, **Then** a log entry is recorded with counts for: rows processed, rows skipped due to no change, rows skipped due to locking, and rows actually written to the database.
3. **Given** an error occurs during a sync cycle, **When** the error is encountered, **Then** it is logged with enough context to identify the affected row and nature of the failure, and the service continues processing remaining rows rather than halting entirely.
4. **Given** a sheet column does not correspond to any column in the database table, **When** that column is encountered during sync, **Then** a warning is logged and that column is silently skipped without causing the row or cycle to fail.

---

### Edge Cases

- What happens when the Google Sheet is unreachable during a sync cycle?
- What happens when the sheet's header row changes between cycles (columns added, removed, or renamed)?
- How does the system handle a value in the sheet that cannot be coerced to the expected data type?
- What happens if the database is unavailable when the sync attempts to write?
- How does the sync behave on first run when the database table is empty?
- What happens if the sheet contains no data rows (header row only)?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST automatically pull data from a configured Google Sheet at a regular, configurable interval without human intervention.
- **FR-002**: The system MUST use the sheet's first row as the column header and map header names directly to the corresponding database column names on a strict 1:1 basis.
- **FR-003**: The system MUST compare each incoming sheet row against its existing database record before deciding whether to write.
- **FR-004**: The system MUST skip any database write for a row whose field values have not changed since the last sync.
- **FR-005**: The system MUST perform an insert when a sheet row does not yet exist in the database, and an update when the row already exists but has changed.
- **FR-006**: The system MUST record a last-synchronized timestamp on each row, updated only when a write actually occurs.
- **FR-007**: The system MUST skip any row whose locked flag is set to `true`, performing no comparison and no database write for that row.
- **FR-008**: The system MUST count and log skipped locked rows per cycle; locked rows MUST NOT be treated as errors.
- **FR-009**: The system MUST enforce that at most one sync process runs at any moment; a new cycle MUST NOT start if the previous one is still in progress.
- **FR-010**: The system MUST pause scheduling additional sync cycles while a sync process is in progress and resume the regular schedule only after that process completes.
- **FR-011**: The system MUST attempt to coerce string values from the sheet into their appropriate data types (numeric, boolean, date) before writing to the database, falling back to storing the value as text when coercion is not possible.
- **FR-012**: The system MUST silently skip any sheet column that does not have a corresponding column in the database table, logging a warning but not failing the row or the cycle.
- **FR-013**: The system MUST notify all connected dashboard clients when at least one row is written during a cycle, including the target table name, the count of rows written, and the timestamp of the cycle.
- **FR-014**: The system MUST NOT emit a notification when a sync cycle completes with zero rows written.
- **FR-015**: The dashboard client MUST connect to the sync notification service on mount and disconnect cleanly on unmount.
- **FR-016**: The dashboard client MUST expose the latest received sync event payload and a live connection status indicator to consuming UI components.
- **FR-017**: The dashboard client MUST trigger a re-fetch of the relevant data when a sync notification is received.
- **FR-018**: The system MUST be fully configurable via environment variables, including: Google Sheet identifier, credentials, target database table name, poll interval, and allowed dashboard origin for cross-origin access.
- **FR-019**: The system MUST log each sync cycle start, all row-level outcomes (processed, skipped-unchanged, skipped-locked, upserted), and any errors encountered during the cycle.
- **FR-020**: The system MUST stop its scheduler cleanly when the application shuts down, without leaving in-flight sync processes in an undefined state.
- **FR-021**: The system MUST NOT auto-create or auto-modify the target database table schema; the table must be pre-provisioned externally before the sync service is started.

### Key Entities

- **Sync Cycle**: A single execution of the scheduled polling process. Has a start time, end time, and outcome counts (rows processed, skipped-unchanged, skipped-locked, upserted).
- **Sheet Row**: A data record read from the Google Sheet during a sync cycle. Identified by a primary-key column value. Contains key-value pairs derived from the header row mapping.
- **Sync Record**: The corresponding record in the target database table. Includes all mapped data columns, a `last_synced_at` timestamp, and an `is_locked` flag.
- **Column Mapping**: The runtime-derived relationship between a sheet header column name and a database column name, generated fresh each cycle from the sheet's header row.
- **Sync Notification**: An event delivered to connected dashboard clients after a successful write cycle, carrying the table name, upsert count, and cycle timestamp.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Changes made to a non-locked row in the Google Sheet are reflected in the database within 30 seconds under normal operating conditions.
- **SC-002**: Zero database writes occur for rows whose data has not changed since the last sync cycle, verified across 100 consecutive cycles against a static sheet.
- **SC-003**: Rows with the locked flag set to `true` are never modified in the database, regardless of the number of sync cycles run or changes made to those rows in the sheet.
- **SC-004**: Only one sync process runs at any given time; concurrent execution is never observed even under sustained scheduling pressure (e.g., a long-running sync with many pending ticks).
- **SC-005**: Dashboard users receive a live data refresh within 5 seconds of a database update caused by a sync cycle, while their browser tab is open and connected.
- **SC-006**: A sync cycle that encounters one or more sheet columns absent from the database table completes successfully for all other columns, with warnings in the logs and no data loss.
- **SC-007**: The service starts and stops cleanly during application lifecycle events, with all in-flight operations completing before shutdown and no orphaned processes left running.
- **SC-008**: All sync activity — cycle starts, per-row outcomes, and errors — is captured in logs with sufficient detail to reconstruct what happened during any given cycle.

## Assumptions

- The Google Sheet has a designated primary-key column whose values correspond to the primary key of the target database table; the sync service uses this to match rows between sheet and database.
- The target database table exists and has the correct schema before the sync service starts; the service does not validate the schema on startup.
- Only one Google Sheet and one target database table are involved per service instance.
- Sheet data flows one way: from the sheet into the database only; the service never writes back to the sheet.
- The default poll interval is 15 seconds, adjustable via environment variable without code changes.
- Dashboard clients that are not connected when a sync notification fires will not receive that notification retroactively; they will see updated data on their next manual or triggered data fetch.
- The credentials required to access the Google Sheet are provisioned and managed externally; the service only needs to be pointed at them.

## Out of Scope

- Webhook or push-based sync from Google Sheets (polling only for this feature).
- Writing data back from PostgreSQL to Google Sheets.
- Automatic schema creation or migration for the target PostgreSQL table.
- Synchronizing multiple sheets within a single service instance.
- Retroactive delivery of missed sync notifications to clients that were disconnected.
- Authentication or authorization on the real-time notification connection between the dashboard and the sync service.
