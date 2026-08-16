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
SELECT count(*) AS rows_without_station
FROM v_pnl_to WHERE origin_station IS NULL OR dest_station IS NULL;

\echo '== 7. view output shape (names and order must be identical) =='
SELECT ordinal_position, column_name
FROM information_schema.columns
WHERE table_name = 'v_pnl_to' ORDER BY ordinal_position;
