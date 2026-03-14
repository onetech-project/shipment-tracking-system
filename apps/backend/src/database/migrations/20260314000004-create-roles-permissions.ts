import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesPermissions20260314000004 implements MigrationInterface {
  name = 'CreateRolesPermissions20260314000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"            VARCHAR(100) NOT NULL,
        "organization_id" UUID,
        "is_default"      BOOLEAN      NOT NULL DEFAULT false,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_roles_name_org" UNIQUE ("name", "organization_id"),
        CONSTRAINT "fk_roles_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      );

      CREATE TABLE "permissions" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"        VARCHAR(200) NOT NULL,
        "description" TEXT,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_permissions"      PRIMARY KEY ("id"),
        CONSTRAINT "uq_permissions_name" UNIQUE ("name"),
        CONSTRAINT "chk_permissions_name_format"
          CHECK ("name" ~ '^(read|create|update|delete)\.[a-z][a-z0-9_]*$')
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
