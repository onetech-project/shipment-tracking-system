import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { AirShipmentsService } from './air-shipments.service'
import { SheetsService } from './sheets.service'
import { DynamicTableService } from './dynamic-table.service'
import { AirShipmentCgk } from './entities/air-shipment-cgk.entity'
import { AirShipmentSub } from './entities/air-shipment-sub.entity'
import { AirShipmentSda } from './entities/air-shipment-sda.entity'
import { RatePerStation } from './entities/rate-per-station.entity'
import { RouteMaster } from './entities/route-master.entity'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { GeneralParamsService } from '../general-params/general-params.service'

const makeRepo = (): Partial<Repository<any>> => ({
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockImplementation((o: any) => ({ ...o })) as any,
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  metadata: {
    columns: [
      { propertyName: 'id' },
      { propertyName: 'to_number' },
      { propertyName: 'lt_number' },
      { propertyName: 'is_locked' },
      { propertyName: 'last_synced_at' },
      { propertyName: 'created_at' },
      { propertyName: 'updated_at' },
      { propertyName: 'extra_fields' },
      { propertyName: 'status' },
      { propertyName: 'flight_date' },
    ],
  } as any,
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  })) as any,
})

describe('AirShipmentsService — runSyncCycle()', () => {
  let service: AirShipmentsService
  let sheetsService: jest.Mocked<SheetsService>
  let dynamicTableService: jest.Mocked<DynamicTableService>

  beforeEach(async () => {
    sheetsService = {
      fetchAllSheets: jest.fn(),
      getConfigs: jest.fn().mockReturnValue([
        {
          sheetName: 'CompileAirCGK',
          tableName: 'air_shipments_cgk',
          uniqueKey: 'to_number',
          skipNullCols: true,
          headerRow: 1,
        },
        {
          sheetName: 'SUB',
          tableName: 'air_shipments_sub',
          uniqueKey: 'to_number',
          skipNullCols: true,
          headerRow: 1,
        },
        {
          sheetName: 'SDA',
          tableName: 'air_shipments_sda',
          uniqueKey: 'to_number',
          skipNullCols: true,
          headerRow: 1,
        },
        {
          sheetName: 'Data',
          tableName: 'rate_per_station',
          uniqueKey: ['origin_dc', 'destination_dc'],
          skipNullCols: true,
          headerRow: 1,
        },
        {
          sheetName: 'Master Data',
          tableName: 'route_master',
          uniqueKey: 'concat',
          skipNullCols: false,
          headerRow: 1,
        },
      ]),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirShipmentsService,
        { provide: SheetsService, useValue: sheetsService },
        {
          provide: DynamicTableService,
          useValue: { ensureTable: jest.fn().mockResolvedValue({ success: true }) },
        },
        { provide: getRepositoryToken(AirShipmentCgk), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSub), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSda), useValue: makeRepo() },
        { provide: getRepositoryToken(RatePerStation), useValue: makeRepo() },
        { provide: getRepositoryToken(RouteMaster), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetConfig), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetSheetConfig), useValue: makeRepo() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        {
          provide: GeneralParamsService,
          useValue: { getValue: jest.fn().mockResolvedValue('5') },
        },
      ],
    }).compile()

    service = module.get<AirShipmentsService>(AirShipmentsService)
    dynamicTableService = module.get(DynamicTableService) as any
  })

  it('createGoogleSheetConfig triggers ensureTable for provided sheetConfigs', async () => {
    const googleSheetConfigRepo = (service as any).googleSheetConfigRepo
    const saved = {
      id: 'cfg-1',
      sheetLink: 'https://docs.google.com/spreadsheets/d/ABC123',
      sheetId: 'ABC123',
      syncInterval: 15,
      enabled: true,
      label: 'My Sheet',
      sheetConfigs: [
        {
          id: 'sc-1',
          sheetName: 'Sheet1',
          tableName: 'air_shipments_sheet1',
          headerRow: 1,
          uniqueKey: ['to_number'],
          skipNullCols: true,
        },
      ],
    }

    googleSheetConfigRepo.save = jest.fn().mockResolvedValue(saved)
    ;(service as any).googleSheetSheetConfigRepo.create = jest.fn((o: any) => ({
      ...o,
      id: 'sc-1',
    }))
    ;(service as any).googleSheetConfigRepo.create = jest.fn((o: any) => ({ ...o, id: 'cfg-1' }))

    const dto = {
      sheetLink: 'https://docs.google.com/spreadsheets/d/ABC123',
      syncInterval: 15,
      enabled: true,
      label: 'My Sheet',
      sheetConfigs: [
        {
          sheetName: 'Sheet1',
          tableName: 'air_shipments_sheet1',
          headerRow: 1,
          uniqueKey: ['to_number'],
        },
      ],
    }

    await service.createGoogleSheetConfig(dto as any)
    expect(dynamicTableService.ensureTable).toHaveBeenCalledTimes(1)
    expect(dynamicTableService.ensureTable).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'air_shipments_sheet1' })
    )
  })

  it('updateGoogleSheetConfig triggers ensureTable for new or changed sheetConfigs', async () => {
    const googleSheetConfigRepo = (service as any).googleSheetConfigRepo
    const prev = {
      id: 'cfg-1',
      sheetLink: 'https://docs.google.com/spreadsheets/d/ABC123',
      sheetId: 'ABC123',
      syncInterval: 15,
      enabled: true,
      label: 'Old',
      sheetConfigs: [
        {
          id: 'sc-1',
          sheetName: 'Sheet1',
          tableName: 'air_shipments_sheet1',
          uniqueKey: ['to_number'],
        },
      ],
    }

    const updated = {
      id: 'cfg-1',
      sheetLink: 'https://docs.google.com/spreadsheets/d/ABC123',
      sheetId: 'ABC123',
      syncInterval: 15,
      enabled: true,
      label: 'New',
      sheetConfigs: [
        // changed uniqueKey should trigger ensureTable
        {
          id: 'sc-1',
          sheetName: 'Sheet1',
          tableName: 'air_shipments_sheet1',
          uniqueKey: ['to_number', 'status'],
        },
      ],
    }

    googleSheetConfigRepo.findOne = jest
      .fn()
      .mockResolvedValueOnce(prev) // prev returned when reading previous
      .mockResolvedValueOnce(updated) // saved returned after update
    googleSheetConfigRepo.update = jest.fn().mockResolvedValue({})

    await service.updateGoogleSheetConfig('cfg-1', {
      sheetLink: updated.sheetLink,
      syncInterval: 15,
      enabled: true,
      label: 'New',
      sheetConfigs: updated.sheetConfigs,
    } as any)

    expect(dynamicTableService.ensureTable).toHaveBeenCalled()
  })

  it('skips a sheet when uniqueKey column is missing from normalized headers', async () => {
    sheetsService.fetchAllSheets.mockResolvedValue([
      {
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_cgk',
        uniqueKey: 'to_number',
        rows: [{ flight_date: '2026-04-01' }], // no to_number column
        headers: ['flight_date'],
      },
      {
        sheetName: 'SUB',
        tableName: 'air_shipments_sub',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'SDA',
        tableName: 'air_shipments_sda',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Data',
        tableName: 'rate_per_station',
        uniqueKey: ['origin_dc', 'destination_dc'],
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Master Data',
        tableName: 'route_master',
        uniqueKey: 'concat',
        rows: [],
        headers: [],
      },
    ])

    const result = await service.runSyncCycle('ABC123')
    expect(result.totalUpserted).toBe(0)
    expect(result.affectedTables).toHaveLength(0)
  })

  it('skips a row when is_locked is true', async () => {
    sheetsService.fetchAllSheets.mockResolvedValue([
      {
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_cgk',
        uniqueKey: 'to_number',
        headers: ['to_number', 'is_locked', 'status'],
        rows: [{ to_number: 'CGK-001', is_locked: true, status: 'pending' }],
      },
      {
        sheetName: 'SUB',
        tableName: 'air_shipments_sub',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'SDA',
        tableName: 'air_shipments_sda',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Data',
        tableName: 'rate_per_station',
        uniqueKey: ['origin_dc', 'destination_dc'],
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Master Data',
        tableName: 'route_master',
        uniqueKey: 'concat',
        rows: [],
        headers: [],
      },
    ])

    const dataSource = service['dataSource'] as any
    dataSource.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ to_number: 'CGK-001', is_locked: true }]),
    }))

    const result = await service.runSyncCycle('ABC123')
    expect(result.totalUpserted).toBe(0)
  })

  it('skips a row when no field has changed', async () => {
    sheetsService.fetchAllSheets.mockResolvedValue([
      {
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_cgk',
        uniqueKey: 'to_number',
        headers: ['to_number', 'status'],
        rows: [{ to_number: 'CGK-001', status: 'delivered' }],
      },
      {
        sheetName: 'SUB',
        tableName: 'air_shipments_sub',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'SDA',
        tableName: 'air_shipments_sda',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Data',
        tableName: 'rate_per_station',
        uniqueKey: ['origin_dc', 'destination_dc'],
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Master Data',
        tableName: 'route_master',
        uniqueKey: 'concat',
        rows: [],
        headers: [],
      },
    ])

    const dataSource = service['dataSource'] as any
    dataSource.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          to_number: 'CGK-001',
          status: 'delivered',
          is_locked: null,
          last_synced_at: new Date(),
        },
      ]),
    }))

    const result = await service.runSyncCycle('ABC123')
    expect(result.totalUpserted).toBe(0)
  })

  it('upserts a row and sets last_synced_at when a field has changed', async () => {
    sheetsService.fetchAllSheets.mockResolvedValue([
      {
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_cgk',
        uniqueKey: 'to_number',
        headers: ['to_number', 'status'],
        rows: [{ to_number: 'CGK-001', status: 'in_transit' }], // changed
      },
      {
        sheetName: 'SUB',
        tableName: 'air_shipments_sub',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'SDA',
        tableName: 'air_shipments_sda',
        uniqueKey: 'to_number',
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Data',
        tableName: 'rate_per_station',
        uniqueKey: ['origin_dc', 'destination_dc'],
        rows: [],
        headers: [],
      },
      {
        sheetName: 'Master Data',
        tableName: 'route_master',
        uniqueKey: 'concat',
        rows: [],
        headers: [],
      },
    ])

    const dataSource = service['dataSource'] as any
    dataSource.query = jest.fn((sql: string, params: any[]) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([
          { column_name: 'to_number' },
          { column_name: 'status' },
          { column_name: 'is_locked' },
          { column_name: 'last_synced_at' },
          { column_name: 'extra_fields' },
        ])
      }
      return Promise.resolve([])
    })
    dataSource.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { to_number: 'CGK-001', status: 'pending', is_locked: null, last_synced_at: new Date() },
        ]),
    }))

    const result = await service.runSyncCycle('ABC123')
    expect(result.totalUpserted).toBe(1)
    expect(result.affectedTables).toContain('air_shipments_cgk')
  })

  it('returns alert summary with routes+tonnage structure', async () => {
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string, _params: any[]) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([{ column_name: 'extra_fields' }])
      }
      if (sql.startsWith('SELECT * FROM "air_shipments_compileaircgk"')) {
        return Promise.resolve([
          {
            // now=2025-01-15, ata_origin=2025-01-01, sla=24h→maxSla=2025-01-02
            // tjph=480h(20 days)→maxTjph=2025-01-21 (not yet breached)
            // effectiveTime=now > maxSla → melewatiSla=true; now < maxTjph → melewatiTjph=false
            extra_fields: {
              ata_origin: '2025-01-01T00:00:00Z',
              sla: '24:00:00',
              tjph: '480:00:00',
              ata_flight: '2025-01-01T12:00:00Z',
              atd_flight: '2025-01-01T06:00:00Z',
              origin: 'CGK',
              destination: 'SUB',
              gross_weight: '9.15',
            },
          },
          {
            // ata_origin=2025-01-12, sla=24h→maxSla=2025-01-13
            // tjph=480h→maxTjph=2025-01-31 (not yet breached)
            // now(2025-01-15) > maxSla → melewatiSla=true
            extra_fields: {
              ata_origin: '2025-01-12T00:00:00Z',
              sla: '24:00:00',
              tjph: '480:00:00',
              ata_flight: '2025-01-12T12:00:00Z',
              atd_flight: '2025-01-12T06:00:00Z',
              origin: 'CGK',
              destination: 'DPS',
              gross_weight: '5.00',
            },
          },
        ])
      }
      return Promise.resolve([])
    })

    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-01-15T12:00:00Z'))

    const summary = await service.getAlertSummaryForTable('air_shipments_compileaircgk', '2025-01-01', '2025-01-15')

    expect(summary.nHours).toBe(5)
    expect(summary.mHours).toBe(5)
    expect(summary.alerts.melewatiSla.routes).toBe(2)
    expect(summary.alerts.melewatiTjph.routes).toBe(0)
    expect(summary.alerts.melewatiSla.breakdown).toContainEqual(
      expect.objectContaining({ route: 'CGK - SUB' }),
    )
    expect(summary.otp).toBeDefined()

    jest.useRealTimers()
  })

  describe('upsertDynamic — generated key columns', () => {
    it('does not throw when key columns are generated (not in insert data)', async () => {
      const mockQuery = jest.fn().mockResolvedValue([])
      ;(service as any).dataSource = { query: mockQuery }

      await expect(
        (service as any).upsertDynamic({
          tableName: 'air_shipments_smu',
          data: [
            {
              extra_fields: { vendor: 'GATRANS', airlines: 'GA', origin: 'CGK', destination: 'SUB' },
              last_synced_at: new Date(),
            },
          ],
          keyColumns: ['vendor', 'airlines', 'origin', 'destination'],
          updateColumns: ['id', 'is_locked', 'created_at', 'updated_at', 'last_synced_at', 'extra_fields'],
        })
      ).resolves.toBeUndefined()
    })

    it('deduplicates correctly using extra_fields for generated key columns', async () => {
      let capturedValues: any[] = []
      const mockQuery = jest.fn().mockImplementation((_sql: string, vals: any[]) => {
        capturedValues = vals
        return Promise.resolve([])
      })
      ;(service as any).dataSource = { query: mockQuery }

      // Two distinct rows — should keep both, not collapse to one
      await (service as any).upsertDynamic({
        tableName: 'air_shipments_sg_outgoing',
        data: [
          { extra_fields: { sg_outgoing_name: 'SG SBM' }, last_synced_at: new Date() },
          { extra_fields: { sg_outgoing_name: 'SG Poslog' }, last_synced_at: new Date() },
        ],
        keyColumns: ['sg_outgoing_name'],
        updateColumns: ['last_synced_at', 'extra_fields'],
      })

      // 2 rows × 2 columns = 4 flat values
      expect(capturedValues).toHaveLength(4)
    })

    it('only includes insert-data columns in DO UPDATE SET', async () => {
      let capturedSql = ''
      const mockQuery = jest.fn().mockImplementation((sql: string) => {
        capturedSql = sql
        return Promise.resolve([])
      })
      ;(service as any).dataSource = { query: mockQuery }

      await (service as any).upsertDynamic({
        tableName: 'air_shipments_smu',
        data: [{ extra_fields: { vendor: 'GATRANS' }, last_synced_at: new Date() }],
        keyColumns: ['vendor'],
        updateColumns: ['id', 'is_locked', 'created_at', 'updated_at', 'last_synced_at', 'extra_fields'],
      })

      expect(capturedSql).toContain('"extra_fields" = EXCLUDED."extra_fields"')
      expect(capturedSql).toContain('"last_synced_at" = EXCLUDED."last_synced_at"')
      expect(capturedSql).not.toContain('"is_locked" = EXCLUDED."is_locked"')
      expect(capturedSql).not.toContain('"id" = EXCLUDED."id"')
    })
  })

  it('returns distinct routes from a table', async () => {
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([{ column_name: 'extra_fields' }])
      }
      if (sql.startsWith('SELECT DISTINCT')) {
        return Promise.resolve([
          { origin: 'CGK', destination: 'SUB' },
          { origin: 'CGK', destination: 'DPS' },
        ])
      }
      return Promise.resolve([])
    })

    const routes = await service.getRoutesForTable('air_shipments_compileaircgk', '2025-01-01', '2025-01-15')
    expect(routes).toEqual({
      routes: [
        { label: 'CGK - SUB', origin: 'CGK', destination: 'SUB' },
        { label: 'CGK - DPS', origin: 'CGK', destination: 'DPS' },
      ],
    })
  })
})

