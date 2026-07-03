import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Corrects the airline_tracking_source names: the original seed used ambiguous
 * combined labels ('Citilink/Garuda', 'Garuda/Citilink'). The Flight Tracker
 * table surfaces this `name` as the Airline column, so each carrier_code maps to
 * a single airline: 126 → Garuda, 888 → Citilink, 778 → Pelita.
 */
export class FixAirlineCarrierNames20260629000001 implements MigrationInterface {
  name = 'FixAirlineCarrierNames20260629000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Garuda',   updated_at = now() WHERE carrier_code = '126'`)
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Citilink', updated_at = now() WHERE carrier_code = '888'`)
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Pelita',   updated_at = now() WHERE carrier_code = '778'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Citilink/Garuda', updated_at = now() WHERE carrier_code = '126'`)
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Garuda/Citilink', updated_at = now() WHERE carrier_code = '888'`)
    await queryRunner.query(`UPDATE airline_tracking_source SET name = 'Pelita',          updated_at = now() WHERE carrier_code = '778'`)
  }
}
