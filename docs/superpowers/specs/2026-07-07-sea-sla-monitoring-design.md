# Sea SLA Monitoring — Design

**Date:** 2026-07-07
**Status:** Approved (design review with Faris, 2026-07-07)

## Context

SLA Monitoring currently covers only air freight: the `/sla` page reads
`air_shipments_compileaircgk` and computes 8 alert types on the fly via
`alert-evaluator.ts`. A sea-freight sheet ("Size Manual Laut" →
`CompileSeaNonJava`) already syncs into `air_shipments_compileseanonjava`
(13.6k rows) but has no monitoring UI.

The feature splits SLA Monitoring into two submenus — **Air** (existing) and
**Sea** (new) — where Sea reuses all Air functionality (alerts-by-route table,
active alerts, excluded list, exclude/restore per row and by LT, batch ops,
column config, Excel export, OTP) against the sea table.

### Data facts (verified against live DB, 2026-07-07)

- Sea sheet columns `sla`, `tjph`, `max_sla`, `max_tjph` are **empty on all
  13,682 rows** — thresholds must come from the `air_shipments_data` lookup.
- `air_shipments_data` (keyed `origin_dc|destination_dc`) currently covers
  **1 of 7 distinct sea routes** (Pekanbaru DC → Tebing Tinggi Riau Hub).
  Ops must fill the remaining sea routes in the Data sheet; until then those
  routes silently produce no SLA/TJPH alerts (same degrade behavior as Air).
- Sea date fields are free text in the same format as CGK
  (`1-Jun-2026 22:15` vs `19-Jun-2026 13:03`); the existing
  `parseDate` (`new Date()`) handles both.
- Sea `gross_weight` is a JSONB number → OTP tonnage weighting works as-is.
- Sea grain is TO (`unique_key = [lt_number, to_number]`), same as Air.
- 1,842 rows have empty `actual_ship_name`; only 1 of those is completed,
  181 have already sailed.

## Decisions made during review

1. **SLA/TJPH threshold source:** identical mechanism to Air — row `sla`/`tjph`
   as base, overridden by the `air_shipments_data` lookup per route.
