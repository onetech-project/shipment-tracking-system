import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateRatePerStation20260408000004 implements MigrationInterface {
  name = 'CreateRatePerStation20260408000004'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_per_station" (
        -- System columns
        "id"                        UUID          NOT NULL DEFAULT gen_random_uuid(),
        "origin_dc"                 TEXT          NOT NULL,
        "destination_dc"            TEXT          NOT NULL,
        "is_locked"                 BOOLEAN,
        "last_synced_at"            TIMESTAMPTZ,
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_rate_per_station" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rate_per_station" UNIQUE ("origin_dc", "destination_dc")
      );

      CREATE INDEX "idx_rate_per_station_origin_dc_destination_dc" ON "rate_per_station" ("origin_dc", "destination_dc");
      CREATE INDEX "idx_rate_per_station_last_synced"  ON "rate_per_station" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_per_station"`)
  }
}
