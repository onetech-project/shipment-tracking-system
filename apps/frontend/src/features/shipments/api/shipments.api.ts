import { apiClient } from '@/shared/api/client'
import type {
  UploadInitiatedResponse,
  ImportStatusResponse,
  ImportErrorsResponse,
  ResolveConflictsRequest,
  ResolveConflictsResponse,
  UploadHistoryResponse,
  ImportItemsResponse,
  ShipmentResponse,
  LinehaulLookupResponse,
  LinehaulTripsListResponse,
  LinehaulTripDetailResponse,
} from '@shared/shipments'

const BASE = '/shipments'

export async function uploadPdf(file: File): Promise<UploadInitiatedResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<UploadInitiatedResponse>(`${BASE}/imports`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getImportStatus(uploadId: string): Promise<ImportStatusResponse> {
  const { data } = await apiClient.get<ImportStatusResponse>(`${BASE}/imports/${uploadId}`)
  return data
}

export async function getImportErrors(uploadId: string): Promise<ImportErrorsResponse> {
  const { data } = await apiClient.get<ImportErrorsResponse>(`${BASE}/imports/${uploadId}/errors`)
  return data
}

export async function resolveConflicts(
  uploadId: string,
  body: ResolveConflictsRequest
): Promise<ResolveConflictsResponse> {
  const { data } = await apiClient.post<ResolveConflictsResponse>(
    `${BASE}/imports/${uploadId}/conflicts/resolve`,
    body
  )
  return data
}

export async function getImportHistory(
  limit = 20,
  cursor?: string
): Promise<UploadHistoryResponse> {
  const { data } = await apiClient.get<UploadHistoryResponse>(`${BASE}/imports/history`, {
    params: { limit, ...(cursor ? { cursor } : {}) },
  })
  return data
}

export async function getImportItems(
  uploadId: string,
  page = 1,
  limit = 20
): Promise<ImportItemsResponse> {
  const { data } = await apiClient.get<ImportItemsResponse>(
    `${BASE}/imports/${encodeURIComponent(uploadId)}/items`,
    { params: { page, limit } }
  )
  return data
}

export async function lookupShipment(shipmentId: string): Promise<ShipmentResponse> {
  const { data } = await apiClient.get<ShipmentResponse>(
    `${BASE}/${encodeURIComponent(shipmentId)}`
  )
  return data
}

export async function lookupLinehaulItem(toNumber: string): Promise<LinehaulLookupResponse> {
  const { data } = await apiClient.get<LinehaulLookupResponse>(
    `${BASE}/linehaul/items/${encodeURIComponent(toNumber)}`
  )
  return data
}

export async function listLinehaulTrips(
  limit = 20,
  cursor?: string
): Promise<LinehaulTripsListResponse> {
  const { data } = await apiClient.get<LinehaulTripsListResponse>(`${BASE}/linehaul/trips`, {
    params: { limit, ...(cursor ? { cursor } : {}) },
  })
  return data
}

export async function getLinehaulTrip(tripId: string): Promise<LinehaulTripDetailResponse> {
  const { data } = await apiClient.get<LinehaulTripDetailResponse>(
    `${BASE}/linehaul/trips/${encodeURIComponent(tripId)}`
  )
  return data
}
