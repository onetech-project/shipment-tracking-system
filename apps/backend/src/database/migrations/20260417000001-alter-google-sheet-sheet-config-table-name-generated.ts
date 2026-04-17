import { MigrationInterface, QueryRunner } from 'typeorm'

export class AlterGoogleSheetSheetConfigTableNameGenerated20260417000001 implements MigrationInterface {
  name = 'AlterGoogleSheetSheetConfigTableNameGenerated20260417000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add a generated column with a temporary name, then swap it in
    await queryRunner.query(`
      ALTER TABLE "google_sheet_sheet_config"
      ADD COLUMN IF NOT EXISTS "table_name_new" TEXT GENERATED ALWAYS AS (
        'air_shipment_' || lower(regexp_replace("sheet_name", '[^a-zA-Z0-9]', '_', 'g'))
      ) STORED
    `)

    // Drop plain text column if it exists, then rename generated column
    await queryRunner.query(`ALTER TABLE "google_sheet_sheet_config" DROP COLUMN IF EXISTS "table_name"`)
    await queryRunner.query(`ALTER TABLE "google_sheet_sheet_config" RENAME COLUMN "table_name_new" TO "table_name"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Convert generated column back to plain text with derived default
    await queryRunner.query(`
      ALTER TABLE "google_sheet_sheet_config"
      ADD COLUMN IF NOT EXISTS "table_name_text" TEXT NOT NULL DEFAULT (
        'air_shipment_' || lower(regexp_replace("sheet_name", '[^a-zA-Z0-9]', '_', 'g'))
      )
    `)
    await queryRunner.query(`ALTER TABLE "google_sheet_sheet_config" DROP COLUMN IF EXISTS "table_name"`)
    await queryRunner.query(`ALTER TABLE "google_sheet_sheet_config" RENAME COLUMN "table_name_text" TO "table_name"`)
  }
}
