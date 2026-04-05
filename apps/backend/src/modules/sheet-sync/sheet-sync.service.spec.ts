/**
 * T011 — Integration tests for SheetSyncService (US1 scheduler + change detection)
 * T017 — Unit tests for is_locked coercion and lock-skip behavior (US2)
 * T027 — Unit tests for Logger calls (US4)
 */
import { Logger } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { SheetSyncService } from './sheet-sync.service'
import type { SyncCycleResult } from './dto/sync-cycle-result.dto'

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    SHEET_SYNC_TABLE: 'test_table',
    SHEET_SYNC_PK_COLUMN: 'id',
    SHEET_SYNC_INTERVAL_MS: 15_000,
  }
  return {
    get: jest.fn((key: string, def?: unknown) => overrides[key] ?? defaults[key] ?? def),
    getOrThrow: jest.fn((key: string) => {
      const v = overrides[key] ?? defaults[key]
      if (v === undefined) throw new Error(`Missing config key: ${key}`)
      return v
    }),
  } as any
}

function makeSchedulerRegistry() {
  const intervals = new Map<string, NodeJS.Timeout>()
  return {
    doesExist: jest.fn((_type: string, name: string) => intervals.has(name)),
    addInterval: jest.fn((_name: string, handle: NodeJS.Timeout) => intervals.set(_name, handle)),
    deleteInterval: jest.fn((name: string) => intervals.delete(name)),
    _intervals: intervals,
  } as any
}

function makeDataSource(dbRows: Array<Record<string, unknown>> = []) {
  return {
    query: jest.fn().mockResolvedValue(dbRows),
  } as any
}

function makeSheetsService(rows: string[][]) {
  return {
    getSheetRows: jest.fn().mockResolvedValue(rows),
  } as any
}

function makeColumnMapper(valid: string[], pkColumn: string, skipped: string[] = []) {
  return {
    clearCache: jest.fn(),
    buildColumnMap: jest.fn().mockResolvedValue({ valid, skipped, pkColumn }),
  } as any
}

function makeSyncGateway() {
  return { notifyClients: jest.fn() } as any
}

function makeService(
  sheetRows: string[][],
  dbRows: Array<Record<string, unknown>> = [],
  configOverrides: Record<string, unknown> = {},
  validColumns = ['id', 'name', 'status'],
  pkColumn = 'id'
) {
  const config = makeConfig(configOverrides)
  const scheduler = makeSchedulerRegistry()
  const dataSource = makeDataSource(dbRows)
  const sheetsService = makeSheetsService(sheetRows)
  const columnMapper = makeColumnMapper(validColumns, pkColumn)
  const gateway = makeSyncGateway()

  const svc = new SheetSyncService(
    config,
    scheduler,
    dataSource,
    sheetsService,
    columnMapper,
    gateway
  )

  return { svc, config, scheduler, dataSource, sheetsService, columnMapper, gateway }
}

// ---------------------------------------------------------------------------
// US1 — Automatic Background Data Synchronization (T011)
// ---------------------------------------------------------------------------

describe('SheetSyncService — US1: Background Sync', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns empty result when sheet has only a header row', async () => {
    const { svc } = makeService([['id', 'name', 'status']])
    const result: SyncCycleResult = await svc.runSyncCycle()
    expect(result.totalRows).toBe(0)
    expect(result.upsertedCount).toBe(0)
  })

  it('returns empty result when sheet is completely empty', async () => {
    const { svc } = makeService([])
    const result = await svc.runSyncCycle()
    expect(result.totalRows).toBe(0)
    expect(result.upsertedCount).toBe(0)
  })

  it('upserts a new row (not in DB)', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'active'],
    ]
    const { svc, dataSource } = makeService(sheetRows, [])

    const result = await svc.runSyncCycle()

    expect(result.upsertedCount).toBe(1)
    expect(result.skippedUnchanged).toBe(0)
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO'),
      expect.any(Array)
    )
  })

  it('skips a row that has not changed since last sync', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'active'],
    ]
    // DB already has identical values
    const dbRows = [{ id: '1', name: 'Alice', status: 'active', last_synced_at: new Date() }]
    const { svc, dataSource } = makeService(sheetRows, dbRows)

    const result = await svc.runSyncCycle()

    expect(result.skippedUnchanged).toBe(1)
    expect(result.upsertedCount).toBe(0)
    // The only query should be the initial SELECT * — no INSERT/UPDATE
    expect(dataSource.query).toHaveBeenCalledTimes(1)
    expect(dataSource.query).toHaveBeenCalledWith(`SELECT * FROM "test_table"`)
  })

  it('upserts a row that has changed since last sync', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'inactive'], // status changed
    ]
    const dbRows = [{ id: '1', name: 'Alice', status: 'active', last_synced_at: new Date() }]
    const { svc } = makeService(sheetRows, dbRows)

    const result = await svc.runSyncCycle()

    expect(result.upsertedCount).toBe(1)
    expect(result.skippedUnchanged).toBe(0)
  })

  it('sets last_synced_at only on upserted rows', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'changed'],
      ['2', 'Bob', 'active'],
    ]
    const dbRows = [
      { id: '1', name: 'Alice', status: 'original', last_synced_at: new Date() },
      { id: '2', name: 'Bob', status: 'active', last_synced_at: new Date() },
    ]
    const { svc, dataSource } = makeService(sheetRows, dbRows)

    const result = await svc.runSyncCycle()

    expect(result.upsertedCount).toBe(1)
    expect(result.skippedUnchanged).toBe(1)
    // Only 1 extra query beyond the SELECT * — the upsert for row 1
    expect(dataSource.query).toHaveBeenCalledTimes(2)
  })

  it('calls clearCache on the column mapper at the start of each cycle', async () => {
    const { svc, columnMapper } = makeService([['id', 'name']])
    await svc.runSyncCycle()
    expect(columnMapper.clearCache).toHaveBeenCalledTimes(1)
  })

  it('does not notify gateway when nothing was upserted', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'active'],
    ]
    const dbRows = [{ id: '1', name: 'Alice', status: 'active', last_synced_at: new Date() }]
    const { svc, gateway } = makeService(sheetRows, dbRows)

    await svc.runSyncCycle()

    expect(gateway.notifyClients).not.toHaveBeenCalled()
  })

  it('notifies gateway with correct payload when rows were upserted', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'new'],
    ]
    const { svc, gateway } = makeService(sheetRows, [])

    await svc.runSyncCycle()

    expect(gateway.notifyClients).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'test_table',
        upsertedCount: 1,
        syncedAt: expect.any(String),
      })
    )
  })

  it('throws when SHEET_SYNC_TABLE contains unsafe characters', async () => {
    const { svc } = makeService([], [], { SHEET_SYNC_TABLE: 'table; DROP TABLE users;--' })
    await expect(svc.runSyncCycle()).rejects.toThrow('Invalid SHEET_SYNC_TABLE')
  })

  it('onModuleDestroy stops the interval', () => {
    const { svc, scheduler } = makeService([])
    svc.onModuleInit()
    svc.onModuleDestroy()
    expect(scheduler.deleteInterval).toHaveBeenCalledWith('sheet-sync-interval')
  })

  it('onModuleInit registers the interval via SchedulerRegistry', () => {
    const { svc, scheduler } = makeService([])
    svc.onModuleInit()
    expect(scheduler.addInterval).toHaveBeenCalledWith('sheet-sync-interval', expect.anything())
  })
})

