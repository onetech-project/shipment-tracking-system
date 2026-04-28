# Task: Dashboard Redesign — Alert Section + Filtered Table

## Context

Current dashboard has:

- Greeting section
- 3 buttons (Shipment menu, Google Sheet Config, Coming Soon placeholder)

We are redesigning the dashboard into 3 sections and removing the 3 buttons
(navigation is handled by sidebar).

Data scope for the entire dashboard: last 15 days from today (inclusive).

---

## New Dashboard Layout

### Section 1 — Greeting

Keep existing greeting UI, no changes.

### Section 2 — Alert Cards

Display 6 cards in a row (or responsive grid), each with distinct color:

| Card                        | Color   |
| --------------------------- | ------- |
| SLA Alert                   | #EF4444 |
| TJPH Alert                  | #F97316 |
| ATA Flight Alert            | #EAB308 |
| ATD Flight Alert            | #3B82F6 |
| SMU Alert                   | #8B5CF6 |
| Normal (no alert triggered) | #22C55E |

Each card shows:

- Alert label
- Count (number of shipment rows matching, within 15 days)
- Subtle icon

At the top of Section 2, show a summary line:
"X shipments in the last 15 days"
(X = total of all rows within scope, regardless of alert status)

Click behavior on card:

- Scroll smoothly to Section 3 (table)
- Set the Alert dropdown filter to match the clicked card
- "Normal" card sets filter to show only rows with no alert flags triggered

### Section 3 — Shipment Table

Reuse the existing AirShipmentPage component from the Shipment menu as-is.
It already supports column show/hide — do not modify the component itself.

Above the table, 3 controls in one row:

1. Search input (text, same behavior as Shipment menu)
2. Alert dropdown — options:
   - All Alerts (default)
   - SLA Alert
   - TJPH Alert
   - ATA Flight Alert
   - ATD Flight Alert
   - SMU Alert
   - Normal
3. Route dropdown — options:
   - All Routes (default)
   - Distinct values of "Origin - Destination" from shipment data

When Alert filter is active, show a dismissible badge:
"Filtered by: <Alert Name> ✕"
Clicking ✕ resets to All Alerts.

Default state: All Alerts, All Routes, no search query.
Pagination: 50 rows per page.

Data scope: always last 15 days — this table is for operational monitoring.
Full historical data is available in the Shipment menu.

---

## Alert Evaluator Logic (alert-evaluator.ts)

Create this utility in: src/shipments/utils/alert-evaluator.ts
This file is the SINGLE SOURCE OF TRUTH for all alert logic.
Do not duplicate this logic anywhere else.

```ts
export function evaluateAlerts(row): AlertFlags {
  const now = new Date()
  const ataOrigin = row.ata_origin ? new Date(row.ata_origin) : null
  const slaTime = row.sla ? parseDuration(row.sla) : null
  const tjphTime = row.tjph ? parseDuration(row.tjph) : null

  // REAL FORMULA
  const slaDeadline = ataOrigin && slaTime ? new Date(ataOrigin.getTime() + slaTime) : null
  const tjphDeadline = ataOrigin && tjphTime ? new Date(ataOrigin.getTime() + tjphTime) : null

  const slaAlert = slaDeadline && tjphDeadline ? now > slaDeadline && now < tjphDeadline : false

  const tjphAlert = tjphDeadline ? now > tjphDeadline : false

  // PLACEHOLDER — formula TBD
  const ataFlightAlert = !row.ata_flight
  const atdFlightAlert = !row.atd_flight
  const smuAlert = !row.tracking_smu

  return { slaAlert, tjphAlert, ataFlightAlert, atdFlightAlert, smuAlert }
}

// NOTE: SLA and TJPH values are in HH:MM:SS string format (e.g. "24:00:00", "48:30:00")
// Hours CAN exceed 24 — do NOT use native Date parsing, it will break above hour 23
// parseDuration is format-dependent — update here if sheet format ever changes
function parseDuration(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return (hours * 3600 + minutes * 60 + seconds) * 1000 // returns ms
}

export interface AlertFlags {
  slaAlert: boolean
  tjphAlert: boolean
  ataFlightAlert: boolean
  atdFlightAlert: boolean
  smuAlert: boolean
}
```

---

## Data Source

- Google Sheet: "Compile Air CGK"
- PostgreSQL table: air_shipments_compileaircgk
- All backend queries (alert-summary, routes, shipments list) must query
  from table air_shipments_compileaircgk specifically

---

## Live Update (WebSocket)

WebSocket is already implemented and emits events to the frontend
whenever a sync from Google Sheets completes.

## Backend Tasks

### 1. GET /shipments/alert-summary?days=15

