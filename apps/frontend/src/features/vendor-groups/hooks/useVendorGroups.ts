import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { AvailableVendor, VendorGroup, VendorGroupPayload } from '../types'

// The wire shapes are deliberately looser than the domain types above. Frontend and backend deploy
// in parallel, so a response from a backend that predates a field must still parse; every such
// field is optional here and defaulted in `select`, which is the one place that reads it.
interface VendorGroupWire {
  id: string
  name: string
  description: string | null
  vendors?: string[]
}

interface AvailableVendorWire {
  vendor: string
  hasData?: boolean
  inMaster?: boolean
}

export function useVendorGroups(options?: { enabled?: boolean }) {
  return useQuery<VendorGroupWire[], Error, VendorGroup[]>({
    queryKey: ['vendor-groups'],
    queryFn: () => apiClient.get('/vendor-groups').then((r) => r.data),
    select: (rows) => rows.map((row) => ({ ...row, vendors: row.vendors ?? [] })),
    staleTime: 60 * 1000,
    enabled: options?.enabled,
  })
}

// Keyed beneath ['vendor-groups'] on purpose: the mutations below invalidate that prefix, so a new
// group also refreshes the vendor list. The list itself barely moves between sheet syncs, so it is
// cached far longer than the groups.
export function useAvailableVendors() {
  return useQuery<AvailableVendorWire[], Error, AvailableVendor[]>({
    queryKey: ['vendor-groups', 'available-vendors'],
    queryFn: () => apiClient.get('/vendor-groups/available-vendors').then((r) => r.data),
    // Both flags default to true. A backend that cannot answer has not said anything is wrong, and
    // dotting every vendor with a warning we cannot substantiate would train the admin to ignore it.
    select: (rows) =>
      rows.map((row) => ({
        vendor: row.vendor,
        hasData: row.hasData ?? true,
        inMaster: row.inMaster ?? true,
      })),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorGroupPayload) =>
      apiClient.post<VendorGroup>('/vendor-groups', payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}

export function useUpdateVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VendorGroupPayload }) =>
      apiClient.patch<VendorGroup>(`/vendor-groups/${id}`, payload).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}

export function useDeleteVendorGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/vendor-groups/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-groups'] }),
  })
}
