import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SheetsService } from './sheets.service'
import { SyncNotificationGateway } from './sync-notification.gateway'
import { AirShipmentCgk } from './entities/air-shipment-cgk.entity'
import { AirShipmentSub } from './entities/air-shipment-sub.entity'
import { AirShipmentSda } from './entities/air-shipment-sda.entity'
import { RatePerStation } from './entities/rate-per-station.entity'
import { RouteMaster } from './entities/route-master.entity'
import { ChunkError, RowError, SheetResult } from './sheet-config.interface'

/** System-managed columns that are never diff-compared against sheet data */
const SYSTEM_COLUMNS = new Set(['id', 'is_locked', 'last_synced_at', 'created_at', 'updated_at'])

@Injectable()
export class AirShipmentsService {
  private readonly logger = new Logger(AirShipmentsService.name)
  private readonly repoMap: Map<string, Repository<any>>

  constructor(
    private readonly sheetsService: SheetsService,
    @Optional() private readonly gateway: SyncNotificationGateway | null,
    @InjectRepository(AirShipmentCgk) private readonly cgkRepo: Repository<AirShipmentCgk>,
    @InjectRepository(AirShipmentSub) private readonly subRepo: Repository<AirShipmentSub>,
    @InjectRepository(AirShipmentSda) private readonly sdaRepo: Repository<AirShipmentSda>,
    @InjectRepository(RatePerStation) private readonly rateRepo: Repository<RatePerStation>,
    @InjectRepository(RouteMaster) private readonly routeRepo: Repository<RouteMaster>
  ) {
    this.repoMap = new Map<string, Repository<any>>([
      ['air_shipments_cgk', this.cgkRepo],
      ['air_shipments_sub', this.subRepo],
      ['air_shipments_sda', this.sdaRepo],
      ['rate_per_station', this.rateRepo],
      ['route_master', this.routeRepo],
    ])
  }

  /** Returns the TypeORM Repository for a given table name. */
  private repoFor(tableName: string): Repository<any> {
    const repo = this.repoMap.get(tableName)
    if (!repo) throw new Error(`No repository registered for table "${tableName}"`)
    return repo
  }

  /**
   * Executes a full sync cycle:
   * 1. Fetch all sheets via SheetsService
   * 2. For each sheet, diff incoming rows against DB
   * 3. Upsert changed/new rows; skip locked rows and unchanged rows
   *
   * FR-028–FR-046
   */
  async runSyncCycle(): Promise<{ affectedTables: string[]; totalUpserted: number }> {
    const startedAt = Date.now()
    const configs = this.sheetsService.getConfigs()
    const results = await this.sheetsService.fetchAllSheets(configs)

    const sheetResults = await Promise.all(results.map((sheet) => this.processSingleSheet(sheet)))

    const affectedTables = sheetResults.filter((r) => r.upserted > 0).map((r) => r.tableName)
    const totalUpserted = sheetResults.reduce((sum, r) => sum + r.upserted, 0)

    const durationMs = Date.now() - startedAt
    this.logger.log(
      `[sync] Cycle complete in ${durationMs}ms — ${totalUpserted} upserted across ${affectedTables.length} table(s)`
    )

    // Summary log per sheet
    for (const { tableName, rowErrors, chunkErrors } of sheetResults) {
      if (rowErrors.length > 0 || chunkErrors.length > 0) {
        this.logger.error(
          `[sync] ${tableName}: ${rowErrors.length} row error(s), ${chunkErrors.length} chunk error(s)\n` +
            this.formatErrorSummary(rowErrors, chunkErrors)
        )
      }
    }

    if (totalUpserted > 0 && this.gateway) {
      this.gateway.notifyClients({
        affectedTables,
        totalUpserted,
        syncedAt: new Date().toISOString(),
      })
    }

    return { affectedTables, totalUpserted }
  }

