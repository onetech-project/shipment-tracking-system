import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizations20260314000001 implements MigrationInterface {
  name = 'CreateOrganizations20260314000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE "organizations" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "name"       VARCHAR(255) NOT NULL,
        "address"    TEXT,
        "is_active"  BOOLEAN     NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organizations" PRIMARY KEY ("id")
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
