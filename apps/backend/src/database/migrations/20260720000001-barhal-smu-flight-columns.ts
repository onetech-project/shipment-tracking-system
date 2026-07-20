import { MigrationInterface, QueryRunner } from 'typeorm'

// Adds flight_number / flight_date generated columns to air_shipments_smu_rate_cgk_spx,
// following the same extra_fields-derived STORED-column pattern as account/airlines/via/dest
// (20260503000002-pnl-generated-columns-pricing.ts). Needed by the Barhal feature's "Data SMU"
// section. If the synced sheet doesn't carry these keys, the columns simply evaluate to NULL —
// callers must treat them as optional.
export class BarhalSmuFlightColumns20260720000001 implements MigrationInterface {
  name = 'BarhalSmuFlightColumns20260720000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu_rate_cgk_spx
        ADD COLUMN IF NOT EXISTS flight_number TEXT GENERATED ALWAYS AS (extra_fields->>'flight_number') STORED,
        ADD COLUMN IF NOT EXISTS flight_date   TEXT GENERATED ALWAYS AS (extra_fields->>'flight_date') STORED
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu_rate_cgk_spx
        DROP COLUMN IF EXISTS flight_number,
        DROP COLUMN IF EXISTS flight_date
    `)
  }
}
