# Barhal Koli — 4-step wizard redesign

## Background

Barhal ("barang mahal") is wood-crate packing for high-value shipments. A prior branch
(`feature/barhal-menu`) implemented a single-modal "create Koli in one shot" flow. This spec
replaces it with the multi-step flow used operationally today (reference: `Code.gs` / `Index.txt`,
a Google Apps Script prototype), driven by TOs sourced from `air_shipments_compileaircgk`.

Flow: user creates a Koli shell (date + origin + destination), attaches Barhal-flagged TOs to it,
records post-packing weight/dimensions/wood-plank count, then records SMU/flight info (optionally
bulk-applied across every Koli sharing the same date + destination).

## Data model

### `air_shipments_compileaircgk` — new generated columns

Same `extra_fields->>'key' STORED` pattern as the table's existing generated columns.

```sql
ALTER TABLE air_shipments_compileaircgk
  ADD COLUMN IF NOT EXISTS remarks    TEXT GENERATED ALWAYS AS (extra_fields->>'remarks') STORED,
  ADD COLUMN IF NOT EXISTS lt_number  TEXT GENERATED ALWAYS AS (extra_fields->>'lt_number') STORED;
```

`remarks` drives Barhal-eligibility (`remarks ILIKE '%barhal%'`); `lt_number` is a display-only
column for the TO list. Vendor is not a sheet column — it's rendered as the constant `"ESP"`.

### `barhal_koli` — replaces `route`/`origin_code`/`dest_code` with plain names

```sql
ALTER TABLE barhal_koli
  DROP COLUMN route,
  DROP COLUMN origin_code,
  DROP COLUMN dest_code,
  ADD COLUMN origin_name   TEXT NOT NULL,
  ADD COLUMN dest_name     TEXT NOT NULL,
  ADD COLUMN batang_kayu   INTEGER,
  ADD COLUMN smu_number    TEXT,
  ADD COLUMN airlines      TEXT,
  ADD COLUMN flight_no     TEXT,
  ADD COLUMN std           TIMESTAMPTZ,
  ADD COLUMN sta           TIMESTAMPTZ;

ALTER TABLE barhal_koli ALTER COLUMN weight_before DROP NOT NULL, ALTER COLUMN weight_before DROP DEFAULT;
ALTER TABLE barhal_koli ALTER COLUMN weight_after  DROP NOT NULL, ALTER COLUMN weight_after  DROP DEFAULT;
-- total_to, weight_before/after start at 0/null on the empty shell created in Step 1.

DROP INDEX IF EXISTS idx_barhal_koli_route;
CREATE INDEX idx_barhal_koli_origin_dest ON barhal_koli(origin_name, dest_name);
```

- `origin_name`/`dest_name`: `origin_station`/`dest_station` text with a trailing `" DC"` (or
  bare `"DC"`) suffix stripped and whitespace collapsed — mirrors `destShort()` in `Code.gs`.
- `koli_number` format: `` `${d}${MonAbbr}-${origin_name}-${dest_name}-Barhal${n}` `` (e.g.
  `1Jun-Kosambi-Badung-Barhal1`). `n` is the next unused sequence for
  `(koli_date, origin_name, dest_name)` — replaces the old `(koli_date, route)` scoping.
  `sequence_no` and its unique constraint are re-scoped to `(koli_date, origin_name, dest_name)`.
- `volume` formula changes from `l*w*h` to `l*w*h/6000` (matches the Apps Script "Volume" figure).

### `barhal_koli_to` — drop per-line SMU snapshot

```sql
ALTER TABLE barhal_koli_to
  DROP COLUMN smu_account,
  DROP COLUMN smu_airlines,
  DROP COLUMN smu_flight_date,
  DROP COLUMN smu_flight_number;
```

SMU is entered once per Koli (Step 4), not per TO. The dashboard's ChWt aggregate still joins
`air_shipments_smu_rate_cgk_spx` live by `awb` (unchanged), independent of the manually-entered
`smu_number`.

### Migration ordering

One new migration file (named at implementation time, following the repo's `YYYYMMDDHHMMSS-`
convention), doing all of the above in a single `up()`/`down()` pair (the feature is still
unreleased on `feature/barhal-menu`, so no backward-compat shim for the old shape is needed —
`down()` restores the original columns).

## Backend API (`BarhalController`, prefix `/barhal`)