  private async processSingleSheet(sheet: SheetResult): Promise<{
    tableName: string
    upserted: number
    rowErrors: RowError[]
    chunkErrors: ChunkError[]
  }> {
    const { tableName, uniqueKey, headers, rows, sheetName } = sheet
    const keyColumns = Array.isArray(uniqueKey) ? uniqueKey : [uniqueKey]
    const rowErrors: RowError[] = []
    const chunkErrors: ChunkError[] = []

    const missingKeys = keyColumns.filter((k) => !headers.includes(k))
    if (missingKeys.length > 0) {
      this.logger.warn(
        `[sync] "${sheetName}" missing key column(s) "${missingKeys.join(', ')}" — skipping`
      )
      return { tableName, upserted: 0, rowErrors, chunkErrors }
    }

    if (rows.length === 0) return { tableName, upserted: 0, rowErrors, chunkErrors }

    const rowKey = (row: Record<string, unknown>): string =>
      keyColumns.map((k) => String(row[k] ?? '')).join('\x00')

    const repo = this.repoFor(tableName)

    // Fetch existing rows — only key columns + data columns needed for diff
    const existingRows = await repo.createQueryBuilder('t').select('t.*').getRawMany()
    const existingMap = new Map<string, Record<string, unknown>>()
    for (const row of existingRows) existingMap.set(rowKey(row), row)

    let lockedSkipped = 0
    let noChangeSkipped = 0
    const rowsToUpsert: Record<string, unknown>[] = []

    for (const incomingRow of rows) {
      if (incomingRow['is_locked'] === true) {
        lockedSkipped++
        continue
      }

      const existing = existingMap.get(rowKey(incomingRow))
      if (existing) {
        const hasChanges = Object.keys(incomingRow).some(
          (k) =>
            !SYSTEM_COLUMNS.has(k) &&
            this.normalizeForDiff(incomingRow[k]) !== this.normalizeForDiff(existing[k])
        )
        if (!hasChanges) {
          noChangeSkipped++
          continue
        }
      }

      rowsToUpsert.push({ ...incomingRow, last_synced_at: new Date() })
    }

    // Batch upsert in chunks
    const CHUNK_SIZE = 500
    const updateColumns = headers.filter((h) => !keyColumns.includes(h) && !SYSTEM_COLUMNS.has(h))
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE)

