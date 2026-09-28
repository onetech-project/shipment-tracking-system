import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetSummary } from '../types'

export function useFleetSummary() {
  return useQuery<Partial<FleetSummary>, Error, FleetSummary>({
    queryKey: ['fleet', 'summary'],
    queryFn: () => apiClient.get('/fleet/summary').then((r) => r.data),
    // Zeroed rather than left undefined, so a tile renders a figure instead of "NaN" against a
    // backend that has not shipped this endpoint yet.
    select: (d) => ({
      totalUnit: d.totalUnit ?? 0,
      dokumenKedaluwarsa: d.dokumenKedaluwarsa ?? 0,
      jatuhTempo30Hari: d.jatuhTempo30Hari ?? 0,
      cicilanPerBulan: d.cicilanPerBulan ?? 0,
      sisaKewajiban: d.sisaKewajiban ?? 0,
    }),
    staleTime: 30 * 1000,
  })
}
