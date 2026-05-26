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
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileaircgk') THEN
          ALTER TABLE air_shipments_compileaircgk ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileaircgk') THEN
          ALTER TABLE air_shipments_compileaircgk DROP COLUMN IF EXISTS excluded_reasons;
        END IF;
      END $$;
    `)
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
