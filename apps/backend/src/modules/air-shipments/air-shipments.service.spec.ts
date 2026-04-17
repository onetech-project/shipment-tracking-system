import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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

const makeRepo = (): Partial<Repository<any>> => ({
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
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
        { provide: DynamicTableService, useValue: { ensureTable: jest.fn().mockResolvedValue({ success: true }) } },
        { provide: getRepositoryToken(AirShipmentCgk), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSub), useValue: makeRepo() },
        { provide: getRepositoryToken(AirShipmentSda), useValue: makeRepo() },
        { provide: getRepositoryToken(RatePerStation), useValue: makeRepo() },
        { provide: getRepositoryToken(RouteMaster), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetConfig), useValue: makeRepo() },
        { provide: getRepositoryToken(GoogleSheetSheetConfig), useValue: makeRepo() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
    ;(service as any).googleSheetSheetConfigRepo.create = jest.fn((o: any) => ({ ...o, id: 'sc-1' }))
    ;(service as any).googleSheetConfigRepo.create = jest.fn((o: any) => ({ ...o, id: 'cfg-1' }))

    const dto = {
      sheetLink: 'https://docs.google.com/spreadsheets/d/ABC123',
      syncInterval: 15,
      enabled: true,
      label: 'My Sheet',
      sheetConfigs: [
        { sheetName: 'Sheet1', tableName: 'air_shipments_sheet1', headerRow: 1, uniqueKey: ['to_number'] },
      ],
    }

    await service.createGoogleSheetConfig(dto as any)
    expect(dynamicTableService.ensureTable).toHaveBeenCalledTimes(1)
    expect(dynamicTableService.ensureTable).toHaveBeenCalledWith(expect.objectContaining({ tableName: 'air_shipments_sheet1' }))
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
        { id: 'sc-1', sheetName: 'Sheet1', tableName: 'air_shipments_sheet1', uniqueKey: ['to_number'] },
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
        { id: 'sc-1', sheetName: 'Sheet1', tableName: 'air_shipments_sheet1', uniqueKey: ['to_number', 'status'] },
      ],
    }

    googleSheetConfigRepo.findOne = jest.fn()
      .mockResolvedValueOnce(prev) // prev returned when reading previous
      .mockResolvedValueOnce(updated) // saved returned after update
    googleSheetConfigRepo.update = jest.fn().mockResolvedValue({})

    await service.updateGoogleSheetConfig('cfg-1', { sheetLink: updated.sheetLink, syncInterval: 15, enabled: true, label: 'New', sheetConfigs: updated.sheetConfigs } as any)

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

    const result = await service.runSyncCycle()
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

    // Mock existing row with is_locked=true so it gets skipped
    const cgkRepo = service['repoFor']('air_shipments_cgk') as jest.Mocked<
      Repository<AirShipmentCgk>
    >
    ;(cgkRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ to_number: 'CGK-001', is_locked: true }]),
    } as any)

    const result = await service.runSyncCycle()
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

    // Pre-load "existing" row in the repository with matching data (no change)
    const cgkRepo = service['repoFor']('air_shipments_cgk') as jest.Mocked<
      Repository<AirShipmentCgk>
    >
    ;(cgkRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          to_number: 'CGK-001',
          status: 'delivered',
          is_locked: null,
          last_synced_at: new Date(),
        },
      ]),
    } as any)

    const result = await service.runSyncCycle()
    expect(result.totalUpserted).toBe(0)
    expect(cgkRepo.save).not.toHaveBeenCalled()
    expect(cgkRepo.update).not.toHaveBeenCalled()
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

    const cgkRepo = service['repoFor']('air_shipments_cgk') as jest.Mocked<
      Repository<AirShipmentCgk>
    >
    ;(cgkRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { to_number: 'CGK-001', status: 'pending', is_locked: null, last_synced_at: new Date() },
        ]),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    } as any)

    const result = await service.runSyncCycle()
    expect(result.totalUpserted).toBe(1)
    expect(result.affectedTables).toContain('air_shipments_cgk')
  })
})
