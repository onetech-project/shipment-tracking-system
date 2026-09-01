import { MigrationInterface, QueryRunner } from 'typeorm'

// Indexes the date column the SLA pages filter on.
//
// Context: every SLA request filters air_shipments_compileaircgk by an atd_origin
// date range. The predicate was built over the raw JSONB —
//
//   (CASE WHEN NULLIF(TRIM(extra_fields->>'atd_origin'),'') ~ '^\d{4}-\d{2}-\d{2}...'
//         THEN ...::timestamptz END) BETWEEN $1 AND $2
//
// — which no index can answer, so Postgres seq-scanned all 279,951 rows, parsing
// JSONB and running a regex per row, just to decide the date range. The SLA page
// issues two such scans per load (sla-overview + the table read), which is what
// made the page take ~1-2 minutes.
//
// air_shipments_compileaircgk already carries date_atd, a STORED generated column
// holding pnl_parse_date(extra_fields->>'atd_origin') — precisely the value that
// expression computed. AirShipmentsService now filters on the bare column, so a
// plain btree turns the range into an index scan.
//
// Safe substitution: pnl_parse_date accepts a superset of the ISO regex it replaces
// (ISO first, then 'DD-Mon-YYYY', EXCEPTION → NULL), so no row the old predicate
// matched is dropped. Rows whose atd_origin is unparseable are NULL in both.
//
// Build note: this is a plain CREATE INDEX, not CONCURRENTLY. The data source runs
// migrations with migrationsTransactionMode: 'all', and TypeORM rejects any
// migration that overrides the transaction mode under that setting
// (ForbiddenTransactionModeOverrideError) — which would block every pending
// migration, not just this one. A plain build takes an ACCESS EXCLUSIVE lock on the
// table for the duration; on ~280K rows that is seconds, but it does block the 15s
// sync loop's writes while it runs, so prefer a low-traffic window. To build it
// without the lock instead, run this by hand outside the migration runner:
//   CREATE INDEX CONCURRENTLY idx_compile_date_atd
//     ON air_shipments_compileaircgk(date_atd);
// and this migration's IF NOT EXISTS will then be a no-op.
export class IndexCompileDateAtd20260902000001 implements MigrationInterface {
  name = 'IndexCompileDateAtd20260902000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_compile_date_atd
         ON air_shipments_compileaircgk(date_atd)`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_date_atd`)
  }
}
