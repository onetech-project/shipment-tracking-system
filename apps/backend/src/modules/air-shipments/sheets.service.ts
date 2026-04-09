import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { readFileSync } from 'fs'
import { google, sheets_v4 } from 'googleapis'
import { normalizeHeader, makeUniqueHeaders } from './normalizer'
import { coerceValue } from './coercer'
import { SheetConfig, SheetResult } from './sheet-config.interface'

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const RETRY_DELAYS_MS = [2000, 4000, 6000]

@Injectable()
export class SheetsService implements OnModuleInit {
  private readonly logger = new Logger(SheetsService.name)
  private configs: SheetConfig[] = []
  private sheetsApi!: sheets_v4.Sheets
  private spreadsheetId!: string

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.spreadsheetId = this.config.getOrThrow<string>('GOOGLE_SHEET_ID')
    const credentialsPath = this.config.getOrThrow<string>('GOOGLE_CREDENTIALS_PATH')
    const configPath = this.config.getOrThrow<string>('SHEET_CONFIG_PATH')

    // Load and validate sheet config once at startup (FR-010)
    let rawConfig: unknown
    try {
      rawConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `[SheetsService] Failed to load sheet config from "${configPath}": ${message}`
      )
    }

    if (!Array.isArray(rawConfig) || rawConfig.length === 0) {
      throw new Error(`[SheetsService] Sheet config at "${configPath}" must be a non-empty array`)
    }
    this.configs = rawConfig as SheetConfig[]

    // Initialize Google Sheets API client
    const auth = new google.auth.GoogleAuth({
      keyFilename: credentialsPath,
      scopes: [READONLY_SCOPE],
    })
    this.sheetsApi = google.sheets({ version: 'v4', auth })
    this.logger.log(`Sheet config loaded: ${this.configs.length} sheets configured`)
  }

  getConfigs(): SheetConfig[] {
    return this.configs
  }

  /**
   * Fetch all configured sheets in a single batchGet call (FR-006).
   * Returns normalized SheetResult[] with headers and coerced row objects.
   */
  async fetchAllSheets(configs: SheetConfig[]): Promise<SheetResult[]> {
    const ranges = configs.map((c) => `${c.sheetName}!A:ZZ`)

    let valueRanges: sheets_v4.Schema$ValueRange[]

    try {
      const response = await this.sheetsApi.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
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
      return configs.map((c) => ({
        sheetName: c.sheetName,
        tableName: c.tableName,
        uniqueKey: c.uniqueKey,
        headers: [],
        rows: [],
      }))
    }

    const results: SheetResult[] = []

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]
      let data = (valueRanges[i]?.values ?? []) as unknown[][]

      // Per-sheet empty-response retry with backoff (FR-008)
      if (data.length === 0) {
        data = await this.retryFetchSheet(cfg.sheetName)
      }

      if (data.length === 0) {
        this.logger.warn(
          `[SheetsService] Sheet "${cfg.sheetName}" returned empty data after retries — skipping`
        )
        results.push({
          sheetName: cfg.sheetName,
          tableName: cfg.tableName,
          uniqueKey: cfg.uniqueKey,
          headers: [],
          rows: [],
        })
        continue
      }

      const headerRowIndex = cfg.headerRow - 1 // convert 1-based to 0-based
      const rawHeaders = (data[headerRowIndex] ?? []) as string[]
      const normalizedRaw = rawHeaders.map((h) => normalizeHeader(String(h ?? '')))

      // Handle skipNullCols (FR-014–FR-015)
      const includedIndices: number[] = []
      const filteredHeaders: string[] = []

      normalizedRaw.forEach((h, idx) => {
        if (h === '') {
          if (cfg.skipNullCols) {
            // silently drop (FR-014)
          } else {
            this.logger.warn(
              `[SheetsService] Sheet "${cfg.sheetName}" col index ${idx} has null/empty header — skipping column (FR-015)`
            )
          }
        } else {
          includedIndices.push(idx)
          filteredHeaders.push(h)
        }
      })

      const uniqueHeaders = makeUniqueHeaders(filteredHeaders)

      // Normalise uniqueKey to array for uniform handling
      const keyColumns = Array.isArray(cfg.uniqueKey) ? cfg.uniqueKey : [cfg.uniqueKey]

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
          row[header] = coerceValue(rawValue, { sheet: cfg.sheetName, row: r + 1, col: header })
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
          `[SheetsService] Skipped ${skippedEmptyRow} empty rows in sheet "${cfg.sheetName}"`
        )
      if (skippedEmptyKey > 0)
        this.logger.warn(
          `[SheetsService] Skipped ${skippedEmptyKey} rows with missing unique key in sheet "${cfg.sheetName}"`
        )

      results.push({
        sheetName: cfg.sheetName,
        tableName: cfg.tableName,
        uniqueKey: cfg.uniqueKey,
        headers: uniqueHeaders,
        rows,
      })
    }

    return results
  }

  private async retryFetchSheet(sheetName: string): Promise<unknown[][]> {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delayMs = RETRY_DELAYS_MS[attempt]
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      this.logger.warn(
        `[SheetsService] Retry ${attempt + 1}/${RETRY_DELAYS_MS.length} for sheet "${sheetName}"…`
      )

      try {
        const response = await this.sheetsApi.spreadsheets.values.batchGet({
          spreadsheetId: this.spreadsheetId,
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
}
