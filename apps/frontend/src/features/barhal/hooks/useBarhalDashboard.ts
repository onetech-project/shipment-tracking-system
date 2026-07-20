import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { BarhalDashboardStats } from '../types'

export interface BarhalDashboardParams {
  startDate?: string
  endDate?: string
  route?: string
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
