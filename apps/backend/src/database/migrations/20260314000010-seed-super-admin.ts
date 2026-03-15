import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

export class SeedSuperAdmin20260314000010 implements MigrationInterface {
  name = 'SeedSuperAdmin20260314000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    const orgId = 'a0000000-0000-0000-0000-000000000001';
    const userId = 'b0000000-0000-0000-0000-000000000001';
    const profileId = 'c0000000-0000-0000-0000-000000000001';

    const passwordHash = await bcrypt.hash('Admin@1234', 10);

    await queryRunner.query(`
      INSERT INTO "organizations" ("id", "name", "is_active")
      VALUES ('${orgId}', 'Default Organization', true)
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "users" ("id", "username", "password", "is_super_admin", "is_active")
      VALUES ('${userId}', 'superadmin', '${passwordHash}', true, true)
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "profiles" ("id", "user_id", "organization_id", "name")
      VALUES ('${profileId}', '${userId}', '${orgId}', 'Super Admin')
      ON CONFLICT DO NOTHING;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "profiles"      WHERE "id" = 'c0000000-0000-0000-0000-000000000001'`);
    await queryRunner.query(`DELETE FROM "users"         WHERE "id" = 'b0000000-0000-0000-0000-000000000001'`);
    await queryRunner.query(`DELETE FROM "organizations" WHERE "id" = 'a0000000-0000-0000-0000-000000000001'`);
  }
}
