import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { ScenarioDetail, ScenarioPayload, ScenarioSummary, SimulationSource } from '../types'

const KEY = ['route-simulation'] as const

export function useSimulationSource(enabled: boolean) {
  return useQuery<SimulationSource>({
    queryKey: [...KEY, 'source'],
    queryFn: () => apiClient.get('/route-simulation/source').then((r) => r.data),
    enabled,
    // Once loaded, the source only changes through the reducer (routeAdd/routeDel/etc.); a
    // background refetch would silently diverge from whatever the user has edited.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useScenarios(enabled: boolean) {
  return useQuery<ScenarioSummary[]>({
    queryKey: [...KEY, 'scenarios'],
    queryFn: () => apiClient.get('/route-simulation/scenarios').then((r) => r.data),
    enabled,
    staleTime: 30 * 1000,
  })
}

export function useScenario(id: string | null) {
  return useQuery<ScenarioDetail>({
    queryKey: [...KEY, 'scenarios', id],
    queryFn: () => apiClient.get(`/route-simulation/scenarios/${id}`).then((r) => r.data),
    enabled: !!id,
    // A scenario is opened deliberately: no background refetch may overwrite edits. But the cached
    // revision must never be trusted either (a stale revision 409s forever), so every explicit open
    // (mount) always hits the network; nothing refetches behind the user's back afterwards.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export interface CreateScenarioBody {
  name: string
  description?: string | null
  payload: ScenarioPayload
}

export interface UpdateScenarioBody {
  revision: number
  name?: string
  description?: string | null
  payload?: ScenarioPayload
}

function useInvalidateList() {
  const queryClient = useQueryClient()
  // The list only: a prefix match would also refetch the open scenario's detail after every write.
  return () => queryClient.invalidateQueries({ queryKey: [...KEY, 'scenarios'], exact: true })
}

export function useCreateScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: (body: CreateScenarioBody) =>
      apiClient.post<ScenarioDetail>('/route-simulation/scenarios', body).then((r) => r.data),
    onSuccess,
  })
}

export function useUpdateScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScenarioBody }) =>
      apiClient.patch<ScenarioDetail>(`/route-simulation/scenarios/${id}`, body).then((r) => r.data),
    onSuccess,
  })
}

export function useDeleteScenario() {
  const onSuccess = useInvalidateList()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/route-simulation/scenarios/${id}`).then((r) => r.data),
    onSuccess,
  })
}
