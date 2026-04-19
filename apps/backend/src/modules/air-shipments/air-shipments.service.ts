import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { SheetsService } from './sheets.service'
import { DynamicTableService } from './dynamic-table.service'
import { SyncNotificationGateway } from './sync-notification.gateway'
import { ChunkError, RowError, SheetResult } from './sheet-config.interface'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'
import { GoogleSheetConfigDto } from './dto/google-sheet-config.dto'
import { EventEmitter2 } from '@nestjs/event-emitter'

/** System-managed columns that are never diff-compared against sheet data */
const SYSTEM_COLUMNS = new Set(['id', 'is_locked', 'last_synced_at', 'created_at', 'updated_at'])

@Injectable()
export class AirShipmentsService {
  private readonly logger = new Logger(AirShipmentsService.name)
  private readonly repoMap: Map<string, Repository<any>>

  constructor(
    private readonly sheetsService: SheetsService,
    @Optional() private readonly gateway: SyncNotificationGateway | null,
    @InjectRepository(GoogleSheetConfig)
    private readonly googleSheetConfigRepo: Repository<GoogleSheetConfig>,
    @InjectRepository(GoogleSheetSheetConfig)
    private readonly googleSheetSheetConfigRepo: Repository<GoogleSheetSheetConfig>,
    private readonly dynamicTableService: DynamicTableService,
    private readonly eventEmitter: EventEmitter2, // inject EventEmitter2
    private readonly dataSource: DataSource
  ) {}

  /**
   * Paginated read for dynamic air_shipment_* tables.
   * Allows basic paging and sorting. Validates table name to prevent SQL injection.
   */
  async findAllForTable(
    tableName: string,
    {
      page = 1,
      limit = 50,
      sortBy = 'id',
      sortOrder = 'asc',
      search,
    }: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc'; search?: string }
  ) {
    // Basic validation: only allow tables with air_shipments_ prefix
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    // Load columns from information_schema
    const cols: { column_name: string }[] = await this.dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    )
    const columns = cols.map((c) => c.column_name)

    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id'
    const offset = (page - 1) * limit

    // Basic search support: search against text columns and extra_fields JSONB via ILIKE
    const whereClauses: string[] = []
    const params: any[] = []
    if (search && String(search).trim()) {
      const s = `%${String(search).trim()}%`
      const textCols = columns // choose text-like columns heuristically
        .filter(
          (c) => c !== 'extra_fields' && c !== 'id' && c !== 'is_locked' && c !== 'last_synced_at'
        )
        .slice(0, 5) // limit to first few to avoid huge queries
      const orConds = textCols.map((c, idx) => `${c}::text ILIKE $${params.length + idx + 1}`)
      params.push(...textCols.map(() => s))
      // extra_fields JSONB text search
      orConds.push(`${'extra_fields'}::text ILIKE $${params.length + 1}`)
      params.push(s)
      whereClauses.push(`(${orConds.join(' OR ')})`)
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const isJsonbSort = !columns.includes(sortBy)
    let orderBySql = isJsonbSort
      ? `ORDER BY extra_fields->>'${sortBy}' ${sortOrder.toUpperCase()}`
      : `ORDER BY "${safeSortBy}" ${sortOrder.toUpperCase()}`

    if (isJsonbSort && sortBy.toLowerCase().includes('date')) {
      // Cast to timestamp for proper date sorting if column name suggests it's a date
      orderBySql = `ORDER BY (NULLIF(extra_fields->>'${sortBy}', ''))::timestamp ${sortOrder.toUpperCase()}`
    }

    const rows = await this.dataSource.query(
      `SELECT * FROM "${tableName}" 
      ${whereSql} ${orderBySql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    const countRes = await this.dataSource.query(
      `SELECT count(*)::int FROM "${tableName}" ${whereSql}`,
      params
    )
    const total = countRes?.[0]?.count ?? 0

    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  /**
   * Executes a full sync cycle:
   * 1. Fetch all sheets via SheetsService
   * 2. For each sheet, diff incoming rows against DB
   * 3. Upsert changed/new rows; skip locked rows and unchanged rows
   *
   * FR-028–FR-046
   */
  async runSyncCycle(
    sheetId: string
  ): Promise<{ affectedTables: string[]; totalUpserted: number }> {
    const startedAt = Date.now()
    const results = await this.sheetsService.fetchAllSheets(sheetId)

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
        `[sync] "${sheetName}" missing key column(s)  "${missingKeys.join(', ')}" — skipping`
      )
      return { tableName, upserted: 0, rowErrors, chunkErrors }
    }

    if (rows.length === 0) return { tableName, upserted: 0, rowErrors, chunkErrors }

    const rowKey = (row: Record<string, unknown>): string =>
      keyColumns.map((k) => String(row[k] ?? '')).join('\x00')

    // Fetch existing rows — only key columns + data columns needed for diff
    const existingRows = await this.dataSource
      .createQueryBuilder()
      .select('*')
      .from(tableName, 't')
      .getRawMany()
    const existingMap = new Map<string, Record<string, unknown>>()
    for (const row of existingRows) existingMap.set(rowKey(row), row)

    let lockedSkipped = 0
    let noChangeSkipped = 0
    const rowsToUpsert: Record<string, unknown>[] = []

    // Get all entity columns for this table (excluding extra_fields)
    const columnsResult = await this.dataSource.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = 'public'
      `,
      [tableName]
    )

    const entityColumns = columnsResult
      .map((c: any) => c.column_name)
      .filter((c: string) => c !== 'extra_fields')

    for (const incomingRow of rows) {
      const existing = existingMap.get(rowKey(incomingRow))

      // ✅ Cek is_locked dari DB (existing row), bukan dari sheet
      // Kalau row belum ada di DB (existing undefined), berarti INSERT baru → tidak di-skip
      if (existing && existing['is_locked'] === true) {
        lockedSkipped++
        continue
      }

      // Split known and unknown fields
      const regularFields: Record<string, unknown> = {}
      const extraFields: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(incomingRow)) {
        if (entityColumns.includes(k) && k !== 'extra_fields') {
          regularFields[k] = v
        } else if (!SYSTEM_COLUMNS.has(k)) {
          extraFields[k] = v
        }
      }
      if (Object.keys(extraFields).length > 0) {
        regularFields['extra_fields'] = extraFields
      }
      regularFields['last_synced_at'] = new Date()

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

      rowsToUpsert.push(regularFields)
    }

