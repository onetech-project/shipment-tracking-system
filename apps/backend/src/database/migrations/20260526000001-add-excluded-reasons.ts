import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddExcludedReasons20260526000001 implements MigrationInterface {
  name = 'AddExcludedReasons20260526000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_cgk
        ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_sda
        ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_sda
        DROP COLUMN IF EXISTS excluded_reasons;
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_cgk
        DROP COLUMN IF EXISTS excluded_reasons;
    `)
  }
}
