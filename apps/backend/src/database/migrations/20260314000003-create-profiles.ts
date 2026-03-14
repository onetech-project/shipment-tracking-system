import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfiles20260314000003 implements MigrationInterface {
  name = 'CreateProfiles20260314000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"         UUID         NOT NULL,
        "organization_id" UUID         NOT NULL,
        "name"            VARCHAR(255) NOT NULL,
        "dob"             DATE,
        "position"        VARCHAR(255),
        "join_at"         DATE,
        "employee_number" VARCHAR(100),
        "phone_number"    VARCHAR(50),
        "email"           VARCHAR(255),
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_profiles"          PRIMARY KEY ("id"),
        CONSTRAINT "uq_profiles_user_id"  UNIQUE ("user_id"),
        CONSTRAINT "fk_profiles_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_profiles_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
  }
}
