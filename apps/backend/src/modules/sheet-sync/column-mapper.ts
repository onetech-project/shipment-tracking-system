import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'

export interface ColumnMap {
  /** Sheet column names that have a matching DB column */
  valid: string[]
  /** Sheet column names not found in the DB table (warned + skipped) */
  skipped: string[]
  /** The column identified as the primary key for row matching */
  pkColumn: string
}

@Injectable()
export class ColumnMapperService {
  private readonly logger = new Logger(ColumnMapperService.name)
  /** Cache of DB column names per table, populated on first use per cycle */
  private dbColumnCache: Set<string> | null = null

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService
  ) {}

  /**
   * Clears the column cache so the next call to buildColumnMap re-fetches
   * column metadata. Call once at the start of each sync cycle.
   */
  clearCache(): void {
    this.dbColumnCache = null
  }

  /**
   * Builds a runtime ColumnMap from the sheet's header row.
   * Performs a one-time DB metadata query (per module lifecycle) to filter
   * columns that don't exist in the target table.
   */
  async buildColumnMap(headerRow: string[]): Promise<ColumnMap> {
    const table = this.config.getOrThrow<string>('SHEET_SYNC_TABLE')
    const pkColumn = this.config.getOrThrow<string>('SHEET_SYNC_PK_COLUMN')

    if (!this.dbColumnCache) {
      const rows: Array<{ column_name: string }> = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [table]
      )
      this.dbColumnCache = new Set(rows.map((r) => r.column_name))
    }

    const valid: string[] = []
    const skipped: string[] = []

    for (const col of headerRow) {
      if (!col || col.trim() === '') continue
      const trimmed = col.trim()
      if (this.dbColumnCache.has(trimmed)) {
        valid.push(trimmed)
      } else {
        skipped.push(trimmed)
        this.logger.warn(`Unknown sheet column: "${trimmed}" — skipping`)
      }
    }

    return { valid, skipped, pkColumn }
  }
}
