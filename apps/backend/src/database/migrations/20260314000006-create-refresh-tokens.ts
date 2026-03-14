import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens20260314000006 implements MigrationInterface {
  name = 'CreateRefreshTokens20260314000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"         UUID         NOT NULL,
        "organization_id" UUID,
        "token_hash"      CHAR(64)     NOT NULL,
        "family_id"       UUID         NOT NULL,
        "expires_at"      TIMESTAMPTZ  NOT NULL,
        "last_used_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "revoked_at"      TIMESTAMPTZ,
        "ip_address"      INET,
        "user_agent"      TEXT,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_refresh_tokens"          PRIMARY KEY ("id"),
        CONSTRAINT "uq_refresh_tokens_hash"     UNIQUE ("token_hash"),
        CONSTRAINT "fk_refresh_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
