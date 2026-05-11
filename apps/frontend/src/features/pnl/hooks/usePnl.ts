import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export type PnlFilter =
  | { mode: 'cycle'; cycle: string }
  | { mode: 'range'; start: string; end: string }

export interface PnlSummary {
  label: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
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
  totalRevenue: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlToRow {
  toNumber: string
  grossWeight: number
  revenue: number
  costSmu: number | null
  costRa: number | null
  costSg: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  marginPct: number | null
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
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
    ? { cycle: filter.cycle }
    : { start: filter.start, end: filter.end }
}

export function usePnlCycles() {
  return useQuery<string[]>({
    queryKey: ['pnl', 'cycles'],
    queryFn: () => apiClient.get('/pnl/cycles').then((r) => r.data),
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

export function usePnlDataQuality() {
  return useQuery<PnlDataQualityItem[]>({
    queryKey: ['pnl', 'data-quality'],
    queryFn: () => apiClient.get('/pnl/data-quality').then((r) => r.data),
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
