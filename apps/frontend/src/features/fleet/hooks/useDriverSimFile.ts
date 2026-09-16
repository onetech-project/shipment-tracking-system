import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

const DRIVERS_KEY = ['fleet', 'drivers']

// The same three steps as a vehicle file, against the driver routes. fetch rather than apiClient
// for the PUT, for the same reason: our Authorization header is not part of the presigned
// signature and MinIO would reject the request.
export function useUploadDriverSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ driverId, file }: { driverId: string; file: File }) => {
      const intent = await apiClient
        .post(`/fleet/drivers/${driverId}/sim-file/upload-intent`, {
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
      if (!put.ok) throw new Error(`Gagal mengunggah berkas (${put.status})`)

      return apiClient
        .post(`/fleet/drivers/${driverId}/sim-file/confirm`, {
          storageKey: intent.storageKey,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  })
}

export function useDriverSimDownloadUrl() {
  return useMutation({
    mutationFn: (driverId: string) =>
      apiClient
        .get(`/fleet/drivers/${driverId}/sim-file/download-url`)
        .then((r) => (r.data as { url: string }).url),
  })
}

export function useDeleteDriverSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (driverId: string) => apiClient.delete(`/fleet/drivers/${driverId}/sim-file`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  })
}
