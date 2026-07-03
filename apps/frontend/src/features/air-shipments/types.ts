export interface AirShipmentRow {
  id: string
  is_locked: boolean | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

/** One column's persisted layout in the app-wide SLA table config. */
export interface SlaColumnLayoutItem {
  key: string
  visible: boolean
  frozen: boolean
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

/** One offloaded AWB from air_shipments_tracking_smu (Flight Tracking alert). */
export interface OffloadedAwbRow {
  id: string
  awb: string
  airline?: string | null
  std_booking?: string | null
  std_flight_no?: string | null
  actual_flight_dep?: string | null
  dep_flight_no?: string | null
  dep2?: string | null
  dep2_flight_no?: string | null
  dep3?: string | null
  dep3_flight_no?: string | null
  dep4?: string | null
  dep4_flight_no?: string | null
  dep5?: string | null
  dep5_flight_no?: string | null
  remarks_offload?: string | null
  offload_status?: string | null
  evidence?: string | null
  updated_at?: string | null
  /** 'sheet' (Tracking_SMU) or 'api' (airline tracking endpoint) */
  source?: string | null
  fetched_at?: string | null
  error?: string | null
  [key: string]: unknown
}

export interface OffloadedAwbResponse {
  data: OffloadedAwbRow[]
  meta: { total: number; page: number; limit: number }
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
  updatedAt?: string
}
