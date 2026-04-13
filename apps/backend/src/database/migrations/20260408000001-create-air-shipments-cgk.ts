import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAirShipmentsCgk20260408000001 implements MigrationInterface {
  name = 'CreateAirShipmentsCgk20260408000001'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_cgk" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "lt_number"                               VARCHAR(100) NOT NULL,
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_air_shipments_cgk" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_cgk" UNIQUE ("lt_number", "to_number")
      );

      CREATE INDEX "idx_air_shipments_cgk_lt_number_to_number"   ON "air_shipments_cgk" ("lt_number", "to_number");
      CREATE INDEX "idx_air_shipments_cgk_last_synced" ON "air_shipments_cgk" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_cgk"`)
  }
}
