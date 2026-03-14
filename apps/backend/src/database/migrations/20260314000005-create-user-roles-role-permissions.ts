import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserRolesRolePermissions20260314000005 implements MigrationInterface {
  name = 'CreateUserRolesRolePermissions20260314000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id"         UUID        NOT NULL,
        "role_id"         UUID        NOT NULL,
        "organization_id" UUID        NOT NULL,
        "assigned_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "assigned_by"     UUID,
        CONSTRAINT "pk_user_roles" PRIMARY KEY ("user_id", "role_id", "organization_id"),
        CONSTRAINT "fk_user_roles_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_roles_role"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_roles_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      );

      CREATE TABLE "role_permissions" (
        "role_id"       UUID        NOT NULL,
        "permission_id" UUID        NOT NULL,
        "assigned_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "assigned_by"   UUID,
        CONSTRAINT "pk_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "fk_role_permissions_role"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_permission"
          FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
  }
}
