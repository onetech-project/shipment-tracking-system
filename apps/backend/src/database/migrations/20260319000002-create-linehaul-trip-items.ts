import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinehaulTripItems20260319000002 implements MigrationInterface {
  name = 'CreateLinehaulTripItems20260319000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "linehaul_trip_items" (
        "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
        "linehaul_trip_id"  UUID            NOT NULL,
        "to_number"         VARCHAR(100)    NOT NULL,
        "weight"            NUMERIC(12,3),
        "destination"       VARCHAR(255),
        "dg_type"           VARCHAR(50),
        "to_type"           VARCHAR(50),
        "created_at"        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_linehaul_trip_items" PRIMARY KEY ("id"),
        CONSTRAINT "uq_linehaul_trip_items_trip_to" UNIQUE ("linehaul_trip_id", "to_number"),
        CONSTRAINT "fk_linehaul_trip_items_trip" FOREIGN KEY ("linehaul_trip_id")
          REFERENCES "linehaul_trips" ("id") ON DELETE CASCADE
      );

      CREATE INDEX "idx_linehaul_items_trip_id"   ON "linehaul_trip_items" ("linehaul_trip_id");
      CREATE INDEX "idx_linehaul_items_to_number"  ON "linehaul_trip_items" ("to_number");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "linehaul_trip_items"`);
  }
}
