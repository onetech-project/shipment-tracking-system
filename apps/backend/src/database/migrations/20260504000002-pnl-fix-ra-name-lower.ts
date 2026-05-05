import { MigrationInterface, QueryRunner } from 'typeorm'

// ra_name in air_shipments_ra is a real column written directly by the sync
// (not stored in extra_fields), so the generated column ra_name_lower must
// reference ra_name instead of extra_fields->>'ra_name'.
export class PnlFixRaNameLower20260504000002 implements MigrationInterface {
  name = 'PnlFixRaNameLower20260504000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ra_name_lower`)
    await queryRunner.query(`ALTER TABLE air_shipments_ra DROP COLUMN IF EXISTS ra_name_lower`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_ra
        ADD COLUMN ra_name_lower TEXT GENERATED ALWAYS AS (LOWER(ra_name)) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_name_lower ON air_shipments_ra(ra_name_lower)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ra_name_lower`)
    await queryRunner.query(`ALTER TABLE air_shipments_ra DROP COLUMN IF EXISTS ra_name_lower`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_ra
        ADD COLUMN ra_name_lower TEXT GENERATED ALWAYS AS (LOWER(extra_fields->>'ra_name')) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_name_lower ON air_shipments_ra(ra_name_lower)`)
  }
}
