import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { google, sheets_v4 } from 'googleapis'
import { normalizeHeader, makeUniqueHeaders } from './normalizer'
import { coerceValue } from './coercer'
import { SheetConfig, SheetResult } from './sheet-config.interface'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const RETRY_DELAYS_MS = [2000, 4000, 6000]

@Injectable()
export class SheetsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SheetsService.name)
  private gsheetConfigs: GoogleSheetConfig[]
  private sheetConfigs: SheetConfig[] = []
  private sheetsApi!: sheets_v4.Sheets
  private tableSchemas: Map<string, string[]> = new Map()

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(GoogleSheetConfig)
    private readonly googleSheetConfigRepo: Repository<GoogleSheetConfig>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Reload table schemas from information_schema for tables matching air_shipment_%.
   * If `tables` is provided, reload only those tables.
   */
  async reloadTableSchemas(tables?: string[]): Promise<void> {
    try {
      if (Array.isArray(tables) && tables.length > 0) {
        for (const t of tables) {
          const rows: { column_name: string }[] = await this.dataSource.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
            [t]
          )
          this.tableSchemas.set(
            t,
            rows.map((r) => r.column_name)
          )
        }
      } else {
        const rows: { table_name: string; column_name: string }[] = await this.dataSource.query(
          `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'air_shipment_%' ORDER BY table_name, ordinal_position`
        )
        this.tableSchemas.clear()
        for (const r of rows) {
          const arr = this.tableSchemas.get(r.table_name) ?? []
          arr.push(r.column_name)
          this.tableSchemas.set(r.table_name, arr)
        }
      }
      this.logger.log('[SheetsService] reloadTableSchemas completed')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`[SheetsService] Failed to reload table schemas: ${message}`)
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    const credentialsPath = this.config.getOrThrow<string>('GOOGLE_CREDENTIALS_PATH')
    const auth = new google.auth.GoogleAuth({
      keyFilename: credentialsPath,
      scopes: [READONLY_SCOPE],
    })
    this.sheetsApi = google.sheets({ version: 'v4', auth })

    // Load and validate sheet config once at startup (FR-010)
    try {
      this.gsheetConfigs = await this.googleSheetConfigRepo.find({
        where: { enabled: true },
        relations: ['sheetConfigs'],
      })
      if (!Array.isArray(this.gsheetConfigs) || this.gsheetConfigs.length === 0) {
        this.logger.warn(`[SheetsService] No enabled Google Sheet config found in DB`)
        return
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`[SheetsService] Failed to load sheet config from DB: ${message}`)
    }

    this.gsheetConfigs = this.gsheetConfigs.filter((cfg: GoogleSheetConfig) => {
      if (!cfg.sheetId) {
        this.logger.warn(
          `[SheetsService] Google Sheet config "${cfg.label}" is missing sheetId — skipping`
        )
        return false
      }
      if (!cfg.sheetConfigs || !Array.isArray(cfg.sheetConfigs) || cfg.sheetConfigs.length === 0) {
        this.logger.warn(
          `[SheetsService] Google Sheet config "${cfg.label}" has no valid sheetConfigs — skipping`
        )
        return false
      }
      return true
    })

    this.sheetConfigs = this.gsheetConfigs.flatMap((cfg) =>
      cfg.sheetConfigs.map((c) => ({
        sheetName: c.sheetName,
        tableName: c.tableName,
        headerRow: c.headerRow,
        uniqueKey: c.uniqueKey,
        skipNullCols: c.skipNullCols,
        sheetId: cfg.sheetId,
      }))
    )

    if (this.gsheetConfigs.length > 0 && this.sheetConfigs.length > 0) {
      this.logger.log(
        `${this.gsheetConfigs.length} Google Sheet configs loaded: ${this.sheetConfigs.length} sheets configured`
      )
      this.eventEmitter.emit('gsheetConfig.ready', this.gsheetConfigs)
    }
  }

  /**
   * Fetch all configured sheets in a single batchGet call (FR-006).
   * Returns normalized SheetResult[] with headers and coerced row objects.
   */
  async fetchAllSheets(sheetId: string): Promise<SheetResult[]> {
    const cfg = this.gsheetConfigs.find((c) => c.sheetId === sheetId)
    const ranges = cfg.sheetConfigs.map((c) => `${c.sheetName}!A:ZZ`)

    let valueRanges: sheets_v4.Schema$ValueRange[]

    try {
      const response = await this.sheetsApi.spreadsheets.values.batchGet({
        spreadsheetId: cfg.sheetId,
        ranges,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      })
      valueRanges = response.data.valueRanges ?? []
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[SheetsService] Google Sheets API error: ${message}`,
        err instanceof Error ? err.stack : undefined
      )
      return cfg.sheetConfigs.map((c) => ({
        sheetName: c.sheetName,
        tableName: c.tableName,
        uniqueKey: c.uniqueKey,
        headers: [],
        rows: [],
      }))
    }

    const results: SheetResult[] = []

    for (let i = 0; i < cfg.sheetConfigs.length; i++) {
      const sheetCfg = cfg.sheetConfigs[i]
      let data = (valueRanges[i]?.values ?? []) as unknown[][]

      // Per-sheet empty-response retry with backoff (FR-008)
      if (data.length === 0) {
        data = await this.retryFetchSheet(sheetCfg.sheetName, cfg.sheetId)
      }

      if (data.length === 0) {
        this.logger.warn(
          `[SheetsService] Sheet "${sheetCfg.sheetName}" returned empty data after retries — skipping`
        )
        results.push({
          sheetName: sheetCfg.sheetName,
          tableName: sheetCfg.tableName,
          uniqueKey: sheetCfg.uniqueKey,
          headers: [],
          rows: [],
        })
        continue
      }

      const headerRowIndex = sheetCfg.headerRow - 1 // convert 1-based to 0-based
      const rawHeaders = (data[headerRowIndex] ?? []) as string[]
      const normalizedRaw = rawHeaders.map((h) => normalizeHeader(String(h ?? '')))

      // Handle skipNullCols (FR-014–FR-015)
      const includedIndices: number[] = []
      const filteredHeaders: string[] = []

      normalizedRaw.forEach((h, idx) => {
        if (h === '') {
          if (sheetCfg.skipNullCols) {
            // silently drop (FR-014)
          } else {
            this.logger.warn(
              `[SheetsService] Sheet "${sheetCfg.sheetName}" col index ${idx} has null/empty header — skipping column (FR-015)`
            )
          }
        } else {
          includedIndices.push(idx)
          filteredHeaders.push(h)
        }
      })

      const uniqueHeaders = makeUniqueHeaders(filteredHeaders)

      // Normalise uniqueKey to array for uniform handling
      const keyColumns = Array.isArray(sheetCfg.uniqueKey)
        ? sheetCfg.uniqueKey
        : [sheetCfg.uniqueKey]

      // Build row objects from data rows below the header row
      const rows: Record<string, unknown>[] = []
      let skippedEmptyRow = 0
      let skippedEmptyKey = 0

      for (let r = headerRowIndex + 1; r < data.length; r++) {
        const rawRow = (data[r] ?? []) as string[]
        const row: Record<string, unknown> = {}

        for (let c = 0; c < includedIndices.length; c++) {
          const colIndex = includedIndices[c]
          const header = uniqueHeaders[c]
          const rawValue = String(rawRow[colIndex] ?? '')
          row[header] = coerceValue(rawValue, {
            sheet: sheetCfg.sheetName,
            row: r + 1,
            col: header,
          })
        }

        // Skip completely empty rows (baris kosong di tengah sheet)
        const isEmptyRow = Object.values(row).every(
          (v) => v === null || v === undefined || String(v).trim() === ''
        )
        if (isEmptyRow) {
          skippedEmptyRow++
          continue
        }

        // Skip row kalau salah satu uniqueKey column kosong / null
        const missingKey = keyColumns.find((k) => {
          const val = row[k]
          return val === null || val === undefined || String(val).trim() === ''
        })
        if (missingKey) {
          skippedEmptyKey++
          continue
        }

        rows.push(row)
      }

      if (skippedEmptyRow > 0)
        this.logger.debug(
          `[SheetsService] Skipped ${skippedEmptyRow} empty rows in sheet "${sheetCfg.sheetName}"`
        )
      if (skippedEmptyKey > 0)
        this.logger.warn(
          `[SheetsService] Skipped ${skippedEmptyKey} rows with missing unique key in sheet "${sheetCfg.sheetName}"`
        )

      results.push({
        sheetName: sheetCfg.sheetName,
        tableName: sheetCfg.tableName,
        uniqueKey: sheetCfg.uniqueKey,
        headers: uniqueHeaders,
        rows,
      })
    }

    return results
  }

  private async retryFetchSheet(sheetName: string, sheetId: string): Promise<unknown[][]> {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delayMs = RETRY_DELAYS_MS[attempt]
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      this.logger.warn(
        `[SheetsService] Retry ${attempt + 1}/${RETRY_DELAYS_MS.length} for sheet "${sheetName}"…`
      )

      try {
        const response = await this.sheetsApi.spreadsheets.values.batchGet({
          spreadsheetId: sheetId,
          ranges: [`${sheetName}!A:ZZ`],
          valueRenderOption: 'FORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING',
        })
        const data = (response.data.valueRanges?.[0]?.values ?? []) as unknown[][]
        if (data.length > 0) return data
      } catch (_err) {
        // Swallow per-retry errors; let the outer caller handle the empty result
      }
    }
    return []
  }

  @OnEvent('gsheetConfig.created') onConfigCreate(newConfig: GoogleSheetConfig) {
    this.logger.log('Google Sheet config created event received, adding to memory...')
    try {
      if (newConfig) {
        this.gsheetConfigs.push(newConfig)
        this.sheetConfigs = this.gsheetConfigs.flatMap((cfg) =>
          cfg.sheetConfigs.map((c) => ({
            sheetName: c.sheetName,
            tableName: c.tableName,
            headerRow: c.headerRow,
            uniqueKey: c.uniqueKey,
            skipNullCols: c.skipNullCols,
            sheetId: cfg.sheetId,
          }))
        )
        this.logger.log(`Sheet config added: ${this.sheetConfigs.length} sheets configured`)
      } else {
        this.logger.warn('No enabled Google Sheet config found during create event')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[SheetsService] Failed to add new sheet config to memory: ${message}`)
    }
  }

  @OnEvent('gsheetConfig.updated') onConfigUpdate(newConfig: GoogleSheetConfig) {
    this.logger.log('Google Sheet config updated event received, reloading config...')
    try {
      if (newConfig) {
        if (this.gsheetConfigs.some((cfg) => cfg.id === newConfig.id)) {
          this.logger.log(`Updating existing config "${newConfig.label}" in memory`)
          this.gsheetConfigs = this.gsheetConfigs.map((cfg) =>
            cfg.id === newConfig.id ? newConfig : cfg
          )
        }

        this.sheetConfigs = this.gsheetConfigs.flatMap((cfg) =>
          cfg.sheetConfigs.map((c) => ({
            sheetName: c.sheetName,
            tableName: c.tableName,
            headerRow: c.headerRow,
            uniqueKey: c.uniqueKey,
            skipNullCols: c.skipNullCols,
            sheetId: cfg.sheetId,
          }))
        )
        this.logger.log(`Sheet config reloaded: ${this.sheetConfigs.length} sheets configured`)
      } else {
        this.logger.warn('No enabled Google Sheet config found during update event')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[SheetsService] Failed to reload sheet config from DB: ${message}`)
    }
  }

  @OnEvent('gsheetConfig.deleted') onConfigDelete(payload: { id: string }) {
    this.logger.log(
      `Google Sheet config deleted event received for id ${payload.id}, removing from memory...`
    )
    this.gsheetConfigs = this.gsheetConfigs.filter((cfg) => cfg.id !== payload.id)
    this.sheetConfigs = this.sheetConfigs.filter((sc) => sc.sheetId !== payload.id)
    this.logger.log(`Sheet config removed: ${this.sheetConfigs.length} sheets remaining`)
  }
}
