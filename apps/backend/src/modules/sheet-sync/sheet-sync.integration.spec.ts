/**
 * T018 — Integration tests verifying US2: locked rows are never upserted even
 * when sheet data differs from DB data.
 *
 * These tests focus on the interaction between is_locked detection and the
 * DB write path — i.e., that locked rows are skipped *before* any upsert
 * is attempted, regardless of what the DB contains.
 */
import { SheetSyncService } from './sheet-sync.service'

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    SHEET_SYNC_TABLE: 'shipments',
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
  } as any
}

function makeColumnMapper(valid: string[], pkColumn: string, skipped: string[] = []) {
  return {
    clearCache: jest.fn(),
    buildColumnMap: jest.fn().mockResolvedValue({ valid, skipped, pkColumn }),
  } as any
}

describe('SheetSyncService — US2 Integration: Locked rows never upserted', () => {
  afterEach(() => jest.restoreAllMocks())

  /**
   * Scenario: A locked row has different data in the sheet vs. DB.
   * Expected: The DB row is NOT updated, upsertedCount stays 0.
   */
  it('does not upsert a locked row even when its sheet data differs from DB', async () => {
    const sheetRows = [
      ['id', 'carrier', 'status', 'is_locked'],
      ['SHP-001', 'FedEx', 'delivered', 'true'], // locked + data changed
    ]
    const dbRows = [{ id: 'SHP-001', carrier: 'DHL', status: 'in_transit', is_locked: true }]

    const querySpy = jest.fn().mockResolvedValueOnce(dbRows) // SELECT *

    const service = new SheetSyncService(
      makeConfig(),
      makeSchedulerRegistry(),
      { query: querySpy } as any,
      { getSheetRows: jest.fn().mockResolvedValue(sheetRows) } as any,
      makeColumnMapper(['id', 'carrier', 'status', 'is_locked'], 'id'),
      { notifyClients: jest.fn() } as any
    )

    const result = await service.runSyncCycle()

    expect(result.skippedLocked).toBe(1)
    expect(result.upsertedCount).toBe(0)
    // Only one query should have been made: the SELECT * — no INSERT/UPDATE
    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(querySpy).toHaveBeenCalledWith(`SELECT * FROM "shipments"`)
  })

  /**
   * Scenario: Mix of locked and unlocked rows with DB data differences.
   * Expected: Only unlocked changed rows get upserted.
   */
  it('upserts only unlocked rows that have changed, skips locked rows', async () => {
    const sheetRows = [
      ['id', 'carrier', 'status', 'is_locked'],
      ['SHP-001', 'FedEx', 'delivered', 'true'], // locked — skip
      ['SHP-002', 'UPS', 'in_transit', 'false'], // unlocked, changed — upsert
      ['SHP-003', 'DHL', 'pending', 'false'], // unlocked, unchanged — skip
    ]
    const dbRows = [
      { id: 'SHP-001', carrier: 'DHL', status: 'in_transit', is_locked: true },
      { id: 'SHP-002', carrier: 'USPS', status: 'pending', is_locked: false }, // carrier changed
      { id: 'SHP-003', carrier: 'DHL', status: 'pending', is_locked: false }, // identical
    ]

    const querySpy = jest
      .fn()
      .mockResolvedValueOnce(dbRows) // SELECT *
      .mockResolvedValueOnce([{}]) // upsert SHP-002

    const service = new SheetSyncService(
      makeConfig(),
      makeSchedulerRegistry(),
      { query: querySpy } as any,
      { getSheetRows: jest.fn().mockResolvedValue(sheetRows) } as any,
      makeColumnMapper(['id', 'carrier', 'status', 'is_locked'], 'id'),
      { notifyClients: jest.fn() } as any
    )

    const result = await service.runSyncCycle()

    expect(result.skippedLocked).toBe(1) // SHP-001
    expect(result.skippedUnchanged).toBe(1) // SHP-003
    expect(result.upsertedCount).toBe(1) // SHP-002
    expect(querySpy).toHaveBeenCalledTimes(2)
  })

  /**
   * Scenario: All rows are locked.
   * Expected: Zero upserts, zero errors, gateway not called.
   */
  it('causes zero upserts and does not call gateway when all rows are locked', async () => {
    const sheetRows = [
      ['id', 'carrier', 'is_locked'],
      ['SHP-001', 'FedEx', 'true'],
      ['SHP-002', 'UPS', 'TRUE'],
    ]
    const dbRows = [
      { id: 'SHP-001', carrier: 'DHL', is_locked: true },
      { id: 'SHP-002', carrier: 'USPS', is_locked: true },
    ]

    const querySpy = jest.fn().mockResolvedValueOnce(dbRows)
    const notifyMock = jest.fn()

    const service = new SheetSyncService(
      makeConfig(),
      makeSchedulerRegistry(),
      { query: querySpy } as any,
      { getSheetRows: jest.fn().mockResolvedValue(sheetRows) } as any,
      makeColumnMapper(['id', 'carrier', 'is_locked'], 'id'),
      { notifyClients: notifyMock } as any
    )

    const result = await service.runSyncCycle()

    expect(result.skippedLocked).toBe(2)
    expect(result.upsertedCount).toBe(0)
    expect(result.errors).toBe(0)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  /**
   * Scenario: Locked row that does NOT exist in DB.
   * Expected: Still skipped — locking check happens before DB lookup.
   */
  it('skips a locked row that does not yet exist in the DB', async () => {
    const sheetRows = [
      ['id', 'carrier', 'is_locked'],
      ['SHP-NEW', 'FedEx', 'true'],
    ]
    // No matching DB row
    const dbRows: object[] = []

    const querySpy = jest.fn().mockResolvedValueOnce(dbRows)

    const service = new SheetSyncService(
      makeConfig(),
      makeSchedulerRegistry(),
      { query: querySpy } as any,
      { getSheetRows: jest.fn().mockResolvedValue(sheetRows) } as any,
      makeColumnMapper(['id', 'carrier', 'is_locked'], 'id'),
      { notifyClients: jest.fn() } as any
    )

    const result = await service.runSyncCycle()

    expect(result.skippedLocked).toBe(1)
    expect(result.upsertedCount).toBe(0)
    expect(querySpy).toHaveBeenCalledTimes(1) // Only SELECT *
  })
})
