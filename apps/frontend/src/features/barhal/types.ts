export interface BarhalKoliTo {
  id: string
  koli_id: string
  to_number: string
  awb: string | null
  gross_weight: number | null
}

export interface BarhalKoli {
  id: string
  koli_number: string
  koli_date: string
  origin_name: string
  dest_name: string
  sequence_no: number
  weight_before: number | null
  packing_kayu_weight: number
  weight_after: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume: number | null
  batang_kayu: number | null
  smu_number: string | null
  airlines: string | null
  flight_no: string | null
  std: string | null
  sta: string | null
  total_to: number
  created_at: string
  lines?: BarhalKoliTo[]
}

export interface AvailableTo {
  to_number: string
  awb: string | null
  gross_weight: number | null
  origin_station: string | null
  dest_station: string | null
  lt_number: string | null
  remarks: string | null
  date: string | null
  vendor: 'ESP'
}

export interface CreateKoliShellPayload {
  koliDate: string
  origin: string
  dest: string
}

export interface AttachTosPayload {
  toNumbers: string[]
}

export interface UpdatePackingPayload {
  weightAfter: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  batangKayu?: number
}

export interface UpdateSmuPayload {
  smuNumber?: string
  airlines?: string
  flightNo?: string
  std?: string
  sta?: string
}

export interface BulkUpdateSmuPayload {
  koliDate: string
  dest: string
  smuNumber?: string
  airlines?: string
  flightNo?: string
  std?: string
  sta?: string
}

export interface BarhalStations {
  origins: string[]
  dests: string[]
}

export interface BarhalDashboardTotals {
  koli_count: number
  total_to: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardRouteItem {
  origin_name: string
  dest_name: string
  koli_count: number
  weight_before: number
  weight_after: number
  chwt: number
}

export interface BarhalDashboardDrillDownItem {
  koli_date: string
  origin_name: string
  dest_name: string
  koli_count: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardStats {
  totals: BarhalDashboardTotals
  perRoute: BarhalDashboardRouteItem[]
  drillDown: BarhalDashboardDrillDownItem[]
}
