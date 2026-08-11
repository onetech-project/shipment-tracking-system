import { MigrationInterface, QueryRunner } from 'typeorm'

// Adds `shipment_date`: the TO's own date, taken from the sheet's `date` field.
//
// Barhal previously dated a TO by `completed_date` (derived from `completed_time`), which is when
// the TO finished moving — typically 1-3 days after the TO itself. Worse, `completed_time` is blank
// on ~41% of Barhal rows, so those TOs were dropped entirely by the `completed_date IS NOT NULL`
// guard and never reached the dashboard. `date` is populated on every row and matches the date
// encoded in the TO number (TO20260526STXE2 -> 2026-05-26), so it is the TO's real date.
//
// Same STORED generated-column pattern as `completed_date`, and MAKE_DATE for the same reason: a
// plain `::date` cast reads DateStyle and is therefore not IMMUTABLE, which a generated column
// requires. The regex guard makes a malformed value produce NULL instead of failing the write.
export class AirShipmentsShipmentDate20260808000001 implements MigrationInterface {
  name = 'AirShipmentsShipmentDate20260808000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS shipment_date DATE GENERATED ALWAYS AS (
          CASE WHEN extra_fields->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN MAKE_DATE(
                 SUBSTRING(extra_fields->>'date', 1, 4)::INTEGER,
                 SUBSTRING(extra_fields->>'date', 6, 2)::INTEGER,
                 SUBSTRING(extra_fields->>'date', 9, 2)::INTEGER
               )
          END
        ) STORED
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_compile_shipment_date
        ON air_shipments_compileaircgk (shipment_date)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compile_shipment_date`)
    await queryRunner.query(`ALTER TABLE air_shipments_compileaircgk DROP COLUMN IF EXISTS shipment_date`)
  }
}
