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
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
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
    // --- Seeder: Insert example config and sheet configs ---
    // Example Google Sheet config (replace with your actual values as needed)
    const sheetConfigId = '00000000-0000-0000-0000-000000000001'
    const sheetLink = 'https://docs.google.com/spreadsheets/d/EXAMPLE_ID/edit'
    const sheetId = 'EXAMPLE_ID'
    await queryRunner.query(`
      INSERT INTO "google_sheet_config" (id, sheet_link, sheet_id, sync_interval, enabled)
      VALUES ('${sheetConfigId}', '${sheetLink}', '${sheetId}', 15, false)
    `)

    // Example sheet configs from sheets.json
    await queryRunner.query(`
      INSERT INTO "google_sheet_sheet_config"
        (id, "googleSheetConfigId", sheet_name, table_name, header_row, unique_key, skip_null_cols)
      VALUES
        ('00000000-0000-0000-0000-000000000101', '${sheetConfigId}', 'CompileAirCGK', 'air_shipments_cgk', 1, '["lt_number","to_number"]', true),
        ('00000000-0000-0000-0000-000000000102', '${sheetConfigId}', 'SUB', 'air_shipments_sub', 4, '["lt_number","to_number"]', true),
        ('00000000-0000-0000-0000-000000000103', '${sheetConfigId}', 'SDA', 'air_shipments_sda', 4, '["lt_number","to_number"]', true),
        ('00000000-0000-0000-0000-000000000104', '${sheetConfigId}', 'Data', 'rate_per_station', 2, '["origin_dc","destination_dc"]', true),
        ('00000000-0000-0000-0000-000000000105', '${sheetConfigId}', 'Master Data', 'route_master', 2, '["concat"]', true)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "google_sheet_sheet_config"')
    await queryRunner.query('DROP TABLE "google_sheet_config"')
  }
}
