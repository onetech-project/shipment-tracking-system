import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  FleetSeverity,
  FleetVehicle,
  FleetVehicleDocument,
  FleetVehicleDocumentPayload,
  FleetVehicleFilters,
  FleetVehicleListResponse,
  FleetVehiclePayload,
} from '../types'

// Wire shapes are looser than the domain types: frontend and backend deploy in parallel, so a
// response from a backend that predates a field must still render. Same convention as
// useFleetDrivers.
interface FleetVehicleWire extends Partial<Omit<FleetVehicle, 'id' | 'nopol' | 'documents'>> {
  id: string
  nopol: string
  documents?: Partial<FleetVehicleDocument>[]
}

interface FleetVehicleListWire {
  rows?: FleetVehicleWire[]
  total?: number
  page?: number
  pageSize?: number
}

const VEHICLES_KEY = ['fleet', 'vehicles']

function normalizeDocument(d: Partial<FleetVehicleDocument>): FleetVehicleDocument {
  return {
    docTypeId: d.docTypeId ?? '',
    code: d.code ?? '',
    label: d.label ?? '',
    nomor: d.nomor ?? null,
    issuedAt: d.issuedAt ?? null,
    expiresAt: d.expiresAt ?? null,
    daysLeft: d.daysLeft ?? null,
    severity: d.severity ?? 'none',
  }
}

function normalizeVehicle(row: FleetVehicleWire): FleetVehicle {
  return {
    id: row.id,
    nopol: row.nopol,
    merk: row.merk ?? null,
    tipe: row.tipe ?? null,
    tahun: row.tahun ?? null,
    kapasitas: row.kapasitas ?? null,
    noRangka: row.noRangka ?? null,
    noMesin: row.noMesin ?? null,
    noBpkb: row.noBpkb ?? null,
    pemilikUnit: row.pemilikUnit ?? null,
    odometer: row.odometer ?? null,
    catatan: row.catatan ?? null,
    jenisArmada: row.jenisArmada ?? null,
    kepemilikan: row.kepemilikan ?? null,
    pool: row.pool ?? null,
    status: row.status ?? null,
    driver: row.driver ?? null,
    lease: row.lease ?? null,
    documents: (row.documents ?? []).map(normalizeDocument),
    // 'none' rather than 'ok': a backend that did not answer has not said the papers are in
    // order, and a green badge on an unknown state is the one wrong answer here.
    worstSeverity: (row.worstSeverity as FleetSeverity) ?? 'none',
    minDaysLeft: row.minDaysLeft ?? null,
    isActive: row.isActive ?? true,
  }
}

export function useFleetVehicles(filters: FleetVehicleFilters) {
  return useQuery<FleetVehicleListWire, Error, FleetVehicleListResponse>({
    // The filters are part of the key: without them, switching a filter serves the previous
    // filter's rows from cache until the refetch lands.
    queryKey: [...VEHICLES_KEY, filters],
    queryFn: () =>
      apiClient
        .get('/fleet/vehicles', {
          params: {
            q: filters.q?.trim() || undefined,
            page: filters.page,
            pageSize: filters.pageSize,
            sort: filters.sort,
            severity: filters.severity || undefined,
            kepemilikanId: filters.kepemilikanId || undefined,
            poolId: filters.poolId || undefined,
            statusId: filters.statusId || undefined,
            includeArchived: filters.includeArchived || undefined,
          },
        })
        .then((r) => r.data),
    select: (data) => ({
      rows: (data.rows ?? []).map(normalizeVehicle),
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 25,
    }),
    staleTime: 30 * 1000,
  })
}

export function useFleetVehicle(id?: string) {
  return useQuery<FleetVehicleWire, Error, FleetVehicle>({
    queryKey: [...VEHICLES_KEY, 'detail', id],
    queryFn: () => apiClient.get(`/fleet/vehicles/${id}`).then((r) => r.data),
    select: normalizeVehicle,
    // The edit dialog mounts before a row is chosen.
    enabled: Boolean(id),
  })
}

export function useCreateFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FleetVehiclePayload) =>
      apiClient.post('/fleet/vehicles', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useUpdateFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FleetVehiclePayload> }) =>
      apiClient.patch(`/fleet/vehicles/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// Archiving is a state change, not a deletion — POST, matching the backend route. The UI never
// hard-deletes: DELETE /fleet/vehicles/:id exists but deliberately has no hook here.
export function useArchiveFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/fleet/vehicles/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useRestoreFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/fleet/vehicles/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// The whole set goes in one request so the backend can swap it in a single transaction; sending
// documents one at a time leaves the vehicle half-updated when one call fails.
export function useReplaceVehicleDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, documents }: { id: string; documents: FleetVehicleDocumentPayload[] }) =>
      apiClient.put(`/fleet/vehicles/${id}/documents`, { documents }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}
