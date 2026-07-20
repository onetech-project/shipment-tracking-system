export interface BarhalKoliTo {
  id: string
  koli_id: string
  to_number: string
  awb: string | null
  gross_weight: number | null
  smu_account: string | null
  smu_airlines: string | null
  smu_flight_date: string | null
  smu_flight_number: string | null
}

export interface BarhalKoli {
  id: string
  koli_number: string
  koli_date: string
  route: string
  origin_code: string
  dest_code: string
  sequence_no: number
  weight_before: number
  packing_kayu_weight: number
  weight_after: number
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume: number | null
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
  smu_account: string | null
  smu_airlines: string | null
  smu_flight_date: string | null
  smu_flight_number: string | null
}

export interface CreateBarhalKoliPayload {
  koliDate: string
  route: string
  toNumbers: string[]
  packingKayuWeight?: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
}

export interface BarhalDashboardTotals {
  koli_count: number
  total_to: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardRouteItem {
  route: string
  koli_count: number
  weight_before: number
  weight_after: number
  chwt: number
}

export interface BarhalDashboardDrillDownItem {
  koli_date: string
  route: string
  koli_count: number
  weight_before: number
  weight_after: number
}

export interface BarhalDashboardStats {
  totals: BarhalDashboardTotals
  perRoute: BarhalDashboardRouteItem[]
  drillDown: BarhalDashboardDrillDownItem[]
}
