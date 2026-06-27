import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { SheetsService } from './sheets.service'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'

const OLD_ID = '1OLDoRfUp1b2bzsSO5QwTfDHBczOiOLD'
const NEW_ID = '1c9vNjU2P8enw4f-oRfUp1b2bzsSO5QwTfDHBczOiN9s'

const makeConfig = (overrides: Partial<GoogleSheetConfig> = {}): GoogleSheetConfig =>
  ({
    id: 'cfg-1',
    label: 'Test Config',
    sheetLink: `https://docs.google.com/spreadsheets/d/${OLD_ID}/edit#gid=0`,
    sheetId: OLD_ID,
    syncInterval: 15,
    enabled: true,
    sheetConfigs: [
      {
        id: 's1',
        sheetName: 'Sheet1',
        tableName: 'air_shipment_test',
        headerRow: 1,
        uniqueKey: ['awb'],
        skipNullCols: true,
      },
    ],
    ...overrides,
  }) as unknown as GoogleSheetConfig

describe('SheetsService config event handlers', () => {
  let service: SheetsService
  let batchGet: jest.Mock

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SheetsService,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn(), get: jest.fn() } },
        { provide: getRepositoryToken(GoogleSheetConfig), useValue: { find: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile()

    service = module.get<SheetsService>(SheetsService)

    // Stub the Google Sheets client so fetchAllSheets can be exercised without network.
    // Reject so we skip downstream row processing — we only assert it was *reached*.
    batchGet = jest.fn().mockRejectedValue(new Error('network disabled in test'))
    ;(service as any).sheetsApi = { spreadsheets: { values: { batchGet } } }

    // Start with an empty in-memory cache (the post-boot state when no enabled
    // config was loaded, or the config was filtered out at boot).
    ;(service as any).gsheetConfigs = []
    ;(service as any).sheetConfigs = []
  })

  it('adds a config that was NOT loaded at boot, so its new sheetId is syncable', async () => {
    // Repro of staging bug: scheduler ticks the new sheetId but SheetsService never
    // knew the config, logging "No config found for sheetId ... — skipping".
    service.onConfigUpdate(makeConfig({ sheetId: NEW_ID }))

    expect((service as any).gsheetConfigs.some((c: GoogleSheetConfig) => c.sheetId === NEW_ID)).toBe(
      true
    )

    await service.fetchAllSheets(NEW_ID)
    expect(batchGet).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: NEW_ID }))
  })

  it('switches an in-memory config to the new sheetId when the link changes', async () => {
    ;(service as any).gsheetConfigs = [makeConfig({ sheetId: OLD_ID })]

    service.onConfigUpdate(makeConfig({ sheetId: NEW_ID }))

    // Old sheetId is no longer resolvable...
    await service.fetchAllSheets(OLD_ID)
    expect(batchGet).not.toHaveBeenCalled()

    // ...but the new one is.
    await service.fetchAllSheets(NEW_ID)
    expect(batchGet).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: NEW_ID }))
  })

  it('removes a config from memory when it is updated to disabled', async () => {
    ;(service as any).gsheetConfigs = [makeConfig({ sheetId: OLD_ID })]

    service.onConfigUpdate(makeConfig({ sheetId: OLD_ID, enabled: false }))

    expect((service as any).gsheetConfigs.some((c: GoogleSheetConfig) => c.id === 'cfg-1')).toBe(
      false
    )
    await service.fetchAllSheets(OLD_ID)
    expect(batchGet).not.toHaveBeenCalled()
  })

  it('onConfigCreate ignores a disabled/invalid config instead of caching it', () => {
    service.onConfigCreate(makeConfig({ sheetId: NEW_ID, enabled: false }))
    expect((service as any).gsheetConfigs.some((c: GoogleSheetConfig) => c.sheetId === NEW_ID)).toBe(
      false
    )
  })
})
