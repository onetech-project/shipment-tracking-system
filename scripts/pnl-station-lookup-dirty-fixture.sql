-- Proves the station lookup actually fires, by reproducing the production defect locally.
-- Local data is clean, so we blank the sheet columns for one DC pair inside a transaction,
-- refresh the view, and check what survives. Everything is rolled back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/pnl-station-lookup-dirty-fixture.sql
--
-- BEFORE the migration checks 1-3 FAIL (station lost, SG Incoming cost lost).
-- AFTER the migration checks 1-3 PASS, because the DC pair resolves from air_shipments_data.
--
-- A second scenario (checks 4-5) also removes the DC pair from air_shipments_data, so
-- neither source can resolve the station: those rows must get issue = 'station_mapping_missing'
-- and still stay in the P&L (revenue counted), rather than vanishing or erroring.
--
-- REFRESH MATERIALIZED VIEW (non-concurrent) is transactional; the CONCURRENTLY form is not,
-- so it must not be used here.

\pset pager off
BEGIN;

-- Kosambi DC -> Aceh DC: 1,019 compile rows, and Jabo -> Aceh has an SG Incoming rate,
-- so the cost check below is not vacuous.
UPDATE air_shipments_compileaircgk
SET extra_fields = extra_fields - 'origin_station' - 'destination_station'
WHERE extra_fields->>'origin' = 'Kosambi DC'
  AND extra_fields->>'destination' = 'Aceh DC';

REFRESH MATERIALIZED VIEW v_pnl_to;

\echo '== CHECK 1: the route survives the sheet being empty (want rows=1019) =='
SELECT count(*) AS rows,
       CASE WHEN count(*) = 1019 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE origin_station = 'Jabo' AND dest_station = 'Aceh';

\echo '== CHECK 2: no row is left without a station (want 0) =='
SELECT count(*) AS rows_without_station,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE origin_station IS NULL OR dest_station IS NULL;

\echo '== CHECK 3: SG Incoming cost still resolves (want 1019) =='
-- This is the check that catches a consumer still reading the raw column: the sgi join keys on
-- the station, so if base still read the unresolved value this would come back 0.
SELECT count(cost_sg_in_to) AS rows_with_sg_in_cost,
       CASE WHEN count(cost_sg_in_to) = 1019 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE awb IN (
  SELECT awb FROM air_shipments_compileaircgk
  WHERE extra_fields->>'origin' = 'Kosambi DC' AND extra_fields->>'destination' = 'Aceh DC'
) AND origin_station = 'Jabo' AND dest_station = 'Aceh';

ROLLBACK;

\echo '== rolled back; verifying the view is intact (want 66203 rows, 0 without station) =='
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE origin_station IS NULL) AS without_station
FROM v_pnl_to;

-- Second scenario: blank the sheet AND remove the DC pair from the master, so the lookup
-- has nowhere left to resolve the station from. Everything is rolled back.
BEGIN;

-- Kosambi DC -> Aceh DC: same 1,019 compile rows as above, but now the master has no row
-- for this pair either, so neither source can supply a station.
UPDATE air_shipments_compileaircgk
SET extra_fields = extra_fields - 'origin_station' - 'destination_station'
WHERE extra_fields->>'origin' = 'Kosambi DC'
  AND extra_fields->>'destination' = 'Aceh DC';

DELETE FROM air_shipments_data
WHERE origin_dc = 'Kosambi DC' AND destination_dc = 'Aceh DC';

REFRESH MATERIALIZED VIEW v_pnl_to;

-- Of the 1019 rows with no station, most (889) already carry 'no_booking' for their AWB --
-- a pre-existing, unrelated issue in this local dataset. 'no_booking' outranks
-- 'station_mapping_missing' in the CASE chain (root-cause-first, see the migration), so
-- those 889 keep showing 'no_booking' by design; only the remaining 130 rows -- the ones
-- that clear every earlier branch -- surface 'station_mapping_missing'. That is exactly the
-- set a mis-ordered CASE chain would corrupt, so it is what this check targets.
\echo '== CHECK 4: rows with no station and no earlier-ranked issue report station_mapping_missing (want 130) =='
SELECT count(*) AS rows,
       CASE WHEN count(*) = 130 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE awb IN (
  SELECT awb FROM air_shipments_compileaircgk
  WHERE extra_fields->>'origin' = 'Kosambi DC' AND extra_fields->>'destination' = 'Aceh DC'
) AND origin_station IS NULL AND dest_station IS NULL AND issue = 'station_mapping_missing';

\echo '== CHECK 5: those rows still carry revenue, i.e. still counted in the P&L (want count=1019, revenue>0) =='
SELECT count(*) AS rows, SUM(revenue_total) AS revenue,
       CASE WHEN count(*) = 1019 AND SUM(revenue_total) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM v_pnl_to WHERE awb IN (
  SELECT awb FROM air_shipments_compileaircgk
  WHERE extra_fields->>'origin' = 'Kosambi DC' AND extra_fields->>'destination' = 'Aceh DC'
) AND origin_station IS NULL AND dest_station IS NULL;

ROLLBACK;

\echo '== rolled back; verifying the database is intact (want 66203 rows, 0 without station, 76 air_shipments_data rows) =='
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE origin_station IS NULL) AS without_station
FROM v_pnl_to;

SELECT count(*) AS air_shipments_data_rows FROM air_shipments_data;
