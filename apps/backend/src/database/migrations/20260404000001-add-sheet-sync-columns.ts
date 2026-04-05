import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSheetSyncColumns20260404000001 implements MigrationInterface {
  name = 'AddSheetSyncColumns20260404000001'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = process.env.SHEET_SYNC_TABLE
    if (!table) {
      // If no target table is configured yet, skip gracefully.
      // The columns will be applied once SHEET_SYNC_TABLE is set and the migration is re-run.
      console.warn(
        '[AddSheetSyncColumns] SHEET_SYNC_TABLE env var not set — skipping column addition.'
      )
      return
    }

    // Validate table name to prevent SQL injection (alphanumeric + underscore only).
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
      throw new Error(`[AddSheetSyncColumns] Invalid SHEET_SYNC_TABLE value: "${table}"`)
    }

    const columns = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table]
    )
    const existing = new Set<string>(columns.map((c: { column_name: string }) => c.column_name))

    if (!existing.has('last_synced_at')) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "last_synced_at" TIMESTAMPTZ NULL`)
    }

    if (!existing.has('is_locked')) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT FALSE`
      )
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = process.env.SHEET_SYNC_TABLE
    if (!table || !/^[a-z_][a-z0-9_]*$/i.test(table)) return

    const columns = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table]
    )
    const existing = new Set<string>(columns.map((c: { column_name: string }) => c.column_name))

    if (existing.has('last_synced_at')) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "last_synced_at"`)
    }
    if (existing.has('is_locked')) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "is_locked"`)
    }
  }
}
