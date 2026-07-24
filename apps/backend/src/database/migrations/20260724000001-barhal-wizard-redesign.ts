import { MigrationInterface, QueryRunner } from 'typeorm'

// Redesigns Barhal Koli creation as a 4-step wizard (Buat Koli -> TO -> Kelola Berat -> Input SMU).
// - air_shipments_compileaircgk gains `remarks`/`lt_number` generated columns (same
//   extra_fields-derived STORED pattern as its existing columns) so TOs can be filtered to
//   Barhal-only and the TO list can show LT Number.
// - barhal_koli drops the IATA-code-based route/origin_code/dest_code in favor of plain
//   origin_name/dest_name text (DC suffix stripped), adds batang_kayu, and gains koli-level SMU
//   fields (smu_number/airlines/flight_no/std/sta) since SMU is now entered once per Koli
//   (optionally bulk-applied across a date+destination group) rather than per TO line.
// - barhal_koli_to drops its now-unused per-line smu_* snapshot columns.
export class BarhalWizardRedesign20260724000001 implements MigrationInterface {
  name = 'BarhalWizardRedesign20260724000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS remarks    TEXT GENERATED ALWAYS AS (extra_fields->>'remarks') STORED,
        ADD COLUMN IF NOT EXISTS lt_number  TEXT GENERATED ALWAYS AS (extra_fields->>'lt_number') STORED,
        ADD COLUMN IF NOT EXISTS completed_date DATE GENERATED ALWAYS AS (
          CASE WHEN extra_fields->>'completed_time' IS NULL OR extra_fields->>'completed_time' = ''
               THEN NULL
               ELSE MAKE_DATE(
                 SUBSTRING(extra_fields->>'completed_time', 8, 4)::INTEGER,
                 CASE SUBSTRING(extra_fields->>'completed_time', 4, 3)
                   WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3
                   WHEN 'Apr' THEN 4 WHEN 'May' THEN 5 WHEN 'Jun' THEN 6
                   WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8 WHEN 'Sep' THEN 9
                   WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
                   ELSE 1
                 END,
                 SUBSTRING(extra_fields->>'completed_time', 1, 2)::INTEGER
               )
          END
        ) STORED
    `)

    await queryRunner.query(`ALTER TABLE barhal_koli DROP CONSTRAINT IF EXISTS uq_barhal_koli_date_route_seq`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_barhal_koli_route`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        DROP COLUMN IF EXISTS route,
        DROP COLUMN IF EXISTS origin_code,
        DROP COLUMN IF EXISTS dest_code,
        ADD COLUMN origin_name TEXT NOT NULL DEFAULT '',
        ADD COLUMN dest_name   TEXT NOT NULL DEFAULT '',
        ADD COLUMN batang_kayu INTEGER,
        ADD COLUMN smu_number  TEXT,
        ADD COLUMN airlines    TEXT,
        ADD COLUMN flight_no   TEXT,
        ADD COLUMN std         TIMESTAMPTZ,
        ADD COLUMN sta         TIMESTAMPTZ
    `)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN origin_name DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN dest_name DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after DROP DEFAULT`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        ADD CONSTRAINT uq_barhal_koli_date_origin_dest_seq UNIQUE (koli_date, origin_name, dest_name, sequence_no)
    `)
    await queryRunner.query(`CREATE INDEX idx_barhal_koli_origin_dest ON barhal_koli(origin_name, dest_name)`)

    await queryRunner.query(`
      ALTER TABLE barhal_koli_to
        DROP COLUMN IF EXISTS smu_account,
        DROP COLUMN IF EXISTS smu_airlines,
        DROP COLUMN IF EXISTS smu_flight_date,
        DROP COLUMN IF EXISTS smu_flight_number
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE barhal_koli_to
        ADD COLUMN smu_account       TEXT,
        ADD COLUMN smu_airlines      TEXT,
        ADD COLUMN smu_flight_date   TEXT,
        ADD COLUMN smu_flight_number TEXT
    `)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_barhal_koli_origin_dest`)
    await queryRunner.query(`ALTER TABLE barhal_koli DROP CONSTRAINT IF EXISTS uq_barhal_koli_date_origin_dest_seq`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        DROP COLUMN IF EXISTS origin_name,
        DROP COLUMN IF EXISTS dest_name,
        DROP COLUMN IF EXISTS batang_kayu,
        DROP COLUMN IF EXISTS smu_number,
        DROP COLUMN IF EXISTS airlines,
        DROP COLUMN IF EXISTS flight_no,
        DROP COLUMN IF EXISTS std,
        DROP COLUMN IF EXISTS sta,
        ADD COLUMN route        TEXT NOT NULL DEFAULT '',
        ADD COLUMN origin_code  TEXT NOT NULL DEFAULT '',
        ADD COLUMN dest_code    TEXT NOT NULL DEFAULT ''
    `)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN route DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN origin_code DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN dest_code DROP DEFAULT`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before SET DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_before SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after SET DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN weight_after SET NOT NULL`)
    await queryRunner.query(`CREATE INDEX idx_barhal_koli_route ON barhal_koli(route)`)
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        ADD CONSTRAINT uq_barhal_koli_date_route_seq UNIQUE (koli_date, route, sequence_no)
    `)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS remarks,
        DROP COLUMN IF EXISTS lt_number,
        DROP COLUMN IF EXISTS completed_date
    `)
  }
}
