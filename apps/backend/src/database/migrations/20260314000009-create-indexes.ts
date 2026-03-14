import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIndexes20260314000009 implements MigrationInterface {
  name = 'CreateIndexes20260314000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- organizations
      CREATE INDEX "idx_organizations_name"
        ON "organizations" ("name");

      -- users
      CREATE INDEX "idx_users_is_super_admin"
        ON "users" ("is_super_admin") WHERE "is_super_admin" = true;

      -- profiles
      CREATE INDEX "idx_profiles_organization_id"
        ON "profiles" ("organization_id");

      -- roles
      CREATE INDEX "idx_roles_organization_id"
        ON "roles" ("organization_id");

      -- user_roles
      CREATE INDEX "idx_user_roles_user_org"
        ON "user_roles" ("user_id", "organization_id");
      CREATE INDEX "idx_user_roles_role_id"
        ON "user_roles" ("role_id");

      -- role_permissions
      CREATE INDEX "idx_role_permissions_role_id"
        ON "role_permissions" ("role_id");

      -- refresh_tokens
      CREATE INDEX "idx_refresh_tokens_user_id"
        ON "refresh_tokens" ("user_id");
      CREATE INDEX "idx_refresh_tokens_family_id"
        ON "refresh_tokens" ("family_id");

      -- invitations
      CREATE UNIQUE INDEX "uq_invitations_org_email_pending"
        ON "invitations" ("organization_id", "email")
        WHERE "status" = 'pending';
      CREATE INDEX "idx_invitations_organization_id"
        ON "invitations" ("organization_id");

      -- audit_logs (on parent — inherited by partitions)
      CREATE INDEX "idx_audit_logs_user_id"
        ON "audit_logs" ("user_id", "created_at" DESC);
      CREATE INDEX "idx_audit_logs_entity"
        ON "audit_logs" ("entity_type", "entity_id", "created_at" DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_audit_logs_entity";
      DROP INDEX IF EXISTS "idx_audit_logs_user_id";
      DROP INDEX IF EXISTS "idx_invitations_organization_id";
      DROP INDEX IF EXISTS "uq_invitations_org_email_pending";
      DROP INDEX IF EXISTS "idx_refresh_tokens_family_id";
      DROP INDEX IF EXISTS "idx_refresh_tokens_user_id";
      DROP INDEX IF EXISTS "idx_role_permissions_role_id";
      DROP INDEX IF EXISTS "idx_user_roles_role_id";
      DROP INDEX IF EXISTS "idx_user_roles_user_org";
      DROP INDEX IF EXISTS "idx_roles_organization_id";
      DROP INDEX IF EXISTS "idx_profiles_organization_id";
      DROP INDEX IF EXISTS "idx_users_is_super_admin";
      DROP INDEX IF EXISTS "idx_organizations_name";
    `);
  }
}