// ---------------------------------------------------------------------------
// US2 — Row-Level Locking (T017)
// ---------------------------------------------------------------------------

describe('SheetSyncService — US2: Row-Level Locking', () => {
  afterEach(() => jest.restoreAllMocks())

  const makeLockedService = (isLockedValue: string | boolean | undefined, dbRows = []) => {
    // Headers include is_locked column
    const validCols = ['id', 'name', 'status', 'is_locked']
    const sheetRows: string[][] = [
      ['id', 'name', 'status', 'is_locked'],
      ['1', 'Alice', 'updated', isLockedValue === undefined ? '' : String(isLockedValue)],
    ]
    return makeService(sheetRows, dbRows, {}, validCols, 'id')
  }

  it('skips row when is_locked = "true" (lowercase)', async () => {
    const { svc } = makeLockedService('true')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(1)
    expect(result.upsertedCount).toBe(0)
  })

  it('skips row when is_locked = "TRUE" (uppercase)', async () => {
    const { svc } = makeLockedService('TRUE')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(1)
  })

  it('skips row when is_locked = "True" (mixed case)', async () => {
    const { svc } = makeLockedService('True')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(1)
  })

  it('does NOT skip row when is_locked = "false"', async () => {
    const { svc } = makeLockedService('false')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(0)
  })

  it('does NOT skip row when is_locked = "0"', async () => {
    const { svc } = makeLockedService('0')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(0)
  })

  it('does NOT skip row when is_locked is empty string', async () => {
    const { svc } = makeLockedService('')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(0)
  })

  it('counts all locked rows in skippedLocked', async () => {
    const validCols = ['id', 'name', 'is_locked']
    const sheetRows = [
      ['id', 'name', 'is_locked'],
      ['1', 'Alice', 'true'],
      ['2', 'Bob', 'TRUE'],
      ['3', 'Carol', 'false'],
    ]
    const { svc } = makeService(sheetRows, [], {}, validCols, 'id')
    const result = await svc.runSyncCycle()
    expect(result.skippedLocked).toBe(2)
    expect(result.upsertedCount).toBe(1) // Carol is new and not locked
  })
})

// ---------------------------------------------------------------------------
// US4 — Logging (T027)
// ---------------------------------------------------------------------------

describe('SheetSyncService — US4: Logging', () => {
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('logs "Starting sync cycle" at the start of each cycle', async () => {
    const { svc } = makeService([['id', 'name']])
    await svc.runSyncCycle()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Starting sync cycle'))
  })

  it('logs a summary with all counts at end of cycle', async () => {
    const sheetRows = [
      ['id', 'name', 'status'],
      ['1', 'Alice', 'new'],
    ]
    const { svc } = makeService(sheetRows, [])
    await svc.runSyncCycle()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Sync cycle complete.*upserted=1.*skipped-unchanged=0/)
    )
  })

  it('logs per-row error with PK context when processing fails', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const sheetRows = [
      ['id', 'name', 'status'],
      ['42', 'broken', 'data'],
    ]
    const { svc, columnMapper } = makeService(sheetRows, [])
    // Make buildUpsertSql-equivalent fail by making DataSource.query throw on the second call
    const ds = makeDataSource([])
    ds.query
      .mockResolvedValueOnce([]) // SELECT *
      .mockRejectedValueOnce(new Error('DB write failed'))
    ;(svc as any).dataSource = ds

    const result = await svc.runSyncCycle()

    expect(result.errors).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('42'), expect.anything())
  })
})
