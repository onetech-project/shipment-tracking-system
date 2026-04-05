import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { google } from 'googleapis'

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name)

  constructor(private readonly config: ConfigService) {}

  /**
   * Reads all rows (including header row at index 0) from the configured
   * Google Sheet. Returns an empty array when the sheet has no data.
   */
  async getSheetRows(): Promise<string[][]> {
    const sheetId = this.config.getOrThrow<string>('SHEET_ID')
    const tabName = this.config.get<string>('SHEET_TAB_NAME', 'Sheet1')

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({
      version: 'v4',
      auth,
      // gaxios retry config: 3 retries with exponential backoff (1s → 2s → 4s)
      // satisfies constitution §VIII retry schedule
      retryConfig: {
        retry: 3,
        retryDelay: 1000,
        statusCodesToRetry: [
          [408, 408],
          [429, 429],
          [500, 599],
        ],
      } as any,
    })

    const range = `'${tabName}'!A:Z`
    this.logger.log(`Fetching sheet data — sheetId=${sheetId} range=${range}`)

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
    })

    const values = response.data.values ?? []
    return values as string[][]
  }
}
