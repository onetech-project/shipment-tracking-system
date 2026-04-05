export interface SyncCycleResult {
  table: string
  startedAt: Date
  syncedAt: Date
  totalRows: number
  skippedLocked: number
  skippedUnchanged: number
  upsertedCount: number
  errors: number
}
