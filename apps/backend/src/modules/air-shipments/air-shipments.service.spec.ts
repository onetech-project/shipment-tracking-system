import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { AirShipmentsService } from './air-shipments.service'
import { AIR_ALERT_PROFILE } from './alert-evaluator'
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

  it('refreshes the offload cache after setEvidenceByAwb (exclude)', async () => {
    // Simulates the running DB: an offloaded API-carrier AWB (sheet says onboard, API says
    // offload) with no evidence yet. setEvidenceByAwb writes evidence; we assert the cached
    // offload lookup reflects the new evidence on the next read (i.e. the cache was evicted).
    const state: { evidence: string | null } = { evidence: null }
    const mockQuery = jest.fn((sql: string, params?: any[]) => {
      if (sql.includes('information_schema.tables')) return Promise.resolve([{ exists: true }])
      if (sql.includes('FROM airline_tracking_source')) return Promise.resolve([{ carrier_code: '126' }])
      if (sql.includes('SELECT awb, offload_status, evidence FROM'))
        return Promise.resolve([{ awb: '126-X', offload_status: 'onboard', evidence: state.evidence }])
      if (sql.includes('SELECT awb, offload FROM'))
        return Promise.resolve([{ awb: '126-X', offload: true }])
      if (sql.includes('INSERT INTO')) {
        state.evidence = params?.[1] ?? null
        return Promise.resolve([])
      }
      return Promise.resolve([])
    })
    ;(service as any).dataSource = { query: mockQuery }
    const smuCalls = () =>
      mockQuery.mock.calls.filter((c) => String(c[0]).includes('offload_status, evidence')).length

    // Before exclude: offloaded + no evidence → would fire the alert.
    const before = await (service as any).getCachedOffloadByAwb()
    expect(before.get('126-X')).toEqual({ offload: true, hasEvidence: false })

    // Second read is served from cache (no extra tracking_smu query).
    const callsAfterFirst = smuCalls()
    await (service as any).getCachedOffloadByAwb()
    expect(smuCalls()).toBe(callsAfterFirst)

    // Exclude (write evidence) must evict the cache so the next read is fresh.
    await service.setEvidenceByAwb('126-X', 'https://test.com')
    const after = await (service as any).getCachedOffloadByAwb()
    expect(after.get('126-X')).toEqual({ offload: true, hasEvidence: true })
    expect(smuCalls()).toBeGreaterThan(callsAfterFirst)
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
      // Narrow alert projection: fields come back as top-level aliases, not extra_fields
      if (sql.startsWith('SELECT id,') && sql.includes('FROM "air_shipments_compileaircgk"')) {
        return Promise.resolve([
          {
            // now=2025-01-15, atd_origin=2025-01-01, sla=24h→maxSla=2025-01-02
            // tjph=480h(20 days)→maxTjph=2025-01-21 (not yet breached)
            // effectiveTime=now > maxSla → melewatiSla=true; now < maxTjph → melewatiTjph=false
            id: 1,
            atd_origin: '2025-01-01T00:00:00Z',
            sla: '24:00:00',
            tjph: '480:00:00',
            ata_flight: '2025-01-01T12:00:00Z',
            atd_flight: '2025-01-01T06:00:00Z',
            origin: 'CGK',
            destination: 'SUB',
            gross_weight: '9.15',
          },
          {
            // atd_origin=2025-01-12, sla=24h→maxSla=2025-01-13
            // tjph=480h→maxTjph=2025-01-31 (not yet breached)
            // now(2025-01-15) > maxSla → melewatiSla=true
            id: 2,
            atd_origin: '2025-01-12T00:00:00Z',
            sla: '24:00:00',
            tjph: '480:00:00',
            ata_flight: '2025-01-12T12:00:00Z',
            atd_flight: '2025-01-12T06:00:00Z',
            origin: 'CGK',
            destination: 'DPS',
            gross_weight: '5.00',
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
      expect(svc.isVoidRow({ ata_vendor_wh_destination: 'VOID' }, AIR_ALERT_PROFILE)).toBe(true)
    })

    it('returns true for lowercase "void"', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: 'void' }, AIR_ALERT_PROFILE)).toBe(true)
    })

    it('returns true for whitespace-padded "  VOID  "', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: '  VOID  ' }, AIR_ALERT_PROFILE)).toBe(true)
    })

    it('returns false for a real datetime value', () => {
      expect(svc.isVoidRow({ ata_vendor_wh_destination: '11-May-2026 10:30' }, AIR_ALERT_PROFILE)).toBe(
        false
      )
    })

    it('returns true when ata_vendor_wh_destination is "VOID" inside extra_fields', () => {
      expect(
        svc.isVoidRow({ extra_fields: { ata_vendor_wh_destination: 'VOID' } }, AIR_ALERT_PROFILE)
      ).toBe(true)
    })

    it('returns false when ata_vendor_wh_destination is absent', () => {
      expect(svc.isVoidRow({}, AIR_ALERT_PROFILE)).toBe(false)
    })
  })

  describe('isExcludedForAlert', () => {
    const svc = AirShipmentsService as any

    it('returns false when alertFilter is "any"', () => {
      const row = { excluded_reasons: { melewatiSla: 'manual' } }
      expect(svc.isExcludedForAlert(row, 'any')).toBe(false)
    })

    it('returns false when alertFilter is "normal"', () => {
      const row = { excluded_reasons: { melewatiSla: 'manual' } }
      expect(svc.isExcludedForAlert(row, 'normal')).toBe(false)
    })

    it('returns true when the alert key is present in excluded_reasons', () => {
      const row = { excluded_reasons: { melewatiSla: 'manual exclusion' } }
      expect(svc.isExcludedForAlert(row, 'melewatiSla')).toBe(true)
    })

    it('returns false when the alert key is absent from excluded_reasons', () => {
      const row = { excluded_reasons: { flightTracking: 'reason' } }
      expect(svc.isExcludedForAlert(row, 'melewatiSla')).toBe(false)
    })

    it('returns false when excluded_reasons is null', () => {
      const row = { excluded_reasons: null }
      expect(svc.isExcludedForAlert(row, 'melewatiSla')).toBe(false)
    })

    it('returns false when excluded_reasons is absent', () => {
      expect(svc.isExcludedForAlert({}, 'melewatiSla')).toBe(false)
    })
  })

  it('VOID rows are excluded from getAlertSummaryForTable alert counts', async () => {
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string, _params: any[]) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([{ column_name: 'extra_fields' }])
      }
      // Narrow alert projection: fields come back as top-level aliases, not extra_fields
      if (sql.startsWith('SELECT id,') && sql.includes('FROM "air_shipments_compileaircgk"')) {
        return Promise.resolve([
          {
            // Normal row that breaches SLA — should be counted
            id: 1,
            atd_origin: '2025-01-01T00:00:00Z',
            sla: '24:00:00',
            tjph: '480:00:00',
            ata_flight: '2025-01-01T12:00:00Z',
            atd_flight: '2025-01-01T06:00:00Z',
            origin: 'CGK',
            destination: 'SUB',
            gross_weight: '10.00',
          },
          {
            // VOID row — must be excluded from all alert counts
            id: 2,
            atd_origin: '2025-01-01T00:00:00Z',
            sla: '24:00:00',
            tjph: '480:00:00',
            ata_flight: '2025-01-01T12:00:00Z',
            atd_flight: '2025-01-01T06:00:00Z',
            origin: 'CGK',
            destination: 'MES',
            gross_weight: '99.00',
            ata_vendor_wh_destination: 'VOID',
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

describe('AirShipmentsService — filterRowsByAlert()', () => {
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

  it('excludes rows whose excluded_reasons contains the matching alert key', () => {
    // Row has the melewatiSla alert but is excluded for it
    const row = {
      excluded_reasons: { melewatiSla: 'manual exclusion' },
      extra_fields: {
        atd_origin: '2020-01-01T00:00:00Z',
        sla: '1:00:00',
      },
    }
    // filterRowsByAlert is private — access via bracket notation
    const result = (service as any).filterRowsByAlert([row], 'melewatiSla', 5, 5, AIR_ALERT_PROFILE)
    expect(result).toHaveLength(0)
  })

  it('includes rows excluded for a different alert key', () => {
    // Row is excluded for flightTracking, but we filter by melewatiSla
    // The row must pass the exclusion gate; alert evaluation is what determines final inclusion.
    // Use a row that would trigger melewatiSla (old atd_origin, sla=1h) so it actually passes the alert filter too.
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-06-01T00:00:00Z'))

    const row = {
      excluded_reasons: { flightTracking: 'reason' },
      extra_fields: {
        atd_origin: '2020-01-01T00:00:00Z',
        sla: '1:00:00',
      },
    }
    const result = (service as any).filterRowsByAlert([row], 'melewatiSla', 5, 5, AIR_ALERT_PROFILE)
    expect(result).toHaveLength(1)

    jest.useRealTimers()
  })

  describe('buildRouteFilterClause()', () => {
    const columns = ['origin', 'destination']

    it('returns null for an empty/undefined filter', () => {
      expect((service as any).buildRouteFilterClause(undefined, columns, [])).toBeNull()
      expect((service as any).buildRouteFilterClause([], columns, [])).toBeNull()
    })

    it('builds a single route clause with origin/destination params', () => {
      const params: any[] = []
      const clause = (service as any).buildRouteFilterClause('CGK - SUB', columns, params)
      expect(clause).toContain(' AND ')
      expect(clause).not.toContain(' OR ')
      expect(params).toEqual(['CGK', 'SUB'])
    })

    it('OR-combines multiple routes and appends all params in order', () => {
      const params: any[] = []
      const clause = (service as any).buildRouteFilterClause(
        ['CGK - SUB', 'DPS - CGK'],
        columns,
        params
      )
      expect(clause).toContain(' OR ')
      expect(params).toEqual(['CGK', 'SUB', 'DPS', 'CGK'])
    })

    it('skips malformed labels', () => {
      const params: any[] = []
      const clause = (service as any).buildRouteFilterClause(['CGK'], columns, params)
      expect(clause).toBeNull()
      expect(params).toEqual([])
    })
  })
})

describe('AirShipmentsService — loadCached() / invalidateLookupCaches()', () => {
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

  it('invokes the loader once for concurrent calls (in-flight dedupe)', async () => {
    const loader = jest.fn().mockResolvedValue('value')
    const [a, b] = await Promise.all([
      (service as any).loadCached('key', loader),
      (service as any).loadCached('key', loader),
    ])
    expect(a).toBe('value')
    expect(b).toBe('value')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('reloads after the TTL expires', async () => {
    jest.useFakeTimers()
    const loader = jest.fn().mockResolvedValue('value')
    await (service as any).loadCached('key', loader)
    await (service as any).loadCached('key', loader)
    expect(loader).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(5 * 60_000 + 1)
    await (service as any).loadCached('key', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  it('evicts rejected loads so the next call retries', async () => {
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')
    await expect((service as any).loadCached('key', loader)).rejects.toThrow('boom')
    await expect((service as any).loadCached('key', loader)).resolves.toBe('recovered')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('invalidateLookupCaches evicts the sla and reservasi entries for affected tables', async () => {
    const loader = jest.fn().mockResolvedValue('value')
    await (service as any).loadCached('sla:air_shipments_data', loader)
    await (service as any).loadCached('reservasi:air_shipments_reservasi', loader)
    await (service as any).loadCached('reservasi:air_shipments_other', loader)

    ;(service as any).invalidateLookupCaches(['air_shipments_data', 'air_shipments_reservasi'])

    await (service as any).loadCached('sla:air_shipments_data', loader)
    await (service as any).loadCached('reservasi:air_shipments_reservasi', loader)
    await (service as any).loadCached('reservasi:air_shipments_other', loader)
    // sla + reservasi entries reloaded; the untouched table stays cached
    expect(loader).toHaveBeenCalledTimes(5)
  })
})

describe('AirShipmentsService — unbounded export read mode', () => {
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

  /** 60 excluded rows — more than one 50-row page. */
  const manyRows = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    to_number: `TO${i + 1}`,
    lt_number: `LT${i + 1}`,
    excluded_reasons: { melewatiSla: 'reason' },
  }))

  function wireMock() {
    const dataSql: string[] = []
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) {
        return Promise.resolve([{ column_name: 'id' }, { column_name: 'excluded_reasons' }])
      }
      if (sql.includes('count(*)')) return Promise.resolve([{ count: manyRows.length }])
      dataSql.push(sql) // the data query
      return Promise.resolve(manyRows)
    })
    return dataSql
  }

  it('paginated read keeps LIMIT/OFFSET (one page only)', async () => {
    const dataSql = wireMock()
    await service.findExcludedRows('air_shipments_test', { page: 1, limit: 50 } as any)
    expect(dataSql[0]).toContain('LIMIT')
  })

  it('unbounded read drops LIMIT/OFFSET and returns every matching row', async () => {
    const dataSql = wireMock()
    const res = await service.findExcludedRows(
      'air_shipments_test',
      { page: 1, limit: 50 } as any,
      { unbounded: true },
    )
    expect(dataSql[0]).not.toContain('LIMIT')
    expect(dataSql[0]).not.toContain('OFFSET')
    expect(res.data).toHaveLength(60) // all rows, not just the 50-row page
  })
})

describe('AirShipmentsService — findOffloadedAwbs() route filter', () => {
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

  /** Captures every non-metadata query so the test can inspect the offloaded UNION. */
  function wireMock() {
    const captured: { sql: string; params: any[] }[] = []
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('information_schema.tables')) return Promise.resolve([{ exists: true }])
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([
          { column_name: 'awb' },
          { column_name: 'origin' },
          { column_name: 'destination' },
          { column_name: 'atd_origin' },
        ])
      }
      if (sql.includes('SELECT carrier_code FROM airline_tracking_source')) {
        return Promise.resolve([])
      }
      captured.push({ sql, params: params ?? [] })
      if (sql.includes('count(*)')) return Promise.resolve([{ count: 0 }])
      return Promise.resolve([])
    })
    return captured
  }

  it('scopes offloaded AWBs to the active route via a compileaircgk subselect', async () => {
    const captured = wireMock()
    await service.findOffloadedAwbs({ routeFilter: ['CGK - SUB'] } as any)

    const dataSql = captured.find((c) => c.sql.includes('ORDER BY awb'))
    expect(dataSql).toBeDefined()
    // The AWB list is narrowed to shipments on the selected route, sourced from the
    // same compile table the date scope and dashboard cards read.
    expect(dataSql!.sql).toContain('air_shipments_compileaircgk')
    expect(dataSql!.params).toContain('CGK')
    expect(dataSql!.params).toContain('SUB')
  })

  it('applies no route subselect when routeFilter is absent', async () => {
    const captured = wireMock()
    await service.findOffloadedAwbs({} as any)

    const dataSql = captured.find((c) => c.sql.includes('ORDER BY awb'))
    expect(dataSql).toBeDefined()
    expect(dataSql!.sql).not.toContain('air_shipments_compileaircgk')
  })

  describe('processSingleSheet — no-change detection (write amplification)', () => {
    // Regression: sheet headers that are NOT top-level table columns live in
    // extra_fields. The diff compared them against `existing[key]` (always
    // undefined), so every row looked changed and was rewritten on every sync
    // tick — 92M updates for 66K rows in production.
    const setupSheet = () => {
      const existingRow = {
        id: 'row-1',
        to_number: 'TO-1',
        is_locked: null,
        // top-level (generated) columns
        awb: '126-111',
        gross_weight: '10.5',
        // everything else lives here
        extra_fields: { vendor: 'GATRANS', origin: 'CGK', stt: 'STT-1' },
      }
      const incomingRow = {
        to_number: 'TO-1',
        awb: '126-111',
        gross_weight: '10.5',
        vendor: 'GATRANS',
        origin: 'CGK',
        stt: 'STT-1',
      }
      const mockQuery = jest.fn().mockImplementation((sql: string) => {
        if (String(sql).includes('information_schema.columns')) {
          // Mirrors the real table: awb/gross_weight/to_number are GENERATED
          // from extra_fields; vendor/origin/stt are not columns at all.
          return Promise.resolve([
            { column_name: 'id', is_generated: 'NEVER' },
            { column_name: 'is_locked', is_generated: 'NEVER' },
            { column_name: 'last_synced_at', is_generated: 'NEVER' },
            { column_name: 'extra_fields', is_generated: 'NEVER' },
            { column_name: 'to_number', is_generated: 'ALWAYS' },
            { column_name: 'awb', is_generated: 'ALWAYS' },
            { column_name: 'gross_weight', is_generated: 'ALWAYS' },
          ])
        }
        return Promise.resolve([])
      })
      const selectSpy = jest.fn().mockReturnThis()
      ;(service as any).dataSource = {
        query: mockQuery,
        createQueryBuilder: jest.fn(() => ({
          select: selectSpy,
          from: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([existingRow]),
        })),
      }
      return { incomingRow, mockQuery, selectSpy }
    }

    it('skips a row whose extra_fields values are all unchanged', async () => {
      const { incomingRow } = setupSheet()
      const upsertSpy = jest
        .spyOn(service as any, 'upsertDynamic')
        .mockResolvedValue(undefined)

      const result = await (service as any).processSingleSheet({
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_compileaircgk',
        uniqueKey: 'to_number',
        headers: Object.keys(incomingRow),
        rows: [incomingRow],
      })

      expect(result.noChangeSkipped).toBe(1)
      expect(result.upserted).toBe(0)
      expect(upsertSpy).not.toHaveBeenCalled()
    })

    it('still upserts when an extra_fields value actually changes', async () => {
      const { incomingRow } = setupSheet()
      const upsertSpy = jest
        .spyOn(service as any, 'upsertDynamic')
        .mockResolvedValue(undefined)

      const result = await (service as any).processSingleSheet({
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_compileaircgk',
        uniqueKey: 'to_number',
        headers: Object.keys(incomingRow),
        rows: [{ ...incomingRow, vendor: 'CHANGED' }],
      })

      expect(result.noChangeSkipped).toBe(0)
      expect(result.upserted).toBe(1)
      expect(upsertSpy).toHaveBeenCalled()
    })

    it('fetches only the columns the diff reads, not SELECT *', async () => {
      const { incomingRow, selectSpy } = setupSheet()
      jest.spyOn(service as any, 'upsertDynamic').mockResolvedValue(undefined)

      await (service as any).processSingleSheet({
        sheetName: 'CompileAirCGK',
        tableName: 'air_shipments_compileaircgk',
        uniqueKey: 'to_number',
        headers: Object.keys(incomingRow),
        rows: [incomingRow],
      })

      const selected = selectSpy.mock.calls[0][0]
      expect(selected).not.toBe('*')
      expect(selected).toEqual(expect.arrayContaining(['t."to_number"', 't."extra_fields"']))
      // vendor/origin/stt are not columns — must not be selected
      expect(selected).not.toEqual(expect.arrayContaining(['t."vendor"']))
    })
  })

  describe('resolveDateExpr — schema probe', () => {
    const runProbe = async (hasDate: boolean) => {
      let capturedSql = ''
      const mockQuery = jest.fn().mockImplementation((sql: string) => {
        capturedSql = sql
        return Promise.resolve([{ has_date: hasDate }])
      })
      ;(service as any).dataSource = { query: mockQuery }
      const expr = await (service as any).resolveDateExpr('air_shipments_compileaircgk')
      return { expr, capturedSql }
    }

    it('uses the business date column when the sheet supplies one', async () => {
      const { expr } = await runProbe(true)
      expect(expr).toBe(`parse_flexible_timestamp(extra_fields->>'date')`)
    })

    it('falls back to created_at when no date field exists', async () => {
      const { expr } = await runProbe(false)
      expect(expr).toBe('created_at::timestamp')
    })

    it('probes the table shape with a single row, not a whole-table EXISTS scan', async () => {
      // The EXISTS form matched every row via the GIN index (66K rows, ~9ms) just
      // to answer a yes/no schema question. LIMIT 1 answers it from one page.
      const { capturedSql } = await runProbe(true)
      expect(capturedSql).toContain('LIMIT 1')
      expect(capturedSql).not.toContain('EXISTS')
    })
  })
})

describe('AirShipmentsService — indexable date filtering (buildTimestampExpression)', () => {
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

  // The date filter drove a seq scan over 280K rows in production: the predicate was a
  // regex + cast over extra_fields->>'atd_origin', which no index can answer. The
  // generated STORED column date_atd holds exactly that parsed value, so when the table
  // exposes it we filter on the bare column and the planner can use a btree on it.
  it('filters on the generated date_atd column when the table exposes it', () => {
    const expr = (service as any).buildTimestampExpression('atd_origin', [
      'id',
      'extra_fields',
      'date_atd',
    ])
    expect(expr).toBe('date_atd')
    // No JSONB extraction, no regex, no cast — otherwise the index is unusable.
    expect(expr).not.toContain('extra_fields')
    expect(expr).not.toContain('~')
    expect(expr).not.toContain('CASE')
  })

  it('falls back to the JSONB expression when the generated column is absent', () => {
    const expr = (service as any).buildTimestampExpression('atd_origin', ['id', 'extra_fields'])
    expect(expr).toContain(`extra_fields->>'atd_origin'`)
    expect(expr).toContain('CASE')
  })

  // Only atd_origin has a generated counterpart; other fields must keep the old path.
  it('does not claim a generated column for fields that have none', () => {
    const expr = (service as any).buildTimestampExpression('ata_flight', [
      'id',
      'extra_fields',
      'date_atd',
    ])
    expect(expr).toContain(`extra_fields->>'ata_flight'`)
  })

  // The sea profile's non-ISO dates go through parse_flexible_timestamp; that tolerant
  // parser must win over the generated column, which only exists on the air compile table.
  it('keeps the flexible parser for sea tables even if a date_atd column exists', () => {
    const expr = (service as any).buildTimestampExpression(
      'atd_origin',
      ['id', 'extra_fields', 'date_atd'],
      true,
    )
    expect(expr).toContain('parse_flexible_timestamp')
  })

  // parse_flexible_timestamp returns a naive TIMESTAMP, so the old clause compared it
  // against a timestamptz bound. Postgres resolved that by coercing the *column* using
  // the session TimeZone (Asia/Jakarta) — a silent 7-hour shift of the sea date window.
  // Converting the bound instead makes the comparison naive-to-naive and removes the shift.
  it('converts the bound, not the column, for the naive sea timestamp', () => {
    const params: any[] = []
    const clause = (service as any).buildDateRangeClause(
      ['id', 'extra_fields'],
      params,
      '2026-01-01',
      '2026-01-31',
      undefined,
      true,
    )
    expect(clause).toContain('AT TIME ZONE')
    // The column side stays a bare call — wrapping it would defeat any index on it.
    expect(clause).not.toContain(`parse_flexible_timestamp(NULLIF(TRIM(extra_fields->>'atd_origin'), '')) AT TIME ZONE`)
  })

  // The JSONB fallback already produces a timestamptz, so its bounds must stay untouched.
  it('leaves the timestamptz fallback clause unconverted', () => {
    const params: any[] = []
    const clause = (service as any).buildDateRangeClause(
      ['id', 'extra_fields'],
      params,
      '2026-01-01',
      '2026-01-31',
    )
    expect(clause).not.toContain('AT TIME ZONE')
  })

  it('the emitted date range clause compares the bare column against bind params', () => {
    const params: any[] = []
    const clause = (service as any).buildDateRangeClause(
      ['id', 'extra_fields', 'date_atd'],
      params,
      '2026-01-01',
      '2026-01-31',
    )
    expect(clause).toContain('date_atd >=')
    expect(clause).toContain('date_atd <=')
    expect(params).toHaveLength(2)
  })
})

describe('AirShipmentsService — SLA lookup caching on the table read path', () => {
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

  /** Counts reads of the air_shipments_data master across a call. */
  function wireMock() {
    const slaReads: string[] = []
    const dataSource = service['dataSource'] as jest.Mocked<DataSource>
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([
          { column_name: 'id' },
          { column_name: 'extra_fields' },
          { column_name: 'excluded_reasons' },
          { column_name: 'lt_number' },
        ])
      }
      if (sql.includes('information_schema.tables')) return Promise.resolve([{ exists: true }])
      if (sql.includes('air_shipments_data')) {
        slaReads.push(sql)
        return Promise.resolve([])
      }
      if (sql.includes('count(*)')) return Promise.resolve([{ count: 0 }])
      return Promise.resolve([])
    })
    return slaReads
  }

  const baseQuery = {
    page: 1,
    limit: 50,
    sortBy: 'id',
    sortOrder: 'asc' as const,
    alertFilter: 'any' as const,
  }

  // The SLA page sends alertFilter=any on every table request, so this path ran
  // SELECT * FROM air_shipments_data (all columns incl. extra_fields) per request.
  it('reuses the cached SLA lookup across repeated table reads', async () => {
    const slaReads = wireMock()
    await service.findAllForTable('air_shipments_compileaircgk', baseQuery)
    await service.findAllForTable('air_shipments_compileaircgk', baseQuery)
    expect(slaReads).toHaveLength(1)
  })

  it('reuses the cached SLA lookup on the lt-numbers path too', async () => {
    const slaReads = wireMock()
    await service.findLtNumbersForTable('air_shipments_compileaircgk', { alertFilter: 'any' })
    await service.findLtNumbersForTable('air_shipments_compileaircgk', { alertFilter: 'any' })
    expect(slaReads).toHaveLength(1)
  })

  // The lookup only reads origin_dc / destination_dc / sla / lost_treshold, but SELECT *
  // dragged the whole extra_fields JSONB across the wire for every row.
  it('reads only the columns the lookup needs, not SELECT *', async () => {
    const slaReads = wireMock()
    await service.findAllForTable('air_shipments_compileaircgk', baseQuery)
    expect(slaReads[0]).not.toContain('SELECT *')
  })
})
