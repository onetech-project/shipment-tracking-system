const KB = 1024
const MB = KB * 1024

// One unit per magnitude, so a card never shows "0,5 MB" next to "512 KB" for the same size. The
// prototype showed base64 length for images and real bytes for PDFs, which made two files of the
// same size read differently.
export function formatBytes(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= MB) return `${(value / MB).toLocaleString('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`
  if (value >= KB) return `${Math.round(value / KB)} KB`
  return `${value} B`
}
