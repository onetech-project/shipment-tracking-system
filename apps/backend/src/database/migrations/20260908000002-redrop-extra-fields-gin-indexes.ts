import { MigrationInterface, QueryRunner } from 'typeorm'

// Re-drops the extra_fields GIN indexes that 20260901000001 already dropped once.
//
// That migration was correct but did not hold: DynamicTableService.ensureTable recreated the
// index for every sheet table, and it runs on scheduler boot and on every sheet-config write.
// So the indexes were back within a tick of the migration completing — verified locally, where
// 20260901000001 shows as applied and idx_air_shipments_compileaircgk_extra_gin is nonetheless
// present at 27 MB with idx_scan = 0.
//
// The recreate is removed in the same change as this migration (ensureTable now drops instead
// of creating), so this is the half that clears what earlier deploys left behind. A migration
// rather than relying on ensureTable's drop, because that path only visits tables that are
// still attached to an enabled sheet config.
//
// No index here has ever been scanned: every query reads the jsonb with `->>`, which GIN cannot
// serve — it answers containment (@>) and key-existence (?) only.
export class RedropExtraFieldsGinIndexes20260908000002 implements MigrationInterface {
  name = 'RedropExtraFieldsGinIndexes20260908000002'

  private static readonly INDEXES: [string, string][] = [
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [index] of RedropExtraFieldsGinIndexes20260908000002.INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index}`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [index, table] of RedropExtraFieldsGinIndexes20260908000002.INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING gin (extra_fields)`
      )
    }
  }
}