    // Batch upsert in chunks
    const CHUNK_SIZE = 500
    // Only include columns present in the entity plus 'extra_fields' in updateColumns for upsert
    const updateColumns = [...entityColumns, 'extra_fields']
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE)

      try {
        await this.upsertDynamic({
          tableName,
          data: chunk,
          keyColumns,
          updateColumns,
        })
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
            await this.upsertDynamic({
              tableName,
              data: [row],
              keyColumns,
              updateColumns,
            })
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

  upsertDynamic = async ({
    tableName,
    data,
    keyColumns,
    updateColumns,
  }: {
    tableName: string
    data: any[]
    keyColumns: string[]
    updateColumns: string[]
  }) => {
    if (!data.length) return

    // ✅ 1. sanitize table name (WAJIB)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new Error('Invalid table name')
    }

    // ✅ 2. deduplicate (FIX error ON CONFLICT)
    const dedupedMap = new Map<string, any>()
    for (const row of data) {
      const key = keyColumns.map((k) => row[k]).join('|')
      dedupedMap.set(key, row) // last wins
    }
    const dedupedData = Array.from(dedupedMap.values())

    // ✅ 3. ambil columns (dari row pertama)
    const columns = Object.keys(dedupedData[0])

    // ⚠️ safety: pastikan keyColumns ada di columns
    for (const key of keyColumns) {
      if (!columns.includes(key)) {
        throw new Error(`Key column "${key}" not found in data`)
      }
    }

    // ✅ 4. build values placeholder
    const values = dedupedData
      .map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`)
      .join(',')

    // ✅ 5. flatten values
    const flatValues = dedupedData.flatMap(
      (row) => columns.map((col) => row[col] ?? null) // handle undefined
    )

    // ✅ 6. handle updateSet kosong
    let onConflictClause = ''

    if (updateColumns.length > 0) {
      const updateSet = updateColumns
        .filter((col) => !keyColumns.includes(col)) // jangan update key
        .map((col) => `"${col}" = EXCLUDED."${col}"`)
        .join(', ')

      if (updateSet.length > 0) {
        onConflictClause = `
        ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
        DO UPDATE SET ${updateSet}
      `
      } else {
        onConflictClause = `
        ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
        DO NOTHING
      `
      }
    } else {
      onConflictClause = `
      ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
      DO NOTHING
    `
    }

    // ✅ 7. execute
    await this.dataSource.query(
      `
    INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
    VALUES ${values}
    ${onConflictClause}
    `,
      flatValues
    )
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
    const columns = repo.metadata.columns.map((c) => c.propertyName)
    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id'

    const DIRECT_SEARCHABLE = ['to_number', 'lt_number']
    const JSONB_SEARCHABLE = [
      'flight_no',
      'nopol_pickup',
      'driver_name_pickup',
      'actual_airline_name',
    ]

    const isAirShipmentTable = [
      'air_shipments_cgk',
      'air_shipments_sub',
      'air_shipments_sda',
    ].includes(tableName || '')

    const alias = 'entity'
    const qb = repo.createQueryBuilder(alias)

    if (search && typeof search === 'string' && search.trim() && isAirShipmentTable) {
      const conditions: string[] = []

      // Regular columns — direct ILIKE
      for (const field of DIRECT_SEARCHABLE) {
        conditions.push(`${alias}.${field} ILIKE :search`)
      }

      // JSONB fields — cast via ->>
      for (const field of JSONB_SEARCHABLE) {
        conditions.push(`${alias}.extra_fields->>'${field}' ILIKE :search`)
      }

      qb.where(`(${conditions.join(' OR ')})`, { search: `%${search}%` })
    }

    // Handle sort: JSONB field vs regular column
    const isJsonbSort = !columns.includes(sortBy)
    if (isJsonbSort) {
      qb.orderBy(`${alias}.extra_fields->>'${sortBy}'`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
    } else {
      qb.orderBy(`${alias}.${safeSortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
    }

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async getGoogleSheetConfig(): Promise<GoogleSheetConfig[]> {
    const config = await this.googleSheetConfigRepo.find({
      relations: ['sheetConfigs'],
    })
    return config
  }

  async createGoogleSheetConfig(
    dto: GoogleSheetConfigDto,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<GoogleSheetConfig> {
    const sheetId = this.extractSheetId(dto.sheetLink)
    const sheetEntities = (dto.sheetConfigs ?? []).map((sc) =>
      this.googleSheetSheetConfigRepo.create({
        sheetName: sc.sheetName,
        tableName: sc.tableName,
        headerRow: sc.headerRow,
        uniqueKey: sc.uniqueKey,
        skipNullCols: sc.skipNullCols ?? true,
      })
    )

    const config = this.googleSheetConfigRepo.create({
      ...dto,
      sheetId,
      sheetConfigs: sheetEntities,
    })

    const saved = await this.googleSheetConfigRepo.save(config)

    // Fire-and-forget table creation for sheets; do not block API response on failures
    if (Array.isArray(saved.sheetConfigs)) {
      void Promise.allSettled(
        saved.sheetConfigs.map((sc) => this.dynamicTableService.ensureTable(sc as any))
      )
    }

    this.eventEmitter.emit('gsheetConfig.created', saved)
    this.eventEmitter.emit('google_sheet_config.created', {
      actorId,
      resourceId: saved.id,
      ip,
      userAgent,
      after: saved,
      before: null,
    })

    return saved
  }

  async updateGoogleSheetConfig(
    id: string,
    dto: GoogleSheetConfigDto,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<GoogleSheetConfig> {
    const sheetId = this.extractSheetId(dto.sheetLink)
    const prev = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    const sheetConfigs = dto.sheetConfigs
    delete dto.sheetConfigs // remove sheetConfigs from dto to avoid confusion in update
    await this.googleSheetConfigRepo.update(id, { ...dto, sheetId })
    const config = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    // Determine which sheet configs are new or changed (uniqueKey change)
    try {
      const prevMap = new Map<string, any>()
      for (const p of prev?.sheetConfigs ?? []) prevMap.set(p.tableName, p)

      const toEnsure: any[] = []
      for (const sc of sheetConfigs ?? []) {
        const prevSc = sc.tableName ? prevMap.get(sc.tableName) : undefined
        if (!prevSc) {
          toEnsure.push(sc)
          continue
        }
        const prevKeys = Array.isArray(prevSc.uniqueKey) ? prevSc.uniqueKey : prevSc.uniqueKey || []
        const newKeys = Array.isArray(sc.uniqueKey) ? sc.uniqueKey : sc.uniqueKey || []
        const prevTableName = prevSc.tableName
        const newTableName = sc.tableName
        // If uniqueKey or tableName changed, we need to ensure the table again
        if (JSON.stringify(prevKeys) !== JSON.stringify(newKeys) || prevTableName !== newTableName)
          toEnsure.push(sc)
      }

      if (toEnsure.length > 0) {
        void Promise.allSettled(toEnsure.map((s) => this.dynamicTableService.ensureTable(s as any)))
      }
    } catch (err) {
      this.logger.warn(
        `[Sync] Failed to ensure tables after config update: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    config.sheetConfigs = sheetConfigs.map((sc) =>
      this.googleSheetSheetConfigRepo.create({
        ...sc,
        skipNullCols: true,
        googleSheetConfig: config,
      })
    )
    await this.googleSheetSheetConfigRepo.delete({ googleSheetConfig: { id } })
    const saved = await this.googleSheetConfigRepo.save(config)
    this.eventEmitter.emit('google_sheet_config.updated', {
      actorId,
      resourceId: id,
      ip,
      userAgent,
      after: saved,
      before: prev,
    })
    this.eventEmitter.emit('gsheetConfig.updated', saved) // Emit event khusus untuk SheetsService agar reload config di scheduler
    return saved
  }

  async deleteGoogleSheetConfig(
    id: string,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const prev = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    await this.googleSheetConfigRepo.delete(id)
    this.eventEmitter.emit('gsheetConfig.deleted', { id })
    this.eventEmitter.emit('google_sheet_config.deleted', {
      actorId,
      resourceId: id,
      ip,
      userAgent,
      after: null,
      before: prev,
    })
  }

  private extractSheetId(link: string): string {
    // Extracts the sheet ID from a Google Sheet link
    const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) throw new Error('Invalid Google Sheet link')
    return match[1]
  }

  async lockRow(tableName: string, id: string, locked: boolean, actorId?: string): Promise<string> {
    // use query builder to update is_locked column for the given id in the specified table
    await this.dataSource
      .createQueryBuilder()
      .update(tableName)
      .set({ is_locked: locked })
      .where('id = :id', { id })
      .execute()
    this.eventEmitter.emit('shipment_row.lock_changed', {
      actorId,
      resourceId: id,
      ip: undefined,
      userAgent: undefined,
      after: { is_locked: locked },
      before: { is_locked: !locked },
    })
    return `Row with id ${id} in table ${tableName} has been ${locked ? 'locked' : 'unlocked'}.`
  }

  /**
   * Batch lock/unlock rows by date range. Returns number of affected rows.
   */
  async batchLockByDate(
    tableName: string,
    start: string,
    end: string,
    locked: boolean,
    actorId?: string
  ): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    if (!start || !end) throw new BadRequestException('Start and end dates are required')

    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()))
      throw new BadRequestException('Invalid date range')

    // Ensure table has a `date` column
    const colRes = await this.dataSource.query(`
      SELECT 1
      FROM ${tableName}
      WHERE extra_fields ? 'date'
      LIMIT 1
    `)
    if (!colRes || colRes.length === 0)
      throw new BadRequestException('Table does not have a date column')

    const res = await this.dataSource.query(
      `UPDATE "${tableName}" SET is_locked = $1, updated_at = NOW() 
      WHERE (NULLIF(extra_fields->>'date', ''))::timestamp BETWEEN $2::timestamp AND $3::timestamp RETURNING id`,
      [locked, start, end]
    )
    const affected = res?.[1] ?? 0
    this.eventEmitter.emit('shipment_row.batch_lock_changed', {
      actorId,
      tableName,
      start,
      end,
      affected,
      locked,
    })
    return affected
  }

  /**
   * Batch delete rows by date range. Returns number of deleted rows.
   */
  async batchDeleteByDate(
    tableName: string,
    start: string,
    end: string,
    actorId?: string
  ): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    if (!start || !end) throw new BadRequestException('Start and end dates are required')

    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()))
      throw new BadRequestException('Invalid date range')

    // Ensure table has a `date` column
    const colRes = await this.dataSource.query(`
      SELECT 1
      FROM ${tableName}
      WHERE extra_fields ? 'date'
      LIMIT 1
    `)
    if (!colRes || colRes.length === 0)
      throw new BadRequestException('Table does not have a date column')

    const res = await this.dataSource.query(
      `DELETE FROM "${tableName}" WHERE (NULLIF(extra_fields->>'date', ''))::timestamp BETWEEN $1::timestamp AND $2::timestamp RETURNING id`,
      [start, end]
    )
    const deleted = res?.[1] ?? 0
    this.eventEmitter.emit('shipment_row.batch_deleted', {
      actorId,
      tableName,
      start,
      end,
      deleted,
    })
    return deleted
  }
}
