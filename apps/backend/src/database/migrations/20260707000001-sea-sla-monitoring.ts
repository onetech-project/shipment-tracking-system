import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeaSlaMonitoring20260707000001 implements MigrationInterface {
  name = 'SeaSlaMonitoring20260707000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sea table is created dynamically by the sheet sync; guard for fresh envs.
    // The sea table name is a code constant (SEA_SLA_TABLE_NAME), so no param seed here.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava DROP COLUMN IF EXISTS excluded_reasons;
        END IF;
      END $$;
    `)
  }
}
