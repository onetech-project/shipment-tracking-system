import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  AvailableToResponse,
  BarhalKoli,
  BarhalSmuListItem,
  BarhalStations,
  CreateKoliShellPayload,
  AttachTosPayload,
  UpdatePackingPayload,
  UpdateSmuPayload,
  BulkUpdateSmuPayload,
} from '../types'

export interface ListBarhalKoliParams {
  search?: string
  date?: string
  origin?: string
  dest?: string
  page?: number
  pageSize?: number
}

export function useBarhalStations() {
  return useQuery<BarhalStations>({
    queryKey: ['barhal', 'stations'],
    queryFn: () => apiClient.get('/barhal/stations').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useBarhalList(params: ListBarhalKoliParams, options?: { enabled?: boolean }) {
  return useQuery<{ data: BarhalKoli[]; total: number; page: number; pageSize: number }>({
    queryKey: ['barhal', 'koli', params],
    queryFn: () => apiClient.get('/barhal/koli', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
    enabled: options?.enabled ?? true,
  })
}

export function useBarhalKoliDetail(id: string | null) {
  return useQuery<BarhalKoli>({
    queryKey: ['barhal', 'koli', 'detail', id],
    queryFn: () => apiClient.get(`/barhal/koli/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useAvailableTos(params: { origin?: string; dest?: string; date?: string; search?: string; koliId?: string }) {
  return useQuery<AvailableToResponse>({
    queryKey: ['barhal', 'available-tos', params],
    queryFn: () => apiClient.get('/barhal/available-tos', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}

export function useCreateKoliShell() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateKoliShellPayload) =>
      apiClient.post<BarhalKoli>('/barhal/koli', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useAttachTos(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AttachTosPayload) =>
      apiClient.put<BarhalKoli>(`/barhal/koli/${koliId}/tos`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useUpdatePacking(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePackingPayload) =>
      apiClient.patch<BarhalKoli>(`/barhal/koli/${koliId}/packing`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useUpdateSmu(koliId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateSmuPayload) =>
      apiClient.patch<BarhalKoli>(`/barhal/koli/${koliId}/smu`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useBulkUpdateSmu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: BulkUpdateSmuPayload) =>
      apiClient.patch<{ updated: number }>('/barhal/koli/bulk-smu', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useSmuList(params: { date?: string; origin?: string; dest?: string }) {
  return useQuery<BarhalSmuListItem[]>({
    queryKey: ['barhal', 'smu-list', params],
    queryFn: () => apiClient.get('/barhal/smu-list', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}

export function useDeleteKoli() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (koliId: string) => apiClient.delete(`/barhal/koli/${koliId}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}

export function useUnassignSmu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (smuNumber: string) =>
      apiClient.delete<{ updated: number }>(`/barhal/smu/${encodeURIComponent(smuNumber)}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barhal'] }),
  })
}
