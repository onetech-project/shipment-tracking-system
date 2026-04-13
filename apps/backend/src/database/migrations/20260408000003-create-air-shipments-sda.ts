import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAirShipmentsSda20260408000003 implements MigrationInterface {
  name = 'CreateAirShipmentsSda20260408000003'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_sda" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "lt_number"                               VARCHAR(100) NOT NULL,
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_air_shipments_sda" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_sda" UNIQUE ("lt_number", "to_number")
      );

      CREATE INDEX "idx_air_shipments_sda_lt_number_to_number"   ON "air_shipments_sda" ("lt_number", "to_number");
      CREATE INDEX "idx_air_shipments_sda_last_synced" ON "air_shipments_sda" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_sda"`)
  }
}
