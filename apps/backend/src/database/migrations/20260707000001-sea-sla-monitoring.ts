import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeaSlaMonitoring20260707000001 implements MigrationInterface {
  name = 'SeaSlaMonitoring20260707000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sea table is created dynamically by the sheet sync; guard for fresh envs.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value")
      VALUES ('sea_sla_table_name', 'Nama Tabel Sheet SLA Laut', 'air_shipments_compileseanonjava')
      ON CONFLICT ("key") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'sea_sla_table_name'`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava DROP COLUMN IF EXISTS excluded_reasons;
        END IF;
      END $$;
    `)
  }
}
