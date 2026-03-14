import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers20260314000002 implements MigrationInterface {
  name = 'CreateUsers20260314000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                     UUID         NOT NULL DEFAULT gen_random_uuid(),
        "username"               VARCHAR(255) NOT NULL,
        "password"               VARCHAR(255) NOT NULL,
        "is_super_admin"         BOOLEAN      NOT NULL DEFAULT false,
        "last_login_at"          TIMESTAMPTZ,
        "last_logout_at"         TIMESTAMPTZ,
        "failed_attempts"        INTEGER      NOT NULL DEFAULT 0,
        "is_locked"              BOOLEAN      NOT NULL DEFAULT false,
        "locked_at"              TIMESTAMPTZ,
        "require_password_reset" BOOLEAN      NOT NULL DEFAULT false,
        "is_active"              BOOLEAN      NOT NULL DEFAULT false,
        "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_users"              PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_username"     UNIQUE ("username"),
        CONSTRAINT "chk_users_failed_attempts" CHECK ("failed_attempts" >= 0)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
