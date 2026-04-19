export interface AirShipmentRow {
  id: string
  is_locked: boolean | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AirShipmentsResponse {
  data: AirShipmentRow[]
  meta: PaginationMeta
}

export type SortOrder = 'asc' | 'desc'

export type SyncStatus = 'connected' | 'disconnected'

export interface SyncNotificationPayload {
  affectedTables: string[]
  totalUpserted: number
  syncedAt: string
}

export interface AdditionalCellProps {
  onToggleLock?: (id: string, locked: boolean) => void
}

export interface CellProps {
  id?: string
  col: string
  value: unknown
  additional?: AdditionalCellProps
}

export interface SheetConfig {
  id?: string
  sheetName: string
  tableName: string
  headerRow: number
  uniqueKey: string[]
  skipNullCols: boolean
}

export interface GoogleSheetConfig {
  id?: string
  label?: string
  sheetLink: string
  syncInterval: number
  enabled: boolean
  sheetConfigs?: SheetConfig[]
}
