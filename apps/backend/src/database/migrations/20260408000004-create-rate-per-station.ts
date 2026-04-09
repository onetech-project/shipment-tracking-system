import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRatePerStation20260408000004 implements MigrationInterface {
  name = 'CreateRatePerStation20260408000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_per_station" (
        -- System columns
        "id"                        UUID          NOT NULL DEFAULT gen_random_uuid(),
        "is_locked"                 BOOLEAN,
        "last_synced_at"            TIMESTAMPTZ,
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        -- Application columns (Data sheet, headerRow 1, skipNullCols true)
        "dc"                        TEXT,
        "station"                   TEXT,
        "origin_city"               TEXT,
        "origin_dc"                 TEXT,
        "destination_city"          TEXT,
        "destination_dc"            TEXT,
        "origin_station"            TEXT,
        "destination_station"       TEXT,
        "concat"                    TEXT,
        "rate_spx"                  TEXT,
        "pph_2"                     NUMERIC,
        "disc_15"                   NUMERIC,
        "rate_spx_after_pph_disc"   TEXT,
        "sla"                       INTEGER,
        "lost_treshold"             INTEGER,
        CONSTRAINT "pk_rate_per_station" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rate_per_station" UNIQUE ("origin_dc", "destination_dc")
      );

      CREATE INDEX "idx_rate_per_station_origin_dc_destination_dc" ON "rate_per_station" ("origin_dc", "destination_dc");
      CREATE INDEX "idx_rate_per_station_last_synced"  ON "rate_per_station" ("last_synced_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_per_station"`);
  }
}
