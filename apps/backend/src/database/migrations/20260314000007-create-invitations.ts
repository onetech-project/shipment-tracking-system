import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvitations20260314000007 implements MigrationInterface {
  name = 'CreateInvitations20260314000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" UUID         NOT NULL,
        "email"           VARCHAR(255) NOT NULL,
        "invited_by"      UUID         NOT NULL,
        "token_hash"      CHAR(64)     NOT NULL,
        "status"          VARCHAR(20)  NOT NULL DEFAULT 'pending',
        "expires_at"      TIMESTAMPTZ  NOT NULL,
        "used_at"         TIMESTAMPTZ,
        "role_id"         UUID,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_invitations"          PRIMARY KEY ("id"),
        CONSTRAINT "uq_invitations_token"    UNIQUE ("token_hash"),
        CONSTRAINT "chk_invitations_status"
          CHECK ("status" IN ('pending', 'accepted', 'expired', 'revoked')),
        CONSTRAINT "fk_invitations_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_invitations_invited_by"
          FOREIGN KEY ("invited_by") REFERENCES "users"("id"),
        CONSTRAINT "fk_invitations_role"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
  }
}
