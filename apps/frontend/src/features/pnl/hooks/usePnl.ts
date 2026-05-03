import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export interface PnlSummary {
  cyclePeriod: string
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

export function usePnlCycles() {
  return useQuery<string[]>({
    queryKey: ['pnl', 'cycles'],
    queryFn: () => apiClient.get('/pnl/cycles').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlSummary(cyclePeriod: string | undefined) {
  return useQuery<PnlSummary>({
    queryKey: ['pnl', 'summary', cyclePeriod],
    queryFn: () =>
      apiClient.get('/pnl/summary', { params: { cycle: cyclePeriod } }).then((r) => r.data),
    enabled: !!cyclePeriod,
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

export function usePnlAwbDrilldown(
  cyclePeriod: string | undefined,
  page: number,
  limit = 50,
) {
  return useQuery<{ data: PnlAwbRow[]; total: number }>({
    queryKey: ['pnl', 'awb-drilldown', cyclePeriod, page, limit],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-drilldown', { params: { cycle: cyclePeriod, page, limit } })
        .then((r) => r.data),
    enabled: !!cyclePeriod,
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
