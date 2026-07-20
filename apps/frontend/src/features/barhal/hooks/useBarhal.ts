import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { AvailableTo, BarhalKoli, CreateBarhalKoliPayload } from '../types'

export interface ListBarhalKoliParams {
  search?: string
  date?: string
  route?: string
  page?: number
  pageSize?: number
}

export function useBarhalRoutes() {
  return useQuery<string[]>({
    queryKey: ['barhal', 'routes'],
    queryFn: () => apiClient.get('/barhal/routes').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useBarhalList(params: ListBarhalKoliParams) {
  return useQuery<{ data: BarhalKoli[]; total: number; page: number; pageSize: number }>({
    queryKey: ['barhal', 'koli', params],
    queryFn: () => apiClient.get('/barhal/koli', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  })
}

export function useBarhalKoliDetail(id: string | null) {
  return useQuery<BarhalKoli>({
    queryKey: ['barhal', 'koli', 'detail', id],
    queryFn: () => apiClient.get(`/barhal/koli/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useAvailableTos(params: { route?: string; date?: string; search?: string }) {
  return useQuery<AvailableTo[]>({
    queryKey: ['barhal', 'available-tos', params],
    queryFn: () => apiClient.get('/barhal/available-tos', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}

export function useCreateBarhalKoli() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateBarhalKoliPayload) =>
      apiClient.post<BarhalKoli>('/barhal/koli', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barhal'] })
    },
  })
}
