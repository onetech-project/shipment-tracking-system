import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetDriver, FleetDriverPayload, FleetMasterCategory, FleetMasterRow } from '../types'

// Wire shapes are looser than the domain types: frontend and backend deploy in parallel, so a
// response from a backend that predates a field must still parse. Same convention as
// useVendorGroups.
interface FleetDriverWire {
  id: string
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simJenis?: { id: string; label: string } | null
  simExpiresAt?: string | null
  isActive?: boolean
}

export function useFleetDrivers(params: { q?: string; includeInactive?: boolean } = {}) {
  const { q = '', includeInactive = false } = params
  return useQuery<FleetDriverWire[], Error, FleetDriver[]>({
    queryKey: ['fleet', 'drivers', { q, includeInactive }],
    queryFn: () =>
      apiClient
        .get('/fleet/drivers', { params: { q: q || undefined, includeInactive } })
        .then((r) => r.data),
    select: (rows) =>
      rows.map((row) => ({
        id: row.id,
        nama: row.nama,
        telepon: row.telepon ?? null,
        simNomor: row.simNomor ?? null,
        simJenisId: row.simJenisId ?? null,
        simJenis: row.simJenis ?? null,
        simExpiresAt: row.simExpiresAt ?? null,
        // Defaults to true: a backend that cannot answer has not said the driver is archived.
        isActive: row.isActive ?? true,
      })),
    staleTime: 60 * 1000,
  })
}

// Shared by the driver form (jenis_sim) and, from Phase 2, the vehicle form. Cached longer than
// the lists it feeds — master data barely moves.
// GET /fleet/master-data is gated by READ_FLEET_MASTER_DATA, but the pages that need these
// dropdowns are gated by READ_FLEET_VEHICLE — spec §7 splits them on purpose so a field
// operator can register vehicles without editing the lookup lists. Callers pass enabled so
// that persona spends no request and can be told the lists are unavailable, instead of
// staring at an empty dropdown.
export function useFleetMasterDataByCategory(
  category: FleetMasterCategory,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<FleetMasterRow[]>({
    queryKey: ['fleet', 'master-data', category],
    queryFn: () =>
      apiClient.get('/fleet/master-data', { params: { category } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: opts.enabled ?? true,
  })
}

export function useCreateFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FleetDriverPayload) =>
      apiClient.post('/fleet/drivers', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}

export function useUpdateFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FleetDriverPayload> }) =>
      apiClient.patch(`/fleet/drivers/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}

export function useDeleteFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/fleet/drivers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}
