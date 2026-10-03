import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { ScenarioDetail, ScenarioPayload, ScenarioSummary, SimulationSource } from '../types'

const KEY = ['route-simulation'] as const

export function useSimulationSource(enabled: boolean) {
  return useQuery<SimulationSource>({
    queryKey: [...KEY, 'source'],
    queryFn: () => apiClient.get('/route-simulation/source').then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
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
    // A scenario is opened deliberately; refetching it behind the user's back would overwrite edits.
    staleTime: Infinity,
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
  return () => queryClient.invalidateQueries({ queryKey: [...KEY, 'scenarios'] })
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
