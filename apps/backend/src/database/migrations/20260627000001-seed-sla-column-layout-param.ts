import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Seeds the single app-wide SLA column layout config into general_params.
 * The value is a JSON array of { key, visible, frozen }; '[]' means "use defaults".
 * Updates go through GeneralParamsService.update, which emits general_params.updated
 * and is persisted to audit_logs (actor + timestamp + value).
 */
export class SeedSlaColumnLayoutParam20260627000001 implements MigrationInterface {
  name = 'SeedSlaColumnLayoutParam20260627000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value")
      VALUES ('sla_column_layout', 'SLA Column Layout', '[]')
      ON CONFLICT ("key") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'sla_column_layout'`)
  }
}
