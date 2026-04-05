/**
 * T010 - Unit tests for column-mapper.ts
 */
import { ColumnMapperService } from './column-mapper'
import { Logger } from '@nestjs/common'

function makeMockDataSource(columns: string[]) {
  return {
    query: jest.fn().mockResolvedValue(columns.map((c) => ({ column_name: c }))),
  } as any
}

function makeMockConfig(table = 'test_table', pkColumn = 'id') {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SHEET_SYNC_TABLE') return table
      if (key === 'SHEET_SYNC_PK_COLUMN') return pkColumn
      throw new Error(`Unknown key: ${key}`)
    }),
  } as any
}

describe('ColumnMapperService', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('passes through columns that exist in the DB', async () => {
    const svc = new ColumnMapperService(
      makeMockDataSource(['id', 'name', 'status']),
      makeMockConfig('test_table', 'id')
    )
    const map = await svc.buildColumnMap(['id', 'name', 'status'])
    expect(map.valid).toEqual(['id', 'name', 'status'])
    expect(map.skipped).toEqual([])
  })

  it('puts unknown columns into skipped and emits a warning', async () => {
    const svc = new ColumnMapperService(
      makeMockDataSource(['id', 'name']),
      makeMockConfig('test_table', 'id')
    )
    const map = await svc.buildColumnMap(['id', 'name', 'ghost_column'])
    expect(map.valid).toEqual(['id', 'name'])
    expect(map.skipped).toEqual(['ghost_column'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost_column'))
  })

  it('correctly identifies pkColumn from config', async () => {
    const svc = new ColumnMapperService(
      makeMockDataSource(['trip_code', 'amount']),
      makeMockConfig('trips', 'trip_code')
    )
    const map = await svc.buildColumnMap(['trip_code', 'amount'])
    expect(map.pkColumn).toBe('trip_code')
  })

  it('skips empty header entries', async () => {
    const svc = new ColumnMapperService(makeMockDataSource(['id', 'name']), makeMockConfig())
    const map = await svc.buildColumnMap(['id', '', '  ', 'name'])
    expect(map.valid).toEqual(['id', 'name'])
  })

  it('uses cached DB columns on second call (no extra query)', async () => {
    const ds = makeMockDataSource(['id', 'name'])
    const svc = new ColumnMapperService(ds, makeMockConfig())
    await svc.buildColumnMap(['id', 'name'])
    await svc.buildColumnMap(['id', 'name'])
    expect(ds.query).toHaveBeenCalledTimes(1)
  })

  it('re-fetches columns after clearCache()', async () => {
    const ds = makeMockDataSource(['id', 'name'])
    const svc = new ColumnMapperService(ds, makeMockConfig())
    await svc.buildColumnMap(['id', 'name'])
    svc.clearCache()
    await svc.buildColumnMap(['id', 'name'])
    expect(ds.query).toHaveBeenCalledTimes(2)
  })
})
