import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShipmentUploads20260318000002 implements MigrationInterface {
  name = 'CreateShipmentUploads20260318000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shipment_uploads" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID         NOT NULL,
        "uploaded_by_user_id" UUID         NOT NULL,
        "original_filename"   VARCHAR(255) NOT NULL,
        "file_hash"           CHAR(64)     NOT NULL,
        "status"              VARCHAR(30)  NOT NULL DEFAULT 'queued',
        "total_rows_detected" INTEGER      NOT NULL DEFAULT 0,
        "rows_imported"       INTEGER      NOT NULL DEFAULT 0,
        "rows_failed"         INTEGER      NOT NULL DEFAULT 0,
        "rows_conflicted"     INTEGER      NOT NULL DEFAULT 0,
        "started_at"          TIMESTAMPTZ,
        "completed_at"        TIMESTAMPTZ,
        "duration_ms"         INTEGER,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_shipment_uploads" PRIMARY KEY ("id"),
        CONSTRAINT "fk_shipment_uploads_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id"),
        CONSTRAINT "fk_shipment_uploads_user" FOREIGN KEY ("uploaded_by_user_id")
          REFERENCES "users" ("id")
      );

      CREATE INDEX "idx_shipment_uploads_org_created"
        ON "shipment_uploads" ("organization_id", "created_at" DESC);

      CREATE UNIQUE INDEX "uq_shipment_uploads_org_hash_active"
        ON "shipment_uploads" ("organization_id", "file_hash")
        WHERE "status" IN ('queued', 'processing');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_uploads"`);
  }
}
