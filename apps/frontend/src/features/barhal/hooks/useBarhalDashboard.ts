import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { BarhalDashboardStats, BarhalToDetailResponse, BarhalToDetailTab } from '../types'

export interface BarhalDashboardParams {
  startDate?: string
  endDate?: string
  origin?: string
  dest?: string
}

export function useBarhalDashboardStats(params: BarhalDashboardParams) {
  return useQuery<BarhalDashboardStats>({
    queryKey: ['barhal', 'dashboard', params],
    queryFn: () => apiClient.get('/barhal/dashboard', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  })
}

export async function exportBarhalCsv(params: BarhalDashboardParams): Promise<Blob> {
  const res = await apiClient.get('/barhal/export.csv', { params, responseType: 'blob' })
  return res.data
}

export interface BarhalToDetailParams {
  tab: BarhalToDetailTab
  startDate?: string
  endDate?: string
  origin?: string
  dest?: string
  page: number
  pageSize: number
}

export function useBarhalToDetail(params: BarhalToDetailParams) {
  return useQuery<BarhalToDetailResponse>({
    queryKey: ['barhal', 'to-detail', params],
    queryFn: () => apiClient.get('/barhal/to-detail', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  })
}
