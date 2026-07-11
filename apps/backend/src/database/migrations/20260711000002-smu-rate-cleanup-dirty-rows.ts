import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cleans up dirty rows in air_shipments_smu_rate_cgk_spx and hardens the table so incomplete
 * rows can no longer be persisted (defense for non-sheet write paths — the sheet ingest already
 * skips rows whose uniqueKey columns are blank, see SheetsService).
 *
 * Background: while the sheet's unique key was just [awb], rows carrying only an awb (no
 * account/via/dest) were upserted and lingered. They are meaningless for pricing (account/via/dest
 * are the join keys into the rate tables) and caused fan-out in v_pnl_to. This migration:
 *
 *   1. Ensures the key columns exist (mirrors DynamicTableService.ensureTable).
 *   2. Deletes incomplete rows (any of awb/account/via/dest NULL or blank).
 *   3. Removes exact composite duplicates (keep most-recently-synced) so the composite unique
 *      constraint can be created cleanly.
 *   4. Reconciles the unique constraint to the composite key (drops the legacy uq_..._awb, adds
 *      uq_..._awb_account_via_dest) — same names/shape DynamicTableService.ensureTable converges to.
 *   5. Adds a hard DB guard: NOT NULL + non-blank CHECK on the four columns.
 *
 * Forward-only on the data: down() removes the guard/constraint but cannot restore deleted rows.
 */
export class SmuRateCleanupDirtyRows20260711000002 implements MigrationInterface {
  name = 'SmuRateCleanupDirtyRows20260711000002'

  private readonly table = 'air_shipments_smu_rate_cgk_spx'
  private readonly compositeConstraint = 'uq_air_shipments_smu_rate_cgk_spx_awb_account_via_dest'
  private readonly nonBlankCheck = 'chk_air_shipments_smu_rate_cgk_spx_keys_nonblank'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip entirely in environments where the dynamic table has not been created yet.
    const exists = await queryRunner.query(
      `SELECT to_regclass('public.${this.table}') AS t`
    )
    if (!exists?.[0]?.t) return

    // 1) Ensure key columns exist (matches ensureTable; no-op if already present).
    await queryRunner.query(`
      ALTER TABLE ${this.table}
        ADD COLUMN IF NOT EXISTS awb     TEXT,
        ADD COLUMN IF NOT EXISTS account TEXT,
        ADD COLUMN IF NOT EXISTS via     TEXT,
        ADD COLUMN IF NOT EXISTS dest    TEXT
    `)

    // 2) Delete incomplete rows — any key column NULL or blank (whitespace-only).
    //    RETURNING lets us log how many were removed regardless of driver result shape.
    const incompletePredicate = `
      awb     IS NULL OR BTRIM(awb)     = ''
   OR account IS NULL OR BTRIM(account) = ''
   OR via     IS NULL OR BTRIM(via)     = ''
   OR dest    IS NULL OR BTRIM(dest)    = ''`
    const deleted: unknown[] = await queryRunner.query(
      `DELETE FROM ${this.table} WHERE ${incompletePredicate} RETURNING id`
    )
    // eslint-disable-next-line no-console
    console.log(`[migration] ${this.name}: deleted ${deleted.length} incomplete row(s)`)

    // 3) Remove exact composite duplicates so the unique constraint can be added.
    await queryRunner.query(`
      DELETE FROM ${this.table} a
      USING (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY awb, account, via, dest
                 ORDER BY updated_at DESC NULLS LAST, id DESC
               ) AS rn
        FROM ${this.table}
      ) d
      WHERE a.id = d.id AND d.rn > 1
    `)

    // 4) Reconcile the unique constraint to the composite key.
    //    Drop any legacy generated unique constraint that is not the composite one...
    const stale: Array<{ conname: string }> = await queryRunner.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = '${this.table}'::regclass
        AND contype = 'u'
        AND conname LIKE 'uq_${this.table}_%'
        AND conname <> '${this.compositeConstraint}'
    `)
    for (const { conname } of stale) {
      await queryRunner.query(`ALTER TABLE ${this.table} DROP CONSTRAINT IF EXISTS "${conname}"`)
    }
    // ...then add the composite one if missing.
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${this.compositeConstraint}') THEN
        EXECUTE 'ALTER TABLE ${this.table} ADD CONSTRAINT ${this.compositeConstraint} UNIQUE (awb, account, via, dest)';
      END IF;
    END$$;`)

    // 5) Hard DB guard: NOT NULL + non-blank CHECK on the four key columns.
    await queryRunner.query(`
      ALTER TABLE ${this.table}
        ALTER COLUMN awb     SET NOT NULL,
        ALTER COLUMN account SET NOT NULL,
        ALTER COLUMN via     SET NOT NULL,
        ALTER COLUMN dest    SET NOT NULL
    `)
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${this.nonBlankCheck}') THEN
        EXECUTE 'ALTER TABLE ${this.table} ADD CONSTRAINT ${this.nonBlankCheck} CHECK (
          BTRIM(awb) <> '''' AND BTRIM(account) <> '''' AND BTRIM(via) <> '''' AND BTRIM(dest) <> ''''
        )';
      END IF;
    END$$;`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT to_regclass('public.${this.table}') AS t`
    )
    if (!exists?.[0]?.t) return

    // Reverts the guard only — deleted rows cannot be restored.
    await queryRunner.query(`ALTER TABLE ${this.table} DROP CONSTRAINT IF EXISTS "${this.nonBlankCheck}"`)
    await queryRunner.query(`
      ALTER TABLE ${this.table}
        ALTER COLUMN awb     DROP NOT NULL,
        ALTER COLUMN account DROP NOT NULL,
        ALTER COLUMN via     DROP NOT NULL,
        ALTER COLUMN dest    DROP NOT NULL
    `)
  }
}
