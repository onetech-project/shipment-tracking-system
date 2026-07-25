# Barhal 3-Tab Restructure Design

## Context

The Barhal wizard redesign (`feature/barhal-menu`, spec `2026-07-24-barhal-wizard-redesign-design.md`) just landed: a 4-step wizard (Create Koli → Choose TO → Manage Weight → Input SMU) plus a single list page and dashboard page.

This follow-up restructures the `/barhal` menu into 3 tabs — **Koli**, **SMU**, **Dashboard** — before that branch is merged. SMU data entry moves out of the wizard into its own dedicated tab with an inline-editable table, a bulk-apply form, and a new aggregated SMU list. The Dashboard tab gains KPI cards, a comparison chart, and two new recap tables.

No new tables or migrations are required — this is entirely a reshaping of existing `barhal_koli` / `barhal_koli_to` data plus a read-only join into the pre-existing `air_shipments_smu_rate_cgk_spx` table.

## Routes

Three separate routes (bookmarkable, consistent with the existing `/barhal/dashboard` route):
- `/barhal/koli` — Koli tab (list + wizard)
- `/barhal/smu` — SMU tab
- `/barhal/dashboard` — Dashboard tab (existing route, extended)

`/barhal` redirects to `/barhal/koli`. A shared tab-nav component renders on all three pages.

## Tab 1 — Koli

Unchanged from the current implementation except:
- Wizard drops **Step 4 (Input SMU)**. Wizard becomes 3 steps: Create Koli → Choose TO → Manage Koli & Weight.
- `isKoliIncomplete()` / `nextStepFor()` in `BarhalKoliWizard.tsx` stop checking SMU fields (`smu_number`, etc.) for wizard-completeness/resume logic — a Koli is now "complete" once weight/dimensions/batang kayu are filled.
- List table columns unchanged: #, No Koli, Total TO, Weight Before, Weight After, Origin, Destination, Action.

No backend changes needed for this tab — `createKoliShell`, `attachTos`, `updatePacking` all reused as-is.

## Tab 2 — SMU

### Filter + inline-editable table
Filters: Koli Date, Destination. Table columns: Date, Destination, No Koli, Airlines (editable), Flight No (editable), STD (editable), STA (editable), SMU (editable), Action.

Row starts read-only; clicking **Edit** enables the 5 editable cells and swaps the Action button to **Save**. Save calls the existing `PATCH koli/:id/smu` endpoint (per-Koli, partial update, blank fields don't overwrite — already implemented). This is a straightforward list built on the existing `GET koli` endpoint (filtered by date/dest) plus per-row `useUpdateSmu`.

### Bulk Input SMU form
Fields: Date, Origin, Destination, Airlines, Flight No, STD, STA, No SMU. Calls the existing `PATCH koli/bulk-smu` endpoint, which already applies Date+Destination-scoped bulk updates (Origin is included in the form for user clarity/filtering but the existing bulk endpoint's matching key is Date+Destination, matching current behavior — no backend change).

### List SMU table (new)
Aggregated by `smu_number` (Koli rows with a null `smu_number` are excluded from this table — they haven't been assigned an SMU yet, and remain visible only in the inline-editable table above). Columns: Date, Origin, Destination, Total Koli, Total TO, No SMU, Airlines, Flight No, STD, STA, chWt Airlines.

**chWt Airlines** is computed by summing `air_shipments_smu_rate_cgk_spx.chwt` for every distinct AWB across all TOs attached to every Koli in the SMU group (reusing the existing `barhal_koli_to.awb = air_shipments_smu_rate_cgk_spx.awb` join already used in `barhal.service.ts`'s dashboard/CSV code — there is no "SMU number" column on the rate table, so grouping happens on the Barhal side, then AWBs within the group are matched to rates). If none of the group's AWBs have a matching rate row, the cell renders **"SMU Rate belum diupdate"** instead of a number.

New backend endpoint: `GET barhal/smu-list?date=&origin=&dest=`. Response per SMU group:
```
{ smuNumber, date, originName, destName, totalKoli, totalTo, airlines, flightNo, std, sta, chwt: number | null }
```
`chwt: null` signals "belum diupdate" to the frontend.

## Tab 3 — Dashboard

Same filters as today (From Date, To Date, Origin, Destination), extended response from the existing `GET barhal/dashboard` endpoint:

- **KPI cards**: Total Koli, Total TO Barhal, Total Weight Before, Total Weight After, Total Variance (`weight_before − weight_after` summed), Total Batang Kayu.
- **Chart**: Weight Before vs Weight After vs chWt Airlines, grouped by date (reuses the same AWB→rate join as the SMU list, aggregated per date across the filtered range).
- **Tabel Rekap Batang Kayu**: Date, Total Koli, Total P, Total L, Total T, Total Volume, Total Batang Kayu (sums of `length_cm`/`width_cm`/`height_cm`/`volume`/`batang_kayu` grouped by date).
- **Tabel Rekap Koli Pertanggal**: Date, Total TO, Total Koli, Total Weight Before, Total Weight After, chWt Airlines, Total Variance, Total Variance in Percent (`variance / weight_before * 100`), Add. Revenue (`total_P * total_L * total_T * 1000`). **`status` column is deferred** — omitted from this iteration pending a follow-up decision on its definition.

No new endpoint; `GET barhal/dashboard` response grows to include `kpi`, `chartByDate`, `recapBatangKayu`, `recapPerDate` blocks alongside the existing per-origin/dest breakdown.

## Out of scope

- Defining the `status` logic for Rekap Koli Pertanggal (explicitly deferred by the user).
- Any change to `air_shipments_smu_rate_cgk_spx` itself (read-only join, no migration).
- Any change to permissions (`READ_BARHAL`/`CREATE_BARHAL` reused throughout).
