import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { SheetsService } from './sheets.service'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'
import { quoteIdentifier } from '@shared/quoteIdentifier'

@Injectable()
export class DynamicTableService {
  private readonly logger = new Logger(DynamicTableService.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly sheetsService: SheetsService
  ) {}

  /**
   * Ensure the physical Postgres table exists for a sheet config.
   * Idempotent: uses IF NOT EXISTS for table/index/columns where possible.
   * Does not throw on DB errors — logs and returns failure result so caller can continue.
   */
  async ensureTable(cfg: GoogleSheetSheetConfig): Promise<{ success: boolean; message?: string }> {
    try {
      const tableName = cfg.tableName || ''
      if (!tableName || typeof tableName !== 'string') {
        this.logger.error(`[DynamicTableService] Invalid table name for sheet ${cfg.sheetName}`)
        return { success: false, message: 'invalid table name' }
      }

      // Validate table name (simple check: starts with letter and contains only a-z0-9_)
      if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
        this.logger.error(`[DynamicTableService] Unsafe table name: ${tableName}`)
        return { success: false, message: 'unsafe table name' }
      }

      const qTable = quoteIdentifier(tableName)

      // 1) Create base table if not exists
      const createSql = `CREATE TABLE IF NOT EXISTS ${qTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        is_locked BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_synced_at TIMESTAMPTZ,
        extra_fields JSONB DEFAULT '{}'::jsonb
      )`

      await this.dataSource.query(createSql)

      // 2) Ensure unique key columns exist
      const rawKeys = cfg.uniqueKey ?? []
      const keys: string[] = Array.isArray(rawKeys) ? rawKeys : JSON.parse(String(rawKeys || '[]'))

      for (const k of keys) {
        if (!k || typeof k !== 'string') continue
        const colName = k.trim()
        if (!/^[a-z][a-z0-9_]*$/.test(colName)) {
          this.logger.warn(`[DynamicTableService] Skipping invalid unique key column: ${colName}`)
          continue
        }
        const qCol = quoteIdentifier(colName)
        const addColSql = `ALTER TABLE ${qTable} ADD COLUMN IF NOT EXISTS ${qCol} TEXT`
        await this.dataSource.query(addColSql)
      }

      // 3) Reconcile the UNIQUE constraint. Changing uniqueKey (e.g. ['awb'] ->
      // ['awb','account','via','dest'] or back) means the previously generated constraint no
      // longer matches. We must both add the new one and drop the obsolete one(s).
      //
      // ORDER MATTERS: add the current constraint FIRST, then drop obsolete ones. If we dropped
      // first and the ADD then failed (e.g. the new key set is violated by existing duplicate
      // rows), the table would be left with NO unique constraint at all — which silently breaks
      // upsert's `ON CONFLICT (<keys>)` ("no unique or exclusion constraint matching the ON
      // CONFLICT specification"). Adding first means a failure here throws before we drop
      // anything, so the previous constraint stays intact and the error is surfaced clearly.
      const currentConstraintName = keys.length > 0 ? `uq_${tableName}_${keys.join('_')}` : null

      // 3a) Add the current UNIQUE constraint if not present.
      if (currentConstraintName) {
        const qConstraint = quoteIdentifier(currentConstraintName)
        const colsList = keys
          .filter((c) => typeof c === 'string' && c.trim().length > 0)
          .map((c) => quoteIdentifier(c.trim()))
          .join(', ')

        if (colsList.length > 0) {
          const addConstraintSql = `DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = '${currentConstraintName}'
            ) THEN
              EXECUTE 'ALTER TABLE ${qTable} ADD CONSTRAINT ${qConstraint} UNIQUE (${colsList})';
            END IF;
          END$$;`
          try {
            await this.dataSource.query(addConstraintSql)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            // Almost always: existing rows already violate the new key set. Surface a clear,
            // actionable error and DO NOT drop the existing constraint(s) below.
            this.logger.error(
              `[DynamicTableService] Failed to add unique constraint ${currentConstraintName} ` +
                `on ${tableName} (existing rows likely violate keys [${keys.join(', ')}]): ${msg}`
            )
            throw err
          }
        }
      }

      // 3b) Drop any UNIQUE constraint we previously generated (prefix uq_<tableName>_) that is
      // no longer the current one. Only runs after the current constraint is safely in place.
      const obsoleteConstraints: Array<{ conname: string }> = await this.dataSource.query(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = $1::regclass
           AND contype = 'u'
           AND conname LIKE $2
           AND ($3::text IS NULL OR conname <> $3)`,
        [tableName, `uq_${tableName}_%`, currentConstraintName]
      )
      for (const { conname } of obsoleteConstraints) {
        // conname is derived from validated identifiers; still quote it to be safe
        await this.dataSource.query(
          `ALTER TABLE ${qTable} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(conname)}`
        )
        this.logger.log(
          `[DynamicTableService] Dropped obsolete unique constraint ${conname} on ${tableName}`
        )
      }

      // 4) Create GIN index on extra_fields
      const idxName = `idx_${tableName}_extra_gin`
      const qIdx = quoteIdentifier(idxName)
      const createIndexSql = `CREATE INDEX IF NOT EXISTS ${qIdx} ON ${qTable} USING GIN (extra_fields)`
      await this.dataSource.query(createIndexSql)

      // 5) Refresh in-memory table schemas so runtime can pick up new columns
      try {
        await this.sheetsService.reloadTableSchemas?.([tableName])
      } catch (err: unknown) {
        this.logger.warn(
          `[DynamicTableService] Failed to call reloadTableSchemas for ${tableName}: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      this.logger.log(`[DynamicTableService] Ensured table ${tableName}`)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[DynamicTableService] ensureTable failed: ${message}`)
      return { success: false, message }
    }
  }
}
