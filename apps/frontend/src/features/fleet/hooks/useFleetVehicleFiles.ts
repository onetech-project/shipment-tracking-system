import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetVehicleFile } from '../types'

// Looser than the domain type, the same convention useFleetVehicles documents: frontend and
// backend deploy in parallel.
interface FleetVehicleFileWire extends Partial<FleetVehicleFile> {
  id: string
  slotId: string
}

const VEHICLES_KEY = ['fleet', 'vehicles']

function normalizeFile(row: FleetVehicleFileWire): FleetVehicleFile {
  return {
    id: row.id,
    slotId: row.slotId,
    slotCode: row.slotCode ?? '',
    slotLabel: row.slotLabel ?? '',
    originalName: row.originalName ?? null,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    externalUrl: row.externalUrl ?? null,
    uploadedAt: row.uploadedAt ?? '',
  }
}

export function useVehicleFiles(vehicleId?: string) {
  return useQuery<FleetVehicleFileWire[], Error, FleetVehicleFile[]>({
    queryKey: [...VEHICLES_KEY, 'files', vehicleId],
    queryFn: () => apiClient.get(`/fleet/vehicles/${vehicleId}/files`).then((r) => r.data),
    select: (rows) => (rows ?? []).map(normalizeFile),
    // The panel mounts before a unit is chosen.
    enabled: Boolean(vehicleId),
  })
}

// The three steps of spec §4.2, kept in one mutation so a caller cannot perform them out of
// order. The PUT goes straight to MinIO with fetch rather than apiClient: apiClient attaches our
// Authorization header, and an unexpected header is not part of the presigned signature, so MinIO
// would reject the upload.
export function useUploadVehicleFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      vehicleId,
      slotId,
      file,
    }: {
      vehicleId: string
      slotId: string
      file: File
    }) => {
      const intent = await apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/upload-intent`, {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data as { uploadUrl: string; storageKey: string })

      const put = await fetch(intent.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      // Confirming after a failed PUT would record a file that is not in the bucket. The backend
      // HEAD refuses it anyway; stopping here gives the operator the real error instead.
      if (!put.ok) throw new Error(`Gagal mengunggah berkas (${put.status})`)

      return apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/confirm`, {
          storageKey: intent.storageKey,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useSetExternalUrl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, slotId, url }: { vehicleId: string; slotId: string; url: string }) =>
      apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/external-url`, { url })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useDeleteVehicleFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, fileId }: { vehicleId: string; fileId: string }) =>
      apiClient.delete(`/fleet/vehicles/${vehicleId}/files/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// Fetched on demand rather than cached with the row: a presigned GET expires in two minutes, and
// a cached one would be dead by the time an operator clicked it.
export function useFileDownloadUrl() {
  return useMutation({
    mutationFn: ({ vehicleId, fileId }: { vehicleId: string; fileId: string }) =>
      apiClient
        .get(`/fleet/vehicles/${vehicleId}/files/${fileId}/download-url`)
        .then((r) => (r.data as { url: string }).url),
  })
}
