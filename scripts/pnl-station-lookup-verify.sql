-- Invariants the station-lookup migration must not move.
-- Run before the migration, save the output, run again after, and diff the two.
--   psql "$DATABASE_URL" -f scripts/pnl-station-lookup-verify.sql
-- On clean data (lookup and sheet agree everywhere) every number must be identical.
-- On dirty data (June-August, stations absent) the route/cost lines are EXPECTED to move --
-- that is the fix working; read the row count and the Tanjung Pinang line as the fan-out guard.

\pset pager off

\echo '== 1. row count (fan-out guard: must never grow) =='
SELECT count(*) AS total_rows FROM v_pnl_to;

\echo '== 2. Tanjung Pinang fan-out guard (DC pair is duplicated across Air/Sea in the master) =='
SELECT count(*) AS tanjung_pinang_rows
FROM v_pnl_to WHERE dest_station = 'Tanjung Pinang';

\echo '== 3. totals per route =='
SELECT origin_station, dest_station,
       count(*)                        AS rows,
       count(DISTINCT awb)             AS awbs,
       round(COALESCE(SUM(revenue_total), 0))  AS revenue,
       round(COALESCE(SUM(gross_weight), 0))   AS weight
FROM v_pnl_to
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 4. cost totals (proves awb_totals and the SG Incoming join did not shift) =='
SELECT round(COALESCE(SUM(cost_smu_awb), 0))    AS cost_smu,
       round(COALESCE(SUM(cost_ra_awb), 0))     AS cost_ra,
       round(COALESCE(SUM(cost_sg_out_awb), 0)) AS cost_sg_out,
       round(COALESCE(SUM(cost_sg_in_to), 0))   AS cost_sg_in,
       count(cost_sg_in_to)                     AS rows_with_sg_in
FROM v_pnl_to;

\echo '== 5. issue distribution =='
SELECT COALESCE(issue, '(none)') AS issue, count(*) AS rows
FROM v_pnl_to GROUP BY 1 ORDER BY 1;

\echo '== 6. rows with no station at all =='
-- Blank vs NULL must count the same on both sides of the migration: the `compile` CTE
-- converts '' to NULL, so a source row holding an empty string counts as 0 here before the
-- migration and 1 after, if compared naively -- read as a regression that isn't one.
-- BTRIM + NULLIF makes blank and NULL count alike on both sides.
SELECT count(*) AS rows_without_station
FROM v_pnl_to
WHERE NULLIF(BTRIM(origin_station), '') IS NULL OR NULLIF(BTRIM(dest_station), '') IS NULL;

\echo '== 7. view output shape (names and order must be identical) =='
-- information_schema.columns does NOT cover materialized views (PostgreSQL
-- limitation), so it silently returns 0 rows here and this check would
-- "pass" even if every column were renamed. Query the system catalogue
-- (pg_attribute/pg_class) instead -- it does cover materialized views.
SELECT a.attnum AS ordinal_position, a.attname AS column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'v_pnl_to'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

\echo '== 8. pre-deploy sanity check: air_shipments_data.service values =='
-- station_map filters WHERE service = 'Air', an exact match. If staging stores 'air', 'AIR', or
-- a trailing space, this CTE comes back empty and the migration succeeds while fixing nothing.
-- Locally this must show exactly 'Air' 55 / 'Sea' 21, with no other spellings.
SELECT service, count(*) AS rows FROM air_shipments_data GROUP BY 1 ORDER BY 1;

\echo '== 9. sheet vs master disagreement (rows where both have a station and they differ) =='
-- The design lets the master override a populated sheet value. This is the one number that
-- separates "filled a gap" from "silently rewrote a route": rows where the sheet AND the master
-- both have a non-blank station for the same DC pair (keyed the same way station_map keys its
-- join), but the values differ. Locally this must be 0 -- lookup and sheet agree everywhere.
SELECT count(*) AS rows_where_sheet_and_master_disagree
FROM air_shipments_compileaircgk c
JOIN air_shipments_data d
  ON BTRIM(d.origin_dc)      = BTRIM(c.extra_fields->>'origin')
 AND BTRIM(d.destination_dc) = BTRIM(c.extra_fields->>'destination')
 AND d.service = 'Air'
WHERE NULLIF(BTRIM(c.extra_fields->>'origin_station'), '') IS NOT NULL
  AND NULLIF(BTRIM(d.extra_fields->>'origin_station'), '') IS NOT NULL
  AND BTRIM(c.extra_fields->>'origin_station') IS DISTINCT FROM BTRIM(d.extra_fields->>'origin_station');