2. **Potential breach reference:** `ata_sailing + m hours` vs `maxSla`/`maxTjph`
   (mirror of Air's `ata_flight + m`); Air's SMU "not onboard" branch has no
   sea equivalent and is omitted.
3. **Sea Reservation guard:** full mirror of Air's reservation alert —
   `actual_ship_name` empty AND not completed AND `now > atd_origin + n hours`
   AND not sailed (`atd_sailing` and `ata_sailing` empty).
4. **Navigation:** in-page tab bar Air | Sea under a single sidebar item
   (`/sla` → redirect `/sla/air`), matching the Air Shipments layout pattern.
5. **Implementation approach:** profile-driven generalization (option A) —
   one evaluator + one page component parameterized per mode; no duplication.
6. **Permission:** both tabs reuse `read.sla` (repo convention; avoids the
   JWT re-login issue a new permission would cause).

## Backend design

### Alert profile (generalize `alert-evaluator.ts`)

New `AlertProfile` object declaring field mappings and enabled alert types;
`evaluateAlerts(row, nHours, mHours, now, profile)`. The AIR profile
reproduces current behavior exactly (regression-tested). Field mapping:

| Aspect                        | Air                        | Sea                                                |
| ----------------------------- | -------------------------- | -------------------------------------------------- |
| Completion (SLA/TJPH/OTP)     | `ata_vendor_wh_destination`| `ata_vendor_wh_destination_sertakan_link_evidence` |
| SPX completion                | `completed_time`           | `trip_completed`                                   |
| Transport arrival (potential) | `ata_flight`               | `ata_sailing`                                      |
| Transport departure           | `atd_flight`               | `atd_sailing`                                      |
| Reservation empty-field       | `awb`                      | `actual_ship_name`                                 |
| SMU not-onboard check         | yes                        | none                                               |
| Flight Tracking (offload)     | yes                        | none                                               |

New `AlertType` member `reservasiKapal` (UI label "Sea Reservation").
Sea enables 7 alerts: `reservasiKapal`, `potensiMelebihiSla`, `melewatiSla`,
`potensiMelebihiTjph`, `melewatiTjph`, `spxSlaAlert`, `spxTjphAlert`.

### Sea alert formulas

With `maxSla = atd_origin + sla`, `maxTjph = atd_origin + tjph`
(durations via existing `parseDurationSafe`):

- **Sea Reservation** — `actual_ship_name` empty AND completion empty AND
  `now > atd_origin + n` AND `atd_sailing`/`ata_sailing` empty.
- **Potential SLA / TJPH Breach** — completion empty AND
  `ata_sailing + m > maxSla` / `maxTjph`.
- **SLA / TJPH Breach** — `(completionTime ?? now) > maxSla` / `maxTjph`.
- **SPX SLA / TJPH Alert** — `(trip_completed ?? now) > maxSla` / `maxTjph`.
- **OTP** — Air formula unchanged (weighted by `gross_weight`), using the sea
  completion field.
- VOID rows (completion field == 'VOID') excluded, as in Air.
- `n_hours` / `m_hours` general params shared with Air.

### Enrichment

- SLA/TJPH: reuse `enrichRowsWithSlaLookup` unchanged (sea `origin`/
  `destination` values already match `origin_dc`/`destination_dc` format).
- Reservasi (trackingan SMU) and offload enrichment: skipped for Sea.

### Profile resolution & endpoints

All existing dynamic `:tableName` endpoints are reused — no new routes.
The service resolves the profile from the table name: new general param
`sea_sla_table_name` (default `air_shipments_compileseanonjava`, seeded by
migration; same pattern as `reservasi_table_name`); any other table → AIR
profile. `reservasiKapal` joins the `ALERT_TYPES` array, so the
`alertFilter` query param and the exclude/restore DTOs (which validate
against `ALERT_TYPES`) accept it automatically; the service additionally
rejects alert types not enabled in the resolved profile (e.g.
`flightTracking` on the sea table).

### Exclusions

New migration: `ALTER TABLE IF EXISTS air_shipments_compileseanonjava ADD
COLUMN IF NOT EXISTS excluded_reasons JSONB` (exact precedent: CGK migration
`20260526000001-add-excluded-reasons.ts`). All exclude/restore per-row,
exclude/restore by LT, and the Excluded listing then work unchanged.

### Column layout & export

- Column layout is currently one app-wide general param
  (`sla_column_layout`); Sea gets its own key `sea_sla_column_layout`
  (seed migration) selected via a `mode` param on the layout endpoints.
- Excel export: builder takes the profile — "Active Alert" + "Exclude"
  sheets as in Air, without the AWB/flight-tracking section for Sea.

## Frontend design

### Routing & tabs

- `app/(dashboard)/sla/layout.tsx` — `read.sla` guard (moved from the current
  page) + static tab bar **Air | Sea** (same visual pattern as the Air
  Shipments tab strip).
- `/sla` redirects to `/sla/air`; `sla/air/page.tsx` and `sla/sea/page.tsx`
  render `SlaPage` with their mode config. Sidebar unchanged (`/sla` link;
  active-state matching already covers sub-paths).

### Centralized mode config — `sla-mode.config.ts`

The alert taxonomy is currently triplicated (`ALERT_CARDS` in
DashboardAlertCards, `ALERT_OPTIONS`/labels/colors in SlaPage, `ALERT_COLS`
in RouteAlertTable). One config module now declares, per mode: `tableName`,
alert list (key, label, badge color), `hasFlightTracking`, column-layout key,
sync sheet key for the socket auto-refresh (`compileaircgk` /
`compileseanonjava`), and default/frozen table columns. All three components
consume it via props.

### `SlaPage` takes a `mode` prop

Hardcoded `TABLE_NAME` removed. For Sea: 7 alert cards + OTP card; the
Flight Tracking UI paths (OffloadedAwbTable, EvidenceModal, the
flightTracking-specific toolbar hiding) are not rendered. Everything else is
identical: Alerts by Route, Active/Excluded tabs, search, route filter,
exclude per-row + by-LT, restore, batch lock/delete, column config
(drag/pin), Excel export, sync badge. Sea default columns come from the sea
sheet fields (`date`, `lt_number`, `to_number` frozen — same as Air; plus
`origin`, `destination`, `actual_ship_name`, `atd_sailing`, `ata_sailing`,
`trip_completed`, …).

## Error handling / degradation

- Route missing from the Data sheet → SLA/TJPH alerts and OTP skip that row
  (identical to Air).
- Unparseable date → the affected rule is skipped for that row.
- Sea table not yet created (never synced) → same error behavior as any
  dynamic table today.

## Testing

1. Evaluator unit tests: AIR-profile regression fixtures (CGK-shaped rows →
   byte-identical results pre/post refactor) + per-rule SEA tests (empty ship
   name guards, potential breach via `ata_sailing`, SPX via `trip_completed`,
   VOID, exclusions).
2. Light service tests: profile resolution from table name; rejection of
   alert filters not enabled in the profile.
3. Manual end-to-end verification on `/sla/sea` with live data, reconciling
   card numbers against manual SQL.

## Out of scope

- Filling sea routes into the `air_shipments_data` Data sheet (ops task).
- Adding `@Authorize` to the Air endpoints that currently lack it
  (pre-existing gap, noted for a separate change).
- Any offload/flight-tracking analog for sea vessels.
