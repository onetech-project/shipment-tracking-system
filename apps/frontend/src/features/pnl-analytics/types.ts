/** Wire shapes of the three /pnl/analytics endpoints, plus the types derived from them. */

/** One (date × route) cell straight off GET /pnl/analytics/daily-series. */
export interface AnalyticsDailyRow {
  date: string // YYYY-MM-DD
  origin: string
  dest: string
  revenue: number // net of discount
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  weight: number
  incompleteTos: number
}

export interface AnalyticsDailySeries {
  /** Every calendar day the period spans, including days with no rows below. */
  dates: string[]
  rows: AnalyticsDailyRow[]
}

export interface AnalyticsJourneyRow {
  vendor: string | null
  airline: string | null
  origin: string
  dest: string
  awbCount: number
  gw: number
  chwt: number
  revenue: number
  cost: number
  margin: number
  marginPerKg: number
}

export interface AnalyticsGwChwRow {
  origin: string
  dest: string
  gw: number
  chwt: number
  diff: number
  revenuePerKg: number
  impact: number
}

/** Which routes the viewer has narrowed to. 'all' means every route the period carries. */
export type AnalyticsScope =
  | { kind: 'all' }
  | { kind: 'group'; id: string }
  | { kind: 'routes'; keys: string[] } // route keys, `${origin}|${dest}`

/**
 * One day of the folded series. `cost` is ALWAYS the four components summed — never the
 * summary endpoint's totalCost, which disagrees with it by up to 17% on some periods.
 */
export interface SeriesDay {
  date: string
  revenue: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
  cost: number
  margin: number
  weight: number
}

export const KPI_KEYS = [
  'days',
  'weight',
  'weightPerDay',
  'revenue',
  'revenuePerDay',
  'revenuePerKg',
  'cost',
  'costPerDay',
  'costPerKg',
  'margin',
  'marginPerDay',
  'marginPerKg',
  'marginPct',
] as const

export type KpiKey = (typeof KPI_KEYS)[number]

export type Kpis = Record<KpiKey, number>

export interface KpiDelta {
  value: number
  prev: number | null
  /** null when there is no usable baseline — never 0, which would read as "no change". */
  deltaPct: number | null
}

export type KpiSet = Record<KpiKey, KpiDelta>

export type CampaignRule = { type: 'doubleDate' } | { type: 'dayOfMonth'; day: number }

export interface Campaign {
  label: string
  rule: CampaignRule
}

/** The slice of the SLA overview response the Operations section reads. */
export interface SlaOtpSummary {
  percentage: number
  onTimeWeight: number
  lateWeight: number
  breakdown: Array<{
    route: string
    percentage: number
    onTimeWeight: number
    lateWeight: number
  }>
}

export interface SlaOverview {
  summary: {
    alerts: Record<string, { routes: number; tonnage: number }>
    otp?: SlaOtpSummary
  }
}
