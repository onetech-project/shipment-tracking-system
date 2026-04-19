import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateGoogleSheetConfig20260410000100 implements MigrationInterface {
  name = 'CreateGoogleSheetConfig20260410000100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "google_sheet_config" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "sheet_link" text NOT NULL,
        "sheet_id" text NOT NULL,
        "sync_interval" integer NOT NULL DEFAULT 15,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "label" text NOT NULL
      )
    `)
    await queryRunner.query(`
      CREATE TABLE "google_sheet_sheet_config" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "googleSheetConfigId" uuid REFERENCES "google_sheet_config"("id") ON DELETE CASCADE,
        "sheet_name" text NOT NULL,
        "table_name" text NOT NULL,
        "header_row" integer NOT NULL DEFAULT 1,
        "unique_key" jsonb NOT NULL,
        "skip_null_cols" boolean NOT NULL DEFAULT true
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "google_sheet_sheet_config"')
    await queryRunner.query('DROP TABLE "google_sheet_config"')
  }
}