describe('AirShipmentsService — isVoidRow / VOID filtering', () => {
  let service: AirShipmentsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirShipmentsService,
        { provide: SheetsService, useValue: { getConfigs: jest.fn().mockReturnValue([]) } },
        {
          provide: DynamicTableService,
          useValue: { ensureTable: jest.fn().mockResolvedValue({ success: true }) },
        },
        { provide: getRepositoryToken(AirShipmentCgk), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSub), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSda), useValue: makeRepo() },
        { provide: getRepositoryToken(RatePerStation), useValue: makeRepo() },
        { provide: getRepositoryToken(RouteMaster), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetConfig), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetSheetConfig), useValue: makeRepo() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        {
          provide: GeneralParamsService,
          useValue: { getValue: jest.fn().mockResolvedValue('5') },
        },
      ],
    }).compile()

    service = module.get<AirShipmentsService>(AirShipmentsService)
  })

  describe('isVoidRow', () => {
    const svc = AirShipmentsService as any

    it('returns true for ata_vendor_wh_destination = "VOID"', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: 'VOID' })).toBe(true)
    })

    it('returns true for lowercase "void"', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: 'void' })).toBe(true)
    })

    it('returns true for whitespace-padded "  VOID  "', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: '  VOID  ' })).toBe(true)
    })

    it('returns false for a real datetime value', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: '11-May-2026 10:30' })).toBe(false)
    })

    it('returns true when ata_vendor_wh_destination is "VOID" inside extra_fields', () => {
      expect(svc.isVoidRow({ extra_fields: { ata_vendor_wh_destination: 'VOID' } })).toBe(true)
    })

    it('returns false when ata_vendor_wh_destination is absent', () => {
      expect(svc.isVoidRow({})).toBe(false)
    })
  })

  it('VOID rows are excluded from getAlertSummaryForTable alert counts', async () => {
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string, _params: any[]) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([{ column_name: 'extra_fields' }])
      }
      if (sql.startsWith('SELECT * FROM "air_shipments_compileaircgk"')) {
        return Promise.resolve([
          {
            // Normal row that breaches SLA — should be counted
            extra_fields: {
              ata_origin: '2025-01-01T00:00:00Z',
              sla: '24:00:00',
              tjph: '480:00:00',
              ata_flight: '2025-01-01T12:00:00Z',
              atd_flight: '2025-01-01T06:00:00Z',
              origin: 'CGK',
              destination: 'SUB',
              gross_weight: '10.00',
            },
          },
          {
            // VOID row — must be excluded from all alert counts
            extra_fields: {
              ata_origin: '2025-01-01T00:00:00Z',
              sla: '24:00:00',
              tjph: '480:00:00',
              ata_flight: '2025-01-01T12:00:00Z',
              atd_flight: '2025-01-01T06:00:00Z',
              origin: 'CGK',
              destination: 'MES',
              gross_weight: '99.00',
              ata_vendor_wh_destination: 'VOID',
            },
          },
        ])
      }
      return Promise.resolve([])
    })

    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-01-15T12:00:00Z'))

    const summary = await service.getAlertSummaryForTable('air_shipments_compileaircgk', '2025-01-01', '2025-01-15')

    // The VOID row contributes 99 kg — if it were counted, melewatiSla tonnage would be >= 99
    // Only the normal row (10 kg) should appear
    expect(summary.alerts.melewatiSla.tonnage).toBe(10)
    expect(summary.alerts.melewatiSla.routes).toBe(1)
    // The VOID row's route (CGK - MES) must not appear in any alert breakdown
    for (const alertType of Object.keys(summary.alerts)) {
      const breakdown = summary.alerts[alertType as keyof typeof summary.alerts].breakdown
      expect(breakdown.find((b: { route: string }) => b.route === 'CGK - MES')).toBeUndefined()
    }

    jest.useRealTimers()
  })
})
