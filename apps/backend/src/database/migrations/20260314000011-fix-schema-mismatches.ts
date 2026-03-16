import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix schema mismatches between entities and existing migrations:
 * - organizations: add slug (entity has it, migration didn't)
 * - roles: add description + is_system (migration had is_default instead)
 * - profiles: add first_name, last_name, phone, avatar_url; make name nullable
 */
export class FixSchemaMismatches20260314000011 implements MigrationInterface {
  name = 'FixSchemaMismatches20260314000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── organizations ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);
    `);
    // Back-fill slug from name for existing rows (lowercase, replace spaces with dashes)
    await queryRunner.query(`
      UPDATE "organizations"
        SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE "slug" IS NULL;
    `);
    // Now enforce unique + not-null
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ALTER COLUMN "slug" SET NOT NULL,
        ADD CONSTRAINT "uq_organizations_slug" UNIQUE ("slug");
    `);

    // ── roles ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "roles"
        ADD COLUMN IF NOT EXISTS "description" TEXT,
        ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;
    `);

    // ── invitations ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "invitations"
        ADD COLUMN IF NOT EXISTS "invited_name" VARCHAR(255);
    `);

    // ── profiles ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "profiles"
        ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "last_name"  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "phone"      VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
    `);
    // The original migration created name NOT NULL; drop the constraint so
    // new inserts (which don't populate name) don't fail.
    await queryRunner.query(`
      ALTER TABLE "profiles"
        ALTER COLUMN "name" DROP NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ALTER COLUMN "name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "last_name"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "first_name"`);
    await queryRunner.query(`ALTER TABLE "invitations" DROP COLUMN IF EXISTS "invited_name"`);

    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "is_system"`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "description"`);

    await queryRunner.query(`ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "uq_organizations_slug"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "slug"`);
  }
}
