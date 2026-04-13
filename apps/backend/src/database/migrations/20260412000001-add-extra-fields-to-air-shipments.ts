import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddExtraFieldsToAirShipments20260412000001 implements MigrationInterface {
  name = 'AddExtraFieldsToAirShipments20260412000001'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "air_shipments_cgk" ADD COLUMN "extra_fields" jsonb`)
    await queryRunner.query(`ALTER TABLE "air_shipments_sub" ADD COLUMN "extra_fields" jsonb`)
    await queryRunner.query(`ALTER TABLE "air_shipments_sda" ADD COLUMN "extra_fields" jsonb`)
    await queryRunner.query(`ALTER TABLE "rate_per_station" ADD COLUMN "extra_fields" jsonb`)
    await queryRunner.query(`ALTER TABLE "route_master" ADD COLUMN "extra_fields" jsonb`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "air_shipments_cgk" DROP COLUMN "extra_fields"`)
    await queryRunner.query(`ALTER TABLE "air_shipments_sub" DROP COLUMN "extra_fields"`)
    await queryRunner.query(`ALTER TABLE "air_shipments_sda" DROP COLUMN "extra_fields"`)
    await queryRunner.query(`ALTER TABLE "rate_per_station" DROP COLUMN "extra_fields"`)
    await queryRunner.query(`ALTER TABLE "route_master" DROP COLUMN "extra_fields"`)
  }
}
