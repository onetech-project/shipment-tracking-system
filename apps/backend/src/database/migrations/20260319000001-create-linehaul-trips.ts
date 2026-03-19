import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinehaulTrips20260319000001 implements MigrationInterface {
  name = 'CreateLinehaulTrips20260319000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "linehaul_trips" (
        "id"                     UUID            NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"        UUID            NOT NULL,
        "trip_code"              VARCHAR(100)    NOT NULL,
        "schedule"               VARCHAR(255),
        "origin"                 VARCHAR(255)    NOT NULL,
        "destination"            VARCHAR(255)    NOT NULL,
        "vendor"                 VARCHAR(255),
        "plate_number"           VARCHAR(50),
        "driver_name"            VARCHAR(255),
        "std"                    TIMESTAMPTZ,
        "sta"                    TIMESTAMPTZ,
        "ata"                    TIMESTAMPTZ,
        "total_weight"           NUMERIC(12,3),
        "last_import_upload_id"  UUID,
        "created_at"             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_linehaul_trips" PRIMARY KEY ("id"),
        CONSTRAINT "uq_linehaul_trips_org_trip_code" UNIQUE ("organization_id", "trip_code"),
        CONSTRAINT "fk_linehaul_trips_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_linehaul_trips_upload" FOREIGN KEY ("last_import_upload_id")
          REFERENCES "shipment_uploads" ("id") ON DELETE SET NULL
      );

      CREATE INDEX "idx_linehaul_trips_org_trip_code" ON "linehaul_trips" ("organization_id", "trip_code");
      CREATE INDEX "idx_linehaul_trips_org_created"   ON "linehaul_trips" ("organization_id", "created_at" DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "linehaul_trips"`);
  }
}
