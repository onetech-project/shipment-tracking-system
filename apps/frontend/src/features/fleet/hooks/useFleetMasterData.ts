import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
  FleetMasterUpdatePayload,
} from '../types'

interface FleetMasterRowWire {
  id: string
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder?: number
  isActive?: boolean
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

// includeInactive is true here, unlike useFleetMasterDataByCategory which feeds dropdowns: this
// is the management screen, where a deactivated row must stay visible to be reactivated.
export function useFleetMasterData(category: FleetMasterCategory) {
  return useQuery<FleetMasterRowWire[], Error, FleetMasterRow[]>({
    queryKey: ['fleet', 'master-data', 'manage', category],
    queryFn: () =>
      apiClient
        .get('/fleet/master-data', { params: { category, includeInactive: true } })
        .then((r) => r.data),
    select: (rows) =>
      rows.map((row) => ({
        id: row.id,
        category: row.category,
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder ?? 0,
        isActive: row.isActive ?? true,
        warnDays: row.warnDays ?? null,
        defaultValidMonths: row.defaultValidMonths ?? null,
        isRequired: row.isRequired ?? null,
      })),
    staleTime: 60 * 1000,
  })
}

// Invalidates the ['fleet'] prefix rather than one category: a new pool row has to reach both the
// management table and the dropdown caches that feed the vehicle form.
function useInvalidateFleet() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['fleet'] })
}

export function useCreateFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: (payload: FleetMasterPayload) =>
      apiClient.post('/fleet/master-data', payload).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FleetMasterUpdatePayload }) =>
      apiClient.patch(`/fleet/master-data/${id}`, payload).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/fleet/master-data/${id}`),
    onSuccess: invalidate,
  })
}
