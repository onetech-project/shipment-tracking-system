import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

// Fetched through apiClient rather than opened as a plain link: the route is behind the bearer
// token, and a window.open would arrive unauthenticated and download a 401 page as a .csv.
export function useFleetExport() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.get('/fleet/export.csv', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `armada-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      // Revoked immediately: the click has already handed the blob to the browser, and leaving
      // the URL alive pins the whole file in memory for the life of the document.
      URL.revokeObjectURL(url)
    },
  })
}
