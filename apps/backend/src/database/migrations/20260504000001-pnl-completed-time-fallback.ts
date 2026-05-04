import { MigrationInterface, QueryRunner } from 'typeorm'

// Adds ata_vendor_wh_destination as fallback when completed_time is empty.
// PostgreSQL does not allow ALTER on GENERATED ALWAYS AS STORED columns —
// must DROP and re-ADD both completed_time and cycle_period.
export class PnlCompletedTimeFallback20260504000001 implements MigrationInterface {
  name = 'PnlCompletedTimeFallback20260504000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_completed_time`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle_awb`)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS completed_time,
        DROP COLUMN IF EXISTS cycle_period
    `)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN completed_time TEXT GENERATED ALWAYS AS (
          COALESCE(
            NULLIF(extra_fields->>'completed_time', ''),
            extra_fields->>'ata_vendor_wh_destination'
          )
        ) STORED,
        ADD COLUMN cycle_period TEXT GENERATED ALWAYS AS (
          CASE
            WHEN COALESCE(
                   NULLIF(extra_fields->>'completed_time', ''),
                   NULLIF(extra_fields->>'ata_vendor_wh_destination', '')
                 ) IS NULL
            THEN NULL
            ELSE
              SUBSTRING(COALESCE(
                NULLIF(extra_fields->>'completed_time', ''),
                NULLIF(extra_fields->>'ata_vendor_wh_destination', '')
              ), 8, 4) ||
              '-' ||
              CASE SUBSTRING(COALESCE(
                     NULLIF(extra_fields->>'completed_time', ''),
                     NULLIF(extra_fields->>'ata_vendor_wh_destination', '')
                   ), 4, 3)
                WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' WHEN 'Mar' THEN '03'
                WHEN 'Apr' THEN '04' WHEN 'May' THEN '05' WHEN 'Jun' THEN '06'
                WHEN 'Jul' THEN '07' WHEN 'Aug' THEN '08' WHEN 'Sep' THEN '09'
                WHEN 'Oct' THEN '10' WHEN 'Nov' THEN '11' WHEN 'Dec' THEN '12'
                ELSE '00'
              END ||
              CASE
                WHEN (SUBSTRING(COALESCE(
                       NULLIF(extra_fields->>'completed_time', ''),
                       NULLIF(extra_fields->>'ata_vendor_wh_destination', '')
                     ), 1, 2))::INTEGER <= 15
                THEN '-1H'
                ELSE '-2H'
              END
          END
        ) STORED
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_completed_time ON air_shipments_compileaircgk(completed_time)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle          ON air_shipments_compileaircgk(cycle_period)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle_awb      ON air_shipments_compileaircgk(cycle_period, awb)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle_awb`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_cycle`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_completed_time`)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS completed_time,
        DROP COLUMN IF EXISTS cycle_period
    `)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN completed_time TEXT GENERATED ALWAYS AS (extra_fields->>'completed_time') STORED,
        ADD COLUMN cycle_period   TEXT GENERATED ALWAYS AS (
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

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_completed_time ON air_shipments_compileaircgk(completed_time)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle          ON air_shipments_compileaircgk(cycle_period)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_compile_cycle_awb      ON air_shipments_compileaircgk(cycle_period, awb)`)
  }
}
