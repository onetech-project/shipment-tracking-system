import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShipmentUploadErrors20260318000003 implements MigrationInterface {
  name = 'CreateShipmentUploadErrors20260318000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shipment_upload_errors" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "shipment_upload_id"   UUID         NOT NULL,
        "row_number"           INTEGER      NOT NULL,
        "error_type"           VARCHAR(30)  NOT NULL,
        "field_name"           VARCHAR(100),
        "message"             TEXT         NOT NULL,
        "incoming_payload"     JSONB,
        "existing_shipment_id" UUID,
        "resolved"             BOOLEAN      NOT NULL DEFAULT false,
        "resolution"           VARCHAR(20),
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_shipment_upload_errors" PRIMARY KEY ("id"),
        CONSTRAINT "fk_shipment_upload_errors_upload" FOREIGN KEY ("shipment_upload_id")
          REFERENCES "shipment_uploads" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_shipment_upload_errors_shipment" FOREIGN KEY ("existing_shipment_id")
          REFERENCES "shipments" ("id") ON DELETE SET NULL
      );

      CREATE INDEX "idx_upload_errors_upload_id"
        ON "shipment_upload_errors" ("shipment_upload_id");

      CREATE INDEX "idx_upload_errors_upload_type"
        ON "shipment_upload_errors" ("shipment_upload_id", "error_type");

      CREATE INDEX "idx_upload_errors_unresolved"
        ON "shipment_upload_errors" ("shipment_upload_id", "resolved")
        WHERE "resolved" = false;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_upload_errors"`);
  }
}
