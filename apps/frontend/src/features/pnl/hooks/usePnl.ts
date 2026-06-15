import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export type DateBasis = 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'
export const DEFAULT_DATE_BASIS: DateBasis = 'ata_vendor_wh_destination'

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

export function usePnlAwbDrilldown(filter: PnlFilter | undefined, page: number, limit = 50) {
  return useQuery<{ data: PnlAwbRow[]; total: number }>({
    queryKey: ['pnl', 'awb-drilldown', filter, page, limit],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-drilldown', { params: { ...filterToParams(filter!), page, limit } })
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
