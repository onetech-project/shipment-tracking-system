export interface SyncNotificationPayload {
  table: string
  upsertedCount: number
  syncedAt: string // ISO 8601
}