| Method | Path | Step | Body / Query | Behavior |
|---|---|---|---|---|
| GET | `/barhal/available-tos` | 2 | `search?, date?, origin?, dest?` | Barhal-only (`remarks`), not yet packed; all four filters applied server-side (today's `date` param is currently a no-op — this fixes it) |
| POST | `/barhal/koli` | 1 | `{koliDate, origin, dest}` | Creates empty shell, generates `koli_number`, returns it with `total_to: 0`, weights null |
| PUT | `/barhal/koli/:id/tos` | 2 | `{toNumbers: string[]}` | Attaches lines (409 if any TO already packed elsewhere), recomputes `weight_before`/`total_to` |
| PATCH | `/barhal/koli/:id/packing` | 3 | `{weightAfter, lengthCm, widthCm, heightCm, batangKayu}` | Sets weight_after + PLT + batang_kayu, recomputes `volume` |
| PATCH | `/barhal/koli/:id/smu` | 4 | `{smuNumber?, airlines?, flightNo?, std?, sta?}` | Per-koli; omitted/blank fields leave existing values untouched |
| PATCH | `/barhal/koli/bulk-smu` | 4 | `{koliDate, dest, smuNumber?, airlines?, flightNo?, std?, sta?}` | Same no-overwrite-on-blank rule, applied to every Koli where `koli_date` + `dest_name` match |
| GET | `/barhal/koli` | — | `search?, date?, origin?, dest?, page?, pageSize?` | List/filter; `origin`/`dest` filters added |
| GET | `/barhal/koli/:id` | — | — | Detail + lines (unchanged) |
| GET | `/barhal/dashboard` | — | `startDate?, endDate?, origin?, dest?` | Totals/per-route/drill-down regrouped by `(origin_name, dest_name)` instead of `route` |
| GET | `/barhal/export.csv` | — | same as dashboard | Unchanged shape, columns re-sourced from the new fields |

`createKoli`'s existing advisory-lock + retry-on-unique-violation pattern (`BarhalService`)
carries over unchanged, just re-keyed on `(koliDate, originName, destName)` instead of
`(koliDate, route)`.

Permissions: same `READ_BARHAL`/`CREATE_BARHAL` guards as today, applied per new endpoint.

## Frontend

`TambahKoliModal` is replaced by a 4-step wizard component with a stepper header. Each step's
"next" action calls its corresponding endpoint immediately (no client-side draft state spanning
steps) — so a user can close the wizard mid-flow and resume later from the list page.

- **Step 1 — Buat Koli**: Tanggal (date), Origin (dropdown, distinct `origin_station` values from
  available TOs), Destinasi (dropdown) → live `koli_number` preview → "Buat Koli" → advances to
  Step 2 with the created koli id.
- **Step 2 — TO**: filter bar (search box, date picker, origin dropdown, dest dropdown) over
  `GET /barhal/available-tos` (Barhal-only); checkbox list, "Pilih Semua"/"Kosongkan"; preview
  table of selected TOs with a running count + total gross weight; "Lanjut" → `PUT .../tos`.
- **Step 3 — Kelola Koli & Berat**: read-only Berat Sebelum (from Step 2's attached TOs); input
  Berat Setelah Packing Kayu → live Kenaikan (`after - before`); inputs Panjang/Lebar/Tinggi (cm)
  → live Volume `(P×L×T)/6000`; input Jumlah Batang Kayu; "Simpan" → `PATCH .../packing`.
- **Step 4 — Input SMU**: per-koli fields (Nomor SMU, Airlines, Flight No, STD, STA); a "Bulk
  Apply" panel — pick Tanggal + Destinasi, fill any subset of fields, blank fields don't overwrite
  — lists every Koli in that group and applies to all via `PATCH .../bulk-smu`.

List page (`/barhal`): columns become Date, Origin, Dest, LT Number, TO Number, Gross Weight,
Remarks (per-TO, drilling into a Koli's lines) alongside the existing Koli-level table
(koli_number, origin, dest, total_to, weight_before/after). A Koli missing weight_after, PLT, or
SMU shows "Lanjutkan" (reopens the wizard at its next incomplete step) instead of "Edit".

Dashboard (`/barhal/dashboard`): unchanged stat cards / bar chart / drill-down / CSV export,
regrouped by `(origin_name, dest_name)` instead of the old `route` string; origin/dest filter
dropdowns replace the single route dropdown.

## Out of scope

- Historical Koli rows created under the old schema (branch is unreleased — no migration-of-data
  needed, only schema).
- `remarks`/`lt_number` backfill for already-synced sheet rows — the generated columns compute
  from `extra_fields` already stored, so no backfill job is needed; they populate on next read.
- Any change to how `air_shipments_smu_rate_cgk_spx`/ChWt aggregation works on the dashboard.