- Loop all shipment rows within last 15 days
- Run evaluateAlerts() per row
- A row is "normal" if ALL flags are false
- Return:

```json
{
  "totalRows": 37,
  "slaAlert": 12,
  "tjphAlert": 7,
  "ataFlightAlert": 5,
  "atdFlightAlert": 9,
  "smuAlert": 3,
  "normal": 8
}
```

Note: alerts can overlap (one row can trigger multiple alerts),
so totalRows != sum of all alert counts. Count them independently.

### 2. GET /shipments/routes

Return distinct routes within last 15 days:

```json
{
  "routes": [
    { "label": "CGK - SUB", "origin": "CGK", "destination": "SUB" },
    { "label": "CGK - DPS", "origin": "CGK", "destination": "DPS" }
  ]
}
```

Source: Origin and Destination columns from Size Manual (already synced to DB).

### 3. Extend GET /shipments

Support combined optional query params:

- ?alertFilter=slaAlert — existing param, extend to support value "normal"
  (normal = rows where all evaluateAlerts() flags are false)
- ?routeFilter=CGK-SUB — new param, split by " - " to extract origin & destination
- ?days=15 — new param, filter rows where ata_origin >= today - N days
- ?page=1&limit=50 — pagination

When ?days is not provided, return all rows (Shipment menu behavior, unchanged).
All params are optional and combinable.

### 4. WebSocket event on sync completion

- After sync completes for sheet "Compile Air CGK", emit a WebSocket event:
  event name: sync.completed
  payload: { sheet: "compile_air_cgk" }
- If this event is already emitted by the existing sync job, no changes needed
  on the backend — just confirm the payload includes the sheet identifier

---

## Frontend Tasks

### 1. Refactor Dashboard page

- Remove the 3 existing buttons entirely
- Build 3-section layout: Greeting → Alert Cards → Table

### 2. AlertCards component (new)

- Fetch from GET /shipments/alert-summary?days=15 on mount
- Render 6 cards with colors defined above
- Show total summary line above cards: "X shipments in the last 15 days"
- On card click:
  - Set activeAlert state to the clicked alert key
  - Scroll smoothly to Section 3 using ref:
    tableRef.current.scrollIntoView({ behavior: 'smooth' })

### 3. Route dropdown

- Fetch from GET /shipments/routes on mount
- Populate dropdown with returned routes
- Default: "All Routes"

### 4. Wire filters to ShipmentTable

- Pass activeAlert, activeRoute, searchQuery, page as props to ShipmentTable
- ShipmentTable builds query string and fetches accordingly
- Always include ?days=15 when called from Dashboard
- Do NOT pass ?days when called from Shipment menu (keep existing behavior)

### 5. Alert filter badge

- Show badge when activeAlert is set: "Filtered by: <Alert Name> ✕"
- Clicking ✕ clears activeAlert back to null (show all)

### 6. Live update on WebSocket event

- Dashboard must listen to WebSocket event sync.completed
- On receive, check payload: if sheet === "compile_air_cgk", re-fetch:
  1. GET /shipments/alert-summary?days=15 → refresh alert cards + total count
  2. GET /shipments/routes → refresh route dropdown (new routes may appear)
  3. Re-fetch current table data with active filters preserved
     (do NOT reset activeAlert, activeRoute, searchQuery, or current page)
- Show a subtle "Last updated: HH:mm:ss" timestamp below the alert cards,
  update it every time a live refresh occurs

---

## Important Constraints

- ShipmentTable component must NOT be modified internally
  — only pass props/params to it
- alert-evaluator.ts is the single source of truth — never duplicate logic
- days=15 scope is enforced at backend level, not just frontend
- Shipment menu page behavior must remain completely unchanged
- Do NOT use native Date() to parse SLA/TJPH duration strings

---

## Acceptance Criteria

- [ ] Dashboard shows 3 sections, buttons removed
- [ ] Alert cards show correct counts within 15-day scope
- [ ] Total shipment count shown above cards
- [ ] Clicking a card scrolls to table and activates alert filter
- [ ] Route dropdown populated with distinct Origin - Destination values
- [ ] Alert + Route + Search filters work in combination
- [ ] "Normal" filter shows only rows with zero alerts
- [ ] Filter badge visible and dismissible with ✕
- [ ] Pagination 50 rows per page
- [ ] Shipment menu page unaffected
- [ ] SLA Alert formula: now > (ataOrigin + sla) && now < (ataOrigin + tjph)
- [ ] TJPH Alert formula: now > (ataOrigin + tjph)
- [ ] parseDuration() handles HH:MM:SS with hours > 23 correctly
- [ ] WebSocket event triggers live refresh of alert summary, routes, and table data
