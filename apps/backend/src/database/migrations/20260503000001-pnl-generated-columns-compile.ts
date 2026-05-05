import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlGeneratedColumnsCompile20260503000001 implements MigrationInterface {
  name = 'PnlGeneratedColumnsCompile20260503000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS awb             TEXT    GENERATED ALWAYS AS (extra_fields->>'awb') STORED,
        ADD COLUMN IF NOT EXISTS to_number       TEXT    GENERATED ALWAYS AS (extra_fields->>'to_number') STORED,
        ADD COLUMN IF NOT EXISTS gross_weight    NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'gross_weight', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS amount_revenue  NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'amount_revenue', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS packing_kayu    NUMERIC GENERATED ALWAYS AS (
          COALESCE(REPLACE(extra_fields->>'additional_amount_packing_kayu', ',', '')::NUMERIC, 0)
        ) STORED,
        ADD COLUMN IF NOT EXISTS completed_time  TEXT    GENERATED ALWAYS AS (extra_fields->>'completed_time') STORED,
        ADD COLUMN IF NOT EXISTS origin_station  TEXT    GENERATED ALWAYS AS (extra_fields->>'origin_station') STORED,
        ADD COLUMN IF NOT EXISTS dest_station    TEXT    GENERATED ALWAYS AS (extra_fields->>'destination_station') STORED,
        ADD COLUMN IF NOT EXISTS cycle_period    TEXT    GENERATED ALWAYS AS (
          CASE WHEN extra_fields->>'completed_time' IS NULL OR extra_fields->>'completed_time' = ''
               THEN NULL
               ELSE SUBSTRING(extra_fields->>'completed_time', 8, 4) ||
                    '-' ||
                    CASE SUBSTRING(extra_fields->>'completed_time', 4, 3)
                      WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' WHEN 'Mar' THEN '03'
                      WHEN 'Apr' THEN '04' WHEN 'May' THEN '05' WHEN 'Jun' THEN '06'
                      WHEN 'Jul' THEN '07' WHEN 'Aug' THEN '08' WHEN 'Sep' THEN '09'
                      WHEN 'Oct' THEN '10' WHEN 'Nov' THEN '11' WHEN 'Dec' THEN '12'
                      ELSE '00'
                    END ||
                    CASE WHEN (SUBSTRING(extra_fields->>'completed_time', 1, 2))::INTEGER <= 15
                         THEN '-1H' ELSE '-2H' END
          END
        ) STORED
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_awb            ON air_shipments_compileaircgk(awb)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_to_number      ON air_shipments_compileaircgk(to_number)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle          ON air_shipments_compileaircgk(cycle_period)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle_awb      ON air_shipments_compileaircgk(cycle_period, awb)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_completed_time ON air_shipments_compileaircgk(completed_time)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_completed_time`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle_awb`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_to_number`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_awb`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS awb,
        DROP COLUMN IF EXISTS to_number,
        DROP COLUMN IF EXISTS gross_weight,
        DROP COLUMN IF EXISTS amount_revenue,
        DROP COLUMN IF EXISTS packing_kayu,
        DROP COLUMN IF EXISTS completed_time,
        DROP COLUMN IF EXISTS origin_station,
        DROP COLUMN IF EXISTS dest_station,
        DROP COLUMN IF EXISTS cycle_period
    `)
  }
}
