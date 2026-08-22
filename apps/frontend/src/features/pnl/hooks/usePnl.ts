import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export type DateBasis = 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'
export const DEFAULT_DATE_BASIS: DateBasis = 'ata_vendor_wh_destination'

// One source of truth for how a date basis is named in the UI: the header dropdown and the
// drilldown's date column header must never drift apart.
export const BASIS_LABELS: Record<DateBasis, string> = {
  ata_vendor_wh_destination: 'ATA Vendor WH dest',
  atd_origin: 'ATD origin',
  completed_time: 'Completed time',
}

// Exported so a rename touches one place. Lives here rather than in page.tsx because Next's App
// Router only allows a page.tsx to export `default` and a fixed whitelist (metadata,
// generateStaticParams, ...) — any other named export fails the generated page type check.
export const ROUTE_COMPARISON_LABEL = 'Route Comparison'

export interface PnlRoutePair {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  dest: string // already a city name, e.g. 'Denpasar'
}

// One data quality issue inside one cell, and how many distinct AWBs carry it there.
export interface PnlCellIssue {
  issue: string
  awbs: number
}

// Narrows the AWB drilldown only. Empty fields are omitted from the request entirely.
export interface PnlRouteFilter {
  routes?: PnlRoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
}

export interface PnlStation {
  origin: string
  originLabel: string
  dest: string
}

export type PnlFilter =
  | { mode: 'cycle'; cycle: string; basis: DateBasis }
  | { mode: 'range'; start: string; end: string; basis: DateBasis }

export interface PnlSummary {
  label: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
  totalDiscount: number
  totalCost: number
  grossProfit: number
  grossMarginPct: number
}

export interface PnlDailyMarginItem {
  date: string
  revenue: number
  cost: number
  marginPct: number | null
  hasIncompleteCost: boolean
}

export interface PnlAwbRow {
  awb: string
  vendor: string | null
  airline: string | null
  origin: string | null
  dest: string | null
  date: string | null
  originVaries: boolean
  destVaries: boolean
  dateVaries: boolean
  toCount: number
  sumGw: number
  chwt: number | null
  totalRevenue: number
  totalDiscount: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
  issue: string | null
}

export interface PnlToRow {
  toNumber: string
  grossWeight: number
  chwt: number | null
  revenue: number
  costSmu: number | null
  costRa: number | null
  costSg: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  marginPct: number | null
  issue: string | null
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
}

export interface PnlDataQualitySummaryItem {
  issue: string
  rows: number
  awbs: number
}

export interface PnlRevenueByRouteItem {
  route: string
  totalWeight: number
  totalRevenue: number
}

export interface PnlCostTotals {
  smu: number
  ra: number
  sgOut: number
  sgIn: number
}

export interface PnlAirlineCostItem {
  airline: string
  totalWeight: number
  totalCost: number
}

export interface PnlVendorCostItem {
  vendor: string
  totalWeight: number
  totalCost: number
  airlines: PnlAirlineCostItem[]
}

export interface PnlNamedCostItem {
  name: string
  totalWeight: number
  totalCost: number
}

export interface PnlSgInRouteCostItem {
  route: string
  totalWeight: number
  totalCost: number
}

export interface PnlProfitByRouteItem {
  route: string
  totalRevenue: number
  totalMargin: number
  avgWeightPerDay: number
  avgCostPerKg: number
  avgMarginPerKg: number
  avgMarginPerDay: number
}

export interface PnlDailyMatrixColumn {
  origin: string
  originLabel: string
  dest: string
}

export interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlDailyMatrixRow {
  date: string
  cells: (PnlDailyMatrixCell | null)[]
}

export interface PnlDailyMatrixFooter {
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null
  spacePerKg: number | null
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]
  footer: PnlDailyMatrixFooter[]
  periodDays: number
}

export interface PnlGroupComparisonColumn {
  // A group column's id is its uuid; a route column's is `r:<origin>|<dest>`.
  id: string
  name: string
  routeCount: number
  kind: 'group' | 'route'
  // The pairs this column aggregates, straight from the response — so a clicked cell and the
  // overlap warning both read the same list the numbers came from.
  routes: { origin: string; originLabel: string; dest: string }[]
}

// One comparison column the user picked: a saved group, or a bare route.
export type PnlColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'route'; origin: string; dest: string }

export function columnsToParam(picks: PnlColumnPick[]): string {
  return picks
    .map((p) => (p.kind === 'group' ? `g:${p.id}` : `r:${p.origin}|${p.dest}`))
    .join(',')
}

