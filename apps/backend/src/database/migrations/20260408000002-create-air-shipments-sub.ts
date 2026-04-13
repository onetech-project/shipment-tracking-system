import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAirShipmentsSub20260408000002 implements MigrationInterface {
  name = 'CreateAirShipmentsSub20260408000002'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_sub" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "lt_number"                               VARCHAR(100) NOT NULL,
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_air_shipments_sub" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_sub" UNIQUE ("lt_number", "to_number")
      );

      CREATE INDEX "idx_air_shipments_sub_lt_number_to_number"   ON "air_shipments_sub" ("lt_number", "to_number");
      CREATE INDEX "idx_air_shipments_sub_last_synced" ON "air_shipments_sub" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_sub"`)
  }
}
