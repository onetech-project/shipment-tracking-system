import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import { GoogleSheetsService } from './google-sheets.service'
import { ColumnMapperService } from './column-mapper'
import { coerceValue } from './type-coercion.util'
import { SyncCycleResult } from './dto/sync-cycle-result.dto'
import { SyncGateway } from './sync.gateway'

@Injectable()
export class SheetSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SheetSyncService.name)
  private readonly INTERVAL_NAME = 'sheet-sync-interval'

  /** Prevents concurrent sync cycles (FR-009) */
  private isSyncing = false
  /**
   * Counts ticks that fired while isSyncing was true.
   * When > 1 the scheduler is paused until the in-flight cycle finishes (FR-010).
   */
  private pendingTickCount = 0

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dataSource: DataSource,
    private readonly sheetsService: GoogleSheetsService,
    private readonly columnMapper: ColumnMapperService,
    private readonly syncGateway: SyncGateway
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get<number>('SHEET_SYNC_INTERVAL_MS', 15_000)
    const table = this.config.get<string>('SHEET_SYNC_TABLE', '')
    this.logger.log(
      `SheetSyncModule initialized. Poll interval: ${intervalMs}ms, table: "${table}"`
    )
    this.startInterval(intervalMs)
  }

  /** T016 — clean shutdown via OnModuleDestroy */
  onModuleDestroy(): void {
    this.stopInterval()
    this.logger.log('SheetSyncService stopped.')
  }

  // ── Scheduler management ────────────────────────────────────────────────

  private startInterval(intervalMs: number): void {
    if (this.schedulerRegistry.doesExist('interval', this.INTERVAL_NAME)) {
      return // Already registered
    }
    const handle = setInterval(() => this.onTick(), intervalMs)
    this.schedulerRegistry.addInterval(this.INTERVAL_NAME, handle)
  }

  private stopInterval(): void {
    if (this.schedulerRegistry.doesExist('interval', this.INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(this.INTERVAL_NAME)
    }
  }

  // ── Tick handler ─────────────────────────────────────────────────────────

  private async onTick(): Promise<void> {
    if (this.isSyncing) {
      this.pendingTickCount += 1
      if (this.pendingTickCount > 1) {
        // Multiple ticks missed — pause the scheduler (FR-010)
        this.stopInterval()
        this.logger.warn(
          `Sync is taking longer than the poll interval. Scheduler paused until cycle completes.`
        )
      } else {
        this.logger.warn('Previous sync still running — skipping this tick.')
      }
      return
    }

    this.isSyncing = true
    try {
      await this.runSyncCycle()
    } finally {
      this.isSyncing = false
      // If the scheduler was paused due to missed ticks, resume it now.
      if (!this.schedulerRegistry.doesExist('interval', this.INTERVAL_NAME)) {
        const intervalMs = this.config.get<number>('SHEET_SYNC_INTERVAL_MS', 15_000)
        this.startInterval(intervalMs)
        this.logger.log('Scheduler resumed after in-flight cycle completed.')
      }
      this.pendingTickCount = 0
    }
  }

  // ── Core sync logic ───────────────────────────────────────────────────────

  async runSyncCycle(): Promise<SyncCycleResult> {
    const table = this.config.getOrThrow<string>('SHEET_SYNC_TABLE')
    // Validate table name to prevent SQL injection via interpolation
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
      throw new Error(`Invalid SHEET_SYNC_TABLE value: "${table}"`)
    }

    const startedAt = new Date()
    const result: SyncCycleResult = {
      table,
      startedAt,
      syncedAt: startedAt,
      totalRows: 0,
      skippedLocked: 0,
      skippedUnchanged: 0,
      upsertedCount: 0,
      errors: 0,
    }

    // T029 — log cycle start (US4)
    this.logger.log(`Starting sync cycle for table: ${table}`)

    // Clear column cache at the start of every cycle so header changes are picked up
    this.columnMapper.clearCache()

    // 1. Fetch sheet data
    const allRows = await this.sheetsService.getSheetRows()
    if (allRows.length <= 1) {
      this.logger.log('No data rows found in sheet — cycle complete with 0 rows.')
      result.syncedAt = new Date()
      return result
    }

    const [headerRow, ...dataRows] = allRows
    result.totalRows = dataRows.length

    // 2. Build column map
    const columnMap = await this.columnMapper.buildColumnMap(headerRow)
    const pkIdx = headerRow.indexOf(columnMap.pkColumn)

    if (pkIdx === -1) {
      this.logger.error(
        `PK column "${columnMap.pkColumn}" not found in sheet header — aborting cycle.`
      )
      result.syncedAt = new Date()
      return result
    }

    // 3. Fetch all existing DB rows (keyed by PK value) for change detection
    const existingRows: Record<string, Record<string, unknown>> = {}
    const dbRows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT * FROM "${table}"`
    )
    for (const row of dbRows) {
      const pk = String(row[columnMap.pkColumn])
      existingRows[pk] = row
    }

    const now = new Date()

    // 4. Process each data row
    for (const rawRow of dataRows) {
      const pkVal = rawRow[pkIdx]
      if (pkVal === undefined || pkVal === null || pkVal === '') continue

      try {
        // US2 (T019) — check is_locked before any comparison
        const isLockedIdx = headerRow.indexOf('is_locked')
        if (isLockedIdx !== -1) {
          const rawLocked = rawRow[isLockedIdx]
          if (typeof rawLocked === 'string' && rawLocked.toLowerCase() === 'true') {
            result.skippedLocked += 1
            continue
          }
        }

        // Build payload from valid columns only
        const payload: Record<string, unknown> = {}
        for (const col of columnMap.valid) {
          const colIdx = headerRow.indexOf(col)
          if (colIdx !== -1) {
            payload[col] = coerceValue(rawRow[colIdx])
          }
        }

        // Change detection — compare against existing row
        const existing = existingRows[String(pkVal)]
        if (existing) {
          let changed = false
          for (const col of columnMap.valid) {
            if (col === 'last_synced_at' || col === 'is_locked') continue
            const incomingVal = String(payload[col] ?? '')
            const existingVal = String(existing[col] ?? '')
            if (incomingVal !== existingVal) {
              changed = true
              break
            }
          }
          if (!changed) {
            result.skippedUnchanged += 1
            continue
          }
        }

        // Upsert — only reaches here when row is new or has changed
        payload['last_synced_at'] = now
        await this.dataSource.query(
          this.buildUpsertSql(table, columnMap.pkColumn, Object.keys(payload)),
          Object.values(payload)
        )
        result.upsertedCount += 1
      } catch (err: unknown) {
        // T031 (US4) — per-row error: log with context, do not abort cycle
        result.errors += 1
        this.logger.error(
          `Error processing row with pk="${pkVal}": ${(err as Error).message}`,
          (err as Error).stack
        )
      }
    }

    result.syncedAt = new Date()

    // T030 (US4) — end-of-cycle summary log
    this.logger.log(
      `Sync cycle complete — table=${table} total=${result.totalRows} ` +
        `upserted=${result.upsertedCount} skipped-unchanged=${result.skippedUnchanged} ` +
        `skipped-locked=${result.skippedLocked} errors=${result.errors}`
    )

    // US3 (T025) — emit WebSocket notification if any rows were written
    if (result.upsertedCount > 0) {
      this.syncGateway.notifyClients({
        table,
        upsertedCount: result.upsertedCount,
        syncedAt: result.syncedAt.toISOString(),
      })
    }

    return result
  }

  // ── SQL helpers ───────────────────────────────────────────────────────────

  /**
   * Builds a parameterised upsert SQL statement.
   * Column and table names are validated to contain only safe characters
   * before being interpolated (alphanumeric + underscore).
   */
  private buildUpsertSql(table: string, pkColumn: string, columns: string[]): string {
    const safe = (name: string) => {
      if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
        throw new Error(`Unsafe identifier: "${name}"`)
      }
      return `"${name}"`
    }

    const cols = columns.map(safe).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const updates = columns
      .filter((c) => c !== pkColumn)
      .map((c, i) => {
        // Map original index in columns array for the correct $N
        const originalIdx = columns.indexOf(c) + 1
        return `${safe(c)} = $${originalIdx}`
      })
      .join(', ')

    return (
      `INSERT INTO ${safe(table)} (${cols}) VALUES (${placeholders}) ` +
      `ON CONFLICT (${safe(pkColumn)}) DO UPDATE SET ${updates}`
    )
  }
}
