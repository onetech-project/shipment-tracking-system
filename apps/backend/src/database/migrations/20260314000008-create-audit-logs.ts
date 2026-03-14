import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs20260314000008 implements MigrationInterface {
  name = 'CreateAuditLogs20260314000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID,
        "action"      VARCHAR(100) NOT NULL,
        "entity_type" VARCHAR(100),
        "entity_id"   UUID,
        "metadata"    JSONB,
        "ip_address"  INET,
        "user_agent"  TEXT,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id", "created_at")
      ) PARTITION BY RANGE ("created_at");

      -- Create initial monthly partition for current month
      CREATE TABLE "audit_logs_2026_03" PARTITION OF "audit_logs"
        FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

      CREATE TABLE "audit_logs_2026_04" PARTITION OF "audit_logs"
        FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

      CREATE TABLE "audit_logs_2026_05" PARTITION OF "audit_logs"
        FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

      CREATE TABLE "audit_logs_2026_06" PARTITION OF "audit_logs"
        FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
  }
}
