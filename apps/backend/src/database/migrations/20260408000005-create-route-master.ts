import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateRouteMaster20260408000005 implements MigrationInterface {
  name = 'CreateRouteMaster20260408000005'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "route_master" (
        -- System columns
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "concat"         VARCHAR(255)  NOT NULL,
        "is_locked"      BOOLEAN,
        "last_synced_at" TIMESTAMPTZ,
        "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_route_master" PRIMARY KEY ("id"),
        CONSTRAINT "uq_route_master_concat" UNIQUE ("concat")
      );

      CREATE INDEX "idx_route_master_concat"       ON "route_master" ("concat");
      CREATE INDEX "idx_route_master_last_synced"  ON "route_master" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "route_master"`)
  }
}
