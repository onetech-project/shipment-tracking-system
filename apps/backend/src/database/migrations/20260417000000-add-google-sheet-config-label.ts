import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddGoogleSheetConfigLabel20260417000000 implements MigrationInterface {
  name = 'AddGoogleSheetConfigLabel20260417000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "google_sheet_config" ADD COLUMN IF NOT EXISTS "label" TEXT`
    )

    // Backfill reasonable label for existing rows using id prefix
    await queryRunner.query(`
      UPDATE "google_sheet_config"
      SET "label" = 'Spreadsheet ' || substring("id"::text, 1, 8)
      WHERE "label" IS NULL OR trim("label") = ''
    `)

    await queryRunner.query(`ALTER TABLE "google_sheet_config" ALTER COLUMN "label" SET NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "google_sheet_config" DROP COLUMN IF EXISTS "label"`)
  }
}
