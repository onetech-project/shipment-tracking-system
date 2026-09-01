import { MigrationInterface, QueryRunner } from 'typeorm'

// Drops indexes that no query uses but that every write has to maintain.
//
// Context: the sync loop's no-change detection was broken (it compared sheet
// headers, which live in extra_fields, against top-level columns that are always
// undefined), so every row was rewritten on every 15s tick — 92M updates against
// 66K rows on air_shipments_compileaircgk. That is fixed separately in
// AirShipmentsService. This migration removes the indexes that made each of those
// writes more expensive than it needed to be.
//
// The GIN indexes on extra_fields are the main cost: GIN keeps a pending list that
// is flushed using work_mem, so a jsonb column indexed with GIN turns every UPDATE
// into index maintenance. pg_stat_user_indexes shows idx_scan = 0 for all of them.
//
// One caveat that shaped this list: idx_air_shipments_compileaircgk_extra_gin WAS
// reachable — resolveDateExpr ran `WHERE extra_fields ? 'date'`, which the planner
// answered with a bitmap scan over all 66K rows (~9ms, 39 buffers) purely to return
// a boolean. That probe now reads a single row instead, so the index has no
// remaining reader.
//
// NOT dropped, despite idx_scan = 0:
//   - idx_v_pnl_to_id — REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique
//     index on the matview. Dropping it breaks the refresh.
//   - every *_pkey and unique constraint — they enforce correctness (and the
//     ON CONFLICT targets the sync depends on), not read performance.
//   - small btrees on low-traffic tables (users, organizations, invitations, …) —
//     they cost nothing to maintain and exist for queries that are simply rare.
//
// The v_pnl_to indexes below are recreated by any later migration that rebuilds the
// matview, so this drop applies to the current view only.
export class DropUnusedWriteAmplifyingIndexes20260901000001 implements MigrationInterface {
  name = 'DropUnusedWriteAmplifyingIndexes20260901000001'

  // GIN on extra_fields — zero reads, maximum write cost.
  private static readonly GIN_INDEXES: [string, string][] = [
    ['idx_air_shipments_compileaircgk_extra_gin', 'air_shipments_compileaircgk'],
    ['idx_air_shipments_compileseanonjava_extra_gin', 'air_shipments_compileseanonjava'],
    ['idx_air_shipments_smu_rate_cgk_spx_extra_gin', 'air_shipments_smu_rate_cgk_spx'],
    ['idx_air_shipments_smu_extra_gin', 'air_shipments_smu'],
    ['idx_air_shipments_data_extra_gin', 'air_shipments_data'],
    ['idx_air_shipments_sg_outgoing_extra_gin', 'air_shipments_sg_outgoing'],
    ['idx_air_shipments_ra_extra_gin', 'air_shipments_ra'],
    ['idx_air_shipments_sg_incoming_extra_gin', 'air_shipments_sg_incoming'],
    ['idx_air_shipments_tracking_smu_extra_gin', 'air_shipments_tracking_smu'],
  ]

  // Redundant btrees. completed_time is a text column that the PnL queries never
  // filter on directly — they use the cycle_* / date_* columns — and it sits on the
  // hottest-write table in the schema.
  private static readonly BTREE_INDEXES: [string, string][] = [
    ['idx_compile_completed_time', 'air_shipments_compileaircgk(completed_time)'],
    ['idx_v_pnl_to_completed_time', 'v_pnl_to(completed_time)'],
    ['idx_v_pnl_to_cycle_awb', 'v_pnl_to(cycle_period, awb)'],
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [index] of DropUnusedWriteAmplifyingIndexes20260901000001.GIN_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index}`)
    }
    for (const [index] of DropUnusedWriteAmplifyingIndexes20260901000001.BTREE_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index}`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [index, table] of DropUnusedWriteAmplifyingIndexes20260901000001.GIN_INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING gin (extra_fields)`
      )
    }
    for (const [index, target] of DropUnusedWriteAmplifyingIndexes20260901000001.BTREE_INDEXES) {
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS ${index} ON ${target}`)
    }
  }
}