export interface PnlGroupComparisonCell {
  revenue: number
  cost: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlGroupComparisonRow {
  date: string
  cells: (PnlGroupComparisonCell | null)[]
}

export interface PnlGroupComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  avgRevenuePerDay: number
  avgCostPerDay: number
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlGroupComparison {
  columns: PnlGroupComparisonColumn[]
  rows: PnlGroupComparisonRow[]
  footer: PnlGroupComparisonFooter[]
  periodDays: number
}

function filterToParams(filter: PnlFilter) {
  return filter.mode === 'cycle'
    ? { cycle: filter.cycle, basis: filter.basis }
    : { start: filter.start, end: filter.end, basis: filter.basis }
}

export function usePnlCycles(basis: DateBasis = DEFAULT_DATE_BASIS) {
  return useQuery<string[]>({
    queryKey: ['pnl', 'cycles', basis],
    queryFn: () => apiClient.get('/pnl/cycles', { params: { basis } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlSummary(filter: PnlFilter | undefined) {
  return useQuery<PnlSummary>({
    queryKey: ['pnl', 'summary', filter],
    queryFn: () =>
      apiClient.get('/pnl/summary', { params: filterToParams(filter!) }).then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlDailyMargin(filter: PnlFilter | undefined) {
  return useQuery<PnlDailyMarginItem[]>({
    queryKey: ['pnl', 'daily-margin', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/daily-margin', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

// Only non-empty fields are sent, so an untouched filter produces the exact request shape the
// endpoint saw before route filtering existed. Exported so its HTTP param names are pinned by a
// direct test rather than only indirectly through a mocked hook.
export function routeToParams(route: PnlRouteFilter | undefined) {
  if (!route) return {}
  return {
    ...(route.routes?.length
      ? { routes: route.routes.map((r) => `${r.origin}|${r.dest}`).join(',') }
      : {}),
    ...(route.dateFrom ? { dateFrom: route.dateFrom } : {}),
    ...(route.dateTo ? { dateTo: route.dateTo } : {}),
  }
}

export function usePnlStations() {
  return useQuery<PnlStation[]>({
    queryKey: ['pnl', 'stations'],
    queryFn: () => apiClient.get('/pnl/stations').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlAwbDrilldown(
  filter: PnlFilter | undefined,
  page: number,
  route?: PnlRouteFilter,
  limit = 50,
) {
  return useQuery<{ data: PnlAwbRow[]; total: number }>({
    queryKey: ['pnl', 'awb-drilldown', filter, page, limit, route],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-drilldown', {
          params: { ...filterToParams(filter!), ...routeToParams(route), page, limit },
        })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlAwbTos(awb: string | null, filter: PnlFilter | undefined) {
  return useQuery<PnlToRow[]>({
    queryKey: ['pnl', 'awb-tos', awb, filter],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-tos', { params: { awb, ...filterToParams(filter!) } })
        .then((r) => r.data),
    enabled: !!awb && !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlDataQuality(page: number, limit = 25) {
  return useQuery<{ data: PnlDataQualityItem[]; total: number }>({
    queryKey: ['pnl', 'data-quality', page, limit],
    queryFn: () =>
      apiClient.get('/pnl/data-quality', { params: { page, limit } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlDataQualitySummary() {
  return useQuery<PnlDataQualitySummaryItem[]>({
    queryKey: ['pnl', 'data-quality', 'summary'],
    queryFn: () => apiClient.get('/pnl/data-quality/summary').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlRevenueByRoute(filter: PnlFilter | undefined) {
  return useQuery<PnlRevenueByRouteItem[]>({
    queryKey: ['pnl', 'revenue-by-route', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/revenue-by-route', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlCostTotals(filter: PnlFilter | undefined) {
  return useQuery<PnlCostTotals>({
    queryKey: ['pnl', 'cost-totals', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-totals', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlCostByVendor(filter: PnlFilter | undefined, enabled = true) {
  return useQuery<PnlVendorCostItem[]>({
    queryKey: ['pnl', 'cost-by-vendor', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-by-vendor', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter && enabled,
    staleTime: 60 * 1000,
  })
}

export function usePnlCostByRa(filter: PnlFilter | undefined, enabled = true) {
  return useQuery<PnlNamedCostItem[]>({
    queryKey: ['pnl', 'cost-by-ra', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-by-ra', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter && enabled,
    staleTime: 60 * 1000,
  })
}

export function usePnlCostBySgOut(filter: PnlFilter | undefined, enabled = true) {
  return useQuery<PnlNamedCostItem[]>({
    queryKey: ['pnl', 'cost-by-sg-out', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-by-sg-out', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter && enabled,
    staleTime: 60 * 1000,
  })
}

export function usePnlCostBySgIn(filter: PnlFilter | undefined, enabled = true) {
  return useQuery<PnlSgInRouteCostItem[]>({
    queryKey: ['pnl', 'cost-by-sg-in', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-by-sg-in', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter && enabled,
    staleTime: 60 * 1000,
  })
}

export function usePnlProfitByRoute(filter: PnlFilter | undefined) {
  return useQuery<PnlProfitByRouteItem[]>({
    queryKey: ['pnl', 'profit-by-route', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/profit-by-route', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function usePnlDailyMatrix(filter: PnlFilter | undefined) {
  return useQuery<PnlDailyMatrix>({
    queryKey: ['pnl', 'daily-matrix', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/daily-matrix', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

// Disabled until at least one column is picked, so an untouched tab makes no request at all.
// picks is part of the query key, so re-picking refetches without a manual invalidate.
export function usePnlRouteComparison(filter: PnlFilter | undefined, picks: PnlColumnPick[]) {
  return useQuery<PnlGroupComparison>({
    queryKey: ['pnl', 'route-comparison', filter, picks],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/route-comparison', {
          params: { ...filterToParams(filter!), columns: columnsToParam(picks) },
        })
        .then((r) => r.data),
    enabled: !!filter && picks.length > 0,
    staleTime: 60 * 1000,
  })
}
