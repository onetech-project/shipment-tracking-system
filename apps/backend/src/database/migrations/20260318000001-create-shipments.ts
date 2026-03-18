import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShipments20260318000001 implements MigrationInterface {
  name = 'CreateShipments20260318000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id"                     UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"        UUID         NOT NULL,
        "shipment_id"            VARCHAR(100) NOT NULL,
        "origin"                 VARCHAR(255) NOT NULL,
        "destination"            VARCHAR(255) NOT NULL,
        "status"                 VARCHAR(50)  NOT NULL,
        "carrier"                VARCHAR(255),
        "estimated_delivery_date" DATE,
        "contents_description"   TEXT,
        "last_import_upload_id"  UUID,
        "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_shipments_org_shipment_id" UNIQUE ("organization_id", "shipment_id"),
        CONSTRAINT "fk_shipments_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE
      );

      CREATE INDEX "idx_shipments_org_shipment_id" ON "shipments" ("organization_id", "shipment_id");
      CREATE INDEX "idx_shipments_org_status"      ON "shipments" ("organization_id", "status");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments"`);
  }
}
