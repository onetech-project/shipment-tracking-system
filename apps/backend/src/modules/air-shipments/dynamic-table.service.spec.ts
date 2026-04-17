import { Test, TestingModule } from '@nestjs/testing'
import { DynamicTableService } from './dynamic-table.service'
import { SheetsService } from './sheets.service'
import { DataSource } from 'typeorm'

describe('DynamicTableService', () => {
  let service: DynamicTableService
  let dataSource: { query: jest.Mock }
  let sheetsService: { reloadTableSchemas: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([]) }
    sheetsService = { reloadTableSchemas: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicTableService,
        { provide: DataSource, useValue: dataSource },
        { provide: SheetsService, useValue: sheetsService },
      ],
    }).compile()

    service = module.get<DynamicTableService>(DynamicTableService)
  })

  it('creates table, columns, constraint and index and calls reloadTableSchemas', async () => {
    const cfg: any = {
      tableName: 'air_shipment_testtable',
      sheetName: 'Test Table',
      uniqueKey: ['to_number'],
    }

    const res = await service.ensureTable(cfg)
    expect(res.success).toBe(true)
    expect(dataSource.query).toHaveBeenCalled()
    expect(sheetsService.reloadTableSchemas).toHaveBeenCalledWith([cfg.tableName])
  })

  it('returns failure for unsafe table name', async () => {
    const cfg: any = { tableName: 'DROP TABLE; --', sheetName: 'bad', uniqueKey: ['a'] }
    const res = await service.ensureTable(cfg)
    expect(res.success).toBe(false)
  })
})
