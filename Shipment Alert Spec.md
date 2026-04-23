# Task: Alert Pie Chart with Clickable Table Filter — Shipment Menu

## Context

We have a shipment data sync system (NestJS + NextJS + PostgreSQL).
Data is already synced from 2 Google Sheets and displayed in a table
on the Shipment menu. The table already has search/filter functionality.

## Goal

Add a Pie Chart ABOVE the search bar and table that:

1. Shows total count per alert type (5 slices)
2. When a slice is clicked → table filters to only show rows matching that alert
3. Clicking the same slice again → clears filter (toggle behavior)
4. Alert logic is PLACEHOLDER for now — use dummy/mock evaluation,
   real formulas will be plugged in later

---

## Alert Types (5 total)

These are the 5 categories shown in the pie chart:

- SLA Alert
- TJPH Alert
- ATA Flight Alert
- ATD Flight Alert
- SMU Alert

---

## Relevant Columns per Row

From the synced shipment data, each row has at minimum:

- AWB (string) — primary key / relation
- ATA Origin (datetime)
- ATD Flight (datetime)
- ATA Flight (datetime)
- SLA (duration value)
- TJPH (duration value)
- Tracking SMU (string, from Reservasi sheet)
- ...and other columns

---

## Alert Evaluation Logic (PLACEHOLDER)

Create a utility function `evaluateAlerts(row)` that returns:

```ts
interface AlertFlags {
  slaAlert: boolean
  tjphAlert: boolean
  ataFlightAlert: boolean
  atdFlightAlert: boolean
  smuAlert: boolean
}
```

For now, use MOCK logic — e.g. random, or simple null checks:

- slaAlert: row.sla is null or empty
- tjphAlert: row.tjph is null or empty
- ataFlightAlert: row.ata_flight is null or empty
- atdFlightAlert: row.atd_flight is null or empty
- smuAlert: row.tracking_smu is null or empty

This function MUST be isolated in its own file so it's easy to
replace with real logic later without touching the chart or table.

---

## Backend Tasks

1. Create `evaluateAlerts(row)` utility in a dedicated file:
   `src/shipments/utils/alert-evaluator.ts`

2. Create endpoint:
   GET /shipments/alert-summary
   - Loop all active shipment rows
   - Run evaluateAlerts() per row
   - Return aggregated counts:

```json
{
  "slaAlert": 12,
  "tjphAlert": 7,
  "ataFlightAlert": 5,
  "atdFlightAlert": 9,
  "smuAlert": 3
}
```

3. Extend existing shipment list endpoint to support alert filter:
   GET /shipments?alertFilter=slaAlert
   - If alertFilter param present, only return rows where
     evaluateAlerts(row)[alertFilter] === true
   - If no param, return all rows as usual (existing behavior unchanged)

---

## Frontend Tasks

1. Create `AlertPieChart` component:
   - Fetch data from GET /shipments/alert-summary on mount
   - Render pie chart using Recharts (already in project)
   - 5 slices with distinct colors:
     - SLA Alert → #EF4444
     - TJPH Alert → #F97316
     - ATA Flight Alert → #EAB308
     - ATD Flight Alert → #3B82F6
     - SMU Alert → #8B5CF6
   - Legend displayed beside the chart
   - Tooltip shows: label, count, percentage
   - Active/selected slice should have visual highlight (opacity or stroke)

2. Click behavior (toggle filter):
   - Click a slice → set activeAlert state to that alert key
   - Table re-fetches with ?alertFilter=<activeAlert>
   - Click same slice again → clear activeAlert, table shows all rows
   - Selected slice should remain visually highlighted

3. Layout in Shipment page:

```
┌─────────────────────────────────┐
│        Alert Pie Chart          │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  [ Search Bar ]                 │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  [ Shipment Table ]             │
└─────────────────────────────────┘
```

4. Auto-refresh chart on WebSocket event `sync.completed`
   (WebSocket is already implemented — just listen and re-fetch
   alert-summary when this event fires)

5. When alertFilter is active:
   - Show a visible indicator/badge like:
     "Filtered by: SLA Alert ✕"
   - Clicking ✕ clears the filter

---

## Important Constraints

- Do NOT modify existing table logic — only add the ?alertFilter query param support
- The alert-evaluator.ts file must be self-contained with no side effects
- Keep the pie chart in its own component file (reusable)
- No changes to existing sync job — alert evaluation is read-time only for now

---

## Acceptance Criteria

- [ ] Pie chart renders with 5 slices and correct counts
- [ ] Clicking a slice filters the table
- [ ] Clicking same slice again clears filter
- [ ] Filter badge visible when active
- [ ] Chart refreshes after sync completes
- [ ] Swapping alert-evaluator.ts logic does not require changes anywhere else
