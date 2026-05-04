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

export interface PnlTrendItem {
  cyclePeriod: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  totalTos: number
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
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
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

export function usePnlTrend() {
  return useQuery<PnlTrendItem[]>({
    queryKey: ['pnl', 'trend'],
    queryFn: () => apiClient.get('/pnl/trend').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
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

export function usePnlDataQuality(filter: PnlFilter | undefined) {
  return useQuery<PnlDataQualityItem[]>({
    queryKey: ['pnl', 'data-quality', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/data-quality', { params: filter ? filterToParams(filter) : {} })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 5 * 60 * 1000,
  })
}
