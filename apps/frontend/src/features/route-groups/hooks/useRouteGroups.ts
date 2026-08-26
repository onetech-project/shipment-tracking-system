import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { AvailableRoute, RouteGroup, RouteGroupPayload } from '../types'

export function useRouteGroups(options?: { enabled?: boolean }) {
  return useQuery<RouteGroup[]>({
    queryKey: ['route-groups'],
    queryFn: () => apiClient.get('/route-groups').then((r) => r.data),
    staleTime: 60 * 1000,
    enabled: options?.enabled,
  })
}

// The master route list barely changes, so it is cached far longer than the groups themselves.
export function useAvailableRoutes() {
  return useQuery<AvailableRoute[]>({
    queryKey: ['route-groups', 'available-routes'],
    queryFn: () => apiClient.get('/route-groups/available-routes').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RouteGroupPayload) =>
      apiClient.post<RouteGroup>('/route-groups', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}

export function useUpdateRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RouteGroupPayload }) =>
      apiClient.patch<RouteGroup>(`/route-groups/${id}`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}

export function useDeleteRouteGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/route-groups/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-groups'] }),
  })
}
