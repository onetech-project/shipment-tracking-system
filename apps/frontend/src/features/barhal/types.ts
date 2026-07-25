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

export interface BarhalDashboardKpi {
  totalKoli: number
  totalTo: number
  totalWeightBefore: number
  totalWeightAfter: number
  totalVariance: number
  totalBatangKayu: number
}

export interface BarhalChartByDateItem {
  date: string
  weightBefore: number
  weightAfter: number
  chwt: number
}

export interface BarhalRecapBatangKayuItem {
  date: string
  totalKoli: number
  totalP: number
  totalL: number
  totalT: number
  totalVolume: number
  totalBatangKayu: number
}

export interface BarhalRecapPerTanggalItem {
  date: string
  totalTo: number
  totalKoli: number
  weightBefore: number
  weightAfter: number
  chwt: number
  variance: number
  variancePercent: number
  addRevenue: number
  status: 'completed' | 'incomplete'
}

export interface BarhalRecapPerRuteItem {
  originName: string
  destName: string
  totalTo: number
  totalKoli: number
  weightBefore: number
  weightAfter: number
  chwt: number
  variance: number
  variancePercent: number
  addRevenue: number
  status: 'completed' | 'incomplete'
}

export interface BarhalDashboardStats {
  kpi: BarhalDashboardKpi
  chartByDate: BarhalChartByDateItem[]
  recapBatangKayu: BarhalRecapBatangKayuItem[]
  recapPerTanggal: BarhalRecapPerTanggalItem[]
  recapPerRute: BarhalRecapPerRuteItem[]
}

export interface BarhalSmuListItem {
  smuNumber: string
  date: string
  originName: string
  destName: string
  totalKoli: number
  totalTo: number
  airlines: string | null
  flightNo: string | null
  std: string | null
  sta: string | null
  chwt: number | null
}