      try {
        await repo
          .createQueryBuilder()
          .insert()
          .into(tableName)
          .values(chunk)
          .orUpdate(updateColumns, keyColumns)
          .execute()
      } catch (err) {
        const errorType = this.classifyError(err as Error)

        // Log chunk-level error
        chunkErrors.push({
          tableName,
          chunkStart: i,
          chunkEnd: i + chunk.length,
          errorType,
          message: (err as Error).message,
          rowCount: chunk.length,
        })

        this.logger.warn(
          `[sync] ${tableName}: chunk [${i}–${i + chunk.length}] failed (${errorType}) — ` +
            `falling back to row-by-row. Reason: ${(err as Error).message}`
        )

        // Fallback row-by-row
        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j]
          try {
            await repo
              .createQueryBuilder()
              .insert()
              .into(tableName)
              .values(row)
              .orUpdate(updateColumns, keyColumns)
              .execute()
          } catch (rowErr: unknown) {
            const rowErrorType = this.classifyError(rowErr as Error)
            const key = rowKey(row)

            rowErrors.push({
              tableName,
              rowKey: key,
              rowIndex: i + j,
              errorType: rowErrorType,
              message: (rowErr as Error).message,
              rowData: this.sanitizeRowForLog(row), // hapus data sensitif kalau ada
            })

            this.logger.warn(
              `[sync] ${tableName}: row skipped — ` +
                `key="${key}" index=${i + j} type=${rowErrorType} reason="${(rowErr as Error).message}"`
            )
          }
        }
      }
    }

    return { tableName, upserted: rowsToUpsert.length - rowErrors.length, rowErrors, chunkErrors }
  }

  private normalizeForDiff = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return '__NULL__'
    if (val instanceof Date) return val.toISOString()
    return String(val).trim()
  }

  private classifyError(err: Error): RowError['errorType'] {
    const msg = err.message.toLowerCase()
    if (msg.includes('unique') || msg.includes('duplicate')) return 'UNIQUE_CONSTRAINT'
    if (msg.includes('column') || msg.includes('does not exist')) return 'COLUMN_MISMATCH'
    return 'UNKNOWN'
  }

  // Format summary yang mudah dibaca
  private formatErrorSummary(rowErrors: RowError[], chunkErrors: ChunkError[]): string {
    const lines: string[] = []

    if (chunkErrors.length > 0) {
      lines.push('  Chunk errors:')
      for (const e of chunkErrors) {
        lines.push(`    [${e.errorType}] rows ${e.chunkStart}–${e.chunkEnd}: ${e.message}`)
      }
    }

    if (rowErrors.length > 0) {
      lines.push('  Row errors:')
      // Group by errorType supaya tidak banjir log kalau banyak error sejenis
      const grouped = rowErrors.reduce(
        (acc, e) => {
          acc[e.errorType] = acc[e.errorType] ?? []
          acc[e.errorType].push(e)
          return acc
        },
        {} as Record<string, RowError[]>
      )

      for (const [type, errors] of Object.entries(grouped)) {
        lines.push(`    [${type}] ${errors.length} row(s):`)
        for (const e of errors.slice(0, 5)) {
          // max 5 per group supaya tidak spam
          lines.push(`      row ${e.rowIndex} key="${e.rowKey}": ${e.message}`)
        }
        if (errors.length > 5) {
          lines.push(`      ... and ${errors.length - 5} more`)
        }
      }
    }

    return lines.join('\n')
  }

  // Hapus field yang mungkin sensitif sebelum masuk log
  private sanitizeRowForLog(row: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE_KEYS = new Set(['link_evidence_of_arrival_wh_destination'])
    return Object.fromEntries(Object.entries(row).filter(([k]) => !SENSITIVE_KEYS.has(k)))
  }

  // ──────────────────────────────────────────────────
  // US3 — Paginated REST query methods (FR-035–FR-037)
  // ──────────────────────────────────────────────────

  private async paginatedQuery<T extends object>(
    repo: Repository<T>,
    {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
    }: {
      page: number
      limit: number
      sortBy: string
      sortOrder: 'asc' | 'desc'
      search?: string
    },
    tableName?: string
  ) {
    // Guard against sorting by a column that doesn't exist on this entity (avoids DB 500)
    const columns = repo.metadata.columns.map((c) => c.propertyName)
    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id'

    // Searchable fields for air shipments tables
    const SEARCHABLE_FIELDS = [
      'to_number',
      'lt_number',
      'flight_no',
      'nopol_pickup',
      'driver_name_pickup',
      'actual_airline_name',
    ]

    let where: any = undefined
    if (
      search &&
      typeof search === 'string' &&
      search.trim() &&
      ['air_shipments_cgk', 'air_shipments_sub', 'air_shipments_sda'].includes(tableName || '')
    ) {
      // Use ILike for case-insensitive partial match
      const { ILike } = require('typeorm')
      where = SEARCHABLE_FIELDS.map((field) => ({ [field]: ILike(`%${search}%`) }))
    }

    const [data, total] = await repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [safeSortBy]: sortOrder.toUpperCase() } as any,
      ...(where ? { where } : {}),
    })
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  findAllCgk(query: {
    page: number
    limit: number
    sortBy: string
    sortOrder: 'asc' | 'desc'
    search?: string
  }) {
    return this.paginatedQuery(this.cgkRepo, query, 'air_shipments_cgk')
  }

  findAllSub(query: {
    page: number
    limit: number
    sortBy: string
    sortOrder: 'asc' | 'desc'
    search?: string
  }) {
    return this.paginatedQuery(this.subRepo, query, 'air_shipments_sub')
  }

  findAllSda(query: {
    page: number
    limit: number
    sortBy: string
    sortOrder: 'asc' | 'desc'
    search?: string
  }) {
    return this.paginatedQuery(this.sdaRepo, query, 'air_shipments_sda')
  }

  findAllRate(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }) {
    return this.paginatedQuery(this.rateRepo, query)
  }

  findAllRoutes(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }) {
    return this.paginatedQuery(this.routeRepo, query)
  }
}
